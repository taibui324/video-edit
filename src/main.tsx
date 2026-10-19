import React, { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { activeTokens, compositionTime, durationOf, type Project, type Asset, type Job } from './domain.ts';
import './style.css';
async function api<T>(url: string, body?: unknown): Promise<T> {
  const res = await fetch('/api' + url, body === undefined ? undefined : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const value = await res.json(); if (!res.ok) throw new Error(value.error); return value;
}
const clock = (ms: number) => `${Math.floor(ms / 60000).toString().padStart(2, '0')}:${(ms / 1000 % 60).toFixed(1).padStart(4, '0')}`;
function App() {
  const [project, setProject] = useState<Project | null>(null), [list, setList] = useState<{ id: string; title: string }[]>([]);
  const [busy, setBusy] = useState(''), [error, setError] = useState(''), [selection, setSelection] = useState<string[]>([]), [job, setJob] = useState<Job | null>(null);
  const [time, setTime] = useState(0), [playing, setPlaying] = useState(false), [showCaptions, setShowCaptions] = useState(true);
  const [preview, setPreview] = useState<Job | null>(null);
  const video = useRef<HTMLVideoElement>(null), mediaInput = useRef<HTMLInputElement>(null), transcriptInput = useRef<HTMLInputElement>(null);
  async function task(label: string, fn: () => Promise<void>) { setBusy(label); setError(''); try { await fn(); } catch (e) { setError((e as Error).message); } finally { setBusy(''); } }
  function install(p: Project) { video.current?.pause(); setPlaying(false); setProject(p); setSelection([]); setTime(0); location.hash = p.id; }
  useEffect(() => { void task('Opening studio', async () => { setList(await api('/projects')); if (location.hash) install(await api('/projects/' + encodeURIComponent(location.hash.slice(1)))); }); }, []);
  useEffect(() => {
    if (!job || !['queued', 'running'].includes(job.status)) return;
    let disposed = false;
    const timer = setInterval(() => { void api<Job>('/exports/' + job.id).then(j => { if (!disposed) setJob(j); }).catch(e => { if (!disposed) setError(e.message); }); }, 500);
    return () => { disposed = true; clearInterval(timer); };
  }, [job]);
  useEffect(() => {
    if (!project) return;
    let disposed = false;
    setPreview(null);
    void api<Job>(`/projects/${project.id}/exports`, { revision: project.revision }).then(j => { if (!disposed) setPreview(j); }).catch(e => { if (!disposed) setError(e.message); });
    return () => { disposed = true; };
  }, [project?.id, project?.revision]);
  useEffect(() => {
    if (!preview || !['queued', 'running'].includes(preview.status)) return;
    let disposed = false;
    const timer = setInterval(() => { void api<Job>('/exports/' + preview.id).then(j => { if (!disposed) setPreview(j); }).catch(e => { if (!disposed) setError(e.message); }); }, 300);
    return () => { disposed = true; clearInterval(timer); };
  }, [preview]);
  useEffect(() => {
    if (!playing) return;
    let frame: number;
    const tick = () => { sync(); frame = requestAnimationFrame(tick); };
    frame = requestAnimationFrame(tick); return () => cancelAnimationFrame(frame);
  }, [playing, project]);
  const previewReady = preview?.projectId === project?.id && preview?.revision === project?.revision && preview?.status === 'succeeded';
  const words = project ? activeTokens(project) : [], duration = project ? durationOf(project.clips) : 0;
  const selected = selection.length ? words.slice(words.findIndex(t => t.id === selection[0]), words.findIndex(t => t.id === selection.at(-1)) + 1) : [];
  async function command(op: string, value?: unknown) { if (!project) return; await task('Saving edit', async () => install(await api(`/projects/${project.id}/commands`, { revision: project.revision, op, value }))); }
  function seek(ms: number) { if (video.current && project) { video.current.currentTime = ms / 1000; setTime(ms); } }
  function sync() {
    const player = video.current; if (!player || !project) return;
    setTime(Math.min(duration, player.currentTime * 1000));
  }
  async function upload(file: File) {
    await task('Importing and preparing playback proxy…', async () => {
      const res = await fetch('/api/assets', { method: 'POST', headers: { 'Content-Type': 'application/octet-stream', 'X-File-Name': encodeURIComponent(file.name) }, body: file });
      const asset: Asset & { error?: string } = await res.json(); if (!res.ok) throw new Error(asset.error);
      install(await api('/projects', { assetId: asset.id, title: file.name.replace(/\.[^.]+$/, '') })); setList(await api('/projects'));
    });
  }
  const caption = words.find(t => { const start = compositionTime(project!.clips, t.start)!; return time >= start && time < start + t.end - t.start; });
  return <div className="studio">
    <aside className="rail"><a className="mark" href="/" aria-label="Moonjelly home">m<span>●</span></a><div className="rail-name">STUDIO</div><button className="rail-item active" onClick={() => mediaInput.current?.click()}>＋<small>Import</small></button><div className="rail-item">▤<small>Projects</small></div><div className="rail-bottom">LOCAL<br/><span>● Connected</span></div></aside>
    <main><header><div className="breadcrumbs">Workspace <span>/</span> <strong>{project?.title ?? 'Your next story'}</strong></div><div className="header-actions"><span className="save">{busy || (project ? `Saved · revision ${project.revision}` : 'All media stays on this Mac')}</span><button className="primary" disabled={!project || !!busy} onClick={() => void task('Starting export', async () => { const j = await api<Job>(`/projects/${project!.id}/exports`, { revision: project!.revision }); setJob(j); setPreview(j); })}>Export ↗</button></div></header>
    <input ref={mediaInput} type="file" accept="video/*,audio/*" aria-label="Import media" hidden onChange={e => { const f = e.target.files?.[0]; if (f) void upload(f); e.target.value = ''; }}/>
    <input ref={transcriptInput} type="file" accept="application/json,.json" aria-label="Import timed transcript" hidden onChange={e => { const f = e.target.files?.[0]; if (f) void task('Attaching transcript', async () => { const data = JSON.parse(await f.text()); install(await api(`/projects/${project!.id}/commands`, { revision: project!.revision, op: 'transcript', value: data })); }); e.target.value = ''; }}/>
    {error && <div className="error" role="alert">{error}<button onClick={() => setError('')} aria-label="Dismiss error">×</button></div>}
    {!project ? <section className="home"><div className="eyebrow">A LITTLE SPACE FOR YOUR BIG IDEAS</div><h1>Every story starts<br/>with a <em>first cut.</em></h1><p>Bring your footage. Find the words that matter.<br/>Shape something worth watching.</p><button className="import-card" disabled={!!busy} onClick={() => mediaInput.current?.click()}><span>＋</span><strong>Import your footage</strong><small>Video or audio · up to 512 MB</small></button><div className="recent"><h2>Recent projects <span>{list.length}</span></h2>{list.length ? list.map(p => <button key={p.id} onClick={() => void task('Opening project', async () => install(await api('/projects/' + p.id)))}><span>▸</span>{p.title}<span>↗</span></button>) : <p>Your stories will live here.</p>}</div><div className="foundation-note">Editing foundation · AI generation is still in development</div></section> : <>
      <div className="workspace"><section className="transcript"><div className="panel-title"><h2>Script</h2><span>{words.length} words</span></div><div className="script-tools"><button disabled={!project.canUndo || !!busy} onClick={() => void command('undo')}>↶ Undo</button><button disabled={!project.canRedo || !!busy} onClick={() => void command('redo')}>↷ Redo</button><button className="danger" disabled={!selection.length || !!busy} onClick={() => void command('cut', [selection[0], selection.at(-1)])}>Cut selection</button></div>{words.length ? <><div className="speaker"><span>A</span>Original recording</div><p className="word-list">{words.map(t => <button key={t.id} disabled={!previewReady || !!busy} className={`${selected.some(s => s.id === t.id) ? 'selected' : ''} ${caption?.id === t.id ? 'current' : ''}`} aria-pressed={selected.some(s => s.id === t.id)} onClick={e => { const first = e.shiftKey && selection.length ? selection[0] : t.id; const a = words.findIndex(w => w.id === first), b = words.findIndex(w => w.id === t.id); setSelection([words[Math.min(a, b)].id, words[Math.max(a, b)].id]); seek(compositionTime(project.clips, t.start)!); }}>{t.text}</button>)}</p><p className="hint">Click a word to seek. Shift-click to select a range.<br/>Cuts remove linked media. Original footage stays intact.</p></> : <div className="empty-script"><span>¶</span><h3>Give your footage words</h3><p>Attach a word-timed transcript to start cutting through text. Automatic transcription is not yet connected.</p><button disabled={!!busy} onClick={() => transcriptInput.current?.click()}>Import timed JSON</button><details><summary>Transcript format</summary><pre>{'[{"text":"Hello",\n  "start":0,"end":500}]'}</pre><p>Integer milliseconds; ordered words within the source duration.</p></details></div>}</section>
      <section className="preview-panel"><div className="panel-title"><h2>Preview</h2><label><input type="checkbox" checked={showCaptions} onChange={e => setShowCaptions(e.target.checked)}/> Captions</label></div><div className="preview"><video key={preview?.id} ref={video} src={previewReady ? `/api/exports/${preview!.id}/preview` : undefined} onLoadedMetadata={() => seek(0)} onTimeUpdate={sync} onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)} playsInline/>{!previewReady && <div className="preview-wait" role="status">{preview?.status === 'failed' || preview?.status === 'cancelled' ? 'Preview stopped. Use Export to render again.' : 'Preparing your composition…'}</div>}<span className="preview-caption">{showCaptions && caption?.text}</span></div><div className="transport"><span>{clock(time)}</span><button disabled={!previewReady} aria-label={playing ? 'Pause preview' : 'Play preview'} onClick={() => { if (!video.current) return; if (playing) video.current.pause(); else { if (time >= duration) seek(0); void video.current.play().catch(e => setError(e.message)); } }}>{playing ? 'Ⅱ' : '▶'}</button><span>{clock(duration)}</span></div><input className="scrubber" aria-label="Composition position" type="range" min="0" max={duration} step="1" value={Math.min(time, duration)} onChange={e => seek(Number(e.target.value))}/><div className="source-info"><span>ORIGINAL MEDIA</span><strong>{project.asset.name}</strong><small>Immutable source · {clock(project.asset.duration)}</small></div></section></div>
      <section className="timeline"><div className="panel-title"><h2>Composition <span>{project.clips.length} {project.clips.length === 1 ? 'clip' : 'clips'}</span></h2><span>{clock(duration)} · 720p · 30 fps</span></div><div className="track"><div className="track-label">▸<br/>Video + audio</div><div className="clips">{project.clips.map((c, i) => <button key={`${c.start}-${c.end}`} style={{ flex: c.end - c.start }} onClick={() => seek(project.clips.slice(0, i).reduce((n, c) => n + c.end - c.start, 0))} aria-label={`Clip ${i + 1}: ${clock(c.start)} to ${clock(c.end)}`}><span>{project.asset.name}</span><div className="wave" style={{ backgroundImage: `url(/api/assets/${project.asset.id}/waveform)`, backgroundSize: `${project.asset.duration / (c.end - c.start) * 100}% 100%`, backgroundPosition: `${project.asset.duration === c.end - c.start ? 0 : c.start / (project.asset.duration - c.end + c.start) * 100}% center` }}/><small>{clock(c.end - c.start)}</small></button>)}</div></div><p className="hint">Non-destructive edits · export always uses a frozen revision</p></section>
    </>}
    {job && <div className="export-toast" role="status"><div><strong>Export · revision {job.revision}</strong><p>{job.status === 'succeeded' ? 'Your video is ready.' : job.status === 'failed' ? job.error : job.status === 'cancelled' ? 'Export cancelled.' : `${job.status} — rendering your composition…`}</p></div>{job.status === 'succeeded' && <div className="downloads"><a href={`/api/exports/${job.id}/video.mp4`}>Download MP4 ↗</a><a href={`/api/exports/${job.id}/captions.vtt`}>Captions .vtt</a></div>}{['queued', 'running'].includes(job.status) && <button onClick={() => void task('Cancelling export', async () => { const cancelled = await api<Job>(`/exports/${job.id}/cancel`, {}); setJob(cancelled); if (preview?.id === job.id) setPreview(cancelled); })}>Cancel export</button>}<button aria-label="Dismiss export" onClick={() => setJob(null)}>×</button></div>}
    <footer><span>MOONJELLY</span><span>Made for the story.</span><span>LOCAL WORKSPACE</span></footer></main>
  </div>;
}
createRoot(document.getElementById('root')!).render(<App/>);
