import { join } from 'node:path';
import { writeFile, mkdir } from 'node:fs/promises';
import { run } from '../server/media.ts';
export const fixtureTokens = [{ text: 'Red', start: 0, end: 1000 }, { text: 'Green', start: 1000, end: 2000 }, { text: 'Blue', start: 2000, end: 3000 }];
export async function fixture(folder: string) {
  await mkdir(folder, { recursive: true });
  const media = join(folder, 'markers.mp4'), transcript = join(folder, 'markers.json');
  await run('ffmpeg', ['-y', '-v', 'error', '-f', 'lavfi', '-i', 'color=red:s=320x180:r=30:d=1', '-f', 'lavfi', '-i', 'color=green:s=320x180:r=30:d=1', '-f', 'lavfi', '-i', 'color=blue:s=320x180:r=30:d=1', '-f', 'lavfi', '-i', 'sine=frequency=440:duration=1:sample_rate=48000', '-f', 'lavfi', '-i', 'sine=frequency=880:duration=1:sample_rate=48000', '-f', 'lavfi', '-i', 'sine=frequency=1320:duration=1:sample_rate=48000', '-filter_complex', '[0:v][1:v][2:v]concat=n=3:v=1:a=0[v];[3:a][4:a][5:a]concat=n=3:v=0:a=1[a]', '-map', '[v]', '-map', '[a]', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', media]);
  await writeFile(transcript, JSON.stringify(fixtureTokens)); return { media, transcript };
}
