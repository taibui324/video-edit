import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { InputError, validateTokens } from '../src/domain.ts';
import type { TranscriptResult } from '../src/transcription.ts';
import { run } from './media.ts';

export interface Transcriber {
  available: boolean; model: string; unavailableReason?: string;
  transcribe(path: string, duration: number, language: string, signal: AbortSignal): Promise<TranscriptResult>;
}
export function whisperResult(value: unknown, duration: number): TranscriptResult {
  const raw = value as { words?: unknown; language?: unknown; languageProbability?: unknown; provenance?: { runtime?: unknown; modelSha256?: unknown } };
  if (!raw || !Array.isArray(raw.words) || raw.words.length > 10000 || typeof raw.language !== 'string' || !Number.isFinite(raw.languageProbability) || Number(raw.languageProbability) < 0 || Number(raw.languageProbability) > 1) throw new InputError('The local model returned an invalid transcript.');
  let previous = 0;
  const words = raw.words.map((word: { text?: unknown; start?: unknown; end?: unknown }, i) => {
    if (!word || typeof word.text !== 'string' || typeof word.start !== 'number' || typeof word.end !== 'number' || !Number.isFinite(word.start) || !Number.isFinite(word.end)) throw new InputError(`Invalid timing for recognized word ${i + 1}.`);
    const rawStart = Math.round(word.start * 1000), rawEnd = Math.round(word.end * 1000);
    if (rawStart < previous - 50 || rawEnd > duration + 100 || rawStart < -50) throw new InputError(`Unreliable timing for recognized word ${i + 1}. Import a corrected timed transcript instead.`);
    const start = Math.max(previous, 0, rawStart), end = Math.min(duration, rawEnd);
    previous = end;
    return { text: word.text.trim(), start, end };
  });
  const provenance = raw.provenance;
  if (provenance && (typeof provenance.runtime !== 'string' || typeof provenance.modelSha256 !== 'string' || !/^[a-f0-9]{64}$/.test(provenance.modelSha256))) throw new InputError('Invalid local model provenance.');
  return { tokens: validateTokens(words, duration), language: raw.language, languageProbability: Number(raw.languageProbability), ...(provenance ? { provenance: { runtime: provenance.runtime as string, modelSha256: provenance.modelSha256 as string } } : {}) };
}
export async function localTranscriber(): Promise<Transcriber> {
  const python = process.env.MOONJELLY_SPEECH_PYTHON ?? fileURLToPath(new URL('../speech/.venv/bin/python', import.meta.url));
  const worker = fileURLToPath(new URL('../speech/worker.py', import.meta.url));
  const modelDir = resolve(process.env.MOONJELLY_WHISPER_MODEL_DIR ?? '.data/models/faster-whisper-base');
  const model = 'Local Whisper · CPU int8';
  let unavailableReason: string | undefined;
  try { await run(python, [worker, '--model-dir', modelDir, '--check'], 15000); }
  catch { unavailableReason = 'Local speech model is not ready. Run pnpm speech:setup in the project terminal, then restart the studio.'; }
  return { model, available: !unavailableReason, unavailableReason, async transcribe(path, duration, language, signal) {
    if (unavailableReason) throw new InputError(unavailableReason, 503);
    const temp = await mkdtemp(join(tmpdir(), 'moonjelly-speech-'));
    try {
      const audio = join(temp, 'audio.wav');
      await run('ffmpeg', ['-y', '-v', 'error', '-i', path, '-vn', '-ar', '16000', '-ac', '1', '-c:a', 'pcm_s16le', audio], 120000, signal);
      const output = await run(python, [worker, '--model-dir', modelDir, '--audio', audio, '--language', language], 1800000, signal);
      let value: unknown;
      try { value = JSON.parse(output); } catch { throw new InputError('The local speech worker returned unreadable output.'); }
      return whisperResult(value, duration);
    } finally { await rm(temp, { recursive: true, force: true }); }
  } };
}
