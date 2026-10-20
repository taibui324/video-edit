import { test } from 'node:test';
import assert from 'node:assert/strict';
import { access, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApp } from '../server/app.ts';
import type { Narrator } from '../server/narrator.ts';
import { run } from '../server/media.ts';

test('narration jobs preserve input/provenance, deduplicate, admit real media, open idempotently, cancel and recover', async () => {
  let calls = 0;
  const narrator: Narrator = { available: true, model: 'synthetic-provider-contract', voices: [{ id: 'tone', name: 'Synthetic tone', language: 'en-us' }, { id: 'wait', name: 'Wait', language: 'en-us' }, { id: 'invalid', name: 'Invalid', language: 'en-us' }], async synthesize(input, path, signal) {
    calls++;
    if (input.voice === 'wait') await new Promise<void>((_resolve, reject) => signal.addEventListener('abort', () => reject(new Error('Cancelled.')), { once: true }));
    if (input.voice === 'invalid') await writeFile(path, 'invalid media');
    else await run('ffmpeg', ['-y', '-v', 'error', '-f', 'lavfi', '-i', 'sine=frequency=440:sample_rate=24000:duration=1', '-c:a', 'pcm_s16le', '-f', 'wav', path], 30000, signal);
    return { runtime: 'synthetic', checksums: { model: 'contract-only' }, sampleRate: 24000 };
  } };
  const root = await mkdtemp(join(tmpdir(), 'moonjelly-narration-'));
  const options = { narrator, planner: { available: false, model: 'unused', async plan() { throw new Error('unused'); } }, transcriber: { available: false, model: 'unused', async transcribe() { throw new Error('unused'); } } };
  const studio = await createApp(root, options), server = studio.app.listen(0, '127.0.0.1'); await new Promise<void>(r => server.once('listening', r));
  const base = `http://127.0.0.1:${(server.address() as { port: number }).port}/api`;
  const request = (path: string, body?: unknown) => fetch(base + path, { method: body === undefined ? 'GET' : 'POST', headers: { 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
  async function wait(id: string, status: string) { for (let i = 0; i < 500; i++) { const j = await (await request('/narrations/' + id)).json(); if (j.status === status) return j; await new Promise(r => setTimeout(r, 10)); } throw new Error(`Never reached ${status}.`); }
  try {
    const body = { text: 'Test narration.', voice: 'tone', speed: 1 };
    for (const invalid of [{ ...body, text: '' }, { ...body, voice: 'missing' }, { ...body, speed: 4 }]) assert.equal((await request('/narrations', invalid)).status, 400);
    const jobs = await Promise.all(Array.from({ length: 5 }, async () => (await request('/narrations', body)).json())); assert.equal(new Set(jobs.map(j => j.id)).size, 1);
    assert.equal((await request(`/narrations/${jobs[0].id}/open`, {})).status, 409);
    const j = await wait(jobs[0].id, 'succeeded'); assert.equal(calls, 1); assert.equal(j.text, body.text); assert.equal(j.provenance.runtime, 'synthetic');
    assert.deepEqual(await (await request('/projects')).json(), []);
    assert.equal(studio.store.asset(j.assetId).origin?.text, body.text);
    const audio = await request(`/narrations/${j.id}/audio`); assert.match(audio.headers.get('content-type')!, /audio\/wav/); assert.equal(Buffer.from(await audio.arrayBuffer()).subarray(0, 4).toString(), 'RIFF');
    const p = await (await request(`/narrations/${j.id}/open`, {})).json(); assert.equal(p.asset.id, j.assetId); assert.equal(p.tokens.length, 0);
    assert.equal((await (await request(`/narrations/${j.id}/open`, {})).json()).id, p.id); assert.equal((await (await request('/projects')).json()).length, 1);
    assert.equal((await request(`/narrations/${j.id}/cancel`, {})).status, 409);
    const pending = await (await request('/narrations', { ...body, voice: 'wait' })).json(); await wait(pending.id, 'running');
    assert.equal((await (await request(`/narrations/${pending.id}/cancel`, {})).json()).status, 'cancelled');
    for (let i = 0; i < 100; i++) { if (!(await access(join(root, 'assets', pending.id)).then(() => true, () => false))) break; await new Promise(r => setTimeout(r, 10)); }
    await assert.rejects(access(join(root, 'assets', pending.id))); assert.throws(() => studio.store.asset(pending.id));
    const invalid = await (await request('/narrations', { ...body, voice: 'invalid' })).json(); assert.match((await wait(invalid.id, 'failed')).error, /ffprobe failed/);
    studio.store.db.prepare('INSERT INTO narrations VALUES (?,?)').run('interrupted', JSON.stringify({ ...j, id: 'interrupted', assetId: undefined, status: 'running' }));
    await mkdir(join(root, 'assets', 'interrupted')); await writeFile(join(root, 'assets', 'interrupted', 'partial'), 'incomplete');
    await mkdir(join(root, 'assets', pending.id)); await writeFile(join(root, 'assets', pending.id, 'partial'), 'cancelled before cleanup completed');
    await mkdir(join(root, 'assets', invalid.id)); await writeFile(join(root, 'assets', invalid.id, 'partial'), 'failed before cleanup completed');
    await studio.close(); const restarted = await createApp(root, options);
    const row = restarted.store.db.prepare('SELECT value FROM narrations WHERE id=?').get('interrupted'); assert.equal(JSON.parse(row!.value as string).status, 'failed'); await assert.rejects(access(join(root, 'assets', 'interrupted')));
    await assert.rejects(access(join(root, 'assets', pending.id)));
    await assert.rejects(access(join(root, 'assets', invalid.id)));
    assert.equal(restarted.store.get(p.id).asset.origin?.voice, 'tone'); await restarted.close();
  } finally { await new Promise<void>(r => server.close(() => r())); await studio.close(); await rm(root, { recursive: true, force: true }); }
});
