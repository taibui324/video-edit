import type { Express } from 'express';
import { randomUUID, createHash } from 'node:crypto';
import { mkdir, readFile, rm } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { InputError, type Asset } from '../src/domain.ts';
import type { Narration } from '../src/narration.ts';
import type { Store } from './store.ts';
import type { Narrator } from './narrator.ts';
import { proxy } from './media.ts';

export async function narrationRoutes(app: Express, store: Store, root: string, narrator: Narrator) {
  const all = (): Narration[] => store.db.prepare('SELECT value FROM narrations ORDER BY rowid').all().map(row => JSON.parse(row.value as string));
  const save = (j: Narration) => store.db.prepare('INSERT OR REPLACE INTO narrations VALUES (?,?)').run(j.id, JSON.stringify(j));
  function get(id: string): Narration { const row = store.db.prepare('SELECT value FROM narrations WHERE id=?').get(id); if (!row) throw new InputError('Narration not found.', 404); return JSON.parse(row.value as string); }
  const folderOf = (id: string) => join(root, 'assets', id);
  for (const j of all()) {
    if (j.status === 'running') save({ ...j, status: 'failed', error: 'The voice worker stopped. Generate again to retry.' });
    if (j.status !== 'succeeded' && !store.db.prepare('SELECT id FROM assets WHERE id=?').get(j.id)) {
      try { await rm(folderOf(j.id), { recursive: true, force: true }); }
      catch { save({ ...get(j.id), error: 'Partial narration media could not be removed. Check local storage permissions before retrying.' }); }
    }
  }
  app.get('/api/narration', (_req, res) => res.json({ available: narrator.available, model: narrator.model, voices: narrator.voices, error: narrator.unavailableReason }));
  app.get('/api/narrations', (_req, res) => res.json(all()));
  app.post('/api/narrations', (req, res) => {
    if (!narrator.available) throw new InputError(narrator.unavailableReason ?? 'Neural voice is unavailable.', 503);
    const text = req.body?.text, voice = req.body?.voice, speed = req.body?.speed;
    if (typeof text !== 'string' || text.trim().length < 3 || text.length > 5000) throw new InputError('Enter a script of 3–5,000 characters.');
    if (!narrator.voices.some(v => v.id === voice)) throw new InputError('Choose an available voice.');
    if (typeof speed !== 'number' || !Number.isFinite(speed) || speed < 0.8 || speed > 1.2) throw new InputError('Choose a speaking speed between 0.8 and 1.2.');
    const existing = all().find(j => j.model === narrator.model && j.text === text.trim() && j.voice === voice && j.speed === speed && ['queued', 'running', 'succeeded'].includes(j.status));
    if (existing) { res.json(existing); return; }
    const j: Narration = { id: randomUUID(), text: text.trim(), voice, speed, status: 'queued', model: narrator.model, createdAt: new Date().toISOString() };
    save(j); res.status(202).json(j);
  });
  app.get('/api/narrations/:id', (req, res) => res.json(get(req.params.id)));
  app.post('/api/narrations/:id/cancel', (req, res) => {
    const j = get(req.params.id);
    if (!['queued', 'running', 'cancelled'].includes(j.status)) throw new InputError('This narration has already finished.', 409);
    const cancelled: Narration = { ...j, status: 'cancelled' }; save(cancelled);
    if (active?.id === j.id) active.controller.abort();
    res.json(cancelled);
  });
  app.get('/api/narrations/:id/audio', (req, res) => {
    const j = get(req.params.id);
    if (j.status !== 'succeeded' || !j.assetId) throw new InputError('The narration is not ready.', 409);
    store.asset(j.assetId); res.type('audio/wav').sendFile(resolve(folderOf(j.assetId), 'original'), { dotfiles: 'allow' });
  });
  app.post('/api/narrations/:id/open', (req, res) => {
    const j = get(req.params.id);
    if (j.status !== 'succeeded' || !j.assetId) throw new InputError('The narration is not ready.', 409);
    const id = `narration-${j.id}`;
    const existing = store.db.prepare('SELECT id FROM projects WHERE id=?').get(id);
    res.json(existing ? store.get(id) : store.create(id, j.assetId, j.text.slice(0, 70)));
  });
  let busy = false, active: { id: string; controller: AbortController } | null = null;
  const timer = setInterval(async () => {
    if (busy || !narrator.available) return;
    const j = all().find(item => item.status === 'queued'); if (!j) return;
    busy = true; active = { id: j.id, controller: new AbortController() }; save({ ...j, status: 'running' });
    const folder = folderOf(j.id);
    try {
      await mkdir(folder, { recursive: true });
      const original = join(folder, 'original');
      const provenance = await narrator.synthesize({ text: j.text, voice: j.voice, speed: j.speed }, original, active.controller.signal);
      const duration = await proxy(original, join(folder, 'proxy.mp4'), active.controller.signal);
      const asset: Asset = { id: j.id, name: 'Narration.wav', duration, checksum: createHash('sha256').update(await readFile(original)).digest('hex'), origin: { kind: 'narration', text: j.text, voice: j.voice, speed: j.speed, model: j.model, provenance } };
      if (!active.controller.signal.aborted) {
        store.db.exec('BEGIN IMMEDIATE');
        try { store.db.prepare('INSERT INTO assets VALUES (?,?)').run(asset.id, JSON.stringify(asset)); save({ ...j, status: 'succeeded', assetId: asset.id, duration, provenance }); store.db.exec('COMMIT'); }
        catch (e) { store.db.exec('ROLLBACK'); throw e; }
      }
    } catch (e) { if (get(j.id).status !== 'cancelled') save({ ...j, status: 'failed', error: (e as Error).message }); }
    finally {
      try { if (get(j.id).status !== 'succeeded') await rm(folder, { recursive: true, force: true }); }
      catch { save({ ...get(j.id), error: 'Temporary narration media could not be removed. Check local storage permissions.' }); }
      finally { active = null; busy = false; }
    }
  }, 200);
  return async () => { clearInterval(timer); if (active) { save({ ...get(active.id), status: 'cancelled' }); active.controller.abort(); } while (busy) await new Promise(r => setTimeout(r, 25)); };
}
