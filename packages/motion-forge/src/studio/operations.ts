import { uniqueId } from '../core/history';
import { nodeSchema, type AnimatedProperty, type ForgeDocument, type ForgeNode, type NodeInput, type Track } from '../core/schema';

export function setKeyframe(doc: ForgeDocument, clipId: string, nodeId: string, property: AnimatedProperty, time: number, value: number | string): void {
  const clip = doc.clips.find(c => c.id === clipId)!;
  time = Math.round(Math.min(clip.duration, Math.max(0, time)));
  let track = clip.tracks.find(t => t.nodeId === nodeId && t.property === property);
  if (!track) { track = { id: uniqueId(clip.tracks.map(t => t.id), 'track'), nodeId, property, keyframes: [] }; clip.tracks.push(track); }
  const existing = track.keyframes.find(k => k.time === time);
  if (existing) existing.value = value; else track.keyframes.push({ time, value, easing: 'ease-in-out' });
  track.keyframes.sort((a, b) => a.time - b.time);
}
export function addShape(doc: ForgeDocument, type: ForgeNode['type']): string {
  const id = uniqueId(doc.nodes.map(n => n.id), type);
  const props: NodeInput = { id, type, name: `${type[0]!.toUpperCase()}${type.slice(1)}`, x: doc.width / 2 - (type === 'rect' ? 60 : 0), y: doc.height / 2 - (type === 'rect' ? 45 : 0), width: 120, height: 90, radius: 12, rx: 50, ry: 50, fill: type === 'line' ? 'none' : '#ee7148', stroke: type === 'line' ? '#ee7148' : 'none', strokeWidth: type === 'line' ? 4 : 0, x2: 100, y2: 0, text: type === 'text' ? 'Hello, motion.' : '', fontSize: 32, d: type === 'path' ? 'M 0 -55 L 16 -17 L 57 -17 L 24 8 L 35 48 L 0 24 L -35 48 L -24 8 L -57 -17 L -16 -17 Z' : '' };
  doc.nodes.push(nodeSchema.parse(props)); return id;
}
export function duplicateNode(doc: ForgeDocument, id: string): string {
  const source = doc.nodes.find(n => n.id === id)!;
  const collected = new Set([id]);
  for (let pass = 0; pass < 33; pass++) for (const node of doc.nodes) if (node.parentId && collected.has(node.parentId)) collected.add(node.id);
  const mapping = new Map<string, string>(); const taken = doc.nodes.map(n => n.id);
  for (const old of collected) { const next = uniqueId(taken, 'copy'); mapping.set(old, next); taken.push(next); }
  doc.nodes.push(...doc.nodes.filter(n => collected.has(n.id)).map(n => ({ ...n, id: mapping.get(n.id)!, name: `${n.name} copy`.slice(0, 200), parentId: mapping.get(n.parentId ?? '') ?? n.parentId, x: n.x + (n.id === id ? 20 : 0), y: n.y + (n.id === id ? 20 : 0) })));
  for (const clip of doc.clips) {
    const newTracks: Track[] = [];
    for (const t of clip.tracks) if (collected.has(t.nodeId)) newTracks.push({ ...structuredClone(t), id: uniqueId([...clip.tracks, ...newTracks].map(t => t.id), 'track'), nodeId: mapping.get(t.nodeId)! });
    clip.tracks.push(...newTracks);
  }
  const oldBindings = [...doc.bindings];
  for (const b of oldBindings) if (collected.has(b.nodeId)) doc.bindings.push({ ...b, id: uniqueId(doc.bindings.map(b => b.id), 'binding'), nodeId: mapping.get(b.nodeId)! });
  return mapping.get(source.id)!;
}
export function isLocked(doc: ForgeDocument, id: string): boolean {
  let node = doc.nodes.find(n => n.id === id);
  while (node) { if (node.locked) return true; node = doc.nodes.find(n => n.id === node!.parentId); }
  return false;
}
