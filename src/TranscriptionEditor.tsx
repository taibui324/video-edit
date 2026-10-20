import { useEffect, useRef, useState } from 'react';
import { api } from './api.ts';
import type { Project } from './domain.ts';
import type { Transcription, TranscriptionStatus } from './transcription.ts';

const languages = [['auto', 'Detect automatically'], ['en', 'English'], ['vi', 'Vietnamese'], ['es', 'Spanish'], ['fr', 'French'], ['de', 'German'], ['ja', 'Japanese'], ['ko', 'Korean'], ['zh', 'Chinese']];
export function TranscriptionEditor({ project, onApply }: { project: Project; onApply: (p: Project) => void }) {
  const [connection, setConnection] = useState<TranscriptionStatus | null>(null), [job, setJob] = useState<Transcription | null>(null);
  const [language, setLanguage] = useState('auto'), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const projectRef = useRef(project); projectRef.current = project;
  const current = job?.projectId === project.id ? job : null;
  const stale = current?.revision !== project.revision;
  const pending = current && ['queued', 'running'].includes(current.status);
  useEffect(() => {
    let disposed = false;
    void api<TranscriptionStatus>('/transcription').then(value => { if (!disposed) setConnection(value); }).catch(e => { if (!disposed) setError(e.message); });
    return () => { disposed = true; };
  }, []);
  useEffect(() => {
    let disposed = false; setJob(null); setError('');
    void api<Transcription[]>(`/projects/${project.id}/transcriptions`).then(items => { if (!disposed) setJob(items.at(-1) ?? null); }).catch(e => { if (!disposed) setError(e.message); });
    return () => { disposed = true; };
  }, [project.id]);
  useEffect(() => {
    if (!pending || !current) return;
    let disposed = false;
    const timer = setInterval(() => { void api<Transcription>('/transcriptions/' + current.id).then(value => { if (!disposed) setJob(value); }).catch(e => { if (!disposed) setError(e.message); }); }, 500);
    return () => { disposed = true; clearInterval(timer); };
  }, [current]);
  async function action(fn: () => Promise<void>) { setBusy(true); setError(''); try { await fn(); } catch (e) { setError((e as Error).message); } finally { setBusy(false); } }
  return <section className="transcription-editor" aria-label="Local transcription">
    <h3>Transcribe on this Mac</h3>
    <p>Audio stays local. Review the recognized words before attaching them. Word timings are model estimates; listen before cutting.</p>
    {connection && !connection.available && <p className="ai-warning">{connection.error}</p>}
    <label>Recording language<select aria-label="Recording language" value={language} disabled={!!pending || busy} onChange={e => setLanguage(e.target.value)}>{languages.map(([id, title]) => <option key={id} value={id}>{title}</option>)}</select></label>
    <button className="primary" disabled={!connection?.available || !!pending || busy || project.tokens.length > 0 || project.asset.duration > 1800000} onClick={() => void action(async () => {
      const value = await api<Transcription>(`/projects/${project.id}/transcriptions`, { revision: project.revision, language });
      if (projectRef.current.id === project.id) setJob(value);
    })}>Transcribe recording</button>
    {project.asset.duration > 1800000 && <p>For recordings over 30 minutes, import a timed transcript.</p>}
    {error && <p role="alert" className="ai-warning">{error}</p>}
    {current && <div className="transcription-review" aria-label="Transcript review">
      <div className="panel-title"><strong>Local transcript</strong><span>{current.status}</span></div>
      {pending && <><p role="status">{current.status === 'queued' ? 'Waiting for the local speech worker…' : 'Recognizing speech on this Mac…'} Your script has not changed.</p><button disabled={busy} onClick={() => void action(async () => { const value = await api<Transcription>(`/transcriptions/${current.id}/cancel`, {}); if (projectRef.current.id === project.id) setJob(value); })}>Cancel transcription</button></>}
      {current.error && <p role="alert" className="ai-warning">{current.error}</p>}
      {current.status === 'cancelled' && <p>Transcription cancelled. No words were attached.</p>}
      {current.result && <><p>{current.result.tokens.length} words · {current.result.language} · estimated word timing</p><p className="recognized-words">{current.result.tokens.map(t => t.text).join(' ')}</p>{stale ? <p className="ai-warning">The project changed. Start a new transcription before attaching.</p> : <button disabled={busy || project.tokens.length > 0} onClick={() => void action(async () => {
        const value = await api<Project>(`/transcriptions/${current.id}/apply`, { revision: project.revision });
        if (projectRef.current.id === project.id && projectRef.current.revision === project.revision) onApply(value);
      })}>Attach recognized transcript</button>}</>}
    </div>}
  </section>;
}
