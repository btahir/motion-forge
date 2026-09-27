import { Resvg } from '@resvg/resvg-js';
import { GIFEncoder, applyPalette, quantize } from 'gifenc';
import { Player } from '../core/player';
import { prefixIds, renderFrameTree } from '../core/render';
import type { Frame } from '../core/sample';
import type { Scene } from '../core/scene';
import { escapeAttr, escapeText, serializeXML } from '../core/xml';

function positive(value: number, name: string, max: number): number {
  if (!Number.isFinite(value) || value <= 0 || value > max) throw new Error(`${name} must be greater than 0 and at most ${max}`);
  return value;
}

export function rasterize(svg: string, width?: number): { png: Buffer; width: number; height: number; pixels: Uint8Array } {
  if (width !== undefined) positive(width, 'width', 16384);
  const r = new Resvg(svg, {
    fitTo: width ? { mode: 'width', value: Math.round(width) } : { mode: 'original' },
    font: { loadSystemFonts: true, defaultFontFamily: 'Helvetica', sansSerifFamily: 'Helvetica', monospaceFamily: 'Menlo' },
    background: 'rgba(0,0,0,0)',
  });
  const w = width ?? r.width;
  const h = r.height * w / r.width;
  if (![w, h].every(n => Number.isFinite(n) && n > 0 && n <= 16384) || w * h > 32_000_000) throw new Error('Image exceeds the 32 megapixel / 16384px limit. Use fewer states or a smaller cell/width.');
  const img = r.render();
  return { png: img.asPng(), width: img.width, height: img.height, pixels: img.pixels };
}

interface Cell {
  frame: Frame;
  label: string;
  sub?: string;
}
interface Row {
  title: string;
  cells: Cell[];
}

export interface SheetOptions {
  /** States to show (default: all states in all layers). */
  states?: string[];
  /** Frames per state (default 8). */
  frames?: number;
  /** Width of each frame cell in px (default 200). */
  cell?: number;
  /** Input values to apply before sampling. */
  inputs?: Record<string, number | boolean>;
  /** Add a row sweeping each number input from min to max (default true). */
  sweep?: boolean;
  /** Add rows playing each event and boolean toggle through the real state machine (default true). */
  flows?: boolean;
  /** Label shown in the header. */
  name?: string;
  /** Cell background, e.g. your app's dark theme color (default white). */
  background?: string;
}

/** Builds a contact sheet: every state as a row of frames, plus input sweeps. */
export function contactSheet(scene: Scene, options: SheetOptions = {}): { svg: string; png: Buffer; rows: { title: string; labels: string[] }[] } {
  const frames = Math.floor(positive(options.frames ?? 8, 'frames', 24));
  if (frames < 1) throw new Error('frames must be at least 1');
  const cellW = positive(options.cell ?? 200, 'cell', 4096);
  for (const name of options.states ?? []) if (!scene.layers.some(l => l.states.has(name))) throw new Error(`Unknown state "${name}"`);
  const cellH = Math.round((cellW * scene.viewBox.height) / scene.viewBox.width);
  const rows: Row[] = [];
  const reachedBy = conditionInputs(scene);
  for (const layer of scene.layers) {
    for (const st of layer.states.values()) {
      if (options.states && !options.states.includes(st.name)) continue;
      // States entered through conditions are shown with inputs that satisfy them; other layers
      // settle from those inputs (e.g. a bloom layer at streak=30), then everything holds.
      const player = new Player(scene, { inputs: { ...reachedBy.get(`${layer.name}/${st.name}`), ...options.inputs } });
      player.hold = true;
      player.goto(st.name, { layer: layer.name });
      const span = st.loop === Infinity ? st.duration : st.completeAt;
      const cells: Cell[] = [];
      const count = span > 0 ? frames : 1;
      for (let i = 0; i < count; i++) {
        // Loops: sample [0, duration) so the last frame isn't a copy of the first.
        const t = count === 1 ? span : st.loop === Infinity ? (span * i) / count : (span * i) / (count - 1);
        player.seek(t, layer.name);
        cells.push({ frame: player.frame(), label: `${Math.round(t)}ms` });
      }
      const flow = [...st.on].map(([e, tr]) => `${e}→${tr.to}`).concat(st.when.map(w => `${w.source}→${w.transition.to}`), st.next ? [`then→${st.next.to}`] : []);
      rows.push({
        title: `${layer.name !== 'main' ? `${layer.name}/` : ''}${st.name}${layer.initial === st.name ? ' (initial)' : ''} · ${span > 0 ? `${Math.round(st.duration)}ms${st.loop === Infinity ? ' loop' : st.loop > 1 ? ` ×${st.loop}` : ''}` : 'pose'}${flow.length ? ` · ${flow.join('  ')}` : ''}`,
        cells,
      });
    }
  }
  if (options.flows !== false) {
    const triggers: { label: string; setup?: (p: Player) => void; inputs?: Record<string, number | boolean>; apply: (p: Player) => void }[] = [];
    for (const layer of scene.layers) {
      for (const st of layer.states.values()) {
        if (options.states && !options.states.includes(st.name)) continue;
        for (const ev of new Set([...st.on.keys(), ...layer.on.keys()])) {
          triggers.push({ label: `send ${ev} from ${layer.name}/${st.name}`, inputs: reachedBy.get(`${layer.name}/${st.name}`), setup: p => {
            p.goto(st.name, { layer: layer.name });
            // Show a meaningful source pose: resetting success should start
            // from the completed checkmark, not its blank opening frame.
            p.seek(st.loop === Infinity ? st.duration / 2 : st.completeAt, layer.name);
          }, apply: p => { p.send(ev); } });
        }
      }
    }
    for (const input of [...scene.inputs.values()].filter(i => i.type === 'boolean')) {
      for (const to of [true, false]) triggers.push({ label: `${input.name} ${!to} → ${to}`, inputs: { [input.name]: !to }, apply: p => p.setInput(input.name, to) });
    }
    for (const trig of triggers) {
      const create = () => {
        const p = new Player(scene, { inputs: { ...options.inputs, ...trig.inputs } });
        trig.setup?.(p);
        return p;
      };
      const player = create();
      const path: string[] = [player.state];
      const off = player.on(e => {
        if (e.type === 'statechange') path.push(e.layer === 'main' ? e.to : `${e.layer}/${e.to}`);
      });
      const cells: Cell[] = [{ frame: player.frame(), label: 'before' }];
      trig.apply(player);
      // Follow the flow until it settles (or 2.4s), sampling evenly.
      const probe = create();
      // Layers this flow changes are named in each frame label, so a hover
      // flow reads "idle · hover/over" rather than an unchanged "idle".
      const touched = new Set<string>();
      probe.on(e => {
        if (e.type === 'statechange' && e.layer !== 'main') touched.add(e.layer);
      });
      trig.apply(probe);
      let span = 0;
      while (span < 2400) {
        probe.advance(100);
        span += 100;
        const st = scene.layers[0]?.states.get(probe.state);
        if (!probe.transitioning && st && (st.loop === Infinity ? span >= 600 : probe.time >= st.completeAt) && span >= 400) break;
      }
      const n = Math.max(2, frames - 1);
      let t = 0;
      for (let i = 1; i <= n; i++) {
        const target = Math.round((span * i) / n);
        player.advance(target - t);
        t = target;
        cells.push({ frame: player.frame(), label: [`+${target}ms ${player.state}`, ...[...touched].map(l => `${l}/${player.stateOf(l)}`)].join(' · ') });
      }
      off();
      const unique = path.filter((s, i) => s !== path[i - 1]);
      rows.push({ title: `flow · ${trig.label} · ${unique.join(' → ')}`, cells });
    }
  }
  if (options.sweep !== false) {
    for (const input of scene.inputs.values()) {
      if (input.type !== 'number' || !scene.bindings.some(b => b.input === input.name || b.template?.includes(`{${input.name}`))) continue;
      // Sweep in the state where this input matters: the chosen state, else one whose conditions watch it.
      const watching = [...(scene.layers[0]?.states.values() ?? [])].find(st => st.when.some(w => new RegExp(`(^|[^\\w-])~?${input.name}([^\\w-]|$)`).test(w.source)));
      const first = options.states?.[0] ?? watching?.name;
      const base = { ...(first ? reachedBy.get(`main/${first}`) : undefined), ...options.inputs };
      const cells: Cell[] = [];
      const n = Math.min(frames, 6);
      for (let i = 0; i < n; i++) {
        const v = input.min + ((input.max - input.min) * i) / Math.max(1, n - 1);
        // Each cell settles its own conditions (a bloom layer opens at the top of the range).
        const cellPlayer = new Player(scene, { inputs: { ...base, [input.name]: v } });
        cellPlayer.hold = true;
        if (first && cellPlayer.state !== first) cellPlayer.goto(first);
        cells.push({ frame: cellPlayer.frame(), label: `${input.name}=${Math.round(v * 100) / 100}` });
      }
      rows.push({ title: `input sweep · ${input.name} ${input.min}→${input.max}${first ? ` · in ${first}` : ''}`, cells });
    }
  }
  if (!rows.length) {
    const player = new Player(scene, { hold: true, inputs: options.inputs });
    rows.push({ title: 'static', cells: [{ frame: player.frame(), label: '' }] });
  }

  const gap = 12, pad = 20, labelH = 18, titleH = 26, headerH = 44;
  const cols = Math.min(frames, Math.max(...rows.map(r => r.cells.length)));
  const width = pad * 2 + cols * cellW + (cols - 1) * gap;
  let y = pad + headerH;
  const parts: string[] = [];
  let n = 0;
  const bg = '#f4f3ef';
  for (const row of rows) {
    parts.push(`<text x="${pad}" y="${y + 16}" font-family="Helvetica, Arial, sans-serif" font-size="13" font-weight="700" fill="#1d1d1b">${escapeText(row.title)}</text>`);
    y += titleH;
    row.cells.forEach((cell, i) => {
      const col = i % cols;
      if (i && col === 0) y += cellH + labelH + gap;
      const x = pad + col * (cellW + gap);
      const tree = renderFrameTree(scene, cell.frame, { width: cellW, height: cellH });
      prefixIds(tree, `c${n++}-`);
      tree.attrs.x = String(x);
      tree.attrs.y = String(y);
      delete tree.attrs.xmlns;
      parts.push(`<rect x="${x - 0.5}" y="${y - 0.5}" width="${cellW + 1}" height="${cellH + 1}" rx="3" fill="${escapeAttrValue(options.background ?? '#ffffff')}" stroke="#d9d6cf"/>`);
      parts.push(serializeXML(tree));
      parts.push(`<text x="${x + 2}" y="${y + cellH + 13}" font-family="Menlo, monospace" font-size="10.5" fill="#6b6860">${escapeText(cell.label)}</text>`);
    });
    y += cellH + labelH + gap + 6;
  }
  const height = y + pad - gap;
  const header = `<text x="${pad}" y="${pad + 18}" font-family="Helvetica, Arial, sans-serif" font-size="17" font-weight="700" fill="#1d1d1b">${escapeText(options.name ?? scene.title ?? 'Motion preview')}</text><text x="${pad}" y="${pad + 36}" font-family="Menlo, monospace" font-size="11" fill="#6b6860">${escapeText(`viewBox ${scene.viewBox.width}×${scene.viewBox.height} · ${scene.layers.reduce((s, l) => s + l.states.size, 0)} states · ${scene.inputs.size} inputs · each row is a state sampled over time`)}</text>`;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><rect width="100%" height="100%" fill="${bg}"/>${header}${parts.join('')}</svg>`;
  return { svg, png: rasterize(svg).png, rows: rows.map(r => ({ title: r.title, labels: r.cells.map(c => c.label) })) };
}

const escapeAttrValue = (v: string) => v.replace(/[<>"&]/g, '');

/** Best-effort inputs that make a state's entry condition true, e.g. "progress >= 100" → { progress: 100 }. */
function conditionInputs(scene: Scene): Map<string, Record<string, number | boolean>> {
  const out = new Map<string, Record<string, number | boolean>>();
  const defaults = Object.fromEntries([...scene.inputs].map(([name, input]) => [name, input.default]));
  for (const layer of scene.layers) {
    for (const st of layer.states.values()) {
      for (const w of st.when) {
        const key = `${layer.name}/${w.transition.to}`;
        if (out.has(key)) continue;
        if (w.test(defaults, defaults)) { out.set(key, {}); continue; }
        const values: Record<string, number | boolean> = {};
        for (const part of w.source.split('&&')) {
          const cmp = /^\s*~?([A-Za-z_][\w-]*)\s*(>=|<=|==|>|<)\s*(-?[\d.]+)\s*$/.exec(part);
          const bool = /^\s*(!?)\s*~?([A-Za-z_][\w-]*)\s*$/.exec(part);
          if (cmp) {
            const input = scene.inputs.get(cmp[1]!);
            const n = Number(cmp[3]);
            if (!input) continue;
            const nudge = (input.max - input.min) / 100;
            values[cmp[1]!] = cmp[2] === '>' ? Math.min(input.max, n + nudge) : cmp[2] === '<' ? Math.max(input.min, n - nudge) : n;
          } else if (bool && scene.inputs.get(bool[2]!)?.type === 'boolean') values[bool[2]!] = !bool[1];
        }
        if (Object.keys(values).length) out.set(key, values);
      }
    }
  }
  // States reached by "next" after a conditional state inherit its inputs (closed → opening → open).
  for (let pass = 0; pass < 8; pass++) {
    let changed = false;
    for (const layer of scene.layers)
      for (const st of layer.states.values()) {
        const from = out.get(`${layer.name}/${st.name}`);
        const to = st.next && `${layer.name}/${st.next.to}`;
        if (from && to && !out.has(to)) {
          out.set(to, from);
          changed = true;
        }
      }
    if (!changed) break;
  }
  return out;
}

export interface ScriptStep {
  at: number;
  send?: string;
  set?: [string, number | boolean];
  goto?: string;
}

/** Parses "wave@800" (event) and "level=90@1500" (input) and "goto:idle@0" steps. */
export function parseScript(items: string[]): ScriptStep[] {
  return items.map((item): ScriptStep => {
    if (typeof item !== 'string' || !item.trim() || item.split('@').length > 2) throw new Error(`Invalid script step "${item}"`);
    const [what, when] = item.split('@');
    const at = Number(when ?? 0);
    if (!Number.isFinite(at) || at < 0 || when === '') throw new Error(`Bad time in "${item}"; use non-negative milliseconds`);
    if (!what || (what.startsWith('goto:') && !what.slice(5))) throw new Error(`Missing event/state in "${item}"`);
    if (what.startsWith('goto:')) return { at, goto: what.slice(5) };
    if (what!.includes('=')) {
      const [k, v] = what!.split('=');
      const value: number | boolean = v === 'true' ? true : v === 'false' ? false : Number(v);
      if (!k || !v || what!.split('=').length !== 2 || (typeof value === 'number' && !Number.isFinite(value))) throw new Error(`Bad input in "${item}"; use name=number or name=true/false`);
      return { at, set: [k!, value] as [string, number | boolean] };
    }
    return { at, send: what };
  }).sort((a, b) => a.at - b.at);
}

export interface RecordOptions {
  state?: string;
  duration?: number;
  fps?: number;
  width?: number;
  inputs?: Record<string, number | boolean>;
  script?: ScriptStep[];
  background?: string;
}

export interface RecordResult {
  frames: number;
  width: number;
  height: number;
  duration: number;
  /** What happened, in order: script steps, state changes, emits and completions. */
  log: string[];
}

/**
 * Plays the real state machine (transitions, conditions, smoothing) with a script,
 * calling `onFrame` at each frame time. The shared core of record and strip.
 */
function simulate(scene: Scene, options: RecordOptions, onFrame: (player: Player, t: number, index: number) => void): { duration: number; frames: number; log: string[] } {
  const fps = positive(options.fps ?? 30, 'fps', 120);
  if (options.state && !scene.layers[0]?.states.has(options.state)) throw new Error(`Unknown state "${options.state}"`);
  const player = new Player(scene, { state: options.state, inputs: options.inputs });
  let duration = options.duration;
  if (duration === undefined) {
    const st = scene.layers[0]?.states.get(player.state);
    const scriptEnd = options.script?.length ? Math.max(...options.script.map(s => s.at)) + 1500 : 0;
    duration = Math.max(scriptEnd, st ? (st.loop === Infinity ? st.duration : st.completeAt + 400) : 1000, 600);
  }
  positive(duration, 'duration', 20000);
  const total = Math.max(1, Math.ceil((duration / 1000) * fps));
  const script = [...(options.script ?? [])].sort((a, b) => a.at - b.at);
  for (const step of script) if (!Number.isFinite(step.at) || step.at < 0 || step.at >= duration) throw new Error(`Script time ${step.at}ms must be within the recording (0 to less than ${duration}ms)`);
  const log: string[] = [`0ms    start in ${player.state}`];
  let now = 0;
  const stamp = () => `${Math.round(player.elapsed)}ms`.padEnd(7);
  player.on(e => {
    if (e.type === 'statechange') log.push(`${stamp()}${e.layer !== 'main' ? `${e.layer}: ` : ''}${e.from} → ${e.to}`);
    else if (e.type === 'emit') log.push(`${stamp()}emit "${e.name}"`);
    else if (e.type === 'complete' && e.layer === 'main') {
      const st = scene.layers[0]?.states.get(e.state);
      if (st && st.channels.length && st.duration > 0) log.push(`${stamp()}${e.state} finished`);
    }
  });
  const advanceTo = (target: number) => {
    while (script.length && script[0]!.at <= target) {
      const s = script.shift()!;
      player.advance(s.at - now);
      now = s.at;
      log.push(`${stamp()}${s.send ? `send "${s.send}"` : s.set ? `set ${s.set[0]} = ${s.set[1]}` : `goto ${s.goto}`}`);
      if (s.send && !player.send(s.send)) log.push(`${stamp()}  (no transition for "${s.send}" in ${player.state})`);
      if (s.set) player.setInput(s.set[0], s.set[1]);
      if (s.goto) player.goto(s.goto, { blend: 200 });
    }
    player.advance(target - now);
    now = target;
  };
  for (let i = 0; i < total; i++) {
    advanceTo((i * 1000) / fps);
    onFrame(player, now, i);
  }
  // Account for actions in the final frame interval in the event log too.
  advanceTo(duration);
  return { duration, frames: total, log };
}

function withBackground(svg: string, scene: Scene, background?: string): string {
  if (!background) return svg;
  return svg.replace(/(<svg[^>]*>)/, (_, root: string) => `${root}<rect x="${scene.viewBox.x}" y="${scene.viewBox.y}" width="${scene.viewBox.width}" height="${scene.viewBox.height}" fill="${escapeAttr(background)}"/>`);
}

export function recordFrames(scene: Scene, options: RecordOptions = {}, onFrame: (rgba: Uint8Array, width: number, height: number, index: number) => void): RecordResult {
  const width = positive(options.width ?? Math.min(480, scene.width), 'width', 4096);
  let w = 0, h = 0;
  const res = simulate(scene, options, (player, _t, i) => {
    const img = rasterize(withBackground(serializeXML(renderFrameTree(scene, player.frame(), { width })), scene, options.background), width);
    w = img.width;
    h = img.height;
    onFrame(img.pixels, img.width, img.height, i);
  });
  return { ...res, width: w, height: h };
}

export function recordGIF(scene: Scene, options: RecordOptions = {}): { gif: Buffer; log: string[] } {
  const gif = GIFEncoder();
  const fps = options.fps ?? 25;
  const delay = Math.round(1000 / fps);
  const res = recordFrames(scene, { ...options, background: options.background ?? '#ffffff', fps }, (rgba, width, height) => {
    const palette = quantize(rgba, 256, { format: 'rgb565' });
    const index = applyPalette(rgba, palette, 'rgb565');
    gif.writeFrame(index, width, height, { palette, delay });
  });
  gif.finish();
  return { gif: Buffer.from(gif.bytes()), log: res.log };
}

/** A recording as one still image an agent can read: a grid of frames with timestamps. */
export function recordStrip(scene: Scene, options: RecordOptions & { cells?: number } = {}): { png: Buffer; log: string[] } {
  const fps = options.fps ?? 30;
  const probe = simulate(scene, { ...options, fps }, () => {});
  const want = Math.max(4, Math.min(24, options.cells ?? 12));
  const pickIndex = new Set(Array.from({ length: want }, (_, i) => Math.round((i * (probe.frames - 1)) / Math.max(1, want - 1))));
  const cellW = 160, cellH = Math.round((cellW * scene.viewBox.height) / scene.viewBox.width), gap = 10, pad = 16, labelH = 16, head = 24;
  const cols = Math.min(6, pickIndex.size);
  const parts: string[] = [];
  let n = 0;
  const res = simulate(scene, { ...options, fps }, (player, t, i) => {
    if (!pickIndex.has(i)) return;
    const x = pad + (n % cols) * (cellW + gap), y = pad + head + Math.floor(n / cols) * (cellH + labelH + gap);
    const tree = renderFrameTree(scene, player.frame(), { width: cellW, height: cellH });
    prefixIds(tree, `r${n}-`);
    tree.attrs.x = String(x);
    tree.attrs.y = String(y);
    delete tree.attrs.xmlns;
    parts.push(`<rect x="${x - 0.5}" y="${y - 0.5}" width="${cellW + 1}" height="${cellH + 1}" rx="3" fill="${escapeAttrValue(options.background ?? '#ffffff')}" stroke="#d9d6cf"/>${serializeXML(tree)}<text x="${x + 2}" y="${y + cellH + 12}" font-family="Menlo, monospace" font-size="10" fill="#6b6860">${Math.round(t)}ms · ${escapeText(player.state)}</text>`);
    n++;
  });
  const rowsN = Math.ceil(n / cols);
  const width = pad * 2 + cols * cellW + (cols - 1) * gap;
  const height = pad * 2 + head + rowsN * (cellH + labelH + gap);
  const title = res.log.slice(1).map(l => l.replace(/\s+/g, ' ').trim()).join(' · ');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><rect width="100%" height="100%" fill="#f4f3ef"/><text x="${pad}" y="${pad + 12}" font-family="Helvetica, Arial, sans-serif" font-size="12" font-weight="700" fill="#1d1d1b">${escapeText(`recording · ${title}`.slice(0, 180))}</text>${parts.join('')}</svg>`;
  return { png: rasterize(svg).png, log: res.log };
}
