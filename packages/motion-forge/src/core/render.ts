import { formatColor, type RGBA } from './color';
import type { PathValue, Value } from './motion';
import { Player, type PlayerOptions } from './player';
import type { Frame } from './sample';
import type { Scene } from './scene';
import { cloneTree, serializeXML, type XElement } from './xml';

const r = (n: number, digits = 3) => {
  const f = 10 ** digits;
  const v = Math.round(n * f) / f;
  return Object.is(v, -0) ? '0' : String(v);
};

const NON_NEGATIVE = new Set(['width', 'height', 'r', 'rx', 'ry', 'fr', 'stroke-width', 'font-size', 'stdDeviation', 'stroke-miterlimit']);
const UNIT = new Set(['opacity', 'fill-opacity', 'stroke-opacity', 'stop-opacity', 'flood-opacity', 'offset']);

/** Special key for text content. */
export const TEXT = '#text';

/**
 * Converts a frame into concrete attribute values for every animated element.
 * Elements the motion touches always get a full set, so writers can reset cleanly.
 */
export function frameAttributes(scene: Scene, frame: Frame): Map<number, Record<string, string>> {
  const out = new Map<number, Record<string, string>>();
  for (const [el, props] of scene.touched) {
    const values = frame.get(el);
    const get = (p: string): Value | undefined => values?.get(p) ?? scene.base.get(el)?.get(p);
    const attrs: Record<string, string> = {};
    let hasTransform = false;
    for (const [prop, kind] of props) {
      const v = get(prop);
      if (v === undefined) continue;
      switch (kind) {
        case 'transform':
          hasTransform = true;
          break;
        case 'number': {
          // Springs and back easing overshoot; keep attributes browsers reject when negative valid.
          let n = v as number;
          if (NON_NEGATIVE.has(prop) && n < 0) n = 0;
          else if (UNIT.has(prop)) n = Math.min(1, Math.max(0, n));
          attrs[prop === 'scale-attr' ? 'scale' : prop] = r(n);
          break;
        }
        case 'color':
          attrs[prop] = (v as RGBA)[3] === 0 && prop !== 'stop-color' ? 'none' : formatColor(v as RGBA);
          break;
        case 'path':
          attrs.d = (v as PathValue).d;
          break;
        case 'points': {
          const n = v as number[];
          const pairs: string[] = [];
          for (let i = 0; i + 1 < n.length; i += 2) pairs.push(`${r(n[i]!)},${r(n[i + 1]!)}`);
          attrs.points = pairs.join(' ');
          break;
        }
        case 'draw': {
          const [s0, e0] = v as [number, number];
          const s = Math.max(0, Math.min(1, Math.min(s0, e0))), e = Math.max(0, Math.min(1, Math.max(s0, e0)));
          const len = scene.lengths.get(el) ?? 0;
          if (s <= 0.0005 && e >= 0.9995) {
            attrs['stroke-dasharray'] = 'none';
            attrs['stroke-dashoffset'] = '0';
          } else if (e - s < 0.0005) {
            // Park a zero-length dash past the end so round caps don't leave a dot.
            attrs['stroke-dasharray'] = `0.0001 ${r(len * 2 + 1)}`;
            attrs['stroke-dashoffset'] = r(-(len + 0.5));
          } else {
            const dash = (e - s) * len + (e >= 0.9995 ? len * 0.02 : 0);
            attrs['stroke-dasharray'] = `${r(dash)} ${r(len * 2 + 1)}`;
            attrs['stroke-dashoffset'] = r(-s * len);
          }
          break;
        }
        case 'text':
          attrs[TEXT] = String(v);
          break;
      }
    }
    if (hasTransform) {
      const n = (p: string, d: number) => {
        const v = get(p);
        return typeof v === 'number' ? v : d;
      };
      const tx = n('translateX', 0), ty = n('translateY', 0), rot = n('rotate', 0);
      const s = n('scale', 1), sx = n('scaleX', 1) * s, sy = n('scaleY', 1) * s;
      const kx = n('skewX', 0), ky = n('skewY', 0);
      const [ox, oy] = scene.origins.get(el) ?? [0, 0];
      const base = scene.baseTransforms.get(el) ?? '';
      const parts: string[] = [];
      const pivot = rot !== 0 || sx !== 1 || sy !== 1 || kx !== 0 || ky !== 0;
      if (pivot || tx !== 0 || ty !== 0) parts.push(`translate(${r(tx + (pivot ? ox : 0))} ${r(ty + (pivot ? oy : 0))})`);
      if (rot !== 0) parts.push(`rotate(${r(rot)})`);
      if (kx !== 0) parts.push(`skewX(${r(kx)})`);
      if (ky !== 0) parts.push(`skewY(${r(ky)})`);
      if (sx !== 1 || sy !== 1) parts.push(`scale(${r(sx, 4)} ${r(sy, 4)})`);
      if (pivot) parts.push(`translate(${r(-ox)} ${r(-oy)})`);
      if (base) parts.push(base);
      attrs.transform = parts.join(' ');
    }
    out.set(el, attrs);
  }
  return out;
}

/** Applies attribute maps to a cloned tree (Node-side rendering). */
export function applyToTree(scene: Scene, attrs: Map<number, Record<string, string>>): XElement {
  const root = cloneTree(scene.root);
  const byKey: XElement[] = [];
  const visit = (el: XElement) => {
    byKey[el.key!] = el;
    for (const c of el.children) if (c.type === 'el') visit(c);
  };
  visit(root);
  for (const [key, a] of attrs) {
    const el = byKey[key];
    if (!el) continue;
    for (const [name, value] of Object.entries(a)) {
      if (name === TEXT) el.children = [{ type: 'text', value }];
      else if (name === 'transform' && value === '') delete el.attrs.transform;
      else if (name === 'stroke-dasharray' && value === 'none') delete el.attrs['stroke-dasharray'];
      else el.attrs[name] = value;
    }
  }
  return root;
}

/** Rewrites ids and local references so several copies can live in one document. */
export function prefixIds(root: XElement, prefix: string): void {
  const ids = new Set<string>();
  const collect = (el: XElement) => {
    if (el.attrs.id) ids.add(el.attrs.id);
    for (const c of el.children) if (c.type === 'el') collect(c);
  };
  collect(root);
  if (!ids.size) return;
  const rewrite = (el: XElement) => {
    for (const [k, v] of Object.entries(el.attrs)) {
      if (k === 'id') el.attrs.id = prefix + v;
      else if (k === 'href' && v.startsWith('#') && ids.has(v.slice(1))) el.attrs.href = '#' + prefix + v.slice(1);
      else if (v.includes('url(#')) el.attrs[k] = v.replace(/url\(#([^)]+)\)/g, (m, id: string) => (ids.has(id) ? `url(#${prefix}${id})` : m));
    }
    for (const c of el.children) if (c.type === 'el') rewrite(c);
  };
  rewrite(root);
}

export interface RenderOptions extends PlayerOptions {
  /** Time in ms within the state. */
  time?: number;
  /** Output pixel size. Defaults to the artboard size. */
  width?: number;
  height?: number;
  /** Strip xmlns for inline embedding. */
  inline?: boolean;
}

export function renderFrameTree(scene: Scene, frame: Frame, options: { width?: number; height?: number } = {}): XElement {
  const root = applyToTree(scene, frameAttributes(scene, frame));
  root.attrs.xmlns = 'http://www.w3.org/2000/svg';
  const w = options.width ?? scene.width;
  const h = options.height ?? (options.width ? (options.width * scene.viewBox.height) / scene.viewBox.width : scene.height);
  root.attrs.width = r(w);
  root.attrs.height = r(h);
  return root;
}

/** Renders a static SVG string of a state at a time (after inputs are applied). */
export function renderSVG(scene: Scene, options: RenderOptions = {}): string {
  // A named state is shown as-is; otherwise conditions settle from the given inputs.
  const player = new Player(scene, { hold: options.state !== undefined, ...options });
  if (options.time) player.seek(options.time);
  return serializeXML(renderFrameTree(scene, player.frame(), options));
}
