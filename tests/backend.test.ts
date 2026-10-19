import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApp } from '../server/app.ts';
import { probe, run } from '../server/media.ts';
import { Store } from '../server/store.ts';
import { fixture, fixtureTokens } from './fixture.ts';
test('real API import, revision conflicts, history, frozen export, pixel/audio timing and restart persistence', { timeout: 120000 }, async () => {
  const root = await mkdtemp(join(tmpdir(), 'moonjelly-api-')), files = await fixture(root), studio = await createApp(join(root, '.data'));
  const server = studio.app.listen(0, '127.0.0.1'); await new Promise<void>(r => server.once('listening', r));
  const address = server.address() as { port: number }, base = `http://127.0.0.1:${address.port}/api`;
  const headers = {};
  async function request(path: string, body?: unknown) { return fetch(base + path, { method: body === undefined ? 'GET' : 'POST', headers: { ...headers, 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) }); }
  try {
    assert.equal((await fetch(base + '/projects', { method: 'POST', headers: { ...headers, Origin: 'https://evil.example', 'Content-Type': 'application/json' }, body: '{}' })).status, 403);
    const imported = await fetch(base + '/assets', { method: 'POST', headers: { ...headers, 'Content-Type': 'application/octet-stream', 'X-File-Name': 'markers.mp4' }, body: await readFile(files.media) }); assert.equal(imported.status, 201); const asset = await imported.json();
    const playback = await fetch(base + `/assets/${asset.id}/proxy`, { headers: { Range: 'bytes=0-99' } }); assert.equal(playback.status, 206); assert.match(playback.headers.get('content-type')!, /video\/mp4/); assert.equal((await playback.arrayBuffer()).byteLength, 100);
    const created = await request('/projects', { assetId: asset.id, title: 'Marker proof' }); assert.equal(created.status, 201); let p = await created.json();
    assert.equal((await request(`/projects/${p.id}/commands`, { revision: p.revision, op: 'transcript', value: [{ text: 'bad', start: 1, end: 99999 }] })).status, 400);
    p = await (await request(`/projects/${p.id}/commands`, { revision: p.revision, op: 'transcript', value: fixtureTokens })).json();
    const beforeCut = p.revision;
    p = await (await request(`/projects/${p.id}/commands`, { revision: p.revision, op: 'cut', value: ['word-1', 'word-1'] })).json();
    assert.deepEqual(p.clips, [{ start: 0, end: 1000 }, { start: 2000, end: 3000 }]);
    assert.equal((await request(`/projects/${p.id}/commands`, { revision: beforeCut, op: 'undo' })).status, 409);
    const parallel = await Promise.all(Array.from({ length: 5 }, async () => (await request(`/projects/${p.id}/exports`, { revision: p.revision })).json()));
    assert.equal(new Set(parallel.map(j => j.id)).size, 1); const job = parallel[0];
    assert.equal((await (await request(`/projects/${p.id}/exports`, { revision: p.revision })).json()).id, job.id);
    p = await (await request(`/projects/${p.id}/commands`, { revision: p.revision, op: 'undo' })).json(); assert.equal(p.clips.length, 1);
    p = await (await request(`/projects/${p.id}/commands`, { revision: p.revision, op: 'redo' })).json(); assert.equal(p.clips.length, 2);
    let status; for (let i = 0; i < 200; i++) { status = await (await request('/exports/' + job.id)).json(); if (['succeeded', 'failed'].includes(status.status)) break; await new Promise(r => setTimeout(r, 100)); }
    assert.equal(status.status, 'succeeded', status.error);
    const out = join(root, '.data', 'exports', job.id, 'video.mp4'), info = await probe(out); assert.ok(Math.abs(Number(info.format.duration) - 2) < .08); assert.deepEqual(info.streams.map((s: { codec_type: string }) => s.codec_type).sort(), ['audio', 'video']);
    const vtt = await (await request(`/exports/${job.id}/captions.vtt`)).text(); assert.doesNotMatch(vtt, /Green/); assert.match(vtt, /00:00:01.000 --> 00:00:02.000\nBlue/);
    for (const [time, expected] of [[.5, 'red'], [1.5, 'blue']] as const) {
      const frame = join(root, `frame-${time}.rgb`); await run('ffmpeg', ['-y', '-v', 'error', '-ss', String(time), '-i', out, '-vf', 'scale=1:1', '-frames:v', '1', '-pix_fmt', 'rgb24', '-f', 'rawvideo', frame]); const pixel = await readFile(frame);
      assert.ok(expected === 'red' ? pixel[0] > 180 && pixel[2] < 60 : pixel[2] > 180 && pixel[0] < 60, `Expected ${expected}, got ${[...pixel]}`);
      const audio = join(root, `audio-${time}.raw`); await run('ffmpeg', ['-y', '-v', 'error', '-ss', String(time - .1), '-i', out, '-t', '0.2', '-ac', '1', '-ar', '48000', '-f', 'f32le', audio]);
      const buffer = await readFile(audio), samples = new Float32Array(buffer.buffer, buffer.byteOffset, buffer.byteLength / 4); let crossings = 0; for (let i = 1; i < samples.length; i++) if (samples[i - 1] <= 0 && samples[i] > 0) crossings++;
      assert.ok(Math.abs(crossings / .2 - (time === .5 ? 440 : 1320)) < 20, `Audio marker frequency ${crossings / .2}`);
    }
    const reopened = new Store(join(root, '.data', 'studio.sqlite')); assert.deepEqual(reopened.get(p.id).clips, p.clips); reopened.db.close();
    const pending = await (await request(`/projects/${p.id}/exports`, { revision: p.revision })).json();
    const cancelled = await (await request(`/exports/${pending.id}/cancel`, {})).json(); assert.equal(cancelled.status, 'cancelled');
    assert.equal((await request(`/exports/${pending.id}/video.mp4`)).status, 409);
    const activeJob = await (await request(`/projects/${p.id}/exports`, { revision: p.revision })).json();
    let activeState;
    for (let i = 0; i < 200; i++) { activeState = await (await request(`/exports/${activeJob.id}`)).json(); if (activeState.status === 'running') break; await new Promise(r => setTimeout(r, 5)); }
    assert.equal(activeState.status, 'running');
    assert.equal((await (await request(`/exports/${activeJob.id}/cancel`, {})).json()).status, 'cancelled');
    await new Promise(r => setTimeout(r, 50)); assert.equal((await (await request(`/exports/${activeJob.id}`)).json()).status, 'cancelled');
    const abort = new AbortController(); const running = run('ffmpeg', ['-v', 'error', '-re', '-f', 'lavfi', '-i', 'sine=duration=30', '-f', 'null', '-'], 30000, abort.signal); setTimeout(() => abort.abort(), 50); await assert.rejects(running, /Cancelled/);
    // Persist an interrupted export and prove a fresh worker exposes its failure, rather than silently resubmitting.
    const interrupted = { ...job, id: 'interrupted', status: 'running' }; studio.store.db.prepare('INSERT INTO jobs VALUES (?,?)').run(interrupted.id, JSON.stringify(interrupted));
    await studio.close(); const restarted = await createApp(join(root, '.data')); const record = restarted.store.db.prepare('SELECT value FROM jobs WHERE id=?').get('interrupted'); assert.equal(JSON.parse(record!.value as string).status, 'failed'); await restarted.close();
  } finally { await new Promise<void>(r => server.close(() => r())); await studio.close(); await rm(root, { recursive: true, force: true }); }
});
