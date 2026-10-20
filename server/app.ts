import express from 'express';
import { randomUUID, createHash } from 'node:crypto';
import { mkdir, rm } from 'node:fs/promises';
import { createWriteStream } from 'node:fs';
import { join, resolve } from 'node:path';
import { pipeline } from 'node:stream/promises';
import { Transform } from 'node:stream';
import { Store } from './store.ts';
import { proxy, render } from './media.ts';
import { durationOf, InputError, type Job } from '../src/domain.ts';
import { codexPlanner, type Planner } from './codex.ts';
import { proposalRoutes } from './proposals.ts';
import { applyPlan, type Proposal } from '../src/proposals.ts';
import { localTranscriber, type Transcriber } from './whisper.ts';
import { transcriptionRoutes } from './transcriptions.ts';
export async function createApp(root: string, options: { planner?: Planner; transcriber?: Transcriber } = {}) {
  await mkdir(root, { recursive: true, mode: 0o700 });
  const store = new Store(join(root, 'studio.sqlite')), app = express();
  const assetPath = (id: string) => join(root, 'assets', id);
  const jobPath = (id: string) => join(root, 'exports', id);
  const saveJob = (j: Job) => store.db.prepare('INSERT OR REPLACE INTO jobs VALUES (?,?)').run(j.id, JSON.stringify(j));
  const jobs = (): Job[] => store.db.prepare('SELECT value FROM jobs').all().map(r => JSON.parse(r.value as string));
  const getJob = (id: string) => { const row = store.db.prepare('SELECT value FROM jobs WHERE id=?').get(id); if (!row) throw new InputError('Export not found.', 404); return JSON.parse(row.value as string) as Job; };
  for (const j of jobs()) if (j.status === 'running') saveJob({ ...j, status: 'failed', error: 'Worker stopped before export completed. Export again to retry.' });
  app.disable('x-powered-by');
  app.use('/api', (req, res, next) => {
    const ports = [req.socket.localPort, Number(process.env.MOONJELLY_WEB_PORT ?? 5173)];
    const hosts = ['127.0.0.1', 'localhost'].flatMap(h => ports.map(port => `${h}:${port}`));
    if (!hosts.includes(req.headers.host ?? '')) { res.status(403).json({ error: 'Use the loopback studio address.' }); return; }
    if (req.headers.origin && !hosts.map(h => `http://${h}`).includes(req.headers.origin)) { res.status(403).json({ error: 'Cross-origin requests are not allowed.' }); return; }
    res.setHeader('X-Content-Type-Options', 'nosniff'); next();
  });
  app.use(express.json({ limit: '8mb' }));
  const closeProposals = proposalRoutes(app, store, options.planner ?? await codexPlanner());
  const closeTranscriptions = transcriptionRoutes(app, store, root, options.transcriber ?? await localTranscriber());
  app.get('/api/health', (_req, res) => res.json({ status: 'ok', transcription: 'local-whisper-or-timed-sidecar', storage: 'sqlite' }));
  app.get('/api/projects', (_req, res) => res.json(store.db.prepare('SELECT id,title,revision FROM projects ORDER BY rowid DESC').all()));
  app.post('/api/assets', async (req, res) => {
    if (req.headers['content-type'] !== 'application/octet-stream') throw new InputError('Send the media file as application/octet-stream.');
    const id = randomUUID(), folder = assetPath(id); await mkdir(folder, { recursive: true });
    const original = join(folder, 'original'), hash = createHash('sha256'); let bytes = 0;
    try {
      await pipeline(req, new Transform({ transform(chunk, _enc, done) { bytes += chunk.length; if (bytes > 512 * 1024 * 1024) return done(new InputError('Media exceeds the 512 MB local import limit.', 413)); hash.update(chunk); done(null, chunk); } }), createWriteStream(original, { flags: 'wx' }));
      const duration = await proxy(original, join(folder, 'proxy.mp4'));
      const name = decodeURIComponent(String(req.headers['x-file-name'] ?? 'Untitled media')).slice(0, 200);
      const asset = { id, name, duration, checksum: hash.digest('hex') };
      store.db.prepare('INSERT INTO assets VALUES (?,?)').run(id, JSON.stringify(asset)); res.status(201).json(asset);
    } catch (e) { await rm(folder, { recursive: true, force: true }); throw e; }
  });
  app.get('/api/assets/:id/proxy', (req, res) => { store.asset(req.params.id); res.sendFile(resolve(assetPath(req.params.id), 'proxy.mp4'), { dotfiles: 'allow' }); });
  app.get('/api/assets/:id/waveform', (req, res) => { store.asset(req.params.id); res.sendFile(resolve(assetPath(req.params.id), 'waveform.png'), { dotfiles: 'allow' }); });
  app.post('/api/projects', (req, res) => {
    if (typeof req.body?.assetId !== 'string' || typeof req.body?.title !== 'string') throw new InputError('Provide a title and imported asset.');
    res.status(201).json(store.create(randomUUID(), req.body.assetId, req.body.title));
  });
  app.get('/api/projects/:id', (req, res) => res.json(store.get(req.params.id)));
  app.post('/api/projects/:id/commands', (req, res) => res.json(store.command(req.params.id, req.body?.revision, req.body?.op, req.body?.value)));
  app.post('/api/projects/:id/exports', (req, res) => {
    const p = store.get(req.params.id);
    if (p.revision !== req.body?.revision) throw new InputError('Project changed. Reload before exporting.', 409);
    const existing = jobs().find(j => !j.proposalId && j.projectId === p.id && j.revision === p.revision && ['queued', 'running', 'succeeded'].includes(j.status));
    if (existing) { res.json(existing); return; }
    const j: Job = { id: randomUUID(), projectId: p.id, revision: p.revision, status: 'queued', duration: durationOf(p.clips) };
    saveJob(j); res.status(202).json(j);
  });
  app.post('/api/proposals/:id/preview', (req, res) => {
    const row = store.db.prepare('SELECT value FROM proposals WHERE id=?').get(req.params.id);
    if (!row) throw new InputError('Proposal not found.', 404);
    const p: Proposal = JSON.parse(row.value as string);
    if (p.status !== 'succeeded' || !p.plan) throw new InputError('The proposal is not ready.', 409);
    if (req.body?.revision !== p.revision || store.head(p.projectId).revision !== p.revision) throw new InputError('The proposal is stale. Request a new plan.', 409);
    const existing = jobs().find(j => j.proposalId === p.id && ['queued', 'running', 'succeeded'].includes(j.status));
    if (existing) { res.json(existing); return; }
    const content = applyPlan(store.content(p.projectId, p.revision), p.plan, p.scope).content;
    const j: Job = { id: randomUUID(), projectId: p.projectId, revision: p.revision, proposalId: p.id, status: 'queued', duration: durationOf(content.clips) };
    saveJob(j); res.status(202).json(j);
  });
  app.post('/api/exports/:id/cancel', (req, res) => {
    const j = getJob(req.params.id);
    if (!['queued', 'running', 'cancelled'].includes(j.status)) throw new InputError('This export has already finished.', 409);
    const cancelled = { ...j, status: 'cancelled' }; saveJob(cancelled);
    if (active?.id === j.id) active.controller.abort();
    res.json(cancelled);
  });
  app.get('/api/exports/:id', (req, res) => res.json(getJob(req.params.id)));
  app.get('/api/exports/:id/preview', (req, res) => {
    const j = getJob(req.params.id);
    if (j.status !== 'succeeded') throw new InputError('Preview is not ready.', 409);
    res.sendFile(resolve(jobPath(j.id), 'video.mp4'), { dotfiles: 'allow' });
  });
  app.get('/api/exports/:id/:file', (req, res) => {
    const j = getJob(req.params.id), file = req.params.file;
    if (j.status !== 'succeeded') throw new InputError('Export is not ready.', 409);
    if (!['video.mp4', 'captions.vtt'].includes(file)) throw new InputError('File not found.', 404);
    res.download(join(jobPath(j.id), file), file, { dotfiles: 'allow' });
  });
  app.use(express.static(resolve('dist')));
  app.use((error: Error & { status?: number }, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    if (!res.headersSent) res.status(error.status ?? 500).json({ error: error.message });
  });
  let busy = false, closed = false, active: { id: string; controller: AbortController } | null = null;
  const timer = setInterval(async () => {
    if (busy) return;
    const j = jobs().find(j => j.status === 'queued'); if (!j) return;
    busy = true; active = { id: j.id, controller: new AbortController() }; saveJob({ ...j, status: 'running' });
    try {
      await mkdir(jobPath(j.id), { recursive: true });
      const h = store.head(j.projectId);
      let content = store.content(j.projectId, j.revision);
      if (j.proposalId) {
        const row = store.db.prepare('SELECT value FROM proposals WHERE id=?').get(j.proposalId);
        if (!row) throw new Error('The proposed preview is unavailable.');
        const p: Proposal = JSON.parse(row.value as string);
        if (p.projectId !== j.projectId || p.revision !== j.revision || p.status !== 'succeeded' || !p.plan) throw new Error('The proposed preview is invalid.');
        content = applyPlan(content, p.plan, p.scope).content;
      }
      await render(join(assetPath(h.assetId), 'proxy.mp4'), content, jobPath(j.id), active.controller.signal);
      if (!active.controller.signal.aborted) saveJob({ ...j, status: 'succeeded' });
    } catch (e) { if (getJob(j.id).status !== 'cancelled') saveJob({ ...j, status: 'failed', error: (e as Error).message }); }
    finally { if (getJob(j.id).status === 'cancelled') await rm(jobPath(j.id), { recursive: true, force: true }); busy = false; active = null; }
  }, 200);
  return { app, store, async close() { if (closed) return; closed = true; clearInterval(timer); await closeProposals(); await closeTranscriptions(); while (busy) await new Promise(r => setTimeout(r, 50)); store.db.close(); } };
}
