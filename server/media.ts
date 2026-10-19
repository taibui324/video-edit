import { spawn } from 'node:child_process';
import { stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { captions, durationOf, InputError, type Content } from '../src/domain.ts';
export function run(command: string, args: string[], timeout = 300000, signal?: AbortSignal): Promise<string> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) { reject(new Error('Cancelled.')); return; }
    const child = spawn(command, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '', stderr = '';
    child.stdout.on('data', d => { stdout = (stdout + d).slice(-1000000); });
    child.stderr.on('data', d => { stderr = (stderr + d).slice(-4000); });
    let timedOut = false;
    const stop = () => child.kill('SIGKILL');
    signal?.addEventListener('abort', stop, { once: true });
    const timer = setTimeout(() => { timedOut = true; stop(); }, timeout);
    const cleanup = () => { clearTimeout(timer); signal?.removeEventListener('abort', stop); };
    child.on('error', e => { cleanup(); reject(e); });
    child.on('close', code => { cleanup(); if (signal?.aborted) reject(new Error('Cancelled.')); else if (timedOut) reject(new Error(`${command} timed out.`)); else code === 0 ? resolve(stdout) : reject(new Error(`${command} failed: ${stderr.slice(-1200)}`)); });
  });
}
export async function probe(path: string) { return JSON.parse(await run('ffprobe', ['-v', 'error', '-show_format', '-show_streams', '-of', 'json', path], 30000)); }
export async function proxy(original: string, output: string): Promise<number> {
  const info = await probe(original), hasVideo = info.streams.some((s: { codec_type: string }) => s.codec_type === 'video'), hasAudio = info.streams.some((s: { codec_type: string }) => s.codec_type === 'audio');
  const seconds = Number(info.format.duration);
  if ((!hasAudio && !hasVideo) || !Number.isFinite(seconds) || seconds <= 0 || seconds > 7200) throw new InputError('Import audio/video with a duration between 0 and 2 hours.');
  const args = ['-y', '-v', 'error', '-i', original];
  if (!hasVideo) args.push('-f', 'lavfi', '-i', 'color=c=0x171b2b:s=1280x720:r=30');
  if (!hasAudio) args.push('-f', 'lavfi', '-i', 'anullsrc=r=48000:cl=stereo');
  args.push('-map', hasVideo ? '0:v:0' : '1:v:0', '-map', hasAudio ? '0:a:0' : '1:a:0', '-t', String(seconds), '-vf', 'scale=1280:720:force_original_aspect_ratio=decrease,pad=1280:720:(ow-iw)/2:(oh-ih)/2,setsar=1', '-r', '30', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '23', '-c:a', 'aac', '-ar', '48000', '-ac', '2', '-movflags', '+faststart', output);
  await run('ffmpeg', args);
  await run('ffmpeg', ['-y', '-v', 'error', '-i', output, '-filter_complex', 'aformat=channel_layouts=mono,showwavespic=s=1200x80:colors=718b50', '-frames:v', '1', join(output, '..', 'waveform.png')]);
  return Math.round(Number((await probe(output)).format.duration) * 1000);
}
export async function render(proxyPath: string, content: Content, folder: string, signal?: AbortSignal): Promise<void> {
  const filter = content.clips.map((c, i) => `[0:v]trim=start=${c.start / 1000}:end=${c.end / 1000},setpts=PTS-STARTPTS[v${i}];[0:a]atrim=start=${c.start / 1000}:end=${c.end / 1000},asetpts=PTS-STARTPTS[a${i}];`).join('') + content.clips.map((_, i) => `[v${i}][a${i}]`).join('') + `concat=n=${content.clips.length}:v=1:a=1[v][a]`;
  await writeFile(join(folder, 'captions.vtt'), captions(content));
  await run('ffmpeg', ['-y', '-v', 'error', '-i', proxyPath, '-filter_complex', filter, '-map', '[v]', '-map', '[a]', '-t', String(durationOf(content.clips) / 1000), '-c:v', 'libx264', '-preset', 'veryfast', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-movflags', '+faststart', join(folder, 'video.mp4')], 300000, signal);
  await stat(join(folder, 'video.mp4'));
}
