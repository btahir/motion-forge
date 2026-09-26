import { useState } from 'react';
import type { AnimatedProperty, Clip, Easing, ForgeDocument } from '../core/schema';
import { properties } from '../core/schema';
import type { PlayerSnapshot } from '../core/player';
import { ease } from '../core/easing';
import { Icon, NumberField, SelectField, TextField } from './fields';

export type Edit = (label: string, change: (draft: ForgeDocument) => void, group?: string) => void;
export function Timeline({ document, clip, snapshot, selected, edit, seek, togglePlay, addKey, autoKey, setAutoKey }: { document: ForgeDocument; clip: Clip; snapshot: PlayerSnapshot; selected: string; edit: Edit; seek: (time: number) => void; togglePlay: () => void; addKey: (property: AnimatedProperty) => void; autoKey: boolean; setAutoKey: (value: boolean) => void }) {
  const [property, setProperty] = useState<AnimatedProperty>('x');
  const [key, setKey] = useState<{ track: string; time: number }>();
  const track = clip.tracks.find(t => t.id === key?.track);
  const frame = track?.keyframes.find(f => f.time === key?.time);
  const selectedNode = document.nodes.find(n => n.id === selected);
  const changeKey = (patch: Partial<NonNullable<typeof frame>>) => {
    if (!track || !frame) return;
    edit('Edit keyframe', d => { const t = d.clips.find(c => c.id === clip.id)!.tracks.find(t => t.id === track.id)!; const f = t.keyframes.find(f => f.time === frame.time)!; Object.assign(f, patch); t.keyframes.sort((a, b) => a.time - b.time); });
    if (patch.time !== undefined) setKey({ track: track.id, time: patch.time });
  };
  const removeKey = () => {
    if (!track || !frame) return;
    edit('Delete keyframe', d => { const c = d.clips.find(c => c.id === clip.id)!; const t = c.tracks.find(t => t.id === track.id)!; t.keyframes = t.keyframes.filter(f => f.time !== frame.time); c.tracks = c.tracks.filter(t => t.keyframes.length); }); setKey(undefined);
  };
  const curve = frame ? Array.from({ length: 61 }, (_, i) => `${i ? 'L' : 'M'}${i * 2},${50 - ease(frame.easing, i / 60) * 40}`).join(' ') : '';
  return <section className="mf-timeline" aria-label="Animation timeline">
    <div className="mf-timeline-toolbar"><div className="mf-playback"><button className="mf-play" onClick={togglePlay} aria-label={snapshot.playing ? 'Pause animation' : 'Play animation'}><Icon name={snapshot.playing ? 'pause' : 'play'}/></button><button onClick={() => seek(0)} title="Return to start">↤</button><output aria-label="Playhead time">{(snapshot.time / 1000).toFixed(2)}<span> / {(clip.duration / 1000).toFixed(2)}s</span></output></div>
      <span className="mf-timeline-name">{clip.name}</span><label className="mf-check"><input type="checkbox" checked={autoKey} onChange={e => setAutoKey(e.target.checked)}/> Auto-key</label>
      <select aria-label="Animated property" value={property} onChange={e => setProperty(e.target.value as AnimatedProperty)}>{properties.map(p => <option key={p}>{p}</option>)}</select><button disabled={!selectedNode || selectedNode.locked} onClick={() => addKey(property)}><Icon name="diamond"/> Add key</button>
    </div>
    <div className="mf-timeline-body"><div className="mf-track-area">
      <div className="mf-seek"><span>Time</span><input aria-label="Seek animation" type="range" min="0" max={clip.duration} step="1" value={snapshot.time} onChange={e => seek(Number(e.target.value))}/></div>
      <div className="mf-ruler"><span>LAYERS / CHANNELS</span><div>{Array.from({ length: 6 }, (_, i) => <span key={i} style={{ left: `${i * 20}%` }}>{(clip.duration * i / 5000).toFixed(1)}s</span>)}</div></div>
      <div className="mf-tracks">{clip.tracks.length ? clip.tracks.map(t => <div className={`mf-track ${t.nodeId === selected ? 'is-selected' : ''}`} key={t.id}><span title={document.nodes.find(n => n.id === t.nodeId)?.name}>{document.nodes.find(n => n.id === t.nodeId)?.name}<small>{t.property}</small></span><div className="mf-key-lane" onPointerDown={e => { if (e.target === e.currentTarget) { const r = e.currentTarget.getBoundingClientRect(); seek((e.clientX - r.left) / r.width * clip.duration); } }}><i className="mf-playhead" style={{ left: `${snapshot.time / clip.duration * 100}%` }}/>{t.keyframes.map(f => <button key={f.time} className={`mf-key ${key?.track === t.id && key.time === f.time ? 'is-active' : ''}`} style={{ left: `${f.time / clip.duration * 100}%` }} aria-label={`${t.property} keyframe at ${f.time} milliseconds`} aria-pressed={key?.track === t.id && key.time === f.time} onClick={() => { setKey({ track: t.id, time: f.time }); seek(f.time); }}><Icon name="diamond" size={12}/></button>)}</div></div>) : <div className="mf-empty">Select a layer, choose a property, and add your first keyframe.</div>}</div>
    </div><div className="mf-key-inspector">{frame && track ? <><div className="mf-section-title">KEYFRAME <button className="mf-icon" onClick={removeKey} aria-label="Delete selected keyframe"><Icon name="trash"/></button></div><NumberField label="Time · ms" value={frame.time} min={0} max={clip.duration} onChange={time => changeKey({ time })}/>{typeof frame.value === 'number' ? <NumberField label="Value" value={frame.value} step={0.1} onChange={value => changeKey({ value })}/> : <TextField label="Value" value={frame.value} onChange={value => changeKey({ value })}/>}
      <SelectField label="Easing" value={typeof frame.easing === 'string' ? frame.easing : frame.easing.type === 'spring' ? 'custom-spring' : 'cubic'} onChange={value => changeKey({ easing: value === 'cubic' ? { type: 'cubic', points: [0.25, 0.1, 0.25, 1] } : value === 'custom-spring' ? { type: 'spring', stiffness: 170, damping: 18, mass: 1 } : value as Easing })}>{['linear', 'hold', 'ease-in', 'ease-out', 'ease-in-out', 'spring', 'cubic'].map(v => <option key={v}>{v}</option>)}<option value="custom-spring">Custom spring</option></SelectField>
      {typeof frame.easing === 'object' && frame.easing.type === 'cubic' ? <div className="mf-grid-two">{frame.easing.points.map((value, i) => <NumberField key={i} label={['x1', 'y1', 'x2', 'y2'][i]!} value={value} step={0.05} min={i % 2 ? -10 : 0} max={i % 2 ? 10 : 1} onChange={v => { if (typeof frame.easing === 'object' && frame.easing.type === 'cubic') { const points = [...frame.easing.points] as [number, number, number, number]; points[i] = v; changeKey({ easing: { type: 'cubic', points } }); } }}/>)}</div> : null}
      {typeof frame.easing === 'object' && frame.easing.type === 'spring' ? <>{(['stiffness', 'damping', 'mass'] as const).map(p => <NumberField key={p} label={p} value={(frame.easing as { stiffness: number; damping: number; mass: number })[p]} step={0.1} onChange={value => { if (typeof frame.easing === 'object' && frame.easing.type === 'spring') changeKey({ easing: { ...frame.easing, [p]: value } }); }}/>)}</> : null}
      <svg className="mf-easing-preview" viewBox="0 0 120 60" role="img" aria-label="Selected easing curve"><path d="M0 50H120M0 10H120" stroke="currentColor" opacity=".2"/><path d={curve} fill="none" stroke="var(--mf-accent)" strokeWidth="2"/></svg></> : <div className="mf-empty"><Icon name="diamond" size={24}/><p>Select a keyframe<br/>to shape the timing.</p></div>}</div></div>
  </section>;
}
