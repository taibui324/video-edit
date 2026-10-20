import { useEffect, useRef, useState } from 'react';
import { api } from './api.ts';
import { activeTokens, type Project, type Job } from './domain.ts';
import { applyPlan, type PlannedEdit, type Proposal } from './proposals.ts';

export function AiEditor({ project, selection, onApply }: { project: Project; selection: string[]; onApply: (project: Project) => void }) {
  const [connection, setConnection] = useState<{ available: boolean; model: string; error?: string } | null>(null);
  const [instruction, setInstruction] = useState('Remove filler words without changing the meaning.');
  const [useSelection, setUseSelection] = useState(false), [proposal, setProposal] = useState<Proposal | null>(null);
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  const [audition, setAudition] = useState<Job | null>(null);
  const projectRef = useRef(project); projectRef.current = project;
  const current = proposal?.projectId === project.id ? proposal : null;
  const stale = current?.revision !== project.revision;
  const pending = current && ['queued', 'running'].includes(current.status);
  useEffect(() => { let disposed = false; void api<typeof connection>('/ai').then(value => { if (!disposed) setConnection(value); }).catch(e => { if (!disposed) setError(e.message); }); return () => { disposed = true; }; }, []);
  useEffect(() => { setUseSelection(selection.length > 0); }, [selection]);
  useEffect(() => {
    let disposed = false; setProposal(null);
    void api<Proposal[]>(`/projects/${project.id}/proposals`).then(items => { if (!disposed) setProposal(items.at(-1) ?? null); }).catch(e => { if (!disposed) setError(e.message); });
    return () => { disposed = true; };
  }, [project.id]);
  useEffect(() => {
    if (!pending || !current) return;
    let disposed = false;
    const timer = setInterval(() => { void api<Proposal>('/proposals/' + current.id).then(value => { if (!disposed) setProposal(value); }).catch(e => { if (!disposed) setError(e.message); }); }, 500);
    return () => { disposed = true; clearInterval(timer); };
  }, [current]);
  useEffect(() => { setAudition(null); }, [project.id, project.revision]);
  useEffect(() => {
    if (!audition || !['queued', 'running'].includes(audition.status)) return;
    let disposed = false;
    const timer = setInterval(() => { void api<Job>('/exports/' + audition.id).then(value => { if (!disposed) setAudition(value); }).catch(e => { if (!disposed) setError(e.message); }); }, 300);
    return () => { disposed = true; clearInterval(timer); };
  }, [audition]);
  async function action(fn: () => Promise<void>) { setBusy(true); setError(''); try { await fn(); } catch (e) { setError((e as Error).message); } finally { setBusy(false); } }
  let removedMs = 0;
  if (current?.plan && !stale) { try { removedMs = applyPlan(project, current.plan, current.scope).removedMs; } catch {} }
  function describe(op: PlannedEdit) {
    const word = (id: string) => project.tokens.find(t => t.id === id)?.text ?? 'word';
    return op.kind === 'remove_words' ? `Cut “${word(op.first)}”${op.first === op.last ? '' : ` through “${word(op.last)}”`}` : `Keep ${op.keepMs} ms between “${word(op.after)}” and “${word(op.before)}”`;
  }
  const auditionReady = audition?.projectId === project.id && audition?.revision === project.revision && audition?.proposalId === current?.id && audition?.status === 'succeeded';
  return <section className="ai-editor" aria-label="Codex editing assistant">
    <div className="panel-title"><h2>Ask Codex</h2><span>{connection?.available ? 'ChatGPT subscription' : 'Not connected'}</span></div>
    <p className="ai-note">Your instruction and selected transcript are sent to Codex when you request a plan. This uses your Codex allowance. Review before applying.</p>
    {connection && !connection.available && <p className="ai-warning">{connection.error}</p>}
    <label className="ai-label" htmlFor="edit-instruction">Describe your edit</label>
    <textarea id="edit-instruction" value={instruction} onChange={e => setInstruction(e.target.value)} maxLength={3000} rows={3}/>
    <label className="scope"><input type="checkbox" checked={useSelection && selection.length > 0} disabled={!selection.length || !!pending || busy} onChange={e => setUseSelection(e.target.checked)}/> Selected words only</label>
    <div className="ai-buttons"><button className="primary" disabled={!connection?.available || !activeTokens(project).length || !!pending || busy || instruction.trim().length < 3} onClick={() => void action(async () => setProposal(await api(`/projects/${project.id}/proposals`, { revision: project.revision, instruction, scope: useSelection && selection.length ? [selection[0], selection.at(-1)] : null })))}>Request edit plan</button>{pending && <button disabled={busy} onClick={() => void action(async () => setProposal(await api(`/proposals/${current!.id}/cancel`, {})))}>Cancel plan</button>}</div>
    {error && <p className="ai-warning" role="alert">{error}</p>}
    {current && <div className="proposal-review" aria-label="Proposed changes">
      <div className="panel-title"><strong>Revision {current.revision}</strong><span>{current.status}</span></div>
      {pending && <p role="status">Codex is planning. Your composition has not changed.</p>}
      {current.error && <p className="ai-warning" role="alert">{current.error}</p>}
      {current.status === 'cancelled' && <p>Plan cancelled. No edit was applied.</p>}
      {current.plan && <><p>{current.plan.summary}</p><ol>{current.plan.operations.map((op, i) => <li key={i}><strong>{describe(op)}</strong><span>{op.reason}</span></li>)}</ol>{stale ? <p className="ai-warning">The composition changed. Request a new plan before applying.</p> : <p className="proposal-duration">{(removedMs / 1000).toFixed(2)} seconds removed · {current.plan.operations.length} proposed edits</p>}<button disabled={busy || stale || !current.plan.operations.length} onClick={() => void action(async () => setAudition(await api(`/proposals/${current.id}/preview`, { revision: project.revision })))}>Preview proposed edit</button>{audition?.proposalId === current.id && !stale && <div className="proposal-audition">{auditionReady ? <video aria-label="Proposed edit preview" controls src={`/api/exports/${audition!.id}/preview`}/> : <p role="status">{audition?.status === 'failed' ? audition.error : 'Rendering proposed preview…'}</p>}</div>}<button disabled={busy || stale || !current.plan.operations.length} onClick={() => void action(async () => { const updated = await api<Project>(`/proposals/${current.id}/apply`, { revision: project.revision }); if (projectRef.current.id === project.id && projectRef.current.revision === project.revision) onApply(updated); })}>Apply proposed edits</button></>}
    </div>}
  </section>;
}
