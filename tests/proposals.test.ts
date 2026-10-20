import { test } from 'node:test';
import assert from 'node:assert/strict';
import { activeTokens, captions, validateTokens } from '../src/domain.ts';
import { applyPlan } from '../src/proposals.ts';

const content = { clips: [{ start: 0, end: 5000 }], tokens: validateTokens([
  { text: 'Hello', start: 0, end: 500 }, { text: 'um', start: 500, end: 1000 },
  { text: 'world', start: 2000, end: 2500 }, { text: 'today', start: 4000, end: 4500 }
], 5000) };
test('validated cleanup and pause edits update source clips, transcript, duration and captions together', () => {
  const result = applyPlan(content, { summary: 'Remove filler and shorten the last pause.', operations: [
    { kind: 'remove_words', first: 'word-1', last: 'word-1', reason: 'Filler word.' },
    { kind: 'shorten_gap', after: 'word-2', before: 'word-3', keepMs: 200, reason: 'Keep a natural pause.' }
  ] }, null);
  assert.equal(result.removedMs, 1800);
  assert.deepEqual(activeTokens(result.content).map(w => w.text), ['Hello', 'world', 'today']);
  assert.match(captions(result.content), /00:00:02.200 --> 00:00:02.700\ntoday/);
  assert.deepEqual(content.clips, [{ start: 0, end: 5000 }]);
});
test('planner output cannot edit outside the selection, overlap cuts, invent words or remove everything', () => {
  const cut = { kind: 'remove_words', first: 'word-1', last: 'word-1', reason: 'Filler.' };
  const plan = (operations: unknown[]) => ({ summary: 'Cleanup.', operations });
  assert.throws(() => applyPlan(content, plan([cut]), ['word-2', 'word-3']), /outside/);
  assert.throws(() => applyPlan(content, plan([cut, cut]), null), /overlap/);
  assert.throws(() => applyPlan(content, plan([{ ...cut, last: 'invented' }]), null), /outside/);
  assert.throws(() => applyPlan(content, plan([{ kind: 'shell', command: 'anything', reason: 'No.' }]), null), /unsupported/);
  assert.throws(() => applyPlan(content, plan([{ kind: 'shorten_gap', after: 'word-0', before: 'word-2', keepMs: 0, reason: 'No.' }]), null), /adjacent/);
  assert.throws(() => applyPlan({ ...content, clips: [{ start: 0, end: 4500 }] }, plan([{ ...cut, first: 'word-0', last: 'word-3' }]), null), /whole/);
});
