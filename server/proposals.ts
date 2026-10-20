import type { Express } from 'express';
import { randomUUID } from 'node:crypto';
import { InputError } from '../src/domain.ts';
import { applyPlan, scopedWords, type Proposal, type Scope } from '../src/proposals.ts';
import { Store } from './store.ts';
import type { Planner } from './codex.ts';

export function proposalRoutes(app: Express, store: Store, planner: Planner) {
  const all = (): Proposal[] => store.db.prepare('SELECT value FROM proposals ORDER BY rowid').all().map(r => JSON.parse(r.value as string));
  const save = (p: Proposal) => store.db.prepare('INSERT OR REPLACE INTO proposals VALUES (?,?)').run(p.id, JSON.stringify(p));
  function get(id: string): Proposal { const row = store.db.prepare('SELECT value FROM proposals WHERE id=?').get(id); if (!row) throw new InputError('Proposal not found.', 404); return JSON.parse(row.value as string); }
  for (const p of all()) if (p.status === 'running') save({ ...p, status: 'failed', error: 'Codex worker stopped. Request a new proposal to retry; no edit was applied.' });
  app.get('/api/ai', (_req, res) => res.json({ available: planner.available, model: planner.model, provider: 'Codex CLI · ChatGPT subscription', error: planner.unavailableReason }));
  app.get('/api/projects/:id/proposals', (req, res) => { store.head(req.params.id); res.json(all().filter(p => p.projectId === req.params.id)); });
  app.post('/api/projects/:id/proposals', (req, res) => {
    if (!planner.available) throw new InputError(planner.unavailableReason ?? 'Codex is unavailable.', 503);
    const p = store.get(req.params.id), instruction = req.body?.instruction, scope: Scope = req.body?.scope ?? null;
    if (p.revision !== req.body?.revision) throw new InputError('Project changed. Reload before requesting a proposal.', 409);
    if (typeof instruction !== 'string' || instruction.trim().length < 3 || instruction.length > 3000) throw new InputError('Describe the edit in 3–3,000 characters.');
    const words = scopedWords(p, scope);
    if (!words.length || words.length > 2000) throw new InputError('Select between 1 and 2,000 active words for this request.');
    const existing = all().find(j => j.projectId === p.id && j.revision === p.revision && j.instruction === instruction.trim() && JSON.stringify(j.scope) === JSON.stringify(scope) && ['queued', 'running', 'succeeded'].includes(j.status));
    if (existing) { res.json(existing); return; }
    const job: Proposal = { id: randomUUID(), projectId: p.id, revision: p.revision, instruction: instruction.trim(), scope, status: 'queued', model: planner.model, createdAt: new Date().toISOString() };
    save(job); res.status(202).json(job);
  });
  app.get('/api/proposals/:id', (req, res) => res.json(get(req.params.id)));
  app.post('/api/proposals/:id/cancel', (req, res) => {
    const p = get(req.params.id);
    if (!['queued', 'running', 'cancelled'].includes(p.status)) throw new InputError('This proposal has already finished.', 409);
    const cancelled: Proposal = { ...p, status: 'cancelled' }; save(cancelled);
    if (active?.id === p.id) active.controller.abort(); res.json(cancelled);
  });
  app.post('/api/proposals/:id/apply', (req, res) => {
    const p = get(req.params.id);
    if (p.status !== 'succeeded' || !p.plan) throw new InputError('The proposal is not ready.', 409);
    if (req.body?.revision !== p.revision) throw new InputError('The proposal belongs to a different revision.', 409);
    res.json(store.command(p.projectId, p.revision, 'plan', { plan: p.plan, scope: p.scope }));
  });
  let busy = false, active: { id: string; controller: AbortController } | null = null;
  const timer = setInterval(async () => {
    if (busy || !planner.available) return;
    const p = all().find(j => j.status === 'queued'); if (!p) return;
    busy = true; active = { id: p.id, controller: new AbortController() }; save({ ...p, status: 'running' });
    try {
      if (store.head(p.projectId).revision !== p.revision) throw new InputError('Project changed before Codex started. Request a new proposal.');
      const content = store.content(p.projectId, p.revision), words = scopedWords(content, p.scope);
      const value = await planner.plan({ instruction: p.instruction, words, scope: p.scope ? 'selection' : 'composition' }, active.controller.signal, threadId => { const latest = get(p.id); if (latest.status === 'running') save({ ...latest, threadId }); });
      const result = applyPlan(content, value, p.scope);
      if (!active.controller.signal.aborted) save({ ...get(p.id), status: 'succeeded', plan: result.plan });
    } catch (e) { if (get(p.id).status !== 'cancelled') save({ ...get(p.id), status: 'failed', error: (e as Error).message }); }
    finally { busy = false; active = null; }
  }, 200);
  return async () => { clearInterval(timer); if (active) { const p = get(active.id); save({ ...p, status: 'cancelled' }); active.controller.abort(); } while (busy) await new Promise(r => setTimeout(r, 25)); };
}
