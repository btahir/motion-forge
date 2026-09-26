import { expect, it } from 'vitest';
import { createDocument, parseDocument } from '../core/schema';
import { createPreset } from '../presets';
import { addShape, duplicateNode, isLocked, setKeyframe } from './operations';

it('adds every supported shape with valid geometry and unique identifiers', () => {
  const doc = createDocument();
  for (const type of ['rect', 'ellipse', 'path', 'line', 'text', 'group'] as const) { addShape(doc, type); addShape(doc, type); }
  expect(new Set(doc.nodes.map(n => n.id)).size).toBe(12); expect(() => parseDocument(doc)).not.toThrow();
});
it('keyframe upserts are sorted, bounded and replace only the target channel', () => {
  const doc = createDocument(); const id = addShape(doc, 'rect');
  setKeyframe(doc, 'main', id, 'x', 5000, 400); setKeyframe(doc, 'main', id, 'x', 0, 20); setKeyframe(doc, 'main', id, 'x', 0, 50); setKeyframe(doc, 'main', id, 'y', 200, 25);
  expect(doc.clips[0]!.tracks[0]!.keyframes.map(f => [f.time, f.value])).toEqual([[0, 50], [3000, 400]]); expect(doc.clips[0]!.tracks).toHaveLength(2); parseDocument(doc);
});
it('duplicates complete subtrees and retargets animation and input references', () => {
  const doc = createPreset('scout'); const before = structuredClone(doc); const copy = duplicateNode(doc, 'scout');
  const node = doc.nodes.find(n => n.id === copy)!; expect(node.x).toBe(340); expect(node.y).toBe(310);
  const children = doc.nodes.filter(n => n.parentId === copy); expect(children.length).toBe(before.nodes.filter(n => n.parentId === 'scout').length);
  expect(doc.clips[0]!.tracks.some(t => t.nodeId === copy && t.property === 'y')).toBe(true); expect(() => parseDocument(doc)).not.toThrow();
  doc.nodes.find(n => n.id === 'scout')!.locked = true; expect(isLocked(doc, 'eye-left')).toBe(true); expect(isLocked(doc, copy)).toBe(false);
});
