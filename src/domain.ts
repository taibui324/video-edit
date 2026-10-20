export interface Token { id: string; text: string; start: number; end: number }
export interface Clip { start: number; end: number }
export interface Content { clips: Clip[]; tokens: Token[] }
export interface Asset { id: string; name: string; duration: number; checksum: string }
export interface Project extends Content { id: string; title: string; revision: number; asset: Asset; canUndo: boolean; canRedo: boolean }
export interface Job { id: string; projectId: string; revision: number; status: string; error?: string; duration: number; proposalId?: string }
export class InputError extends Error { constructor(message: string, public status = 400) { super(message); } }
export function validateTokens(value: unknown, duration: number): Token[] {
  if (!Array.isArray(value) || value.length > 50000) throw new InputError('Expected an array of at most 50,000 timed words.');
  let end = 0;
  return value.map((t, i) => {
    if (!t || typeof t.text !== 'string' || !t.text.trim() || t.text.length > 300 || !Number.isSafeInteger(t.start) || !Number.isSafeInteger(t.end) || t.start < end || t.end <= t.start || t.end > duration) throw new InputError(`Word ${i + 1}: use ordered, non-overlapping integer start/end milliseconds within the source.`);
    end = t.end;
    return { id: `word-${i}`, text: t.text.trim(), start: t.start, end: t.end };
  });
}
export const durationOf = (clips: Clip[]) => clips.reduce((n, c) => n + c.end - c.start, 0);
export function compositionTime(clips: Clip[], source: number): number | null {
  let time = 0;
  for (const c of clips) { if (source >= c.start && source < c.end) return time + source - c.start; time += c.end - c.start; }
  return null;
}
export function sourceTime(clips: Clip[], time: number): number {
  for (const c of clips) { if (time < c.end - c.start) return c.start + Math.max(0, time); time -= c.end - c.start; }
  return clips.at(-1)?.end ?? 0;
}
export const activeTokens = (content: Content) => content.tokens.filter(t => content.clips.some(c => t.start >= c.start && t.end <= c.end));
export function removeWords(content: Content, ids: unknown): Content {
  if (!Array.isArray(ids) || ids.length !== 2 || !ids.every(x => typeof x === 'string')) throw new InputError('Choose the first and last word of a range.');
  const words = activeTokens(content), a = words.findIndex(t => t.id === ids[0]), b = words.findIndex(t => t.id === ids[1]);
  if (a < 0 || b < a) throw new InputError('The selected range is no longer active.');
  const start = words[a].start, end = words[b].end;
  const clips = content.clips.flatMap(c => c.end <= start || c.start >= end ? [c] : [ ...(c.start < start ? [{ start: c.start, end: start }] : []), ...(c.end > end ? [{ start: end, end: c.end }] : []) ]);
  if (!clips.length) throw new InputError('Keep some media in the composition.');
  return { ...content, clips };
}
function stamp(ms: number) { return new Date(ms).toISOString().slice(11, 23); }
export function captions(content: Content): string {
  return 'WEBVTT\n\n' + activeTokens(content).map(t => `${stamp(compositionTime(content.clips, t.start)!)} --> ${stamp(compositionTime(content.clips, t.end - 1)! + 1)}\n${t.text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')}\n`).join('\n');
}
