import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApp } from '../server/app.ts';
import type { Planner } from '../server/codex.ts';

test('proposal API validates before mutation, deduplicates, persists threads, applies atomically, rejects stale plans and cancels', async () => {
  const planner: Planner = { model: 'test-contract-only', available: true, async plan(input, signal, onThread) {
    onThread('synthetic-thread-for-contract-test');
    if (input.instruction.includes('wait')) await new Promise<void>((_resolve, reject) => signal.addEventListener('abort', () => reject(new Error('Cancelled.')), { once: true }));
    if (input.instruction.includes('invalid')) return { summary: 'Invalid.', operations: [{ kind: 'shell', reason: 'Unsupported.' }] };
    return { summary: 'Remove filler.', operations: [{ kind: 'remove_words', first: 'word-1', last: 'word-1', reason: 'Filler.' }] };
  } };
  const folder = await mkdtemp(join(tmpdir(), 'moonjelly-proposals-')), studio = await createApp(folder, { planner });
  const server = studio.app.listen(0, '127.0.0.1'); await new Promise<void>(r => server.once('listening', r));
  const port = (server.address() as { port: number }).port, base = `http://127.0.0.1:${port}/api`;
  async function request(path: string, body?: unknown) { return fetch(base + path, { method: body === undefined ? 'GET' : 'POST', headers: { 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) }); }
  async function wait(id: string, target: string) { for (let i = 0; i < 300; i++) { const p = await (await request('/proposals/' + id)).json(); if (p.status === target) return p; await new Promise(r => setTimeout(r, 10)); } throw new Error(`Proposal never reached ${target}.`); }
  try {
    studio.store.db.prepare('INSERT INTO assets VALUES (?,?)').run('a', JSON.stringify({ id: 'a', duration: 3000, checksum: 'contract-only', name: 'Fixture' }));
    let p = studio.store.create('p', 'a', 'Proposal test');
    p = studio.store.command('p', p.revision, 'transcript', [{ text: 'Hello', start: 0, end: 1000 }, { text: 'um', start: 1000, end: 2000 }, { text: 'world', start: 2000, end: 3000 }]);
    assert.equal((await request('/projects/p/proposals', { revision: p.revision - 1, instruction: 'Remove filler.', scope: null })).status, 409);
    const body = { revision: p.revision, instruction: 'Remove filler.', scope: null };
    const submissions = await Promise.all(Array.from({ length: 5 }, async () => (await request('/projects/p/proposals', body)).json()));
    assert.equal(new Set(submissions.map(j => j.id)).size, 1);
    const proposal = await wait(submissions[0].id, 'succeeded'); assert.equal(proposal.threadId, 'synthetic-thread-for-contract-test');
    assert.equal(studio.store.get('p').revision, p.revision); assert.equal(studio.store.get('p').clips.length, 1);
    const applied = await request(`/proposals/${proposal.id}/apply`, { revision: p.revision }); assert.equal(applied.status, 200); p = await applied.json(); assert.equal(p.clips.length, 2);
    assert.equal((await request(`/proposals/${proposal.id}/apply`, { revision: proposal.revision })).status, 409);
    p = studio.store.command('p', p.revision, 'undo', undefined); assert.equal(p.clips.length, 1);
    const invalid = await (await request('/projects/p/proposals', { revision: p.revision, instruction: 'Return invalid operation.', scope: null })).json();
    assert.match((await wait(invalid.id, 'failed')).error, /unsupported/); assert.equal(studio.store.get('p').revision, p.revision);
    const outside = await (await request('/projects/p/proposals', { revision: p.revision, instruction: 'Remove outside selected words.', scope: ['word-2', 'word-2'] })).json();
    assert.match((await wait(outside.id, 'failed')).error, /outside/);
    const pending = await (await request('/projects/p/proposals', { revision: p.revision, instruction: 'Please wait.', scope: null })).json();
    await wait(pending.id, 'running');
    assert.equal((await (await request(`/proposals/${pending.id}/cancel`, {})).json()).status, 'cancelled');
    assert.equal(studio.store.get('p').revision, p.revision);
    studio.store.db.prepare('INSERT INTO proposals VALUES (?,?)').run('interrupted', JSON.stringify({ ...proposal, id: 'interrupted', status: 'running' }));
    await studio.close(); const restarted = await createApp(folder, { planner });
    const recovered = restarted.store.db.prepare('SELECT value FROM proposals WHERE id=?').get('interrupted'); assert.equal(JSON.parse(recovered!.value as string).status, 'failed'); await restarted.close();
  } finally { await new Promise<void>(r => server.close(() => r())); await studio.close(); await rm(folder, { recursive: true, force: true }); }
});
