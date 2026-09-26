import { clamp, ease, interpolate } from './easing';
import { applyBindings, sampleClip, setProperty, type Frame, type InputValues } from './sample';
import { parseDocument, properties, type ForgeDocument, type ForgeState, type Transition } from './schema';

export type PlayerSnapshot = { state: string; time: number; duration: number; playing: boolean; rate: number; inputs: InputValues; frame: Frame; transitioning: boolean };
export type PlayerEvent = { type: 'statechange'; from: string; to: string } | { type: 'complete'; state: string };
type Blend = { from: Frame; elapsed: number; duration: number; easing: Transition['easing'] };

/** Pure clock-driven player. Hosts own RAF so the same engine runs in Node, tests, and React. */
export class ForgePlayer {
  readonly document: ForgeDocument;
  private state: ForgeState;
  private time = 0;
  private playing = false;
  private rate = 1;
  private values: InputValues;
  private blend: Blend | undefined;
  private snapshot: PlayerSnapshot;
  private listeners = new Set<() => void>();
  private eventListeners = new Set<(event: PlayerEvent) => void>();
  private completed = false;
  private disposed = false;
  private reducedMotion: boolean;

  constructor(document: ForgeDocument, options: { reducedMotion?: boolean; autoplay?: boolean } = {}) {
    this.document = parseDocument(document);
    this.state = this.document.states.find(s => s.id === this.document.initialState)!;
    this.values = Object.fromEntries(this.document.inputs.map(i => [i.id, i.default]));
    this.reducedMotion = options.reducedMotion ?? false;
    this.playing = options.autoplay ?? false;
    if (this.reducedMotion) { this.time = this.duration; this.playing = false; }
    this.snapshot = this.compute();
  }

  private get duration(): number { return this.document.clips.find(c => c.id === this.state.clipId)!.duration; }
  private compute(): PlayerSnapshot {
    const frame = sampleClip(this.document, this.state.clipId, this.time);
    if (this.blend) {
      const t = ease(this.blend.easing, this.blend.elapsed / this.blend.duration);
      for (const node of Object.values(frame)) {
        const from = this.blend.from[node.id];
        if (from) for (const property of properties) setProperty(node, property, interpolate(from[property], node[property], t));
      }
    }
    applyBindings(this.document, frame, this.values);
    return { state: this.state.id, time: this.time, duration: this.duration, playing: this.playing, rate: this.rate, inputs: { ...this.values }, frame, transitioning: !!this.blend };
  }
  private publish(): void {
    if (this.disposed) return;
    this.snapshot = this.compute();
    for (const listener of [...this.listeners]) listener();
  }
  getSnapshot = (): PlayerSnapshot => this.snapshot;
  subscribe = (listener: () => void): (() => void) => {
    if (this.disposed) return () => {};
    this.listeners.add(listener); return () => this.listeners.delete(listener);
  };
  onEvent(listener: (event: PlayerEvent) => void): () => void { this.eventListeners.add(listener); return () => this.eventListeners.delete(listener); }
  private emit(event: PlayerEvent): void { for (const listener of [...this.eventListeners]) listener(event); }
  play(): void { if (!this.reducedMotion) { this.playing = true; this.publish(); } }
  pause(): void { this.playing = false; this.publish(); }
  seek(time: number): void {
    if (!Number.isFinite(time)) throw new RangeError('Time must be finite');
    this.time = clamp(time, 0, this.duration); this.blend = undefined; this.completed = false; this.publish();
  }
  setRate(rate: number): void {
    if (!Number.isFinite(rate) || Math.abs(rate) > 16) throw new RangeError('Playback rate must be between -16 and 16');
    this.rate = rate; this.publish();
  }
  setReducedMotion(enabled: boolean): void {
    this.reducedMotion = enabled;
    if (enabled) { this.time = this.duration; this.blend = undefined; this.playing = false; }
    this.publish();
  }
  setInput(id: string, value: number | boolean): void {
    const input = this.document.inputs.find(i => i.id === id);
    if (!input) throw new Error(`Unknown input: ${id}`);
    if (input.type === 'number') {
      if (typeof value !== 'number' || !Number.isFinite(value)) throw new TypeError(`Input ${id} requires a finite number`);
      value = clamp(value, input.min, input.max);
    } else if (typeof value !== 'boolean') throw new TypeError(`Input ${id} requires a boolean`);
    this.values[id] = value;
    const transition = this.match(t => {
      if (t.trigger.type !== 'input' || t.trigger.inputId !== id) return false;
      const expected = t.trigger.value;
      switch (t.trigger.operator) {
        case 'eq': return value === expected;
        case 'gt': return value > expected;
        case 'gte': return value >= expected;
        case 'lt': return value < expected;
        case 'lte': return value <= expected;
      }
    });
    if (transition) this.transition(transition); else this.publish();
  }
  private match(test: (t: Transition) => boolean): Transition | undefined {
    // Document order is the explicit priority. One transition is taken per host operation.
    return this.document.transitions.find(t => (t.from === this.state.id || t.from === '*') && t.to !== this.state.id && test(t));
  }
  send(event: string): boolean {
    const t = this.match(t => t.trigger.type === 'event' && t.trigger.event === event);
    if (!t) return false;
    this.transition(t); return true;
  }
  setState(id: string): void {
    if (!this.document.states.some(s => s.id === id)) throw new Error(`Unknown state: ${id}`);
    this.transition({ id: 'direct', from: this.state.id, to: id, trigger: { type: 'event', event: 'direct' }, duration: 0, easing: 'linear' });
  }
  private transition(t: Transition): void {
    const from = this.state.id;
    const captured = this.compute().frame;
    this.state = this.document.states.find(s => s.id === t.to)!;
    this.time = this.reducedMotion ? this.duration : 0;
    this.completed = false;
    this.blend = t.duration > 0 && !this.reducedMotion ? { from: captured, duration: t.duration, elapsed: 0, easing: t.easing } : undefined;
    this.playing = !this.reducedMotion;
    this.publish(); this.emit({ type: 'statechange', from, to: this.state.id });
  }
  advance(delta: number): void {
    if (!Number.isFinite(delta) || delta < 0) throw new RangeError('Elapsed time must be finite and non-negative');
    if (!this.playing || this.disposed || this.reducedMotion) return;
    if (this.blend) { this.blend.elapsed += delta; if (this.blend.elapsed >= this.blend.duration) this.blend = undefined; }
    const next = this.time + delta * this.rate;
    const ended = this.rate > 0 ? next >= this.duration : this.rate < 0 ? next <= 0 : false;
    this.time = this.state.loop ? ((next % this.duration) + this.duration) % this.duration : clamp(next, 0, this.duration);
    if (ended && !this.state.loop && !this.completed) {
      this.completed = true;
      const finishedState = this.state.id;
      const t = this.match(t => t.trigger.type === 'complete');
      if (t) this.transition(t); else this.playing = !!this.blend;
      this.publish(); this.emit({ type: 'complete', state: finishedState });
      return;
    }
    if (this.completed && !this.state.loop && !this.blend) this.playing = false;
    this.publish();
  }
  reset(): void {
    this.values = Object.fromEntries(this.document.inputs.map(i => [i.id, i.default]));
    this.state = this.document.states.find(s => s.id === this.document.initialState)!;
    this.time = this.reducedMotion ? this.duration : 0; this.playing = false; this.blend = undefined; this.completed = false; this.publish();
  }
  dispose(): void { this.disposed = true; this.playing = false; this.listeners.clear(); this.eventListeners.clear(); }
}
