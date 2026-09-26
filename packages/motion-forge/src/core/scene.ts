import { parseColor } from './color';
import { parseEasing, type EaseFn } from './easing';
import {
  apply, boundsOfPoints, flatten, IDENTITY, multiply, parsePath, parseTransform, pathLength, transformBox, unionBoxes,
  type Box, type Matrix, type Point,
} from './geometry';
import { normalizeMotion, parseMotionJSON, parseValue, type NInput, type NInteraction, type NMotion, type NTransition, type Value, type Expr } from './motion';
import { GEOMETRY_ATTRS, TRANSFORM_DEFAULTS, type PropKind, type TransformProp } from './props';
import { sanitize, type Diagnostic } from './sanitize';
import { indexTree, parseSelector, SelectorError, selectAll, type TreeIndex } from './selector';
import { parseXML, textContent, XMLError, type XElement } from './xml';

export interface Key {
  t: number;
  value: Value;
  ease?: EaseFn;
}
export interface Channel {
  el: number;
  prop: string;
  kind: PropKind;
  keys: Key[];
  ease: EaseFn;
  offset: number;
  /** The author wrote a keyframe at 0: when the property was at rest, start there instead of blending. */
  explicitStart: boolean;
  curve?: 'smooth';
  at: string;
}
export interface RState {
  name: string;
  duration: number;
  loop: number;
  alternate: boolean;
  channels: Channel[];
  on: Map<string, NTransition>;
  when: { source: string; test: Expr; transition: NTransition }[];
  next?: NTransition;
  emit: string[];
  set?: Record<string, number | boolean>;
  allowOverflow?: boolean;
  /** Time at which a non-looping state has finished (includes stagger/delay). */
  completeAt: number;
  at: string;
}
export interface RLayer {
  name: string;
  initial: string;
  states: Map<string, RState>;
  on: Map<string, NTransition>;
  add: boolean;
}
export interface RBinding {
  els: number[];
  prop: string;
  kind: PropKind;
  input?: string;
  map: { x: number; value: Value; ease?: EaseFn }[];
  template?: string;
  add?: boolean;
  at: string;
}
export interface RInteraction extends NInteraction {
  els: number[];
  withinEl?: number;
}

export interface Scene {
  ok: boolean;
  root: XElement;
  /** Elements by key (preorder index). */
  elements: XElement[];
  parents: (number | undefined)[];
  viewBox: Box;
  width: number;
  height: number;
  title?: string;
  inputs: Map<string, NInput>;
  layers: RLayer[];
  bindings: RBinding[];
  interactions: RInteraction[];
  events: Set<string>;
  /** Properties each element can receive, with their resting values. */
  base: Map<number, Map<string, Value>>;
  origins: Map<number, Point>;
  lengths: Map<number, number>;
  baseTransforms: Map<number, string>;
  diagnostics: Diagnostic[];
  hasMotion: boolean;
  motionSource?: string;
  /** Every element/property pair the motion writes, so writers can reset them. */
  touched: Map<number, Map<string, PropKind>>;
  /** Element bounds in its parent's coordinates (static artwork). */
  boxOf: (key: number) => Box | undefined;
  localBoxOf: (key: number) => Box | undefined;
  matrixOf: (key: number) => Matrix;
}

const DEFAULT_EASE = parseEasing('ease-in-out')!;
const LINEAR = parseEasing('linear')!;
const NON_RENDERED = new Set(['defs', 'clipPath', 'mask', 'linearGradient', 'radialGradient', 'stop', 'pattern', 'marker', 'filter', 'symbol', 'title', 'desc']);

export interface LoadOptions {
  /** Motion JSON (string or object) to use instead of, or in the absence of, an embedded block. */
  motion?: string | object;
}

function lineColumn(text: string, offset: number) {
  let line = 1, col = 1;
  for (let i = 0; i < offset && i < text.length; i++) {
    if (text[i] === '\n') {
      line++;
      col = 1;
    } else col++;
  }
  return { line, col };
}

/** Parses, sanitizes and compiles a Motion SVG. Never throws; inspect `ok` and `diagnostics`. */
export function loadScene(source: string, options: LoadOptions = {}): Scene {
  const diagnostics: Diagnostic[] = [];
  let parsed: XElement;
  try {
    parsed = parseXML(source);
  } catch (e) {
    const err = e as Error;
    diagnostics.push({ level: 'error', code: 'svg.xml', message: err instanceof XMLError ? err.message : `Could not parse SVG: ${err.message}` });
    parsed = { type: 'el', name: 'svg', attrs: { viewBox: '0 0 100 100' }, children: [] };
  }
  const { root, motionSource, issues } = sanitize(parsed);
  diagnostics.push(...issues);

  // Index elements.
  const elements: XElement[] = [];
  const parents: (number | undefined)[] = [];
  const byId = new Map<string, XElement>();
  const visit = (el: XElement, parent: number | undefined) => {
    el.key = elements.length;
    elements.push(el);
    parents.push(parent);
    if (el.attrs.id) {
      if (byId.has(el.attrs.id)) diagnostics.push({ level: 'warning', code: 'svg.duplicate-id', message: `Duplicate id "${el.attrs.id}"` });
      else byId.set(el.attrs.id, el);
    }
    for (const c of el.children) if (c.type === 'el') visit(c, el.key);
  };
  visit(root, undefined);
  const tree: TreeIndex = indexTree(root);

  // Artboard.
  const num = (v: string | undefined) => (v === undefined || /%$/.test(v) ? NaN : parseFloat(v));
  const vb = root.attrs.viewBox?.trim().split(/[\s,]+/).map(Number);
  let viewBox: Box;
  if (vb && vb.length === 4 && vb.every(Number.isFinite) && vb[2]! > 0 && vb[3]! > 0) viewBox = { x: vb[0]!, y: vb[1]!, width: vb[2]!, height: vb[3]! };
  else {
    const w = num(root.attrs.width), h = num(root.attrs.height);
    viewBox = { x: 0, y: 0, width: Number.isFinite(w) && w > 0 ? w : 300, height: Number.isFinite(h) && h > 0 ? h : 150 };
    if (!root.attrs.viewBox) diagnostics.push({ level: 'info', code: 'svg.viewbox', message: `No viewBox; using 0 0 ${viewBox.width} ${viewBox.height}`, hint: 'Add viewBox so the artwork scales cleanly.' });
    root.attrs.viewBox = `${viewBox.x} ${viewBox.y} ${viewBox.width} ${viewBox.height}`;
  }
  const w = num(root.attrs.width), h = num(root.attrs.height);
  const width = Number.isFinite(w) && w > 0 ? w : viewBox.width;
  const height = Number.isFinite(h) && h > 0 ? h : viewBox.height;
  const titleEl = root.children.find((c): c is XElement => c.type === 'el' && c.name === 'title');

  // Motion.
  let rawMotion: unknown;
  let motionText: string | undefined;
  if (options.motion !== undefined) {
    if (typeof options.motion === 'string') motionText = options.motion;
    else rawMotion = options.motion;
  } else motionText = motionSource;
  if (motionText !== undefined) {
    const res = parseMotionJSON(motionText);
    if (res.error) {
      if (res.offset !== undefined) {
        const blockStart = options.motion === undefined ? source.indexOf(motionText) : -1;
        const pos = blockStart >= 0 ? lineColumn(source, blockStart + res.offset) : lineColumn(motionText, res.offset);
        res.error.at = `${blockStart >= 0 ? 'file' : 'motion'} line ${pos.line}, column ${pos.col}`;
      }
      diagnostics.push(res.error);
    } else rawMotion = res.value;
  }
  let motion: NMotion | undefined;
  if (rawMotion !== undefined) {
    const n = normalizeMotion(rawMotion);
    diagnostics.push(...n.diagnostics);
    motion = n.motion;
  }

  const scene: Scene = {
    ok: false, root, elements, parents, viewBox, width, height,
    title: motion?.title ?? (titleEl ? textContent(titleEl).trim() : undefined),
    inputs: motion?.inputs ?? new Map(), layers: [], bindings: [], interactions: [], events: motion?.events ?? new Set(),
    base: new Map(), origins: new Map(), lengths: new Map(), baseTransforms: new Map(), diagnostics,
    hasMotion: !!motion, motionSource: motionText,
    touched: new Map(), boxOf: () => undefined, localBoxOf: () => undefined, matrixOf: () => IDENTITY,
  };

  // Selector resolution with cache and helpful errors.
  const selCache = new Map<string, number[] | undefined>();
  const resolve = (selector: string, at: string): number[] | undefined => {
    if (selCache.has(selector)) return selCache.get(selector);
    let result: number[] | undefined;
    try {
      const sel = parseSelector(selector);
      const found = selectAll(root, sel, tree).map(e => e.key!);
      if (!found.length) {
        const ids = [...byId.keys()];
        const idPart = /#([\w-]+)/.exec(selector)?.[1];
        const close = idPart ? suggestId(idPart, ids) : undefined;
        diagnostics.push({
          level: 'error', code: 'motion.no-match', at, message: `Selector "${selector}" matches no elements`,
          hint: close ? `Did you mean "#${close}"?` : ids.length ? `Available ids: ${ids.slice(0, 20).map(i => '#' + i).join(', ')}${ids.length > 20 ? ', …' : ''}` : 'Give the SVG elements you want to animate an id or class.',
        });
      } else result = found;
    } catch (e) {
      diagnostics.push({ level: 'error', code: 'motion.selector', at, message: e instanceof SelectorError ? e.message : String(e) });
    }
    selCache.set(selector, result);
    return result;
  };

  // Base values.
  const inherited = (el: XElement, attr: string): string | undefined => {
    let cur: XElement | undefined = el;
    while (cur) {
      if (cur.attrs[attr] !== undefined && cur.attrs[attr] !== 'inherit') return cur.attrs[attr];
      const p: number | undefined = parents[cur.key!];
      cur = p === undefined ? undefined : elements[p];
    }
  };
  const baseValue = (key: number, prop: string, kind: PropKind): Value => {
    const el = elements[key]!;
    let map = scene.base.get(key);
    if (!map) scene.base.set(key, (map = new Map()));
    const existing = map.get(prop);
    if (existing !== undefined) return existing;
    let v: Value;
    switch (kind) {
      case 'transform':
        v = TRANSFORM_DEFAULTS[prop as TransformProp];
        break;
      case 'number': {
        const attr = prop === 'scale-attr' ? 'scale' : prop;
        const raw = ['opacity', 'fill-opacity', 'stroke-opacity', 'stop-opacity', 'flood-opacity'].includes(prop) ? el.attrs[attr] : ['stroke-width', 'font-size', 'letter-spacing'].includes(prop) ? inherited(el, attr) : el.attrs[attr];
        const fallback = /opacity/.test(prop) ? 1 : prop === 'stroke-width' ? 1 : prop === 'font-size' ? 16 : 0;
        const n = raw === undefined ? fallback : parseFloat(raw);
        v = Number.isFinite(n) ? n : fallback;
        break;
      }
      case 'color': {
        const raw = prop === 'fill' || prop === 'stroke' || prop === 'color' ? inherited(el, prop) : el.attrs[prop];
        const fallback = prop === 'fill' || prop === 'stop-color' || prop === 'flood-color' ? '#000000' : 'none';
        const parsedColor = raw === undefined || raw === 'none' ? (raw === 'none' || fallback === 'none' ? undefined : parseColor(fallback)) : parseColor(raw, inherited(el, 'color'));
        if (raw?.startsWith('url(')) diagnostics.push({ level: 'warning', code: 'motion.paint-server', message: `<${el.name}${el.attrs.id ? ` id="${el.attrs.id}"` : ''}> uses ${raw} for ${prop}; animating it replaces the gradient/pattern with a flat color`, hint: 'Animate the gradient <stop> stop-color values instead.' });
        v = parsedColor ?? [0, 0, 0, 0];
        break;
      }
      case 'path': {
        const d = el.attrs.d ?? '';
        const pv = parseValue('path', d || 'M0 0');
        v = typeof pv === 'string' ? (parseValue('path', 'M0 0') as Value) : pv;
        break;
      }
      case 'draw': {
        // data-draw="0" (or "0.2 0.8") marks strokes that rest hidden or partly drawn.
        const d = el.attrs['data-draw']?.trim().split(/[\s,]+/).map(Number);
        v = d && d.every(Number.isFinite) ? (d.length >= 2 ? [d[0]!, d[1]!] : [0, d[0]!]) : [0, 1];
        break;
      }
      case 'text':
        v = textContent(el);
        break;
      case 'points': {
        const nums = (el.attrs.points ?? '').trim().split(/[\s,]+/).filter(Boolean).map(Number);
        v = nums;
        break;
      }
    }
    map.set(prop, v);
    return v;
  };

  // Geometry for origins and draw lengths.
  const boxCache = new Map<number, Box | undefined>();
  const localBox = (el: XElement, depth = 0): Box | undefined => {
    if (depth > 40) return;
    if (boxCache.has(el.key!)) return boxCache.get(el.key!);
    const f = (a: string, d = 0) => {
      const n = parseFloat(el.attrs[a] ?? '');
      return Number.isFinite(n) ? n : d;
    };
    let b: Box | undefined;
    switch (el.name) {
      case 'rect':
      case 'image':
        b = { x: f('x'), y: f('y'), width: f('width'), height: f('height') };
        break;
      case 'circle':
        b = { x: f('cx') - f('r'), y: f('cy') - f('r'), width: 2 * f('r'), height: 2 * f('r') };
        break;
      case 'ellipse':
        b = { x: f('cx') - f('rx'), y: f('cy') - f('ry'), width: 2 * f('rx'), height: 2 * f('ry') };
        break;
      case 'line':
        b = boundsOfPoints([[f('x1'), f('y1')], [f('x2'), f('y2')]]);
        break;
      case 'polyline':
      case 'polygon': {
        const n = (el.attrs.points ?? '').trim().split(/[\s,]+/).map(Number);
        const pts: Point[] = [];
        for (let i = 0; i + 1 < n.length; i += 2) pts.push([n[i]!, n[i + 1]!]);
        b = boundsOfPoints(pts);
        break;
      }
      case 'path': {
        const sp = parsePath(el.attrs.d ?? '');
        b = sp ? boundsOfPoints(flatten(sp).flat()) : undefined;
        break;
      }
      case 'text': {
        const size = parseFloat(inherited(el, 'font-size') ?? '16') || 16;
        const str = textContent(el);
        const w = str.length * size * 0.56;
        const anchor = inherited(el, 'text-anchor');
        const x = f('x') - (anchor === 'middle' ? w / 2 : anchor === 'end' ? w : 0);
        b = { x, y: f('y') - size * 0.78, width: w, height: size };
        break;
      }
      case 'use': {
        const ref = el.attrs.href?.startsWith('#') ? byId.get(el.attrs.href.slice(1)) : undefined;
        const rb = ref ? childBox(ref, depth + 1) : undefined;
        b = rb ? { ...rb, x: rb.x + f('x'), y: rb.y + f('y') } : undefined;
        break;
      }
      case 'g':
      case 'svg':
      case 'symbol':
      case 'a':
        b = unionBoxes(el.children.filter((c): c is XElement => c.type === 'el' && !NON_RENDERED.has(c.name)).map(c => childBox(c, depth + 1)));
        break;
    }
    boxCache.set(el.key!, b);
    return b;
  };
  /** Box of a child in its parent's coordinates (applies the child's own transform). */
  const childBox = (el: XElement, depth = 0): Box | undefined => {
    const b = localBox(el, depth);
    if (!b) return;
    const m = parseTransform(el.attrs.transform) ?? IDENTITY;
    return transformBox(b, m);
  };
  scene.boxOf = (key: number) => childBox(elements[key]!);
  scene.localBoxOf = (key: number) => localBox(elements[key]!);
  scene.matrixOf = (key: number) => parseTransform(elements[key]!.attrs.transform) ?? IDENTITY;

  const originSpecs = new Map<number, { spec: string; at: string }>();
  const noteOrigin = (els: number[], spec: string | undefined, at: string) => {
    if (!spec) return;
    for (const k of els) {
      const prev = originSpecs.get(k);
      if (prev && prev.spec !== spec) diagnostics.push({ level: 'warning', code: 'motion.origin-conflict', at, message: `Element already has origin "${prev.spec}" (from ${prev.at}); ignoring "${spec}"` });
      else originSpecs.set(k, { spec, at });
    }
  };

  const touched = new Map<number, Map<string, PropKind>>();
  const touch = (el: number, prop: string, kind: PropKind, at: string) => {
    let m = touched.get(el);
    if (!m) touched.set(el, (m = new Map()));
    m.set(prop, kind);
    const element = elements[el]!;
    if (kind === 'number' && !['opacity', 'fill-opacity', 'stroke-opacity', 'stroke-width', 'stroke-dashoffset', 'stroke-miterlimit', 'font-size', 'letter-spacing', 'word-spacing', 'stop-opacity', 'flood-opacity'].includes(prop)) {
      const allowed = GEOMETRY_ATTRS[element.name];
      if (!allowed?.includes(prop)) {
        const hint = (prop === 'x' || prop === 'y') ? `Use translate${prop.toUpperCase()} to move <${element.name}> elements.` : prop === 'r' ? 'Use scale to resize non-circles.' : allowed ? `<${element.name}> supports: ${allowed.join(', ')}` : 'Use transform properties (translateX/Y, rotate, scale) instead.';
        diagnostics.push({ level: 'error', code: 'motion.bad-attribute', at, message: `"${prop}" has no effect on <${element.name}${element.attrs.id ? `#${element.attrs.id}` : ''}>`, hint });
      }
    }
    if (kind === 'path' && element.name !== 'path') diagnostics.push({ level: 'error', code: 'motion.bad-attribute', at, message: `"d" can only morph <path> elements, not <${element.name}>`, hint: 'Convert the shape to a <path>.' });
    if (kind === 'points' && element.name !== 'polygon' && element.name !== 'polyline') diagnostics.push({ level: 'error', code: 'motion.bad-attribute', at, message: `"points" only applies to <polygon>/<polyline>` });
    if (kind === 'draw' && ['g', 'svg', 'text', 'image', 'use'].includes(element.name)) diagnostics.push({ level: 'error', code: 'motion.bad-attribute', at, message: `"draw" needs a stroked shape (path, line, circle, rect, polyline…), not <${element.name}>`, hint: 'Target the shapes inside the group, e.g. "#group > *".' });
    if (kind === 'text' && element.name !== 'text' && element.name !== 'tspan') diagnostics.push({ level: 'error', code: 'motion.bad-attribute', at, message: `"text" only applies to <text> or <tspan>` });
    if (kind === 'draw' && !scene.lengths.has(el)) {
      let len = 0;
      const f = (a: string) => parseFloat(element.attrs[a] ?? '0') || 0;
      if (element.name === 'path') {
        const sp = parsePath(element.attrs.d ?? '');
        len = sp ? pathLength(sp) : 0;
      } else if (element.name === 'line') len = Math.hypot(f('x2') - f('x1'), f('y2') - f('y1'));
      else if (element.name === 'circle') len = 2 * Math.PI * f('r');
      else if (element.name === 'ellipse') {
        const a = f('rx'), b = f('ry');
        len = Math.PI * (3 * (a + b) - Math.sqrt((3 * a + b) * (a + 3 * b)));
      } else if (element.name === 'rect') len = 2 * (f('width') + f('height'));
      else if (element.name === 'polyline' || element.name === 'polygon') {
        const n = (element.attrs.points ?? '').trim().split(/[\s,]+/).map(Number);
        for (let i = 2; i + 1 < n.length; i += 2) len += Math.hypot(n[i]! - n[i - 2]!, n[i + 1]! - n[i - 1]!);
        if (element.name === 'polygon' && n.length >= 4) len += Math.hypot(n[0]! - n[n.length - 2]!, n[1]! - n[n.length - 1]!);
      }
      scene.lengths.set(el, len);
    }
  };

  if (motion) {
    for (const layer of motion.layers) {
      const rl: RLayer = { name: layer.name, initial: layer.initial, states: new Map(), on: layer.on, add: layer.add };
      for (const st of layer.states.values()) {
        const channels: Channel[] = [];
        let completeAt = st.duration * (st.loop === Infinity ? 1 : st.loop);
        for (const g of st.groups) {
          const els = resolve(g.selector, g.at);
          if (!els) continue;
          noteOrigin(els, g.origin, g.at);
          els.forEach((el, index) => {
            const offset = g.delay + index * g.stagger;
            for (const tr of g.tracks) {
              touch(el, tr.prop, tr.kind, tr.at);
              const base = baseValue(el, tr.prop, tr.kind);
              const keys: Key[] = tr.keys
                .map(k => ({ t: k.ms ?? (k.pct ?? 0) * st.duration, value: k.value, ease: k.ease }))
                .sort((a, b) => a.t - b.t);
              if (!keys.length) continue;
              const explicitStart = keys[0]!.t === 0 && !tr.keys[0]?.constant;
              if (keys[0]!.t > 0) keys.unshift({ t: 0, value: base });
              channels.push({ el, prop: tr.prop, kind: tr.kind, keys, ease: tr.ease ?? g.ease ?? st.ease ?? (tr.kind === 'text' ? LINEAR : DEFAULT_EASE), offset, explicitStart, curve: g.curve, at: tr.at });
            }
            if (st.loop !== Infinity) completeAt = Math.max(completeAt, offset + st.duration * st.loop);
          });
        }
        rl.states.set(st.name, { name: st.name, duration: st.duration, loop: st.loop, alternate: st.alternate, channels, on: st.on, when: st.when, next: st.next, emit: st.emit, set: st.set, allowOverflow: st.allowOverflow, completeAt, at: st.at });
      }
      scene.layers.push(rl);
    }
    for (const b of motion.bindings) {
      const els = resolve(b.selector, b.at);
      if (!els) continue;
      noteOrigin(els, b.origin, b.at);
      for (const el of els) {
        touch(el, b.prop, b.kind, b.at);
        baseValue(el, b.prop, b.kind);
      }
      scene.bindings.push({ els, prop: b.prop, kind: b.kind, input: b.input, map: b.map, template: b.template, add: b.add, at: b.at });
    }
    for (const it of motion.interactions) {
      const els = it.selector ? resolve(it.selector, `${it.at}.target`) ?? [] : [0];
      const within = it.within ? resolve(it.within, `${it.at}.within`)?.[0] : undefined;
      scene.interactions.push({ ...it, els, withinEl: within });
    }
  }

  // Origins for every element that receives transforms.
  for (const [el, props] of touched) {
    let needs = false;
    for (const k of props.values()) if (k === 'transform') needs = true;
    for (const prop of props.keys()) baseValue(el, prop, props.get(prop)!);
    if (!needs) continue;
    const element = elements[el]!;
    scene.baseTransforms.set(el, element.attrs.transform ?? '');
    const box = childBox(element) ?? { x: 0, y: 0, width: 0, height: 0 };
    const origin = resolveOrigin(originSpecs.get(el)?.spec, box, diagnostics, originSpecs.get(el)?.at);
    const reach = Math.max(box.width, box.height, 1);
    const dist = Math.max(box.x - origin[0], origin[0] - (box.x + box.width), box.y - origin[1], origin[1] - (box.y + box.height), 0);
    if (dist > reach * 1.5 && originSpecs.get(el)) diagnostics.push({ level: 'warning', code: 'motion.origin-far', at: originSpecs.get(el)!.at, message: `Origin "${originSpecs.get(el)!.spec}" is ${Math.round(dist)} units away from ${element.attrs.id ? '#' + element.attrs.id : `<${element.name}>`}, so rotation and scale will swing it widely`, hint: `Absolute origins are in the element's parent coordinates (its box there is ${Math.round(box.x)},${Math.round(box.y)} ${Math.round(box.width)}×${Math.round(box.height)}). Percentages like "50% 100%" are relative to the element's own box.` });
    scene.origins.set(el, origin);
  }
  scene.touched = touched;
  scene.ok = !diagnostics.some(d => d.level === 'error');
  return scene;
}

function suggestId(id: string, ids: string[]): string | undefined {
  const lower = id.toLowerCase();
  return ids.find(i => i.toLowerCase() === lower) ?? ids.find(i => i.toLowerCase().includes(lower) || lower.includes(i.toLowerCase())) ?? ids.find(i => levenshtein(i.toLowerCase(), lower) <= 2);
}
function levenshtein(a: string, b: string): number {
  const dp = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    let prev = dp[0]!;
    dp[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = dp[j]!;
      dp[j] = Math.min(dp[j]! + 1, dp[j - 1]! + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = tmp;
    }
  }
  return dp[b.length]!;
}

const KEYWORDS: Record<string, [number, number]> = {
  center: [0.5, 0.5], left: [0, 0.5], right: [1, 0.5], top: [0.5, 0], bottom: [0.5, 1],
};

/**
 * Origins: "center" (default), keywords ("left top", "bottom"), percentages of the
 * element's box ("50% 100%"), or absolute artboard coordinates ("120 80").
 */
export function resolveOrigin(spec: string | undefined, box: Box, diagnostics: Diagnostic[], at?: string): Point {
  const s = (spec ?? 'center').trim().toLowerCase();
  const parts = s.split(/[\s,]+/);
  let fx: number | undefined, fy: number | undefined;
  let ax: number | undefined, ay: number | undefined;
  const assign = (p: string, axis?: 'x' | 'y') => {
    if (p in KEYWORDS) {
      const [kx, ky] = KEYWORDS[p]!;
      if (p === 'left' || p === 'right') fx = kx;
      else if (p === 'top' || p === 'bottom') fy = ky;
      else {
        if (axis !== 'y' && fx === undefined && ax === undefined) fx = kx;
        if (axis !== 'x' && fy === undefined && ay === undefined) fy = ky;
      }
      return true;
    }
    const pct = /^(-?[\d.]+)%$/.exec(p);
    const abs = /^(-?[\d.]+)(px)?$/.exec(p);
    if (pct) {
      if (axis === 'y') fy = Number(pct[1]) / 100;
      else fx = Number(pct[1]) / 100;
      return true;
    }
    if (abs) {
      if (axis === 'y') ay = Number(abs[1]);
      else ax = Number(abs[1]);
      return true;
    }
    return false;
  };
  let ok = parts.length <= 2;
  if (ok) {
    if (parts.length === 1) ok = assign(parts[0]!);
    else ok = assign(parts[0]!, /^(top|bottom)$/.test(parts[0]!) ? 'y' : 'x') && assign(parts[1]!, /^(left|right)$/.test(parts[1]!) ? 'x' : 'y');
  }
  if (!ok) {
    diagnostics.push({ level: 'error', code: 'motion.origin', at, message: `Origin "${spec}" is not valid`, hint: 'Use "center", "left top", "50% 100%", or artboard coordinates "120 80".' });
    fx = fy = 0.5;
  }
  const x = ax ?? box.x + box.width * (fx ?? 0.5);
  const y = ay ?? box.y + box.height * (fy ?? 0.5);
  return [x, y];
}

export { apply as applyMatrix, multiply as multiplyMatrix };
