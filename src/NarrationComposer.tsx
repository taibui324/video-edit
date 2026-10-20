import { useEffect, useRef, useState } from 'react';
import { api } from './api.ts';
import type { Project } from './domain.ts';
import type { Narration, NarrationConnection } from './narration.ts';

export function NarrationComposer({ onOpen }: { onOpen: (project: Project) => void }) {
  const [connection, setConnection] = useState<NarrationConnection | null>(null), [job, setJob] = useState<Narration | null>(null);
  const [history, setHistory] = useState<Narration[]>([]);
  const [text, setText] = useState(''), [voice, setVoice] = useState('af_heart'), [speed, setSpeed] = useState(1);
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  const mounted = useRef(true);
  const pending = job && ['queued', 'running'].includes(job.status);
  useEffect(() => {
    mounted.current = true;
    void Promise.all([api<NarrationConnection>('/narration'), api<Narration[]>('/narrations')]).then(([status, jobs]) => {
      if (!mounted.current) return;
      setConnection(status); setHistory(jobs); const latest = jobs.at(-1);
      if (latest) { setJob(latest); setText(latest.text); setVoice(latest.voice); setSpeed(latest.speed); }
      else if (status.voices.length) setVoice(status.voices[0].id);
    }).catch(e => { if (mounted.current) setError(e.message); });
    return () => { mounted.current = false; };
  }, []);
  useEffect(() => {
    if (!pending || !job) return;
    let disposed = false;
    const timer = setInterval(() => { void api<Narration>('/narrations/' + job.id).then(value => { if (!disposed) setJob(value); }).catch(e => { if (!disposed) setError(e.message); }); }, 500);
    return () => { disposed = true; clearInterval(timer); };
  }, [job]);
  useEffect(() => { if (job) setHistory(items => [...items.filter(item => item.id !== job.id), job]); }, [job]);
  async function action(fn: () => Promise<void>) { setBusy(true); setError(''); try { await fn(); } catch (e) { if (mounted.current) setError((e as Error).message); } finally { if (mounted.current) setBusy(false); } }
  return <section className="narration-composer" aria-label="Neural narration">
    <div className="panel-title"><h2>Start with a voice</h2><span>Local neural narration</span></div>
    <p>Paste your script and choose a voice. Speech is generated on this Mac, then opens in the editor for transcription, cuts and export.</p>
    {connection && !connection.available && <p className="ai-warning">{connection.error}</p>}
    <label htmlFor="narration-script">Narration script</label>
    <textarea id="narration-script" rows={5} maxLength={5000} value={text} disabled={!connection || !!pending || busy} onChange={e => setText(e.target.value)} placeholder="What story do you want to tell?"/>
    <div className="voice-settings"><label>Voice<select aria-label="Narration voice" value={voice} disabled={!!pending || busy} onChange={e => setVoice(e.target.value)}>{connection?.voices.map(v => <option key={v.id} value={v.id}>{v.name} · {v.language}</option>)}</select></label><label>Speaking speed<select aria-label="Speaking speed" value={speed} disabled={!!pending || busy} onChange={e => setSpeed(Number(e.target.value))}>{[0.8, 0.9, 1, 1.1, 1.2].map(s => <option key={s} value={s}>{s}×</option>)}</select></label></div>
    <div className="ai-buttons"><button className="primary" disabled={!connection?.available || !!pending || busy || text.trim().length < 3} onClick={() => void action(async () => { const value = await api<Narration>('/narrations', { text, voice, speed }); if (mounted.current) setJob(value); })}>Generate narration</button>{pending && <button disabled={busy} onClick={() => void action(async () => { const value = await api<Narration>(`/narrations/${job!.id}/cancel`, {}); if (mounted.current) setJob(value); })}>Cancel narration</button>}</div>
    <p className="hint">Kokoro neural voices · English · up to 5,000 characters · no API key needed</p>
    {history.length > 0 && <label>Generation history<select aria-label="Narration history" value={job?.id ?? ''} disabled={busy} onChange={e => { const selected = history.find(j => j.id === e.target.value); if (selected) { setJob(selected); setText(selected.text); setVoice(selected.voice); setSpeed(selected.speed); } }}>{history.map(j => <option key={j.id} value={j.id}>{new Date(j.createdAt).toLocaleTimeString()} · {connection?.voices.find(v => v.id === j.voice)?.name ?? j.voice} · {j.status}</option>)}</select></label>}
    {error && <p role="alert" className="ai-warning">{error}</p>}
    {job && <div className="narration-review" aria-label="Generated narration">
      <div className="panel-title"><strong>{connection?.voices.find(v => v.id === job.voice)?.name ?? job.voice}</strong><span>{job.status}</span></div>
      {pending && <p role="status">{job.status === 'queued' ? 'Waiting for the local voice worker…' : 'Generating your narration on this Mac…'}</p>}
      {job.error && <p role="alert" className="ai-warning">{job.error}</p>}
      {job.status === 'cancelled' && <p>Narration cancelled. No asset was admitted.</p>}
      {job.status === 'succeeded' && <><p>{((job.duration ?? 0) / 1000).toFixed(1)} seconds · {job.speed}× · {job.model}</p><p className="generated-script">{job.text}</p><audio aria-label="Generated narration playback" controls src={`/api/narrations/${job.id}/audio`}/><button disabled={busy} onClick={() => void action(async () => { const p = await api<Project>(`/narrations/${job.id}/open`, {}); if (mounted.current) onOpen(p); })}>Open narration in editor</button></>}
    </div>}
  </section>;
}
