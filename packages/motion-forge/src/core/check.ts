import { IDENTITY, multiply, parseTransform, transformBox, type Box, type Matrix } from './geometry';
import type { Value } from './motion';
import { Player } from './player';
import { frameAttributes } from './render';
import { sampleChannel } from './sample';
import type { Diagnostic } from './sanitize';
import { loadScene, type LoadOptions, type RState, type Scene } from './scene';

export interface StateSummary {
  layer: string;
  name: string;
  duration: number;
  loop: number | 'forever';
  channels: number;
  events: Record<string, string>;
  when: Record<string, string>;
  next?: string;
}
export interface CheckReport {
  ok: boolean;
  diagnostics: Diagnostic[];
  counts: { errors: number; warnings: number; infos: number };
  summary: {
    title?: string;
    viewBox: string;
    elements: number;
    ids: string[];
    animatedElements: number;
    initial?: string;
    states: StateSummary[];
    inputs: { name: string; type: string; min?: number; max?: number; default: number | boolean }[];
    events: string[];
    interactions: string[];
  };
}

const same = (a: Value, b: Value): boolean => {
  if (typeof a === 'number' && typeof b === 'number') return Math.abs(a - b) < 1e-6;
  if (Array.isArray(a) && Array.isArray(b)) return a.length === b.length && a.every((v, i) => Math.abs((v as number) - (b[i] as number)) < 1e-4);
  if (typeof a === 'object' && typeof b === 'object' && a && b && 'd' in a && 'd' in b) return a.d === b.d;
  return a === b;
};

/** Validates a Motion SVG and lints it for motion problems agents can't see. */
export function check(input: string | Scene, options: LoadOptions = {}): CheckReport {
  const scene = typeof input === 'string' ? loadScene(input, options) : input;
  const diagnostics = [...scene.diagnostics];
  const warn = (code: string, at: string, message: string, hint?: string) => diagnostics.push({ level: 'warning', code, at, message, hint });
  const info = (code: string, at: string | undefined, message: string, hint?: string) => diagnostics.push({ level: 'info', code, at, message, hint });
  const name = (k: number) => {
    const el = scene.elements[k]!;
    return el.attrs.id ? `#${el.attrs.id}` : el.attrs.class ? `${el.name}.${el.attrs.class.split(/\s+/)[0]}` : `<${el.name}>`;
  };

  if (!scene.hasMotion) info('motion.none', undefined, 'No motion block: this renders as a static SVG', 'Add <metadata type="application/motion+json"> with states. Run `motion-forge docs` for the format.');
  if (!scene.title) info('a11y.title', undefined, 'No <title>; screen readers will announce an unlabeled graphic', 'Add <title>What this shows</title> as the first child of <svg>.');

  const hasErrors = diagnostics.some(d => d.level === 'error');
  if (scene.hasMotion && !hasErrors) {
    // Per-state channel lint.
    for (const layer of scene.layers) {
      for (const st of layer.states.values()) {
        const seen = new Map<string, string>();
        for (const ch of st.channels) {
          const id = `${ch.el}:${ch.prop}`;
          if (seen.has(id) && seen.get(id) !== ch.at) warn('motion.overlap', ch.at, `${name(ch.el)} ${ch.prop} is animated twice in state "${st.name}"; the later one wins`, `First defined at ${seen.get(id)}`);
          seen.set(id, ch.at);
          const rest = scene.base.get(ch.el)?.get(ch.prop);
          if (st.duration > 0 && ch.keys.length > 1 && ch.keys.every(k => same(k.value, ch.keys[0]!.value)) && ch.keys.some(k => k.t > 0) && rest !== undefined && same(rest, ch.keys[0]!.value)) {
            warn('motion.static', ch.at, `${ch.prop} on ${name(ch.el)} never changes in "${st.name}"`, 'Every keyframe has the same value (missing 0% keys start from the element\'s resting value).');
          }
          if (st.loop === Infinity && !st.alternate && st.duration > 0 && ch.kind !== 'text') {
            const a = sampleChannel(ch, 0), b = sampleChannel(ch, st.duration);
            const rotationWrap = ch.prop === 'rotate' && typeof a === 'number' && typeof b === 'number' && Math.abs(((b - a) % 360 + 360) % 360) < 1e-6;
            if (!same(a, b) && !rotationWrap) warn('motion.loop-seam', ch.at, `${ch.prop} on ${name(ch.el)} jumps when "${st.name}" loops (${fmt(a)} → ${fmt(b)})`, 'Make the first and last keyframes match, set "alternate": true to ping-pong, or (if the jump happens while the element is hidden) give the last keyframe "ease": "hold".');
          }
          for (let i = 1; i < ch.keys.length; i++) {
            const span = ch.keys[i]!.t - ch.keys[i - 1]!.t;
            if (span > 0 && span < 40 && !same(ch.keys[i]!.value, ch.keys[i - 1]!.value)) {
              info('motion.too-fast', ch.at, `${ch.prop} on ${name(ch.el)} changes over only ${Math.round(span)}ms; that reads as a jump at 60fps`);
              break;
            }
          }
        }
        if (st.loop === Infinity && st.duration > 20000) info('motion.long-loop', st.at, `"${st.name}" loops every ${(st.duration / 1000).toFixed(1)}s`);
        if (st.loop !== Infinity && st.completeAt > 6000 && st.channels.length) info('motion.long', st.at, `"${st.name}" takes ${(st.completeAt / 1000).toFixed(1)}s; UI feedback usually lands under 1s`);
      }
      // Reachability.
      const reached = new Set<string>([layer.initial]);
      for (const t of layer.on.values()) reached.add(t.to);
      const queue = [...reached];
      while (queue.length) {
        const st = layer.states.get(queue.pop()!);
        if (!st) continue;
        const targets = [...st.on.values(), ...st.when.map(w => w.transition), ...(st.next ? [st.next] : [])].map(t => t.to);
        for (const t of targets) if (!reached.has(t)) {
          reached.add(t);
          queue.push(t);
        }
      }
      for (const st of layer.states.keys()) if (!reached.has(st)) info('motion.unreachable', `${layer.name === 'main' ? '' : `layers.${layer.name}.`}states.${st}`, `State "${st}" is only reachable with goto(); no event, condition or "next" leads to it`);
    }

    // Unused inputs.
    const used = new Set<string>();
    for (const b of scene.bindings) {
      if (b.input) used.add(b.input);
      for (const m of b.template?.matchAll(/\{(\w[\w-]*)/g) ?? []) used.add(m[1]!);
    }
    for (const it of scene.interactions) for (const i of [it.toggle, it.hold, it.x, it.y, ...Object.keys(it.set ?? {})]) if (i) used.add(i);
    for (const layer of scene.layers) for (const st of layer.states.values()) for (const w of st.when) for (const m of w.source.matchAll(/[A-Za-z_][\w-]*/g)) used.add(m[0]);
    for (const i of scene.inputs.keys()) if (!used.has(i)) info('motion.unused-input', `inputs.${i}`, `Input "${i}" is declared but nothing in the file uses it (host code can still set it)`);

    // Artboard overflow: sample every state and compare element bounds to the viewBox.
    overflowCheck(scene, warn);
    conflictCheck(scene, warn);
  }

  // Collapse identical messages (e.g. one selector matching many elements).
  const seenMsg = new Map<string, Diagnostic>();
  const merged: Diagnostic[] = [];
  const repeat = new Map<Diagnostic, number>();
  for (const d of diagnostics) {
    const key = `${d.level}|${d.code}|${d.at ?? ''}|${d.message.replace(/<[^>]+>|#[\w-]+/g, '')}`;
    const first = seenMsg.get(key);
    if (first && d.code !== 'motion.no-match') repeat.set(first, (repeat.get(first) ?? 1) + 1);
    else {
      seenMsg.set(key, d);
      merged.push(d);
    }
  }
  for (const [d, n] of repeat) d.message += ` (and ${n - 1} more like it)`;
  diagnostics.length = 0;
  diagnostics.push(...merged);
  const counts = { errors: 0, warnings: 0, infos: 0 };
  for (const d of diagnostics) counts[d.level === 'error' ? 'errors' : d.level === 'warning' ? 'warnings' : 'infos']++;
  const states: StateSummary[] = [];
  for (const layer of scene.layers)
    for (const st of layer.states.values())
      states.push({
        layer: layer.name,
        name: st.name,
        duration: Math.round(st.duration),
        loop: st.loop === Infinity ? 'forever' : st.loop,
        channels: st.channels.length,
        events: Object.fromEntries([...st.on].map(([k, v]) => [k, v.to])),
        when: Object.fromEntries(st.when.map(w => [w.source, w.transition.to])),
        next: st.next?.to,
      });
  return {
    ok: counts.errors === 0,
    diagnostics,
    counts,
    summary: {
      title: scene.title,
      viewBox: `${scene.viewBox.x} ${scene.viewBox.y} ${scene.viewBox.width} ${scene.viewBox.height}`,
      elements: scene.elements.length,
      ids: scene.elements.map(e => e.attrs.id).filter((x): x is string => !!x),
      animatedElements: scene.touched.size,
      initial: scene.layers[0]?.initial,
      states,
      inputs: [...scene.inputs.values()].map(i => (i.type === 'boolean' ? { name: i.name, type: i.type, default: !!i.default } : { name: i.name, type: i.type, min: i.min, max: i.max, default: i.default })),
      events: [...scene.events],
      interactions: scene.interactions.map(i => `${i.on}${i.selector ? ` ${i.selector}` : ''} → ${[i.send && `send ${i.send}`, i.leave && `leave ${i.leave}`, i.toggle && `toggle ${i.toggle}`, i.hold && `hold ${i.hold}`, i.set && `set ${JSON.stringify(i.set)}`, i.x && `x→${i.x}`, i.y && `y→${i.y}`].filter(Boolean).join(', ')}`),
    },
  };
}

function fmt(v: Value): string {
  if (typeof v === 'number') return String(Math.round(v * 1000) / 1000);
  if (typeof v === 'string') return JSON.stringify(v);
  if (Array.isArray(v)) return `[${v.map(x => Math.round((x as number) * 1000) / 1000).join(', ')}]`;
  return 'path';
}

const NON_RENDERED = new Set(['defs', 'clipPath', 'mask', 'linearGradient', 'radialGradient', 'stop', 'pattern', 'marker', 'filter', 'symbol']);

function overflowCheck(scene: Scene, warn: (code: string, at: string, message: string, hint?: string) => void) {
  const vb = scene.viewBox;
  const inDefs = new Set<number>();
  scene.elements.forEach((el, k) => {
    const p = scene.parents[k];
    if (NON_RENDERED.has(el.name) || (p !== undefined && inDefs.has(p))) inDefs.add(k);
  });
  const candidates = [...scene.touched.keys()].filter(k => !inDefs.has(k) && k !== 0);
  if (!candidates.length) return;
  const size = Math.max(vb.width, vb.height);
  const ancestors = (k: number) => {
    const out: number[] = [];
    for (let p = scene.parents[k]; p !== undefined && p !== 0; p = scene.parents[p]) out.push(p);
    return out;
  };
  const test = (st: RState, layerName: string) => {
    const player = new Player(scene, { hold: true });
    if (!player.goto(st.name, { layer: layerName })) return;
    const span = st.loop === Infinity ? st.duration : st.completeAt;
    const steps = span > 0 ? 24 : 1;
    const worst = new Map<number, { over: number; t: number }>();
    for (let s = 0; s <= steps; s++) {
      const t = (span * s) / steps;
      player.seek(t, layerName);
      const frame = player.frame();
      const attrs = frameAttributes(scene, frame);
      const world = new Map<number, Matrix>();
      const worldOf = (k: number): Matrix => {
        const cached = world.get(k);
        if (cached) return cached;
        const p = scene.parents[k];
        const own = parseTransform(attrs.get(k)?.transform ?? scene.elements[k]!.attrs.transform) ?? IDENTITY;
        const m = multiply(p === undefined || p === 0 ? IDENTITY : worldOf(p), own);
        world.set(k, m);
        return m;
      };
      const opacity = (k: number) => {
        let o = 1;
        for (const e of [k, ...ancestors(k)]) {
          const v = frame.get(e)?.get('opacity') ?? scene.base.get(e)?.get('opacity') ?? Number(scene.elements[e]!.attrs.opacity ?? 1);
          o *= typeof v === 'number' ? v : 1;
        }
        return o;
      };
      for (const k of candidates) {
        const local = scene.localBoxOf(k);
        if (!local || (local.width === 0 && local.height === 0)) continue;
        const rest = restBox(scene, k);
        if (!rest || !inside(rest, vb, 1)) continue;
        if (opacity(k) < 0.05) continue;
        const over = overflow(transformBox(local, worldOf(k)), vb);
        if (over > size * 0.02 && over > (worst.get(k)?.over ?? 0)) worst.set(k, { over, t });
      }
    }
    // Report the outermost element that overflows; its children move with it.
    for (const [k, w] of worst) {
      if (ancestors(k).some(a => worst.has(a))) continue;
      const own = st.channels.find(c => c.el === k) ?? st.channels.find(c => ancestors(k).includes(c.el)) ?? st.channels.find(c => ancestors(c.el).includes(k));
      warn('motion.overflow', own?.at ?? st.at, `${label(scene, k)} goes up to ${Math.round(w.over)} units past the artboard edge in "${st.name}" (worst around ${Math.round(w.t)}ms) and will be clipped`, 'Shrink the motion, move the element inward, or enlarge the viewBox. If leaving the frame is intended, set "allowOverflow": true on the state.');
    }
  };
  for (const layer of scene.layers) for (const st of layer.states.values()) if (st.channels.length && !st.allowOverflow) test(st, layer.name);
}

/** Warns when two layers (or a layer and a binding) write the same property: one silently wins. */
function conflictCheck(scene: Scene, warn: (code: string, at: string, message: string, hint?: string) => void) {
  const writers = new Map<string, { who: string; at: string; add: boolean }[]>();
  const note = (el: number, prop: string, who: string, at: string, add: boolean) => {
    const key = `${el}:${prop}`;
    const list = writers.get(key) ?? [];
    if (!list.some(w => w.who === who)) list.push({ who, at, add });
    writers.set(key, list);
  };
  for (const layer of scene.layers) for (const st of layer.states.values()) for (const ch of st.channels) note(ch.el, ch.prop, `layer "${layer.name}"`, ch.at, layer.add);
  for (const b of scene.bindings) for (const el of b.els) note(el, b.prop, 'a binding', b.at, !!b.add);
  const reported = new Set<string>();
  for (const [key, list] of writers) {
    const replacing = list.filter((w, i) => i === 0 || !w.add);
    if (replacing.length < 2) continue;
    const [el, prop] = key.split(':');
    const msg = `${prop} on ${label(scene, Number(el))} is written by ${replacing.map(w => w.who).join(' and ')}; the last one wins and the others never show`;
    if (reported.has(msg)) continue;
    reported.add(msg);
    warn('motion.conflict', replacing[replacing.length - 1]!.at, msg, 'Wrap the element in a <g> so each layer animates its own node, or set "add": true on the layer or binding to combine them.');
  }
}

function restBox(scene: Scene, k: number): Box | undefined {
  const local = scene.localBoxOf(k);
  if (!local) return;
  let m: Matrix = IDENTITY;
  const chain: number[] = [];
  for (let c: number | undefined = k; c !== undefined && c !== 0; c = scene.parents[c]) chain.unshift(c);
  for (const c of chain) m = multiply(m, scene.matrixOf(c));
  return transformBox(local, m);
}
function inside(b: Box, vb: Box, tol: number) {
  return b.x >= vb.x - tol && b.y >= vb.y - tol && b.x + b.width <= vb.x + vb.width + tol && b.y + b.height <= vb.y + vb.height + tol;
}
function overflow(b: Box, vb: Box) {
  return Math.max(0, vb.x - b.x, vb.y - b.y, b.x + b.width - (vb.x + vb.width), b.y + b.height - (vb.y + vb.height));
}
function label(scene: Scene, k: number) {
  const el = scene.elements[k]!;
  return el.attrs.id ? `#${el.attrs.id}` : `<${el.name}${el.attrs.class ? ` class="${el.attrs.class}"` : ''}>`;
}

/** Human-readable report for terminals and agents. */
export function formatReport(report: CheckReport, file = 'file'): string {
  const lines: string[] = [];
  const icon = { error: '✖', warning: '▲', info: '·' } as const;
  const s = report.summary;
  lines.push(`${report.ok ? '✔' : '✖'} ${file}${s.title ? ` — ${s.title}` : ''}`);
  lines.push(`  viewBox ${s.viewBox} · ${s.elements} elements · ${s.animatedElements} animated`);
  if (s.states.length) {
    lines.push('  states:');
    for (const st of s.states) {
      const flow = [
        ...Object.entries(st.events).map(([e, t]) => `on ${e} → ${t}`),
        ...Object.entries(st.when).map(([c, t]) => `when ${c} → ${t}`),
        st.next ? `then → ${st.next}` : '',
      ].filter(Boolean);
      lines.push(`    ${st.layer !== 'main' ? `${st.layer}/` : ''}${st.name}${st.name === s.initial && st.layer === 'main' ? ' (initial)' : ''}  ${st.duration}ms${st.loop === 'forever' ? ' loop' : st.loop > 1 ? ` ×${st.loop}` : ''}  ${st.channels} channels${flow.length ? `  ${flow.join(' · ')}` : ''}`);
    }
  }
  if (s.inputs.length) lines.push(`  inputs: ${s.inputs.map(i => `${i.name}:${i.type}${i.type === 'number' ? `[${i.min}..${i.max}]` : ''}=${i.default}`).join(', ')}`);
  if (s.events.length) lines.push(`  events: ${s.events.join(', ')}`);
  if (s.interactions.length) lines.push(`  interactions: ${s.interactions.join('; ')}`);
  if (report.diagnostics.length) lines.push('');
  for (const d of report.diagnostics) {
    lines.push(`${icon[d.level]} ${d.level}${d.at ? ` at ${d.at}` : ''}: ${d.message}`);
    if (d.hint) lines.push(`    ${d.hint}`);
  }
  lines.push('');
  lines.push(`${report.counts.errors} errors, ${report.counts.warnings} warnings, ${report.counts.infos} notes`);
  return lines.join('\n');
}
