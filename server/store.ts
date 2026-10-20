import { DatabaseSync } from 'node:sqlite';
import { InputError, removeWords, validateTokens, type Content, type Asset, type Project } from '../src/domain.ts';
import { applyPlan, type Scope } from '../src/proposals.ts';
interface Head { id: string; title: string; assetId: string; revision: number; undo: string; redo: string }
export class Store {
  db: DatabaseSync;
  constructor(path: string) {
    this.db = new DatabaseSync(path);
    this.db.exec(`PRAGMA journal_mode=WAL; CREATE TABLE IF NOT EXISTS assets (id TEXT PRIMARY KEY, value TEXT NOT NULL); CREATE TABLE IF NOT EXISTS projects (id TEXT PRIMARY KEY, title TEXT NOT NULL, assetId TEXT NOT NULL, revision INTEGER NOT NULL, undo TEXT NOT NULL, redo TEXT NOT NULL); CREATE TABLE IF NOT EXISTS revisions (projectId TEXT NOT NULL, revision INTEGER NOT NULL, content TEXT NOT NULL, PRIMARY KEY(projectId,revision)); CREATE TABLE IF NOT EXISTS jobs (id TEXT PRIMARY KEY, value TEXT NOT NULL); CREATE TABLE IF NOT EXISTS proposals (id TEXT PRIMARY KEY, value TEXT NOT NULL);`);
  }
  asset(id: string): Asset { const row = this.db.prepare('SELECT value FROM assets WHERE id=?').get(id); if (!row) throw new InputError('Media not found.', 404); return JSON.parse(row.value as string); }
  head(id: string): Head { const row = this.db.prepare('SELECT * FROM projects WHERE id=?').get(id); if (!row) throw new InputError('Project not found.', 404); return row as unknown as Head; }
  content(id: string, revision: number): Content { const row = this.db.prepare('SELECT content FROM revisions WHERE projectId=? AND revision=?').get(id, revision); if (!row) throw new InputError('Revision not found.', 404); return JSON.parse(row.content as string); }
  get(id: string): Project { const h = this.head(id); return { ...this.content(id, h.revision), id, title: h.title, revision: h.revision, asset: this.asset(h.assetId), canUndo: JSON.parse(h.undo).length > 0, canRedo: JSON.parse(h.redo).length > 0 }; }
  create(id: string, assetId: string, title: string): Project {
    const asset = this.asset(assetId);
    this.db.exec('BEGIN IMMEDIATE');
    try { this.db.prepare('INSERT INTO projects VALUES (?,?,?,?,?,?)').run(id, title.slice(0, 120), assetId, 1, '[]', '[]'); this.db.prepare('INSERT INTO revisions VALUES (?,?,?)').run(id, 1, JSON.stringify({ clips: [{ start: 0, end: asset.duration }], tokens: [] })); this.db.exec('COMMIT'); } catch (e) { this.db.exec('ROLLBACK'); throw e; }
    return this.get(id);
  }
  command(id: string, revision: unknown, op: string, value: unknown): Project {
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const h = this.head(id);
      if (h.revision !== revision) throw new InputError('Project changed. Reload before applying this edit.', 409);
      const undo: number[] = JSON.parse(h.undo), redo: number[] = JSON.parse(h.redo);
      let content = this.content(id, h.revision);
      if (op === 'undo' || op === 'redo') { const from = op === 'undo' ? undo : redo, to = op === 'undo' ? redo : undo, target = from.pop(); if (target === undefined) throw new InputError(`Nothing to ${op}.`); to.push(h.revision); content = this.content(id, target); }
      else {
        if (op === 'transcript') { if (content.tokens.length) throw new InputError('A transcript is already attached. Undo its attachment before replacing it.'); content = { ...content, tokens: validateTokens(value, this.asset(h.assetId).duration) }; }
        else if (op === 'cut') content = removeWords(content, value);
        else if (op === 'plan') {
          const v = value as { plan: unknown; scope: Scope };
          const result = applyPlan(content, v?.plan, v?.scope);
          if (!result.plan.operations.length) throw new InputError('This proposal contains no changes.');
          content = result.content;
        }
        else throw new InputError('Unsupported edit.');
        undo.push(h.revision); redo.length = 0;
      }
      this.db.prepare('INSERT INTO revisions VALUES (?,?,?)').run(id, h.revision + 1, JSON.stringify(content));
      this.db.prepare('UPDATE projects SET revision=?, undo=?, redo=? WHERE id=?').run(h.revision + 1, JSON.stringify(undo), JSON.stringify(redo), id);
      this.db.exec('COMMIT'); return this.get(id);
    } catch (e) { this.db.exec('ROLLBACK'); throw e; }
  }
}
