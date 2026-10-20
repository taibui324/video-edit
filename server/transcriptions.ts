import type { Express } from 'express';
import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { InputError, validateTokens } from '../src/domain.ts';
import { transcriptLanguages, type Transcription } from '../src/transcription.ts';
import type { Store } from './store.ts';
import type { Transcriber } from './whisper.ts';

export function transcriptionRoutes(app: Express, store: Store, root: string, transcriber: Transcriber) {
  const all = (): Transcription[] => store.db.prepare('SELECT value FROM transcriptions ORDER BY rowid').all().map(r => JSON.parse(r.value as string));
  const save = (job: Transcription) => store.db.prepare('INSERT OR REPLACE INTO transcriptions VALUES (?,?)').run(job.id, JSON.stringify(job));
  function get(id: string): Transcription {
    const row = store.db.prepare('SELECT value FROM transcriptions WHERE id=?').get(id);
    if (!row) throw new InputError('Transcription not found.', 404);
    return JSON.parse(row.value as string);
  }
  for (const j of all()) if (j.status === 'running') save({ ...j, status: 'failed', error: 'The transcription worker stopped. Start a new transcription to retry.' });
  app.get('/api/transcription', (_req, res) => res.json({ available: transcriber.available, model: transcriber.model, error: transcriber.unavailableReason }));
  app.get('/api/projects/:id/transcriptions', (req, res) => { store.head(req.params.id); res.json(all().filter(j => j.projectId === req.params.id)); });
  app.post('/api/projects/:id/transcriptions', (req, res) => {
    if (!transcriber.available) throw new InputError(transcriber.unavailableReason ?? 'Local transcription is unavailable.', 503);
    const p = store.get(req.params.id), language = req.body?.language ?? 'auto';
    if (p.revision !== req.body?.revision) throw new InputError('Project changed. Reload before transcribing.', 409);
    if (p.tokens.length) throw new InputError('A transcript is already attached. Undo its attachment before replacing it.', 409);
    if (p.asset.duration > 1800000) throw new InputError('Local transcription currently supports recordings up to 30 minutes. Import a timed transcript for longer media.');
    if (!transcriptLanguages.includes(language)) throw new InputError('Choose a supported language or automatic detection.');
    const existing = all().find(j => j.projectId === p.id && j.revision === p.revision && j.language === language && ['queued', 'running', 'succeeded'].includes(j.status));
    if (existing) { res.json(existing); return; }
    const j: Transcription = { id: randomUUID(), projectId: p.id, revision: p.revision, assetId: p.asset.id, status: 'queued', language, model: transcriber.model, createdAt: new Date().toISOString() };
    save(j); res.status(202).json(j);
  });
  app.get('/api/transcriptions/:id', (req, res) => res.json(get(req.params.id)));
  app.post('/api/transcriptions/:id/cancel', (req, res) => {
    const j = get(req.params.id);
    if (!['queued', 'running', 'cancelled'].includes(j.status)) throw new InputError('This transcription has already finished.', 409);
    const cancelled: Transcription = { ...j, status: 'cancelled' }; save(cancelled);
    if (active?.id === j.id) active.controller.abort();
    res.json(cancelled);
  });
  app.post('/api/transcriptions/:id/apply', (req, res) => {
    const j = get(req.params.id);
    if (j.status !== 'succeeded' || !j.result) throw new InputError('The transcript is not ready.', 409);
    if (req.body?.revision !== j.revision) throw new InputError('The transcript belongs to a different revision.', 409);
    res.json(store.command(j.projectId, j.revision, 'transcript', j.result.tokens));
  });
  let busy = false, active: { id: string; controller: AbortController } | null = null;
  const timer = setInterval(async () => {
    if (busy || !transcriber.available) return;
    const j = all().find(item => item.status === 'queued'); if (!j) return;
    busy = true; active = { id: j.id, controller: new AbortController() }; save({ ...j, status: 'running' });
    try {
      if (store.head(j.projectId).revision !== j.revision) throw new InputError('Project changed before transcription started. Start a new transcription.');
      const result = await transcriber.transcribe(join(root, 'assets', j.assetId, 'proxy.mp4'), store.asset(j.assetId).duration, j.language, active.controller.signal);
      const tokens = validateTokens(result.tokens, store.asset(j.assetId).duration);
      if (!tokens.length) throw new InputError('No speech was detected. Try another language or import a timed transcript.');
      if (typeof result.language !== 'string' || !Number.isFinite(result.languageProbability) || result.languageProbability < 0 || result.languageProbability > 1) throw new InputError('The transcription worker returned invalid language metadata.');
      if (!active.controller.signal.aborted) save({ ...j, status: 'succeeded', result: { ...result, tokens } });
    } catch (e) { if (get(j.id).status !== 'cancelled') save({ ...j, status: 'failed', error: (e as Error).message }); }
    finally { active = null; busy = false; }
  }, 200);
  return async () => {
    clearInterval(timer);
    if (active) { save({ ...get(active.id), status: 'cancelled' }); active.controller.abort(); }
    while (busy) await new Promise(r => setTimeout(r, 25));
  };
}
