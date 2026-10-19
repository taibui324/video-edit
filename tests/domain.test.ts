import { test } from 'node:test';
import assert from 'node:assert/strict';
import { activeTokens, captions, compositionTime, durationOf, removeWords, sourceTime, validateTokens } from '../src/domain.ts';
const content = { clips: [{ start: 0, end: 3000 }], tokens: validateTokens([{ text: 'Red', start: 0, end: 1000 }, { text: 'Green', start: 1000, end: 2000 }, { text: 'Blue', start: 2000, end: 3000 }], 3000) };
test('cuts keep immutable source mapping, transcript and captions synchronized', () => {
  const cut = removeWords(content, ['word-1', 'word-1']);
  assert.equal(durationOf(cut.clips), 2000); assert.equal(durationOf(content.clips), 3000);
  assert.deepEqual(activeTokens(cut).map(w => w.text), ['Red', 'Blue']);
  assert.equal(sourceTime(cut.clips, 1000), 2000); assert.equal(compositionTime(cut.clips, 2000), 1000); assert.equal(compositionTime(cut.clips, 1500), null);
  assert.match(captions(cut), /00:00:01.000 --> 00:00:02.000\nBlue/); assert.doesNotMatch(captions(cut), /Green/);
});
test('invalid timing, deleted selections and all-media deletion fail', () => {
  for (const value of [[{ text: 'bad', start: -1, end: 1 }], [{ text: 'bad', start: 1, end: 3001 }], [{ text: '', start: 0, end: 1 }], [{ text: 'x', start: 0.5, end: 1 }]]) assert.throws(() => validateTokens(value, 3000));
  assert.throws(() => validateTokens([{ text: 'a', start: 0, end: 1000 }, { text: 'b', start: 900, end: 1100 }], 3000));
  assert.throws(() => removeWords(content, ['word-0', 'word-2'])); assert.throws(() => removeWords(content, ['unknown', 'word-2']));
});
