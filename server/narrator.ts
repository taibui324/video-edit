import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { InputError } from '../src/domain.ts';
import type { NarrationInput, Voice, VoiceProvenance } from '../src/narration.ts';
import { run } from './media.ts';

export interface Narrator {
  available: boolean; model: string; voices: Voice[]; unavailableReason?: string;
  synthesize(input: NarrationInput, output: string, signal: AbortSignal): Promise<VoiceProvenance>;
}
export async function localNarrator(): Promise<Narrator> {
  const python = process.env.MOONJELLY_SPEECH_PYTHON ?? fileURLToPath(new URL('../speech/.venv/bin/python', import.meta.url));
  const worker = fileURLToPath(new URL('../speech/narrate.py', import.meta.url));
  const modelDir = resolve(process.env.MOONJELLY_VOICE_MODEL_DIR ?? '.data/models/kokoro');
  const model = 'Kokoro ONNX · local neural voice';
  let voices: Voice[] = [], unavailableReason: string | undefined;
  try {
    const value = JSON.parse(await run(python, [worker, '--model-dir', modelDir, '--check'], 15000));
    if (!Array.isArray(value.voices) || !value.voices.length || value.voices.some((v: Voice) => !v || typeof v.id !== 'string' || typeof v.name !== 'string' || typeof v.language !== 'string')) throw new Error('Invalid voice catalog.');
    voices = value.voices;
  } catch { unavailableReason = 'Local neural voice is not ready. Run pnpm voice:setup in the project terminal, then restart the studio.'; }
  return { model, voices, available: !unavailableReason, unavailableReason, async synthesize(input, output, signal) {
    if (unavailableReason) throw new InputError(unavailableReason, 503);
    const temp = await mkdtemp(join(tmpdir(), 'moonjelly-voice-'));
    try {
      const path = join(temp, 'request.json'); await writeFile(path, JSON.stringify(input), { mode: 0o600 });
      const value = JSON.parse(await run(python, [worker, '--model-dir', modelDir, '--input', path, '--output', output], 600000, signal));
      if (typeof value.runtime !== 'string' || !Number.isSafeInteger(value.sampleRate) || value.sampleRate < 8000 || value.sampleRate > 192000 || !value.checksums || ['kokoro-v1.0.onnx', 'voices-v1.0.bin'].some(name => typeof value.checksums[name] !== 'string' || !/^[a-f0-9]{64}$/.test(value.checksums[name]))) throw new InputError('The voice worker returned invalid provenance.');
      return { runtime: value.runtime, sampleRate: value.sampleRate, checksums: { 'kokoro-v1.0.onnx': value.checksums['kokoro-v1.0.onnx'], 'voices-v1.0.bin': value.checksums['voices-v1.0.bin'] } };
    } finally { await rm(temp, { recursive: true, force: true }); }
  } };
}
