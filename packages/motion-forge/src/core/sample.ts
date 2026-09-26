import { mixColor, type RGBA } from './color';
import { alignPaths, lerpSubpaths, pathToSubpaths, sameStructure, subpathsToD, tokensToD, type Subpath } from './geometry';
import type { PathValue, Value } from './motion';
import type { PropKind } from './props';
import type { Channel, RState, Scene } from './scene';

/** element key → property → value */
export type Frame = Map<number, Map<string, Value>>;

function subpathsOf(p: PathValue): Subpath[] {
  return (p.subpaths ??= pathToSubpaths(p.tokens));
}

const alignCache = new WeakMap<PathValue, WeakMap<PathValue, [Subpath[], Subpath[]]>>();

function morph(a: PathValue, b: PathValue, t: number): PathValue {
  if (sameStructure(a.tokens, b.tokens)) {
    const tokens = { commands: a.tokens.commands, args: a.tokens.args.map((args, i) => args.map((v, j) => {
      const c = a.tokens.commands[i]!.toLowerCase();
      if (c === 'a' && (j === 3 || j === 4)) return v;
      return v + (b.tokens.args[i]![j]! - v) * t;
    })) };
    return { d: tokensToD(tokens), tokens };
  }
  let inner = alignCache.get(a);
  if (!inner) alignCache.set(a, (inner = new WeakMap()));
  let pair = inner.get(b);
  if (!pair) inner.set(b, (pair = alignPaths(subpathsOf(a), subpathsOf(b))));
  const sp = lerpSubpaths(pair[0], pair[1], t);
  const d = subpathsToD(sp);
  // Tokens here are only used for further morphing; build a C-only token list.
  const commands: string[] = [];
  const args: number[][] = [];
  for (const p of sp) {
    commands.push('M');
    args.push([p.start[0], p.start[1]]);
    for (const s of p.segs) {
      commands.push('C');
      args.push([...s]);
    }
    if (p.closed) {
      commands.push('Z');
      args.push([]);
    }
  }
  return { d, tokens: { commands, args }, subpaths: sp };
}

export function interpolate(kind: PropKind, a: Value, b: Value, t: number): Value {
  if (t <= 0) return a;
  if (t >= 1 && kind !== 'number' && kind !== 'transform') return b;
  switch (kind) {
    case 'number':
    case 'transform':
      return (a as number) + ((b as number) - (a as number)) * t;
    case 'color':
      return mixColor(a as RGBA, b as RGBA, Math.min(1, Math.max(0, t)));
    case 'path':
      return morph(a as PathValue, b as PathValue, t);
    case 'draw': {
      const x = a as [number, number], y = b as [number, number];
      return [x[0] + (y[0] - x[0]) * t, x[1] + (y[1] - x[1]) * t];
    }
    case 'points': {
      const x = a as number[], y = b as number[];
      return x.length === y.length ? x.map((v, i) => v + (y[i]! - v) * t) : t < 1 ? x : y;
    }
    case 'text':
      return t < 1 ? a : b;
  }
}

/** Where a channel is in its own timeline, given time since the state began. */
export function channelPhase(state: RState, channel: Channel, t: number): number {
  const d = state.duration;
  const local = t - channel.offset;
  if (d <= 0) return 0;
  if (state.loop === Infinity) {
    let iteration = Math.floor(local / d);
    let phase = local - iteration * d;
    if (state.alternate && iteration % 2 !== 0) phase = d - phase;
    return phase;
  }
  if (local <= 0) return 0;
  const total = d * state.loop;
  if (local >= total) {
    const iterations = state.loop;
    return state.alternate && Math.ceil(iterations) % 2 === 0 ? 0 : d;
  }
  const iteration = Math.floor(local / d);
  const phase = local - iteration * d;
  return state.alternate && iteration % 2 !== 0 ? d - phase : phase;
}

export function sampleChannel(channel: Channel, phase: number): Value {
  const keys = channel.keys;
  if (keys.length === 1 || phase <= keys[0]!.t) return keys[0]!.value;
  const last = keys[keys.length - 1]!;
  if (phase >= last.t) return last.value;
  let i = 1;
  while (i < keys.length - 1 && keys[i]!.t < phase) i++;
  const a = keys[i - 1]!, b = keys[i]!;
  const span = b.t - a.t;
  const p = span <= 0 ? 1 : (phase - a.t) / span;
  if (channel.curve === 'smooth' && (channel.kind === 'number' || channel.kind === 'transform')) {
    // Catmull-Rom through neighbouring keys: motion flows through keyframes instead of stopping.
    const v0 = (keys[i - 2] ?? a).value as number, v1 = a.value as number, v2 = b.value as number, v3 = (keys[i + 1] ?? b).value as number;
    const t = b.ease ? b.ease(p) : p;
    const t2 = t * t, t3 = t2 * t;
    return 0.5 * (2 * v1 + (-v0 + v2) * t + (2 * v0 - 5 * v1 + 4 * v2 - v3) * t2 + (-v0 + 3 * v1 - 3 * v2 + v3) * t3);
  }
  return interpolate(channel.kind, a.value, b.value, (b.ease ?? channel.ease)(p));
}

export function sampleState(state: RState, t: number, into: Frame = new Map()): Frame {
  for (const ch of state.channels) {
    let m = into.get(ch.el);
    if (!m) into.set(ch.el, (m = new Map()));
    m.set(ch.prop, sampleChannel(ch, channelPhase(state, ch, t)));
  }
  return into;
}

export function baseOf(scene: Scene, el: number, prop: string): Value | undefined {
  return scene.base.get(el)?.get(prop);
}

export function kindOf(scene: Scene, el: number, prop: string): PropKind {
  return scene.touched.get(el)?.get(prop) ?? 'number';
}

/** Blend two frames; missing values fall back to the scene's resting values. */
export function blendFrames(scene: Scene, from: Frame, to: Frame, t: number, into: Frame = new Map()): Frame {
  const keys = new Set<number>([...from.keys(), ...to.keys()]);
  for (const el of keys) {
    const a = from.get(el), b = to.get(el);
    const props = new Set<string>([...(a?.keys() ?? []), ...(b?.keys() ?? [])]);
    let out = into.get(el);
    if (!out) into.set(el, (out = new Map()));
    for (const prop of props) {
      const base = baseOf(scene, el, prop);
      const va = a?.get(prop) ?? base, vb = b?.get(prop) ?? base;
      if (va === undefined || vb === undefined) continue;
      out.set(prop, interpolate(kindOf(scene, el, prop), va, vb, t));
    }
  }
  return into;
}

export function formatNumber(n: number, digits: number): string {
  return n.toFixed(digits);
}
