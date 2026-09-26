import { clamp, ease, interpolate } from './easing';
import type { ForgeDocument, ForgeNode, Track, AnimatedProperty } from './schema';

export type InputValues = Record<string, number | boolean>;
export type Frame = Record<string, ForgeNode>;
export function sampleTrack(track: Track, time: number): number | string {
  const keys = track.keyframes;
  if (!keys.length) throw new Error('Cannot sample an empty track');
  if (time <= keys[0]!.time) return keys[0]!.value;
  if (time >= keys.at(-1)!.time) return keys.at(-1)!.value;
  let lo = 0, hi = keys.length - 1;
  while (hi - lo > 1) { const mid = (hi + lo) >> 1; if (keys[mid]!.time <= time) lo = mid; else hi = mid; }
  const a = keys[lo]!, b = keys[hi]!;
  return interpolate(a.value, b.value, ease(a.easing, (time - a.time) / (b.time - a.time)));
}

export function setProperty(node: ForgeNode, property: AnimatedProperty, value: number | string): void {
  if (property === 'fill' || property === 'stroke') { if (typeof value === 'string') node[property] = value; }
  else if (typeof value === 'number') {
    if (property === 'opacity') value = clamp(value);
    else if (property === 'scaleX' || property === 'scaleY') value = clamp(value, -100, 100);
    else if (property === 'strokeWidth') value = clamp(value, 0, 1000);
    else if (property === 'fontSize') value = clamp(value, 1, 1000);
    else if (['width', 'height', 'radius', 'rx', 'ry'].includes(property)) value = clamp(value, 0, 100000);
    else value = clamp(value, -1e6, 1e6);
    node[property] = value;
  }
}

/** Sample a validated document without changing it. Time is in milliseconds. */
export function sampleClip(document: ForgeDocument, clipId: string, time: number): Frame {
  if (!Number.isFinite(time)) throw new RangeError('Time must be finite');
  const clip = document.clips.find(c => c.id === clipId);
  if (!clip) throw new Error(`Unknown clip: ${clipId}`);
  const frame: Frame = Object.create(null) as Frame;
  for (const node of document.nodes) frame[node.id] = { ...node };
  const t = clamp(time, 0, clip.duration);
  for (const track of clip.tracks) setProperty(frame[track.nodeId]!, track.property, sampleTrack(track, t));
  return frame;
}

export function applyBindings(document: ForgeDocument, frame: Frame, values: InputValues): Frame {
  for (const binding of document.bindings) {
    const input = document.inputs.find(i => i.id === binding.inputId);
    if (!input || input.type !== 'number') continue;
    const value = Object.hasOwn(values, input.id) ? values[input.id] : input.default;
    if (typeof value !== 'number' || !Number.isFinite(value)) throw new Error(`Input ${input.id} must be a finite number`);
    const bounded = clamp(value, input.min, input.max);
    const range = input.max - input.min;
    const t = Number.isFinite(range) ? (bounded - input.min) / range : (bounded / 2 - input.min / 2) / (input.max / 2 - input.min / 2);
    setProperty(frame[binding.nodeId]!, binding.property, binding.from + t * (binding.to - binding.from));
  }
  return frame;
}

export function sampleDocument(document: ForgeDocument, time: number, options: { state?: string; inputs?: InputValues; loop?: boolean } = {}): Frame {
  const state = document.states.find(s => s.id === (options.state ?? document.initialState));
  if (!state) throw new Error(`Unknown state: ${options.state}`);
  const duration = document.clips.find(c => c.id === state.clipId)!.duration;
  const t = options.loop ? ((time % duration) + duration) % duration : time;
  return applyBindings(document, sampleClip(document, state.clipId, t), options.inputs ?? {});
}
