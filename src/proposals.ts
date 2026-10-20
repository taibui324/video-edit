import { activeTokens, InputError, type Clip, type Content } from './domain.ts';

export type PlannedEdit =
  | { kind: 'remove_words'; first: string; last: string; reason: string }
  | { kind: 'shorten_gap'; after: string; before: string; keepMs: number; reason: string };
export interface EditPlan { summary: string; operations: PlannedEdit[] }
export type Scope = [string, string] | null;
export interface Proposal {
  id: string;
  projectId: string;
  revision: number;
  instruction: string;
  scope: Scope;
  status: 'queued' | 'running' | 'succeeded' | 'failed' | 'cancelled';
  plan?: EditPlan;
  error?: string;
  threadId?: string;
  model: string;
  createdAt: string;
}

export function scopedWords(content: Content, scope: unknown) {
  const words = activeTokens(content);
  if (scope === null) return words;
  if (!Array.isArray(scope) || scope.length !== 2 || !scope.every(id => typeof id === 'string')) throw new InputError('Select the first and last word of an active range.');
  const first = words.findIndex(w => w.id === scope[0]), last = words.findIndex(w => w.id === scope[1]);
  if (first < 0 || last < first) throw new InputError('The selected words are no longer active.');
  return words.slice(first, last + 1);
}

export function applyPlan(content: Content, value: unknown, scope: Scope): { plan: EditPlan; content: Content; removedMs: number } {
  const candidate = value as EditPlan;
  if (!candidate || typeof candidate.summary !== 'string' || !candidate.summary.trim() || candidate.summary.length > 1000 || !Array.isArray(candidate.operations) || candidate.operations.length > 100) throw new InputError('Codex returned an invalid edit plan.');
  const words = activeTokens(content), allowed = new Set(scopedWords(content, scope).map(w => w.id));
  const cuts: Clip[] = [], operations: PlannedEdit[] = [];
  for (const op of candidate.operations) {
    if (!op || typeof op.reason !== 'string' || !op.reason.trim() || op.reason.length > 1000) throw new InputError('Every proposed edit needs a short reason.');
    if (op.kind === 'remove_words') {
      const first = words.findIndex(w => w.id === op.first), last = words.findIndex(w => w.id === op.last);
      if (first < 0 || last < first || words.slice(first, last + 1).some(w => !allowed.has(w.id))) throw new InputError('A proposed cut is outside the selected transcript.');
      cuts.push({ start: words[first].start, end: words[last].end });
      operations.push({ kind: op.kind, first: op.first, last: op.last, reason: op.reason });
    } else if (op.kind === 'shorten_gap') {
      const after = words.findIndex(w => w.id === op.after), before = words.findIndex(w => w.id === op.before);
      if (after < 0 || before !== after + 1 || !allowed.has(op.after) || !allowed.has(op.before)) throw new InputError('A pause must lie between adjacent words inside the selection.');
      const a = words[after], b = words[before], sameClip = content.clips.some(c => c.start <= a.start && c.end >= b.end);
      if (!sameClip || !Number.isSafeInteger(op.keepMs) || op.keepMs < 0 || op.keepMs >= b.start - a.end) throw new InputError('A proposed pause trim has invalid timing.');
      cuts.push({ start: a.end + op.keepMs, end: b.start });
      operations.push({ kind: op.kind, after: op.after, before: op.before, keepMs: op.keepMs, reason: op.reason });
    } else throw new InputError('Codex proposed an unsupported editing operation.');
  }
  cuts.sort((a, b) => a.start - b.start);
  if (cuts.some((c, i) => i > 0 && c.start < cuts[i - 1].end)) throw new InputError('Proposed edits overlap. Ask for a new plan.');
  let clips = content.clips;
  for (const cut of cuts) clips = clips.flatMap(c => c.end <= cut.start || c.start >= cut.end ? [c] : [
    ...(c.start < cut.start ? [{ start: c.start, end: cut.start }] : []),
    ...(c.end > cut.end ? [{ start: cut.end, end: c.end }] : [])
  ]);
  if (!clips.length) throw new InputError('The proposal removes the whole composition. Keep some media.');
  const duration = (ranges: Clip[]) => ranges.reduce((sum, c) => sum + c.end - c.start, 0);
  return { plan: { summary: candidate.summary, operations }, content: { ...content, clips }, removedMs: duration(content.clips) - duration(clips) };
}
