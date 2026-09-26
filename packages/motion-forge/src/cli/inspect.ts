import { IDENTITY, multiply, transformBox, type Box, type Matrix } from '../core/geometry';
import type { Scene } from '../core/scene';
import { textContent, type XElement } from '../core/xml';

interface Node {
  tag: string;
  id?: string;
  class?: string;
  bounds?: [number, number, number, number];
  animated?: string[];
  text?: string;
  children?: Node[];
}

const SKIP = new Set(['title', 'desc']);
const r = (n: number) => Math.round(n * 10) / 10;

/** A compact map of the artwork: what exists, where it is, and what already moves. */
export function inspectTree(scene: Scene): { text: string; json: Node } {
  const lines: string[] = [];
  let count = 0;
  const visit = (el: XElement, parentMatrix: Matrix, prefix: string, last: boolean, depth: number, inDefs: boolean): Node => {
    const k = el.key!;
    const m = k === 0 ? IDENTITY : multiply(parentMatrix, scene.matrixOf(k));
    const local = scene.localBoxOf(k);
    const world: Box | undefined = local && !inDefs && k !== 0 ? transformBox(local, m) : undefined;
    const animated = scene.touched.has(k) ? [...scene.touched.get(k)!.keys()] : undefined;
    const node: Node = { tag: el.name, id: el.attrs.id, class: el.attrs.class, bounds: world ? [r(world.x), r(world.y), r(world.width), r(world.height)] : undefined, animated };
    if (el.name === 'text' || el.name === 'tspan') node.text = textContent(el).trim().slice(0, 40);
    const label = `${el.name}${el.attrs.id ? `#${el.attrs.id}` : ''}${el.attrs.class ? `.${el.attrs.class.trim().split(/\s+/).join('.')}` : ''}`;
    const extra = [
      world ? `[${r(world.x)},${r(world.y)} ${r(world.width)}×${r(world.height)}]` : '',
      node.text ? `"${node.text}"` : '',
      el.attrs.fill && !['g', 'svg'].includes(el.name) ? `fill ${el.attrs.fill}` : '',
      animated ? `● ${animated.join(' ')}` : '',
    ].filter(Boolean).join('  ');
    count++;
    if (count <= 400) lines.push(k === 0 ? `svg viewBox="${scene.viewBox.x} ${scene.viewBox.y} ${scene.viewBox.width} ${scene.viewBox.height}"${scene.title ? `  "${scene.title}"` : ''}` : `${prefix}${last ? '└─ ' : '├─ '}${label}  ${extra}`);
    const kids = el.children.filter((c): c is XElement => c.type === 'el' && !SKIP.has(c.name));
    const childPrefix = k === 0 ? '' : prefix + (last ? '   ' : '│  ');
    const defs = inDefs || ['defs', 'clipPath', 'mask', 'linearGradient', 'radialGradient', 'pattern', 'filter', 'symbol', 'marker'].includes(el.name);
    // Collapse long runs of anonymous leaves.
    const children: Node[] = [];
    kids.forEach((c, i) => children.push(visit(c, m, childPrefix, i === kids.length - 1, depth + 1, defs)));
    if (children.length) node.children = children;
    return node;
  };
  const json = visit(scene.root, IDENTITY, '', true, 0, false);
  if (count > 400) lines.push(`… ${count - 400} more elements (use --json for all)`);
  lines.push('', 'Bounds are [x,y width×height] in viewBox units. ● marks properties the motion block animates.');
  return { text: lines.join('\n'), json };
}
