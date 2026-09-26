import { parseColor, type RGBA } from './color';
import { easingNames, parseEasing, type EaseFn } from './easing';
import { parsePath, tokenizePath, type PathTokens, type Subpath } from './geometry';
import { normalizeProp, PROPERTY_HINTS, PROPS, type PropKind } from './props';
import type { Diagnostic } from './sanitize';

// ------------------------------------------------------------------ types

export interface PathValue {
  d: string;
  tokens: PathTokens;
  subpaths?: Subpath[];
}
export type Value = number | RGBA | PathValue | [number, number] | string | number[];

export interface NKey {
  /** Either ms or a fraction of the state duration (resolved later). */
  ms?: number;
  pct?: number;
  /** A bare value: held for the whole state. */
  constant?: boolean;
  value: Value;
  ease?: EaseFn;
}
export interface NTrack {
  prop: string;
  kind: PropKind;
  keys: NKey[];
  ease?: EaseFn;
  at: string;
}
export interface NGroup {
  selector: string;
  tracks: NTrack[];
  stagger: number;
  delay: number;
  /** Curve smoothly through keyframes (Catmull-Rom) instead of stopping at each one. */
  curve?: 'smooth';
  origin?: string;
  ease?: EaseFn;
  at: string;
}
export interface NTransition {
  to: string;
  blend: number;
  ease: EaseFn;
  at: string;
}
export interface NState {
  name: string;
  duration: number;
  loop: number;
  alternate: boolean;
  groups: NGroup[];
  on: Map<string, NTransition>;
  when: { source: string; test: Expr; transition: NTransition }[];
  next?: NTransition;
  emit: string[];
  /** The state moves things out of frame on purpose (skips the overflow lint). */
  allowOverflow?: boolean;
  /** Inputs to set when the state is entered. */
  set?: Record<string, number | boolean>;
  ease?: EaseFn;
  at: string;
}
export interface NLayer {
  name: string;
  initial: string;
  states: Map<string, NState>;
  on: Map<string, NTransition>;
  /** Numeric/transform values add to the layers below instead of replacing them. */
  add: boolean;
}
export interface NInput {
  name: string;
  type: 'number' | 'boolean';
  min: number;
  max: number;
  default: number;
  smooth: number;
  /** Spring smoothing (can overshoot) instead of exponential easing. */
  spring?: { stiffness: number; damping: number };
}
export interface NBinding {
  selector: string;
  prop: string;
  kind: PropKind;
  input?: string;
  /** Sorted input-value → output-value stops. */
  map: { x: number; value: Value; ease?: EaseFn }[];
  template?: string;
  origin?: string;
  /** Add to the animated value instead of replacing it (numbers only). */
  add?: boolean;
  at: string;
}
export type InteractionKind = 'click' | 'hover' | 'press' | 'pointer' | 'appear' | 'drag';
export interface NInteraction {
  on: InteractionKind;
  selector?: string;
  send?: string;
  /** For hover/press: event sent when the pointer leaves or releases. */
  leave?: string;
  toggle?: string;
  hold?: string;
  set?: Record<string, number | boolean>;
  x?: string;
  y?: string;
  /** Selector whose box maps pointer/drag positions (default: the target, or the artwork). */
  within?: string;
  at: string;
}
export interface NMotion {
  inputs: Map<string, NInput>;
  layers: NLayer[];
  bindings: NBinding[];
  interactions: NInteraction[];
  events: Set<string>;
  title?: string;
}

// ------------------------------------------------------------ expressions

/** Evaluated with target input values and displayed (smoothed) values; `~name` reads the displayed value. */
export type Expr = (inputs: Record<string, number>, shown?: Record<string, number>) => number;

export function compileExpression(source: string, known: Set<string>): { fn?: Expr; error?: string; unknown: string[] } {
  const tokens = source.match(/\s*(\d+\.?\d*|\.\d+|~?[A-Za-z_][\w-]*|&&|\|\||[<>!=]=|[<>!()+\-*/%]|\S)/g)?.map(t => t.trim()) ?? [];
  let i = 0;
  const unknown: string[] = [];
  const peek = () => tokens[i];
  const take = () => tokens[i++];
  type Node = Expr;
  const primary = (): Node => {
    const t = take();
    if (t === undefined) throw new Error('Unexpected end of expression');
    if (t === '(') {
      const e = or();
      if (take() !== ')') throw new Error('Expected )');
      return e;
    }
    if (t === '!') {
      const e = primary();
      return (v, w) => (e(v, w) ? 0 : 1);
    }
    if (t === '-') {
      const e = primary();
      return (v, w) => -e(v, w);
    }
    if (/^(\d|\.)/.test(t)) {
      const n = Number(t);
      return () => n;
    }
    if (t === 'true') return () => 1;
    if (t === 'false') return () => 0;
    if (/^~?[A-Za-z_]/.test(t)) {
      const shown = t[0] === '~';
      const name = shown ? t.slice(1) : t;
      if (!known.has(name)) unknown.push(name);
      return shown ? (v, w) => (w ?? v)[name] ?? 0 : v => v[name] ?? 0;
    }
    throw new Error(`Unexpected "${t}"`);
  };
  const binary = (next: () => Node, ops: Record<string, (a: number, b: number) => number>) => (): Node => {
    let left = next();
    while (peek() !== undefined && ops[peek()!]) {
      const op = ops[take()!]!;
      const right = next();
      const l = left;
      left = (v, w) => op(l(v, w), right(v, w));
    }
    return left;
  };
  const mul = binary(primary, { '*': (a, b) => a * b, '/': (a, b) => a / b, '%': (a, b) => a % b });
  const add = binary(mul, { '+': (a, b) => a + b, '-': (a, b) => a - b });
  const cmp = binary(add, { '<': (a, b) => +(a < b), '<=': (a, b) => +(a <= b), '>': (a, b) => +(a > b), '>=': (a, b) => +(a >= b) });
  const eq = binary(cmp, { '==': (a, b) => +(a === b), '!=': (a, b) => +(a !== b) });
  const and = binary(eq, { '&&': (a, b) => +(!!a && !!b) });
  const or = binary(and, { '||': (a, b) => +(!!a || !!b) });
  try {
    const fn = or();
    if (i < tokens.length) throw new Error(`Unexpected "${tokens[i]}"`);
    return { fn, unknown };
  } catch (e) {
    return { error: (e as Error).message, unknown };
  }
}

// ---------------------------------------------------------------- helpers

export function suggest(name: string, options: Iterable<string>): string | undefined {
  let best: string | undefined, bestScore = Infinity;
  const a = name.toLowerCase();
  for (const option of options) {
    const b = option.toLowerCase();
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
    const score = dp[b.length]!;
    if (score < bestScore) {
      bestScore = score;
      best = option;
    }
  }
  return best !== undefined && bestScore <= Math.max(2, Math.floor(a.length / 3)) ? best : undefined;
}

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

/** Parses "400", "400ms", "1.2s" into ms. */
export function parseTime(v: unknown): number | undefined {
  if (typeof v === 'number') return Number.isFinite(v) && v >= 0 ? v : undefined;
  if (typeof v !== 'string') return;
  const m = /^\s*(\d+\.?\d*|\.\d+)\s*(ms|s)?\s*$/.exec(v);
  if (!m) return;
  return Number(m[1]) * (m[2] === 's' ? 1000 : 1);
}

export function parseValue(kind: PropKind, raw: unknown): Value | string {
  switch (kind) {
    case 'transform':
    case 'number': {
      const n = typeof raw === 'string' ? Number(raw.replace(/(px|deg)$/, '')) : raw;
      return typeof n === 'number' && Number.isFinite(n) ? n : 'Expected a number';
    }
    case 'color': {
      if (typeof raw !== 'string') return 'Expected a color string like "#ff5a1f"';
      if (raw === 'none') return [0, 0, 0, 0];
      return parseColor(raw) ?? `Unrecognized color "${raw}". Use hex, rgb(), hsl() or a CSS color name`;
    }
    case 'path': {
      if (typeof raw !== 'string') return 'Expected SVG path data';
      const tokens = tokenizePath(raw);
      const subpaths = tokens && parsePath(raw);
      return tokens && subpaths ? { d: raw, tokens, subpaths } : `Invalid path data "${raw.slice(0, 40)}"`;
    }
    case 'draw': {
      if (typeof raw === 'number' && raw >= 0 && raw <= 1) return [0, raw];
      if (Array.isArray(raw) && raw.length === 2 && raw.every(n => typeof n === 'number' && n >= 0 && n <= 1)) return [raw[0] as number, raw[1] as number];
      return 'Expected a number 0..1 or [start, end] with values 0..1';
    }
    case 'text':
      return typeof raw === 'string' || typeof raw === 'number' ? String(raw) : 'Expected text';
    case 'points': {
      if (typeof raw !== 'string') return 'Expected a points list';
      const nums = raw.trim().split(/[\s,]+/).map(Number);
      return nums.length % 2 === 0 && nums.every(Number.isFinite) ? nums : 'Invalid points list';
    }
  }
}

// ------------------------------------------------------------- normalize

export interface NormalizeResult {
  motion?: NMotion;
  diagnostics: Diagnostic[];
}

export function parseMotionJSON(source: string): { value?: unknown; error?: Diagnostic; offset?: number } {
  try {
    return { value: JSON.parse(source) };
  } catch (e) {
    const message = (e as Error).message;
    const pos = /position (\d+)/.exec(message);
    return {
      error: { level: 'error', code: 'motion.json', message: `Motion block is not valid JSON: ${message.replace(/^JSON\.parse: /, '')}`, hint: 'Check for trailing commas, comments, or unquoted keys.' },
      offset: pos ? Number(pos[1]) : undefined,
    };
  }
}

const STATE_KEYS = new Set(['duration', 'loop', 'alternate', 'animate', 'on', 'when', 'next', 'emit', 'set', 'ease', 'description', 'allowOverflow']);
const GROUP_KEYS = new Set(['ease', 'stagger', 'delay', 'origin', 'curve']);
const TOP_KEYS = new Set(['$schema', 'version', 'title', 'description', 'initial', 'inputs', 'states', 'on', 'transition', 'bind', 'interactions', 'layers']);

export function normalizeMotion(raw: unknown): NormalizeResult {
  const diagnostics: Diagnostic[] = [];
  const error = (at: string, message: string, hint?: string) => diagnostics.push({ level: 'error', code: 'motion.invalid', at, message, hint });
  const warning = (at: string, message: string, hint?: string) => diagnostics.push({ level: 'warning', code: 'motion.suspicious', at, message, hint });

  if (!isObject(raw)) {
    error('', 'The motion block must be a JSON object');
    return { diagnostics };
  }
  for (const k of Object.keys(raw)) if (!TOP_KEYS.has(k)) warning(k, `Unknown top-level key "${k}"`, suggest(k, TOP_KEYS) ? `Did you mean "${suggest(k, TOP_KEYS)}"?` : undefined);
  if (raw.version !== undefined && raw.version !== 1) error('version', `Unsupported version ${String(raw.version)}; this runtime reads version 1`);

  // Inputs
  const inputs = new Map<string, NInput>();
  if (raw.inputs !== undefined) {
    if (!isObject(raw.inputs)) error('inputs', 'inputs must be an object of name → definition');
    else
      for (const [name, def] of Object.entries(raw.inputs)) {
        const at = `inputs.${name}`;
        if (!/^[A-Za-z_][\w-]*$/.test(name)) error(at, `Input name "${name}" must start with a letter`);
        if (typeof def === 'boolean') {
          inputs.set(name, { name, type: 'boolean', min: 0, max: 1, default: +def, smooth: 0 });
          continue;
        }
        if (typeof def === 'number') {
          const max = def <= 1 && def >= 0 ? 1 : Math.max(100, def);
          inputs.set(name, { name, type: 'number', min: 0, max, default: def, smooth: 0 });
          continue;
        }
        if (!isObject(def)) {
          error(at, 'Input definition must be an object, e.g. { "type": "number", "min": 0, "max": 100, "default": 50 }');
          continue;
        }
        const type = def.type ?? (typeof def.default === 'boolean' ? 'boolean' : 'number');
        if (type !== 'number' && type !== 'boolean') {
          error(`${at}.type`, `Input type must be "number" or "boolean"`);
          continue;
        }
        let smooth = def.smooth === undefined ? 0 : parseTime(def.smooth);
        let spring: NInput['spring'];
        if (typeof def.smooth === 'string' && /^spring/.test(def.smooth.trim())) {
          const m = /^spring(?:\(\s*([\d.]+)\s*(?:,\s*([\d.]+)\s*)?\))?$/.exec(def.smooth.trim().replace(/\s+/g, ''));
          if (!m) error(`${at}.smooth`, 'Use "spring" or "spring(stiffness, damping)"');
          else {
            spring = { stiffness: Number(m[1] ?? 170), damping: Number(m[2] ?? 18) };
            smooth = 1;
          }
        }
        if (smooth === undefined) error(`${at}.smooth`, 'smooth is a duration in ms (eases toward new values) or "spring" / "spring(stiffness, damping)" (can overshoot)');
        if (type === 'boolean') {
          inputs.set(name, { name, type, min: 0, max: 1, default: def.default ? 1 : 0, smooth: smooth ?? 0, spring });
          continue;
        }
        const min = def.min === undefined ? 0 : Number(def.min);
        const max = def.max === undefined ? (typeof def.default === 'number' && def.default > 1 ? 100 : 1) : Number(def.max);
        const dflt = def.default === undefined ? min : Number(def.default);
        if (![min, max, dflt].every(Number.isFinite)) error(at, 'min, max and default must be numbers');
        else if (min >= max) error(at, `min (${min}) must be less than max (${max})`);
        else if (dflt < min || dflt > max) error(`${at}.default`, `default ${dflt} is outside ${min}..${max}`);
        inputs.set(name, { name, type, min, max, default: dflt, smooth: smooth ?? 0, spring });
      }
  }
  const inputNames = new Set(inputs.keys());

  // Default transition
  let defaultBlend = 250;
  let defaultTransitionEase: EaseFn = parseEasing('out')!;
  if (raw.transition !== undefined) {
    if (typeof raw.transition === 'number' || typeof raw.transition === 'string') {
      const t = parseTime(raw.transition);
      if (t === undefined) error('transition', 'transition must be a duration in ms or { "blend": ms, "ease": "…" }');
      else defaultBlend = t;
    } else if (isObject(raw.transition)) {
      if (raw.transition.blend !== undefined) {
        const t = parseTime(raw.transition.blend);
        if (t === undefined) error('transition.blend', 'blend must be a duration in ms');
        else defaultBlend = t;
      }
      if (raw.transition.ease !== undefined) {
        const e = typeof raw.transition.ease === 'string' ? parseEasing(raw.transition.ease) : undefined;
        if (!e) error('transition.ease', `Unknown easing ${JSON.stringify(raw.transition.ease)}`, `Try one of: ${easingNames.slice(0, 12).join(', ')}, cubic-bezier(…), spring(stiffness, damping), steps(n)`);
        else defaultTransitionEase = e;
      }
    }
  }

  const easing = (v: unknown, at: string): EaseFn | undefined => {
    if (v === undefined) return;
    const e = typeof v === 'string' ? parseEasing(v) : undefined;
    if (!e) {
      const s = typeof v === 'string' ? suggest(v, easingNames) : undefined;
      error(at, `Unknown easing ${JSON.stringify(v)}`, s ? `Did you mean "${s}"?` : `Use one of: ${easingNames.join(', ')}, cubic-bezier(x1,y1,x2,y2), spring(stiffness,damping,mass), steps(n)`);
    }
    return e;
  };

  const transition = (v: unknown, at: string): NTransition | undefined => {
    if (typeof v === 'string') return { to: v, blend: defaultBlend, ease: defaultTransitionEase, at };
    if (isObject(v) && typeof v.to === 'string') {
      const blend = v.blend === undefined ? defaultBlend : parseTime(v.blend);
      if (blend === undefined) error(`${at}.blend`, 'blend must be a duration in ms');
      return { to: v.to, blend: blend ?? defaultBlend, ease: easing(v.ease, `${at}.ease`) ?? defaultTransitionEase, at };
    }
    error(at, 'A transition is a state name, or { "to": "state", "blend": 200, "ease": "out" }');
  };

  const events = new Set<string>();

  const parseTrack = (propName: string, spec: unknown, at: string): NTrack | undefined => {
    const prop = normalizeProp(propName);
    if (!prop) {
      const hint = PROPERTY_HINTS[propName] ?? (suggest(propName, Object.keys(PROPS)) ? `Did you mean "${suggest(propName, Object.keys(PROPS))}"?` : undefined);
      error(at, `Unknown property "${propName}"`, hint);
      return;
    }
    const kind = PROPS[prop]!;
    const keys: NKey[] = [];
    const push = (value: unknown, where: string, time: { ms?: number; pct?: number; constant?: boolean }, ease?: EaseFn) => {
      const parsed = parseValue(kind, value);
      if (typeof parsed === 'string' && kind !== 'text') {
        error(where, `${parsed} for ${prop}, got ${JSON.stringify(value)}`);
        return;
      }
      keys.push({ ...time, value: parsed, ease });
    };
    const unwrap = (v: unknown, where: string): [unknown, EaseFn | undefined] => {
      if (isObject(v) && 'value' in v) return [v.value, easing(v.ease, `${where}.ease`)];
      return [v, undefined];
    };
    if (Array.isArray(spec)) {
      if (!spec.length) error(at, 'Keyframe list is empty');
      spec.forEach((v, i) => {
        const [value, ease] = unwrap(v, `${at}[${i}]`);
        push(value, `${at}[${i}]`, { pct: spec.length === 1 ? 0 : i / (spec.length - 1) }, ease);
      });
    } else if (isObject(spec) && !('value' in spec)) {
      for (const [key, v] of Object.entries(spec)) {
        const where = `${at}.${key}`;
        let time: { ms?: number; pct?: number };
        if (/^\s*-?\d+\.?\d*\s*%\s*$/.test(key)) {
          const pct = parseFloat(key) / 100;
          if (pct < 0 || pct > 1) {
            error(where, `Keyframe ${key} must be between 0% and 100%`);
            continue;
          }
          time = { pct };
        } else if (key === 'from') time = { pct: 0 };
        else if (key === 'to') time = { pct: 1 };
        else {
          const ms = parseTime(key);
          if (ms === undefined) {
            error(where, `Keyframe time "${key}" is not valid`, 'Use "0%".."100%", "from"/"to", or milliseconds like "400" / "400ms" / "0.4s".');
            continue;
          }
          time = { ms };
        }
        const [value, ease] = unwrap(v, where);
        push(value, where, time, ease);
      }
      if (!Object.keys(spec).length) error(at, 'Keyframe object is empty');
    } else {
      // A bare value holds for the whole state; the state-change blend animates into it.
      const [value, ease] = unwrap(spec, at);
      push(value, at, { pct: 0, constant: true }, ease);
    }
    return { prop, kind, keys, at };
  };

  const parseState = (name: string, spec: unknown, at: string, stateNames: Set<string>): NState | undefined => {
    if (!isObject(spec)) {
      error(at, 'A state must be an object like { "duration": 1000, "animate": { … } }');
      return;
    }
    for (const k of Object.keys(spec)) if (!STATE_KEYS.has(k)) {
      const s = suggest(k, STATE_KEYS);
      error(`${at}.${k}`, `Unknown state key "${k}"`, s ? `Did you mean "${s}"?` : `State keys: ${[...STATE_KEYS].join(', ')}`);
    }
    const duration = spec.duration === undefined ? undefined : parseTime(spec.duration);
    if (spec.duration !== undefined && duration === undefined) error(`${at}.duration`, 'duration must be ms (number) or a string like "1.2s"');
    let loop = 1;
    if (spec.loop === true) loop = Infinity;
    else if (typeof spec.loop === 'number' && spec.loop >= 1) loop = spec.loop;
    else if (spec.loop !== undefined && spec.loop !== false) error(`${at}.loop`, 'loop must be true, false, or a repeat count ≥ 1');
    const stateEase = easing(spec.ease, `${at}.ease`);
    const groups: NGroup[] = [];
    if (spec.animate !== undefined) {
      if (!isObject(spec.animate)) error(`${at}.animate`, 'animate must map CSS selectors to properties, e.g. { "#arm": { "rotate": [0, -30, 0] } }');
      else
        for (const [selector, g] of Object.entries(spec.animate)) {
          const gat = `${at}.animate.${selector}`;
          if (!isObject(g)) {
            error(gat, 'Expected an object of property → keyframes');
            continue;
          }
          const group: NGroup = { selector, tracks: [], stagger: 0, delay: 0, at: gat };
          for (const [key, v] of Object.entries(g)) {
            if (GROUP_KEYS.has(key)) continue;
            const track = parseTrack(key, v, `${gat}.${key}`);
            if (track) group.tracks.push(track);
          }
          if (g.stagger !== undefined) {
            const s = typeof g.stagger === 'number' ? g.stagger : parseTime(g.stagger);
            if (s === undefined || !Number.isFinite(s)) error(`${gat}.stagger`, 'stagger must be ms between matched elements');
            else group.stagger = s;
          }
          if (g.delay !== undefined) {
            const d = parseTime(g.delay);
            if (d === undefined) error(`${gat}.delay`, 'delay must be ms');
            else group.delay = d;
          }
          if (g.origin !== undefined) {
            if (typeof g.origin !== 'string') error(`${gat}.origin`, 'origin is a string like "center", "50% 100%", "left top" or "120 80"');
            else group.origin = g.origin;
          }
          group.ease = easing(g.ease, `${gat}.ease`);
          if (g.curve !== undefined) {
            if (g.curve === 'smooth') group.curve = 'smooth';
            else if (g.curve !== 'linear') error(`${gat}.curve`, 'curve is "smooth" (flow through keyframes) or "linear" (default: stop at each keyframe)');
          }
          groups.push(group);
        }
    }
    // Resolve duration: explicit, else the latest ms keyframe, else 1000ms for percentage-only tracks, else 0 for poses.
    let inferred = 0;
    let hasPct = false;
    for (const g of groups) for (const t of g.tracks) for (const k of t.keys) {
      if (k.ms !== undefined) inferred = Math.max(inferred, k.ms);
      else if (!k.constant) hasPct = true;
    }
    const finalDuration = duration ?? (inferred || (hasPct ? 1000 : 0));
    if (duration !== undefined) for (const g of groups) for (const t of g.tracks) for (const k of t.keys) if (k.ms !== undefined && k.ms > duration) warning(t.at, `Keyframe at ${k.ms}ms is after the state's ${duration}ms duration and will never be reached`);
    if (loop === Infinity && finalDuration === 0 && groups.some(g => g.tracks.length)) warning(`${at}.loop`, 'A looping state needs a duration or timed keyframes');

    const on = new Map<string, NTransition>();
    if (spec.on !== undefined) {
      if (!isObject(spec.on)) error(`${at}.on`, 'on maps event names to target states, e.g. { "wave": "waving" }');
      else
        for (const [event, t] of Object.entries(spec.on)) {
          if (event === 'complete') {
            error(`${at}.on.complete`, 'Use "next" for what happens when a state finishes', `"next": ${JSON.stringify(t)}`);
            continue;
          }
          const tr = transition(t, `${at}.on.${event}`);
          if (tr) on.set(event, tr);
          events.add(event);
        }
    }
    const when: NState['when'] = [];
    if (spec.when !== undefined) {
      if (!isObject(spec.when)) error(`${at}.when`, 'when maps conditions to target states, e.g. { "level > 80": "alarm" }');
      else
        for (const [cond, t] of Object.entries(spec.when)) {
          const where = `${at}.when.${cond}`;
          const compiled = compileExpression(cond, inputNames);
          if (compiled.error) error(where, `Condition "${cond}" could not be parsed: ${compiled.error}`, 'Conditions use inputs, numbers, true/false and < <= > >= == != && || ! ( ).');
          for (const u of compiled.unknown) error(where, `Condition references unknown input "${u}"`, suggest(u, inputNames) ? `Did you mean "${suggest(u, inputNames)}"?` : 'Declare it under "inputs".');
          const tr = transition(t, where);
          if (compiled.fn && tr) when.push({ source: cond, test: compiled.fn, transition: tr });
        }
    }
    const next = spec.next === undefined ? undefined : transition(spec.next, `${at}.next`);
    if (next && loop === Infinity) warning(`${at}.next`, 'This state loops forever, so "next" never happens', 'Set loop to a number of repeats, or remove next.');
    const emit = spec.emit === undefined ? [] : Array.isArray(spec.emit) ? spec.emit.map(String) : [String(spec.emit)];
    let set: NState['set'];
    if (spec.set !== undefined) {
      if (!isObject(spec.set)) error(`${at}.set`, 'set maps input names to values applied when the state starts, e.g. { "progress": 0 }');
      else {
        set = {};
        for (const [k, v] of Object.entries(spec.set)) {
          if (!inputs.has(k)) error(`${at}.set.${k}`, `Unknown input "${k}"`, suggest(k, inputNames) ? `Did you mean "${suggest(k, inputNames)}"?` : 'Declare it under "inputs".');
          else if (typeof v !== 'boolean' && typeof v !== 'number') error(`${at}.set.${k}`, 'Expected a number or boolean');
          else set[k] = v;
        }
      }
    }
    void stateNames;
    return { name, duration: finalDuration, loop, alternate: spec.alternate === true, groups, on, when, next, emit, set, allowOverflow: spec.allowOverflow === true, ease: stateEase, at };
  };

  const parseLayer = (name: string, spec: Record<string, unknown>, prefix: string): NLayer | undefined => {
    const states = new Map<string, NState>();
    if (!isObject(spec.states) || !Object.keys(spec.states).length) {
      error(`${prefix}states`, 'Define at least one state, e.g. "states": { "idle": { "loop": true, "animate": { … } } }');
      return;
    }
    const names = new Set(Object.keys(spec.states));
    for (const [stateName, s] of Object.entries(spec.states)) {
      const st = parseState(stateName, s, `${prefix}states.${stateName}`, names);
      if (st) states.set(stateName, st);
    }
    const initial = typeof spec.initial === 'string' ? spec.initial : [...names][0]!;
    if (!names.has(initial)) error(`${prefix}initial`, `Initial state "${initial}" does not exist`, suggest(initial, names) ? `Did you mean "${suggest(initial, names)}"?` : `States: ${[...names].join(', ')}`);
    const on = new Map<string, NTransition>();
    if (spec.on !== undefined) {
      if (!isObject(spec.on)) error(`${prefix}on`, 'on maps event names to target states');
      else
        for (const [event, t] of Object.entries(spec.on)) {
          const tr = transition(t, `${prefix}on.${event}`);
          if (tr) on.set(event, tr);
          events.add(event);
        }
    }
    // Check transition targets.
    const check = (t: NTransition | undefined) => {
      if (t && !names.has(t.to)) error(t.at, `Unknown target state "${t.to}"`, suggest(t.to, names) ? `Did you mean "${suggest(t.to, names)}"?` : `States: ${[...names].join(', ')}`);
    };
    on.forEach(check);
    for (const st of states.values()) {
      st.on.forEach(check);
      st.when.forEach(w => check(w.transition));
      check(st.next);
    }
    return { name, initial, states, on, add: spec.add === true };
  };

  const layers: NLayer[] = [];
  if (raw.states === undefined && raw.layers === undefined) error('states', 'Missing "states". Every motion block needs at least one state.', 'Minimal example: { "states": { "idle": { "loop": true, "duration": 2000, "animate": { "#logo": { "rotate": [0, 360] } } } } }');
  if (raw.states !== undefined) {
    const main = parseLayer('main', raw as Record<string, unknown>, '');
    if (main) layers.push(main);
  }
  if (raw.layers !== undefined) {
    if (!isObject(raw.layers)) error('layers', 'layers maps names to { "initial", "states", "on" }');
    else
      for (const [name, spec] of Object.entries(raw.layers)) {
        if (!isObject(spec)) error(`layers.${name}`, 'A layer is { "initial": …, "states": { … } }');
        else {
          const layer = parseLayer(name, spec, `layers.${name}.`);
          if (layer) layers.push(layer);
        }
      }
  }

  // Bindings
  const bindings: NBinding[] = [];
  if (raw.bind !== undefined) {
    if (!isObject(raw.bind)) error('bind', 'bind maps selectors to { property: { "input": name, "from": a, "to": b } }');
    else
      for (const [selector, group] of Object.entries(raw.bind)) {
        const gat = `bind.${selector}`;
        if (!isObject(group)) {
          error(gat, 'Expected an object of property → binding');
          continue;
        }
        const origin = typeof group.origin === 'string' ? group.origin : undefined;
        for (const [propName, spec] of Object.entries(group)) {
          if (propName === 'origin' || propName === 'add') continue;
          const at = `${gat}.${propName}`;
          const prop = normalizeProp(propName);
          if (!prop) {
            error(at, `Unknown property "${propName}"`, PROPERTY_HINTS[propName] ?? (suggest(propName, Object.keys(PROPS)) ? `Did you mean "${suggest(propName, Object.keys(PROPS))}"?` : undefined));
            continue;
          }
          const kind = PROPS[prop]!;
          if (prop === 'text' && typeof spec === 'string') {
            const refs = [...spec.matchAll(/\{(\w[\w-]*)(?::(\d+))?\}/g)].map(m => m[1]!);
            for (const r of refs) if (!inputs.has(r)) error(at, `Template references unknown input "${r}"`, suggest(r, inputNames) ? `Did you mean "${suggest(r, inputNames)}"?` : undefined);
            if (!refs.length) warning(at, 'Text template has no {input} placeholders');
            bindings.push({ selector, prop, kind, map: [], template: spec, origin, at });
            continue;
          }
          if (!isObject(spec) || typeof spec.input !== 'string') {
            error(at, 'A binding is { "input": "name", "from": value, "to": value } or { "input": "name", "map": { "0": value, "100": value } }');
            continue;
          }
          const input = inputs.get(spec.input);
          if (!input) {
            error(`${at}.input`, `Unknown input "${spec.input}"`, suggest(spec.input, inputNames) ? `Did you mean "${suggest(spec.input, inputNames)}"?` : 'Declare it under "inputs".');
            continue;
          }
          const map: NBinding['map'] = [];
          const add = (x: number, v: unknown, where: string, ease?: EaseFn) => {
            const parsed = parseValue(kind, v);
            if (typeof parsed === 'string' && kind !== 'text') error(where, `${parsed} for ${prop}`);
            else map.push({ x, value: parsed, ease });
          };
          if (spec.map !== undefined) {
            if (!isObject(spec.map)) error(`${at}.map`, 'map is an object of input value → property value, e.g. { "0": -90, "100": 90 }');
            else
              for (const [k, v] of Object.entries(spec.map)) {
                const x = k === 'true' ? 1 : k === 'false' ? 0 : Number(k);
                if (!Number.isFinite(x)) error(`${at}.map.${k}`, `Map key "${k}" must be an input value (number)`);
                else {
                  if (x < input.min || x > input.max) warning(`${at}.map.${k}`, `Map key ${k} is outside input "${input.name}" range ${input.min}..${input.max}`);
                  if (isObject(v) && 'value' in v) add(x, v.value, `${at}.map.${k}`, easing(v.ease, `${at}.map.${k}.ease`));
                  else add(x, v, `${at}.map.${k}`);
                }
              }
          } else if ('from' in spec || 'to' in spec) {
            add(input.min, spec.from, `${at}.from`);
            add(input.max, spec.to, `${at}.to`, easing(spec.ease, `${at}.ease`));
          } else error(at, 'Binding needs "from"/"to" or "map"');
          map.sort((a, b) => a.x - b.x);
          const additive = spec.add === true || group.add === true;
          if (additive && kind !== 'number' && kind !== 'transform') error(`${at}.add`, '"add" only works for numeric and transform properties');
          if (map.length) bindings.push({ selector, prop, kind, input: input.name, map, origin, add: additive, at });
        }
      }
  }

  // Interactions
  const interactions: NInteraction[] = [];
  const KINDS = new Set(['click', 'hover', 'press', 'pointer', 'appear', 'drag']);
  if (raw.interactions !== undefined) {
    if (!Array.isArray(raw.interactions)) error('interactions', 'interactions is a list, e.g. [{ "on": "click", "target": "#button", "send": "press" }]');
    else
      raw.interactions.forEach((spec, i) => {
        const at = `interactions[${i}]`;
        if (!isObject(spec) || typeof spec.on !== 'string' || !KINDS.has(spec.on)) {
          error(at, `Each interaction needs "on": one of ${[...KINDS].join(', ')}`);
          return;
        }
        const it: NInteraction = { on: spec.on as InteractionKind, at, selector: typeof spec.target === 'string' ? spec.target : undefined };
        if (typeof spec.send === 'string') it.send = spec.send;
        if (typeof spec.leave === 'string') it.leave = spec.leave;
        const needInput = (name: unknown, where: string, type?: 'boolean' | 'number'): string | undefined => {
          if (typeof name !== 'string' || !inputs.has(name)) {
            error(where, `Unknown input ${JSON.stringify(name)}`, typeof name === 'string' && suggest(name, inputNames) ? `Did you mean "${suggest(name, inputNames)}"?` : 'Declare it under "inputs".');
            return;
          }
          if (type && inputs.get(name)!.type !== type) error(where, `Input "${name}" must be a ${type} input here`);
          return name;
        };
        if (spec.toggle !== undefined) it.toggle = needInput(spec.toggle, `${at}.toggle`, 'boolean');
        if (typeof spec.set === 'string') it.hold = needInput(spec.set, `${at}.set`, 'boolean');
        else if (isObject(spec.set)) {
          it.set = {};
          for (const [k, v] of Object.entries(spec.set)) if (needInput(k, `${at}.set.${k}`)) it.set[k] = typeof v === 'boolean' ? v : Number(v);
        }
        if (spec.x !== undefined) it.x = needInput(spec.x, `${at}.x`, 'number');
        if (spec.y !== undefined) it.y = needInput(spec.y, `${at}.y`, 'number');
        if (typeof spec.within === 'string') it.within = spec.within;
        if ((it.on === 'hover' || it.on === 'press') && spec.set !== undefined && typeof spec.set !== 'string') warning(at, `"${it.on}" with an object "set" applies once; use "set": "booleanInput" to hold it while ${it.on === 'hover' ? 'hovered' : 'pressed'}`);
        if ((it.on === 'pointer' || it.on === 'drag') && !it.x && !it.y) error(at, `"${it.on}" interactions need "x" and/or "y" number inputs`);
        if (!it.send && !it.toggle && !it.hold && !it.set && !it.x && !it.y) error(at, 'Interaction does nothing: add "send", "toggle", "set", or "x"/"y"');
        interactions.push(it);
      });
  }
  for (const it of interactions) for (const ev of [it.send, it.leave]) if (ev && !events.has(ev)) diagnostics.push({ level: 'warning', code: 'motion.unhandled-event', at: it.at, message: `Event "${ev}" is not handled by any state`, hint: suggest(ev, events) ? `Did you mean "${suggest(ev, events)}"?` : 'Add it under a state\'s "on", or the top-level "on".' });

  return {
    motion: { inputs, layers, bindings, interactions, events, title: typeof raw.title === 'string' ? raw.title : undefined },
    diagnostics,
  };
}
