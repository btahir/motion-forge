'use client';
import { useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore, type PointerEvent } from 'react';
import { DocumentHistory, deleteNodes } from '../core/history';
import { ForgePlayer } from '../core/player';
import { createDocument, parseJSON, properties, serializeDocument, type AnimatedProperty, type ForgeDocument, type ForgeNode } from '../core/schema';
import { exportPNG, exportReact, importSVG } from '../core/interchange';
import { renderSVG } from '../core/render';
import { ForgeSVG, usePlayerClock } from '../react';
import { createPreset, presetCatalog, type PresetId } from '../presets';
import { addShape, duplicateNode, isLocked, setKeyframe } from './operations';
import { Icon } from './fields';
import { Inspector } from './inspector';
import { Machine } from './machine';
import { Timeline, type Edit } from './timeline';

export type ForgeStudioProps = { initialDocument?: ForgeDocument; storageKey?: string | false; onChange?: (document: ForgeDocument) => void; className?: string };
const download = (name: string, content: string | Blob, type: string) => {
  const url = URL.createObjectURL(typeof content === 'string' ? new Blob([content], { type }) : content);
  const link = globalThis.document.createElement('a'); link.href = url; link.download = name; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
};

export function ForgeStudio({ initialDocument, storageKey = 'motion-forge:studio:v1', onChange, className = '' }: ForgeStudioProps) {
  const [history] = useState(() => new DocumentHistory(initialDocument ?? createPreset('scout')));
  const historySnapshot = useSyncExternalStore(history.subscribe, history.getSnapshot, history.getSnapshot);
  const document = historySnapshot.document;
  const remembered = useRef({ time: 0, state: document.initialState, inputs: {} as Record<string, number | boolean> });
  const player = useMemo(() => {
    const p = new ForgePlayer(document);
    if (document.states.some(s => s.id === remembered.current.state)) p.setState(remembered.current.state);
    for (const input of document.inputs) { const value = remembered.current.inputs[input.id]; if (value !== undefined && typeof value === typeof input.default) p.setInput(input.id, value); }
    p.seek(remembered.current.time); p.pause(); return p;
  }, [document]);
  const snapshot = useSyncExternalStore(player.subscribe, player.getSnapshot, player.getSnapshot);
  const stage = useRef<HTMLDivElement>(null), svg = useRef<SVGSVGElement>(null), shell = useRef<HTMLDivElement>(null), fileInput = useRef<HTMLInputElement>(null);
  usePlayerClock(player, stage);
  const [selected, setSelected] = useState(''), [autoKey, setAutoKey] = useState(false), [zoom, setZoom] = useState(1), [fit, setFit] = useState(1);
  const [notice, setNotice] = useState<{ message: string; error?: boolean }>({ message: 'Ready. Everything stays on your device.' });
  const [saveState, setSaveState] = useState('Local document'), [panel, setPanel] = useState<'design' | 'interact'>('design');
  const [format, setFormat] = useState('json'), [exporting, setExporting] = useState(false);
  const [selectionBox, setSelectionBox] = useState<{ x: number; y: number; width: number; height: number }>();
  const drag = useRef<{ id: string; pointerId: number; matrix: DOMMatrix; start: DOMPoint; x: number; y: number; group: string } | undefined>(undefined);
  const [canPersist, setCanPersist] = useState(true);
  const state = document.states.find(s => s.id === snapshot.state)!;
  const clip = document.clips.find(c => c.id === state.clipId)!;
  const baseNode = document.nodes.find(n => n.id === selected);
  const node = baseNode ? { ...snapshot.frame[selected]!, locked: isLocked(document, selected) } : undefined;
  const callbacks = useRef(onChange); useEffect(() => { callbacks.current = onChange; }, [onChange]);
  useEffect(() => { remembered.current = { time: snapshot.time, state: snapshot.state, inputs: snapshot.inputs }; }, [snapshot]);
  useEffect(() => {
    if (!storageKey) return;
    try { const saved = localStorage.getItem(storageKey); if (saved) { history.replace(parseJSON(saved)); setNotice({ message: 'Recovered your local document.' }); } }
    catch (error) { setCanPersist(false); setSaveState('Recovery needs attention'); setNotice({ message: `Recovery failed; stored data was left untouched. Export or open a document to continue. ${error instanceof Error ? error.message : ''}`, error: true }); }
  }, [history, storageKey]);
  useEffect(() => {
    callbacks.current?.(document);
    if (!storageKey || !canPersist) return;
    setSaveState('Saving…');
    const timer = setTimeout(() => { try { localStorage.setItem(storageKey, serializeDocument(document)); setSaveState('Saved on this device'); } catch { setSaveState('Local save unavailable'); setNotice({ message: 'Browser storage is unavailable or full. Export JSON to keep your work.', error: true }); } }, 400);
    return () => clearTimeout(timer);
  }, [document, storageKey, canPersist]);
  useEffect(() => {
    const element = stage.current; if (!element) return;
    const resize = () => setFit(Math.max(0.1, Math.min((element.clientWidth - 80) / document.width, (element.clientHeight - 72) / document.height, 1.4)));
    resize(); const observer = new ResizeObserver(resize); observer.observe(element); return () => observer.disconnect();
  }, [document.width, document.height]);
  useLayoutEffect(() => {
    const target = svg.current?.querySelector<SVGGraphicsElement>(`[data-node-id="${selected}"]`);
    const rootMatrix = svg.current?.getScreenCTM();
    if (!target || !rootMatrix || !node?.visible) { setSelectionBox(undefined); return; }
    const rect = target.getBoundingClientRect();
    const inverse = rootMatrix.inverse();
    const p1 = new DOMPoint(rect.left, rect.top).matrixTransform(inverse), p2 = new DOMPoint(rect.right, rect.bottom).matrixTransform(inverse);
    setSelectionBox({ x: p1.x, y: p1.y, width: p2.x - p1.x, height: p2.y - p1.y });
  }, [selected, snapshot, zoom, fit, node?.visible]);
  const edit: Edit = (label, change, group) => {
    try { player.pause(); history.edit(label, change, { group }); }
    catch (error) { setNotice({ message: error instanceof Error ? error.message : String(error), error: true }); }
  };
  const patchNode = (id: string, patch: Partial<ForgeNode>, group?: string) => {
    if (isLocked(document, id)) return;
    edit('Edit layer', draft => {
      const target = draft.nodes.find(n => n.id === id)!;
      for (const [property, value] of Object.entries(patch)) {
        const animated = properties.includes(property as AnimatedProperty) && (autoKey || clip.tracks.some(t => t.nodeId === id && t.property === property));
        if (animated) setKeyframe(draft, clip.id, id, property as AnimatedProperty, snapshot.time, value as number | string);
        else Object.assign(target, { [property]: value });
      }
    }, group);
  };
  const chooseState = (id: string) => {
    if (!history.getSnapshot().document.states.some(s => s.id === id)) return;
    remembered.current = { ...remembered.current, state: id, time: 0 };
    if (player.document.states.some(s => s.id === id)) { player.setState(id); player.seek(0); player.pause(); }
  };
  const seek = (time: number) => { player.pause(); player.seek(time); };
  const togglePlay = () => { if (snapshot.playing) player.pause(); else { if (snapshot.time >= snapshot.duration) player.seek(0); player.play(); } };
  const remove = () => { if (!selected || isLocked(document, selected)) return; edit('Delete layer', draft => deleteNodes(draft, [selected])); setSelected(''); };
  const duplicate = () => { if (!selected || isLocked(document, selected)) return; let id = ''; edit('Duplicate layer', draft => { id = duplicateNode(draft, selected); }); if (id) setSelected(id); };
  const replace = (next: ForgeDocument) => { player.pause(); remembered.current = { time: 0, state: next.initialState, inputs: {} }; history.replace(next); setSelected(''); setZoom(1); setCanPersist(true); };
  const openFile = async (file: File) => {
    try {
      if (file.size > 5_000_000) throw new Error('Files must be smaller than 5 MB');
      const source = await file.text();
      if (file.name.toLowerCase().endsWith('.svg') || source.trim().startsWith('<')) {
        const result = importSVG(source);
        if (!result.success) throw new Error(result.issues.map(i => `${i.path}: ${i.message}`).join('\n'));
        replace(result.document); setNotice({ message: result.issues.length ? result.issues.map(i => i.message).join(' ') : 'Imported SVG as editable layers.' });
      } else { replace(parseJSON(source)); setNotice({ message: `Opened ${file.name}` }); }
    } catch (error) { setNotice({ message: error instanceof Error ? error.message : String(error), error: true }); }
  };
  const exportFile = async () => {
    setExporting(true);
    const name = document.name.toLowerCase().replace(/[^a-z0-9_-]+/g, '-').replace(/^-|-$/g, '') || 'animation';
    try {
      if (format === 'json') download(`${name}.forge.json`, serializeDocument(document), 'application/json');
      if (format === 'svg') download(`${name}.svg`, renderSVG(document, { frame: snapshot.frame }), 'image/svg+xml');
      if (format === 'png') download(`${name}.png`, await exportPNG(document, { frame: snapshot.frame }), 'image/png');
      if (format === 'react') download(`${name}.tsx`, exportReact(document), 'text/plain');
      setNotice({ message: `Exported ${format.toUpperCase()}${format === 'svg' || format === 'png' ? ` at ${(snapshot.time / 1000).toFixed(2)}s` : ''}.` });
    } catch (error) { setNotice({ message: error instanceof Error ? error.message : String(error), error: true }); }
    finally { setExporting(false); }
  };
  const pointerDown = (e: PointerEvent<SVGSVGElement>) => {
    if (e.button !== 0) return;
    const target = (e.target as Element).closest<SVGGraphicsElement>('[data-node-id]');
    const id = target?.getAttribute('data-node-id');
    if (!id) { setSelected(''); return; }
    setSelected(id); player.pause();
    if (isLocked(document, id)) return;
    const parent = target!.parentElement as unknown as SVGGraphicsElement;
    const matrix = parent.getScreenCTM()?.inverse();
    if (!matrix) return;
    const point = new DOMPoint(e.clientX, e.clientY).matrixTransform(matrix), original = snapshot.frame[id]!;
    drag.current = { id, matrix, start: point, x: original.x, y: original.y, pointerId: e.pointerId, group: `drag-${Date.now()}` };
    e.currentTarget.setPointerCapture(e.pointerId); e.preventDefault();
  };
  const pointerMove = (e: PointerEvent<SVGSVGElement>) => {
    const current = drag.current; if (!current || current.pointerId !== e.pointerId) return;
    const point = new DOMPoint(e.clientX, e.clientY).matrixTransform(current.matrix);
    patchNode(current.id, { x: Math.round((current.x + point.x - current.start.x) * 10) / 10, y: Math.round((current.y + point.y - current.start.y) * 10) / 10 }, current.group);
  };
  const endDrag = () => { drag.current = undefined; history.endGroup(); };
  const orderedLayers = useMemo(() => {
    const layers: { node: ForgeNode; depth: number }[] = [];
    const visit = (parentId: string | undefined, depth: number) => { [...document.nodes].reverse().filter(n => n.parentId === parentId).forEach(node => { layers.push({ node, depth }); visit(node.id, depth + 1); }); };
    visit(undefined, 0); return layers;
  }, [document]);
  const reorder = (direction: -1 | 1) => edit('Reorder layer', draft => {
    const current = draft.nodes.find(n => n.id === selected)!; const peers = draft.nodes.filter(n => n.parentId === current.parentId); const other = peers[peers.indexOf(current) + direction];
    if (!other) return; const a = draft.nodes.indexOf(current), b = draft.nodes.indexOf(other); [draft.nodes[a], draft.nodes[b]] = [other, current];
  });
  return <div ref={shell} className={`mf-studio ${className}`} tabIndex={-1} onKeyDown={e => {
    const target = e.target as HTMLElement; if (target.closest('input,textarea,select,[contenteditable=true]')) return;
    const modifier = e.metaKey || e.ctrlKey;
    if (modifier && e.key.toLowerCase() === 'z') { e.preventDefault(); player.pause(); if (e.shiftKey) history.redo(); else history.undo(); }
    else if (modifier && e.key.toLowerCase() === 's') { e.preventDefault(); download('animation.forge.json', serializeDocument(document), 'application/json'); }
    else if (modifier && e.key.toLowerCase() === 'd') { e.preventDefault(); duplicate(); }
    else if (e.key === ' ' && target.tagName !== 'BUTTON') { e.preventDefault(); togglePlay(); }
    else if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); remove(); }
    else if (e.key === 'Escape') { setSelected(''); endDrag(); }
    else if (node && ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) { e.preventDefault(); const step = e.shiftKey ? 10 : 1; patchNode(selected, { x: node.x + (e.key === 'ArrowRight' ? step : e.key === 'ArrowLeft' ? -step : 0), y: node.y + (e.key === 'ArrowDown' ? step : e.key === 'ArrowUp' ? -step : 0) }); }
  }}>
    <header className="mf-topbar"><a className="mf-wordmark" href="/" aria-label="Motion Forge home"><span className="mf-mark">m<span>f</span></span><span>MOTION FORGE<small>STUDIO</small></span></a><span className="mf-top-divider"/><span className="mf-document-name">{document.name}<small>{saveState}</small></span><div className="mf-top-actions"><button onClick={() => replace(createDocument())}>New</button><button onClick={() => fileInput.current?.click()}><Icon name="upload"/> Open</button><select aria-label="Export format" value={format} onChange={e => setFormat(e.target.value)}><option value="json">Editable JSON</option><option value="svg">SVG frame</option><option value="png">PNG frame</option><option value="react">React component</option></select><button className="mf-primary" onClick={exportFile} disabled={exporting}><Icon name="download"/>{exporting ? 'Exporting…' : 'Export'}</button></div><input ref={fileInput} type="file" accept=".json,.svg,application/json,image/svg+xml" hidden onChange={e => { const file = e.target.files?.[0]; if (file) void openFile(file); e.currentTarget.value = ''; }}/></header>
    <div className="mf-workspace"><aside className="mf-left"><div className="mf-panel-heading">Layers <span>{document.nodes.length}</span></div><div className="mf-shape-tools">{(['rect', 'ellipse', 'text', 'path', 'line', 'group'] as const).map(type => <button key={type} onClick={() => { let id = ''; edit(`Add ${type}`, draft => { id = addShape(draft, type); }); if (id) setSelected(id); }} title={`Add ${type}`} aria-label={`Add ${type}`}>{({ rect: '▭', ellipse: '◯', text: 'T', path: '✧', line: '╱', group: '▱' })[type]}</button>)}</div>
      <div className="mf-layer-list" aria-label="Layers">{orderedLayers.map(({ node: layer, depth }) => <div key={layer.id} className={`mf-layer ${selected === layer.id ? 'is-selected' : ''} ${!layer.visible ? 'is-hidden' : ''}`} style={{ paddingLeft: 8 + Math.min(depth, 6) * 12 }}><button className="mf-layer-name" onClick={() => setSelected(layer.id)} aria-pressed={selected === layer.id}><span className="mf-layer-symbol">{layer.type === 'group' ? '▱' : layer.type === 'text' ? 'T' : '◇'}</span><span>{layer.name}</span></button><button className="mf-icon" aria-label={`${layer.visible ? 'Hide' : 'Show'} ${layer.name}`} onClick={() => edit('Toggle visibility', d => { d.nodes.find(n => n.id === layer.id)!.visible = !layer.visible; })}><Icon name={layer.visible ? 'eye' : 'hidden'} size={13}/></button><button className="mf-icon" aria-label={`${layer.locked ? 'Unlock' : 'Lock'} ${layer.name}`} onClick={() => edit('Toggle lock', d => { d.nodes.find(n => n.id === layer.id)!.locked = !layer.locked; })}><Icon name={layer.locked ? 'lock' : 'unlock'} size={13}/></button></div>)}</div>
      <div className="mf-layer-actions"><button disabled={!node || node.locked} onClick={duplicate} title="Duplicate · ⌘/Ctrl D">Duplicate</button><button disabled={!node || node.locked} onClick={() => reorder(1)} aria-label="Bring layer forward">↑</button><button disabled={!node || node.locked} onClick={() => reorder(-1)} aria-label="Send layer backward">↓</button><button disabled={!node || node.locked} onClick={remove} aria-label="Delete layer"><Icon name="trash"/></button></div>
      <div className="mf-preset-picker"><label>START WITH A SCENE<select aria-label="Open example" value="" onChange={e => { if (e.target.value) replace(createPreset(e.target.value as PresetId)); }}><option value="">Explore examples…</option>{presetCatalog.map(p => <option key={p.id} value={p.id}>{p.name} · {p.category}</option>)}</select></label></div>
    </aside><main className="mf-canvas-panel"><div className="mf-canvas-toolbar"><div><button disabled={!historySnapshot.canUndo} onClick={() => history.undo()} aria-label="Undo"><Icon name="undo"/></button><button disabled={!historySnapshot.canRedo} onClick={() => history.redo()} aria-label="Redo"><Icon name="redo"/></button></div><span>{document.width} × {document.height}</span><div><button onClick={() => setZoom(v => Math.max(0.25, v - 0.25))} aria-label="Zoom out">−</button><output aria-label="Canvas zoom">{Math.round(fit * zoom * 100)}%</output><button onClick={() => setZoom(v => Math.min(4, v + 0.25))} aria-label="Zoom in">+</button><button onClick={() => setZoom(1)} aria-label="Fit artboard"><Icon name="fit"/></button></div></div>
      <div ref={stage} className="mf-stage" tabIndex={0} aria-label="Animation artboard. Select a layer and use arrow keys to move it."><div className="mf-artboard-wrap" style={{ width: document.width * fit * zoom, height: document.height * fit * zoom }}><ForgeSVG ref={svg} document={document} frame={snapshot.frame} className="mf-artboard" onPointerDown={pointerDown} onPointerMove={pointerMove} onPointerUp={endDrag} onPointerCancel={endDrag} onLostPointerCapture={endDrag}>
        {selectionBox ? <g pointerEvents="none"><rect x={selectionBox.x} y={selectionBox.y} width={selectionBox.width} height={selectionBox.height} fill="none" stroke="#ff784f" strokeWidth={1 / (fit * zoom)}/>{[[selectionBox.x, selectionBox.y], [selectionBox.x + selectionBox.width, selectionBox.y], [selectionBox.x, selectionBox.y + selectionBox.height], [selectionBox.x + selectionBox.width, selectionBox.y + selectionBox.height]].map(([x, y], i) => <rect key={i} x={x! - 3 / (fit * zoom)} y={y! - 3 / (fit * zoom)} width={6 / (fit * zoom)} height={6 / (fit * zoom)} fill="#fff" stroke="#ff784f" strokeWidth={1 / (fit * zoom)}/>)}</g> : null}
      </ForgeSVG></div></div><div className="mf-canvas-footer"><span><Icon name="cursor" size={12}/>{node ? node.name : 'Select a layer to begin'}</span><span>{snapshot.playing ? 'Playing' : 'Paused'} · {state.name}</span></div>
    </main><aside className="mf-right"><div className="mf-tabs"><button className={panel === 'design' ? 'is-active' : ''} onClick={() => setPanel('design')}>Design</button><button className={panel === 'interact' ? 'is-active' : ''} onClick={() => setPanel('interact')}>Interact</button></div><div className="mf-right-scroll">{panel === 'design' ? <Inspector document={document} node={node} edit={edit} patch={patch => patchNode(selected, patch)} animated={new Set(clip.tracks.filter(t => t.nodeId === selected).map(t => t.property))}/> : <Machine document={document} edit={edit} stateId={state.id} chooseState={chooseState} player={player} selected={selected}/>}</div></aside></div>
    <Timeline document={document} clip={clip} snapshot={snapshot} selected={selected} edit={edit} seek={seek} togglePlay={togglePlay} autoKey={autoKey} setAutoKey={setAutoKey} addKey={property => { if (!node || node.locked) return; edit('Add keyframe', d => setKeyframe(d, clip.id, selected, property, snapshot.time, node[property])); }}/>
    <footer className={`mf-status ${notice.error ? 'is-error' : ''}`}><span role={notice.error ? 'alert' : 'status'}>{notice.message}</span>{notice.error ? <button onClick={() => setNotice({ message: 'Ready.' })}>Dismiss</button> : <span>PORTABLE BY DESIGN · v1</span>}</footer>
  </div>;
}
export { addShape, duplicateNode, setKeyframe } from './operations';
