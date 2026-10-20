import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApp } from '../server/app.ts';
import { whisperResult, type Transcriber } from '../server/whisper.ts';

test('local word timings preserve measured bounds, tolerate rounding and reject unreliable output', () => {
  const result = whisperResult({ words: [{ text: ' Hello', start: 0.1011, end: 0.5 }, { text: 'world.', start: 0.49, end: 1.01 }], language: 'en', languageProbability: 0.97 }, 1000);
  assert.deepEqual(result.tokens, [{ id: 'word-0', text: 'Hello', start: 101, end: 500 }, { id: 'word-1', text: 'world.', start: 500, end: 1000 }]);
  for (const words of [[{ text: 'Bad', start: NaN, end: 1 }], [{ text: 'Bad', start: 0, end: 2 }], [{ text: 'First', start: 0, end: 0.8 }, { text: 'Overlap', start: 0.5, end: 1 }], [{ text: 'Zero', start: 0.5, end: 0.5 }]]) assert.throws(() => whisperResult({ words, language: 'en', languageProbability: 0.9 }, 1000));
});

test('transcription jobs deduplicate, review without mutation, attach revision-safely, cancel and recover after interruption', async () => {
  let release!: () => void, calls = 0;
  const transcriber: Transcriber = { available: true, model: 'synthetic-contract-only', async transcribe(_path, _duration, language, signal) {
    calls++;
    if (language === 'vi') await new Promise<void>((resolve, reject) => { release = resolve; signal.addEventListener('abort', () => reject(new Error('Cancelled.')), { once: true }); });
    if (language === 'ja') return { tokens: [], language: 'ja', languageProbability: 0.9 };
    if (language === 'de') return { tokens: [{ id: 'wrong', text: 'Invalid', start: -1, end: 100 }], language: 'de', languageProbability: 0.9 };
    return { tokens: [{ id: 'raw', text: 'Hello', start: 100, end: 500 }, { id: 'raw-2', text: 'world.', start: 600, end: 900 }], language: 'en', languageProbability: 0.99 };
  } };
  const root = await mkdtemp(join(tmpdir(), 'moonjelly-transcription-'));
  const planner = { available: false, model: 'unused', async plan() { throw new Error('unused'); } };
  const studio = await createApp(root, { transcriber, planner });
  const server = studio.app.listen(0, '127.0.0.1'); await new Promise<void>(r => server.once('listening', r));
  const base = `http://127.0.0.1:${(server.address() as { port: number }).port}/api`;
  const request = (path: string, body?: unknown) => fetch(base + path, { method: body === undefined ? 'GET' : 'POST', headers: { 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
  async function wait(id: string, status: string) { for (let i = 0; i < 300; i++) { const j = await (await request('/transcriptions/' + id)).json(); if (j.status === status) return j; await new Promise(r => setTimeout(r, 10)); } throw new Error(`Never reached ${status}.`); }
  try {
    studio.store.db.prepare('INSERT INTO assets VALUES (?,?)').run('a', JSON.stringify({ id: 'a', name: 'Contract fixture', duration: 1000, checksum: 'contract-only' }));
    let p = studio.store.create('p', 'a', 'ASR contract');
    assert.equal((await request('/projects/p/transcriptions', { revision: 0 })).status, 409);
    assert.equal((await request('/projects/p/transcriptions', { revision: p.revision, language: 'invalid' })).status, 400);
    const jobs = await Promise.all(Array.from({ length: 5 }, async () => (await request('/projects/p/transcriptions', { revision: p.revision, language: 'en' })).json()));
    assert.equal(new Set(jobs.map(j => j.id)).size, 1);
    const j = await wait(jobs[0].id, 'succeeded'); assert.equal(calls, 1);
    assert.equal(studio.store.get('p').tokens.length, 0); assert.equal(studio.store.get('p').revision, 1);
    p = await (await request(`/transcriptions/${j.id}/apply`, { revision: 1 })).json(); assert.equal(p.tokens.length, 2); assert.equal(p.tokens[0].id, 'word-0');
    assert.equal((await request(`/transcriptions/${j.id}/apply`, { revision: 1 })).status, 409);
    p = studio.store.command('p', p.revision, 'undo', null); assert.equal(p.tokens.length, 0);
    const waiting = await (await request('/projects/p/transcriptions', { revision: p.revision, language: 'vi' })).json(); await wait(waiting.id, 'running');
    p = studio.store.command('p', p.revision, 'redo', null); release(); await wait(waiting.id, 'succeeded');
    assert.equal((await request(`/transcriptions/${waiting.id}/apply`, { revision: waiting.revision })).status, 409);
    p = studio.store.command('p', p.revision, 'undo', null);
    const cancel = await (await request('/projects/p/transcriptions', { revision: p.revision, language: 'vi' })).json(); await wait(cancel.id, 'running');
    assert.equal((await (await request(`/transcriptions/${cancel.id}/cancel`, {})).json()).status, 'cancelled');
    assert.equal(studio.store.get('p').tokens.length, 0);
    for (const [language, message] of [['ja', /No speech/], ['de', /Word 1/]] as const) { const bad = await (await request('/projects/p/transcriptions', { revision: p.revision, language })).json(); assert.match((await wait(bad.id, 'failed')).error, message); }
    studio.store.db.prepare('INSERT INTO transcriptions VALUES (?,?)').run('interrupted', JSON.stringify({ ...j, id: 'interrupted', status: 'running' }));
    await studio.close();
    const restarted = await createApp(root, { transcriber, planner });
    const row = restarted.store.db.prepare('SELECT value FROM transcriptions WHERE id=?').get('interrupted'); assert.equal(JSON.parse(row!.value as string).status, 'failed');
    assert.equal(restarted.store.get('p').tokens.length, 0); await restarted.close();
  } finally { await new Promise<void>(r => server.close(() => r())); await studio.close(); await rm(root, { recursive: true, force: true }); }
});
