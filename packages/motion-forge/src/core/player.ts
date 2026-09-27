import type { EaseFn } from './easing';
import type { NTransition } from './motion';
import { blendFrames, interpolate, sampleState, type Frame } from './sample';
import type { RLayer, RState, Scene } from './scene';

export type PlayerEvent =
  | { type: 'statechange'; layer: string; from: string; to: string }
  | { type: 'complete'; layer: string; state: string }
  | { type: 'emit'; name: string; state: string }
  | { type: 'input'; name: string; value: number | boolean };

export interface PlayerOptions {
  /** Initial input values. Booleans are accepted for boolean inputs. */
  inputs?: Record<string, number | boolean>;
  /** Start in this state instead of the declared initial state. */
  state?: string;
  /** Freeze loops and jump one-shots to their end. */
  reducedMotion?: boolean;
  /** Stay in the chosen state: ignore "when" conditions and "next" (for previews and scrubbing). */
  hold?: boolean;
}

interface LayerRuntime {
  layer: RLayer;
  state: RState;
  t: number;
  completed: boolean;
  blend?: { from: Frame; elapsed: number; duration: number; ease: EaseFn };
  output: Frame;
}

/**
 * The headless state machine. Hosts drive it with `advance(ms)`; it never touches
 * timers or the DOM, so the same code runs in browsers, Node, tests and renderers.
 */
export class Player {
  readonly scene: Scene;
  private layers: LayerRuntime[] = [];
  private targets: Record<string, number> = Object.create(null);
  private values: Record<string, number> = Object.create(null);
  private velocity: Record<string, number> = Object.create(null);
  private tweens: Record<string, { from: number; elapsed: number }> = Object.create(null);
  private mutationDepth = 1;
  private evaluating = false;
  private initializing = true;
  private listeners = new Set<(e: PlayerEvent) => void>();
  private frameCache?: Frame;
  private reduced: boolean;
  /** When true, conditions and "next" transitions are ignored. */
  hold: boolean;
  /** Total time advanced, for diagnostics and renderers. */
  elapsed = 0;

  constructor(scene: Scene, options: PlayerOptions = {}) {
    this.scene = scene;
    this.reduced = !!options.reducedMotion;
    this.hold = !!options.hold;
    for (const input of scene.inputs.values()) {
      this.targets[input.name] = input.default;
      this.values[input.name] = input.default;
    }
    for (const [name, v] of Object.entries(options.inputs ?? {})) this.setInput(name, v, true);
    for (const layer of scene.layers) {
      const start = (layer === scene.layers[0] && options.state && layer.states.get(options.state)) || layer.states.get(layer.initial) || layer.states.values().next().value!;
      const rt: LayerRuntime = { layer, state: start, t: 0, completed: false, output: new Map() };
      this.layers.push(rt);
      this.enter(rt);
    }
    if (!this.hold) this.settle();
    this.initializing = false;
    this.mutationDepth = 0;
  }

  /**
   * Starts in the state that matches the initial inputs, as if it had been there all
   * along: conditions jump without blending and one-shots on the way finish instantly.
   */
  private settle() {
    for (const rt of this.layers) {
      for (let guard = 0; guard < 12; guard++) {
        const w = rt.state.when.find(w => w.transition.to !== rt.state.name && w.test(this.targets, this.values));
        const next = w?.transition ?? (rt.state.loop !== Infinity && rt.state.next && rt.state.channels.length ? rt.state.next : undefined);
        if (!w && guard === 0) break;
        if (!next) {
          if (rt.state.loop !== Infinity) {
            rt.t = rt.state.completeAt;
            rt.completed = true;
          }
          break;
        }
        const to = rt.layer.states.get(next.to);
        if (!to) break;
        rt.state = to;
        rt.t = 0;
        rt.completed = false;
        if (to.set) for (const [k, v] of Object.entries(to.set)) this.setInput(k, v, true);
      }
    }
  }

  /** Main layer's current state name. */
  get state(): string {
    return this.layers[0]?.state.name ?? '';
  }
  get time(): number {
    return this.layers[0]?.t ?? 0;
  }
  stateOf(layer: string): string | undefined {
    return this.layers.find(l => l.layer.name === layer)?.state.name;
  }
  get states(): string[] {
    return [...(this.scene.layers[0]?.states.keys() ?? [])];
  }
  get inputs(): Record<string, number | boolean> {
    const out: Record<string, number | boolean> = Object.create(null);
    for (const input of this.scene.inputs.values()) out[input.name] = input.type === 'boolean' ? !!this.targets[input.name] : this.targets[input.name]!;
    return out;
  }
  get transitioning(): boolean {
    return this.layers.some(l => l.blend);
  }
  /** True when something is still moving (loops, blends, smoothing, unfinished one-shots). */
  get active(): boolean {
    for (const l of this.layers) {
      if (l.blend) return true;
      if (l.state.loop !== Infinity && !l.completed) return true;
      if (!this.reduced && l.state.channels.length && l.state.loop === Infinity) return true;
    }
    for (const input of this.scene.inputs.values()) if (this.values[input.name] !== this.targets[input.name] || this.velocity[input.name]) return true;
    return false;
  }

  /** Update a live preference without restarting the state machine. */
  setReducedMotion(reduced: boolean): void {
    if (this.reduced === reduced) return;
    this.reduced = reduced;
    if (reduced) {
      for (const input of this.scene.inputs.keys()) {
        this.values[input] = this.targets[input]!;
        this.velocity[input] = 0;
        delete this.tweens[input];
      }
      for (const rt of this.layers) {
        rt.blend = undefined;
        rt.t = rt.state.loop === Infinity ? 0 : rt.state.completeAt;
      }
    }
    this.frameCache = undefined;
    this.evaluateConditions();
  }

  on(listener: (e: PlayerEvent) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
  private emit(e: PlayerEvent) {
    for (const l of this.listeners) l(e);
  }

  private enter(rt: LayerRuntime) {
    rt.completed = false;
    rt.t = 0;
    if (this.reduced && rt.state.loop !== Infinity) rt.t = rt.state.completeAt;
    if (rt.state.set) for (const [k, v] of Object.entries(rt.state.set)) this.setInput(k, v, this.initializing);
    for (const name of rt.state.emit) this.emit({ type: 'emit', name, state: rt.state.name });
  }

  private go(rt: LayerRuntime, transition: NTransition) {
    const to = rt.layer.states.get(transition.to);
    if (!to) return;
    const from = rt.state.name;
    const snapshot = this.layerFrame(rt);
    rt.state = to;
    rt.blend = transition.blend > 0 && !this.reduced ? { from: snapshot, elapsed: 0, duration: transition.blend, ease: transition.ease } : undefined;
    this.frameCache = undefined;
    this.mutationDepth++;
    try {
      this.emit({ type: 'statechange', layer: rt.layer.name, from, to: to.name });
      this.enter(rt);
    } finally {
      this.mutationDepth--;
    }
  }

  /** Send an event to every layer. Returns true if any layer changed state. */
  send(event: string): boolean {
    let handled = false;
    for (const rt of this.layers) {
      const t = rt.state.on.get(event) ?? rt.layer.on.get(event);
      if (t) {
        this.go(rt, t);
        handled = true;
      }
    }
    if (handled) this.evaluateConditions();
    return handled;
  }

  /** Jump (or blend) straight to a state. */
  goto(state: string, options: { layer?: string; blend?: number } = {}): boolean {
    const rt = options.layer ? this.layers.find(l => l.layer.name === options.layer) : this.layers[0];
    if (!rt || !rt.layer.states.has(state)) return false;
    this.go(rt, { to: state, blend: options.blend ?? 0, ease: (t: number) => t, at: 'goto' });
    return true;
  }

  setInput(name: string, value: number | boolean, immediate = false): void {
    const def = this.scene.inputs.get(name);
    if (!def) return;
    let v = typeof value === 'boolean' ? +value : Number(value);
    if (!Number.isFinite(v)) return;
    v = def.type === 'boolean' ? (v ? 1 : 0) : Math.min(def.max, Math.max(def.min, v));
    if (this.targets[name] === v && !immediate) return;
    this.targets[name] = v;
    if (immediate || def.smooth <= 0 || this.reduced) {
      this.values[name] = v;
      this.velocity[name] = 0;
      delete this.tweens[name];
    } else if (!def.spring) this.tweens[name] = { from: this.values[name]!, elapsed: 0 };
    this.frameCache = undefined;
    this.emit({ type: 'input', name, value: def.type === 'boolean' ? !!v : v });
    this.evaluateConditions();
  }
  getInput(name: string): number | boolean | undefined {
    const def = this.scene.inputs.get(name);
    if (!def) return;
    return def.type === 'boolean' ? !!this.targets[name] : this.targets[name];
  }

  private evaluateConditions() {
    if (this.hold || this.mutationDepth || this.evaluating) return;
    this.evaluating = true;
    try {
      for (let guard = 0; guard < 8; guard++) {
        let changed = false;
        for (const rt of this.layers) {
          for (const w of rt.state.when) {
            if (w.transition.to !== rt.state.name && w.test(this.targets, this.values)) {
              this.go(rt, w.transition);
              changed = true;
              break;
            }
          }
        }
        if (!changed) return;
      }
    } finally {
      this.evaluating = false;
    }
  }

  /** Advance the clock. Large steps are subdivided so completions/transitions stay ordered. */
  advance(ms: number): void {
    if (!(ms > 0) || !Number.isFinite(ms)) return;
    let remaining = ms;
    while (remaining > 0) {
      let step = Math.min(remaining, 50);
      // Stop at completion boundaries so advance(125) and small frame steps
      // spend the same amount of time in each state.
      for (const rt of this.layers) {
        const until = rt.state.completeAt - rt.t;
        if (!rt.completed && rt.state.loop !== Infinity && until > 0) step = Math.min(step, until);
      }
      remaining -= step;
      this.elapsed += step;
      this.frameCache = undefined;
      for (const input of this.scene.inputs.values()) {
        const target = this.targets[input.name]!;
        const cur = this.values[input.name]!;
        const vel = this.velocity[input.name] ?? 0;
        if (cur === target && vel === 0) continue;
        const eps = (input.max - input.min) * 1e-4;
        if (input.spring) {
          // Semi-implicit Euler in small substeps; unit mass.
          let x = cur, v = vel;
          for (let k = 0; k < 4; k++) {
            const dt = step / 4000;
            v += (-input.spring.stiffness * (x - target) - input.spring.damping * v) * dt;
            x += v * dt;
          }
          const done = Math.abs(x - target) < eps && Math.abs(v) < eps * 10;
          this.values[input.name] = done ? target : x;
          this.velocity[input.name] = done ? 0 : v;
        } else {
          // A retargetable ease-out tween that arrives exactly after `smooth` ms.
          const tw = (this.tweens[input.name] ??= { from: cur, elapsed: 0 });
          tw.elapsed += step;
          const p = input.smooth > 0 ? Math.min(1, tw.elapsed / input.smooth) : 1;
          const e = 1 - (1 - p) ** 3;
          this.values[input.name] = p >= 1 ? target : tw.from + (target - tw.from) * e;
          if (p >= 1) delete this.tweens[input.name];
        }
      }
      for (const rt of this.layers) {
        if (rt.blend) {
          rt.blend.elapsed += step;
          if (rt.blend.elapsed >= rt.blend.duration) rt.blend = undefined;
        }
        if (this.reduced && rt.state.loop === Infinity) continue;
        rt.t += step;
        if (!rt.completed && rt.state.loop !== Infinity && rt.t >= rt.state.completeAt) {
          rt.completed = true;
          this.emit({ type: 'complete', layer: rt.layer.name, state: rt.state.name });
          if (rt.state.next && !this.hold) this.go(rt, rt.state.next);
        }
      }
      this.evaluateConditions();
    }
    this.frameCache = undefined;
  }

  /** Scrub the main layer (or a named layer) to a time within its current state. */
  seek(ms: number, layer?: string): void {
    const rt = layer ? this.layers.find(l => l.layer.name === layer) : this.layers[0];
    if (!rt) return;
    if (!Number.isFinite(ms)) return;
    rt.t = Math.max(0, ms);
    rt.blend = undefined;
    rt.completed = rt.state.loop !== Infinity && rt.t >= rt.state.completeAt;
    this.frameCache = undefined;
  }

  private layerFrame(rt: LayerRuntime): Frame {
    const current = sampleState(rt.state, rt.t, new Map());
    if (!rt.blend) return current;
    const p = Math.min(1, rt.blend.elapsed / rt.blend.duration);
    const out = blendFrames(this.scene, rt.blend.from, current, rt.blend.ease(p));
    // Properties that were at rest and whose new keyframes start explicitly at 0% begin
    // exactly there (a stroke that draws on shouldn't first flash fully drawn).
    for (const ch of rt.state.channels) {
      if (!ch.explicitStart || rt.blend.from.get(ch.el)?.has(ch.prop)) continue;
      const v = current.get(ch.el)?.get(ch.prop);
      if (v !== undefined) out.get(ch.el)?.set(ch.prop, v);
    }
    return out;
  }

  /** The current values of every animated element property. */
  frame(): Frame {
    if (this.frameCache) return this.frameCache;
    const out: Frame = new Map();
    for (const rt of this.layers) {
      const f = this.layerFrame(rt);
      for (const [el, props] of f) {
        let m = out.get(el);
        if (!m) out.set(el, (m = new Map()));
        for (const [p, v] of props) {
          const prev = m.get(p);
          if (rt.layer.add && typeof v === 'number' && typeof prev === 'number') {
            const base = this.scene.base.get(el)?.get(p);
            m.set(p, prev + v - (typeof base === 'number' ? base : 0));
          } else m.set(p, v);
        }
      }
    }
    for (const b of this.scene.bindings) {
      const text = b.template ? this.formatTemplate(b.template) : undefined;
      for (const el of b.els) {
        let m = out.get(el);
        if (!m) out.set(el, (m = new Map()));
        if (text !== undefined) {
          m.set(b.prop, text);
          continue;
        }
        const x = this.values[b.input!]!;
        const map = b.map;
        let value = map[0]!.value;
        const numeric = b.kind === 'number' || b.kind === 'transform';
        const last = map[map.length - 1]!;
        const def = this.scene.inputs.get(b.input!)!;
        // Only a spring pushes a value past the input's own range; extrapolate then so the overshoot shows.
        if (numeric && map.length > 1 && ((x > def.max && x > last.x) || (x < def.min && x < map[0]!.x))) {
          // Only springs push past the input range; extrapolate so the overshoot shows.
          const [p, q] = x > last.x ? [map[map.length - 2]!, last] : [map[0]!, map[1]!];
          value = (p.value as number) + (((q.value as number) - (p.value as number)) * (x - p.x)) / (q.x - p.x || 1);
        } else if (x >= last.x) value = last.value;
        else if (x > map[0]!.x) {
          let i = 1;
          while (i < map.length - 1 && map[i]!.x < x) i++;
          const a = map[i - 1]!, c = map[i]!;
          const p = (x - a.x) / (c.x - a.x || 1);
          value = interpolate(b.kind, a.value, c.value, c.ease ? c.ease(p) : p);
        }
        if (b.add && typeof value === 'number') {
          const base = this.scene.base.get(el)?.get(b.prop);
          const cur = m.get(b.prop) ?? base;
          m.set(b.prop, (typeof cur === 'number' ? cur : 0) + value - (typeof base === 'number' ? base : 0));
        } else m.set(b.prop, value);
      }
    }
    this.frameCache = out;
    return out;
  }

  private formatTemplate(template: string): string {
    return template.replace(/\{(\w[\w-]*)(?::(\d+))?\}/g, (whole, name: string, digits?: string) => {
      const def = this.scene.inputs.get(name);
      if (!def) return whole;
      const v = this.values[name]!;
      if (def.type === 'boolean') return v >= 0.5 ? 'true' : 'false';
      const d = digits !== undefined ? Number(digits) : def.max - def.min >= 10 ? 0 : 2;
      return v.toFixed(Math.min(100, Math.max(0, d)));
    });
  }
}
