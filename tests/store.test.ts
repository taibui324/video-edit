import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Store } from '../server/store.ts';
test('branching after undo clears redo but preserves immutable revisions and rejects stale commands', () => {
  const store = new Store(':memory:');
  try {
    store.db.prepare('INSERT INTO assets VALUES (?,?)').run('source', JSON.stringify({ id: 'source', duration: 3000, checksum: 'test', name: 'test' }));
    let p = store.create('p', 'source', 'Test');
    p = store.command(p.id, p.revision, 'transcript', [{ text: '<a>&', start: 100, end: 1000 }, { text: 'b', start: 1100, end: 2000 }]);
    const transcriptRevision = p.revision;
    p = store.command(p.id, p.revision, 'cut', ['word-0', 'word-0']);
    p = store.command(p.id, p.revision, 'undo', undefined); assert.equal(p.canRedo, true);
    p = store.command(p.id, p.revision, 'cut', ['word-1', 'word-1']); assert.equal(p.canRedo, false);
    assert.deepEqual(store.content('p', transcriptRevision).clips, [{ start: 0, end: 3000 }]);
    assert.throws(() => store.command('p', transcriptRevision, 'undo', undefined), /changed/);
    assert.throws(() => store.command('p', p.revision, 'redo', undefined), /Nothing to redo/);
    assert.equal(store.get('p').revision, p.revision);
  } finally { store.db.close(); }
});
