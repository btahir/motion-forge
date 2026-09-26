/**
 * Easing strings follow CSS where CSS has an answer, plus a few motion-design
 * staples. Every function maps 0..1 progress to eased progress (may overshoot).
 */
export type EaseFn = (t: number) => number;

function cubicBezier(x1: number, y1: number, x2: number, y2: number): EaseFn {
  const cx = 3 * x1, bx = 3 * (x2 - x1) - cx, ax = 1 - cx - bx;
  const cy = 3 * y1, by = 3 * (y2 - y1) - cy, ay = 1 - cy - by;
  const sx = (t: number) => ((ax * t + bx) * t + cx) * t;
  const sy = (t: number) => ((ay * t + by) * t + cy) * t;
  const dx = (t: number) => (3 * ax * t + 2 * bx) * t + cx;
  return x => {
    if (x <= 0) return 0;
    if (x >= 1) return 1;
    let t = x;
    for (let i = 0; i < 8; i++) {
      const err = sx(t) - x;
      if (Math.abs(err) < 1e-6) return sy(t);
      const d = dx(t);
      if (Math.abs(d) < 1e-6) break;
      t -= err / d;
    }
    let lo = 0, hi = 1;
    t = x;
    for (let i = 0; i < 30; i++) {
      const v = sx(t);
      if (Math.abs(v - x) < 1e-6) break;
      if (v < x) lo = t;
      else hi = t;
      t = (lo + hi) / 2;
    }
    return sy(t);
  };
}

/**
 * A damped spring normalized to the keyframe segment: the segment's duration is
 * the spring's settle time, so springs always land exactly on their keyframe.
 */
export function spring(stiffness = 170, damping = 14, mass = 1): EaseFn {
  const w0 = Math.sqrt(stiffness / mass);
  const zeta = damping / (2 * Math.sqrt(stiffness * mass));
  // Settle time: envelope reaches 0.1% of the initial displacement.
  // Overdamped springs are treated as critically damped (no overshoot either way).
  const settle = Math.min(10, Math.max(0.05, zeta < 1 ? 6.9 / (zeta * w0) : 9.2 / w0));
  const raw = (s: number) => {
    if (zeta < 1) {
      const wd = w0 * Math.sqrt(1 - zeta * zeta);
      return 1 - Math.exp(-zeta * w0 * s) * (Math.cos(wd * s) + ((zeta * w0) / wd) * Math.sin(wd * s));
    }
    return 1 - Math.exp(-w0 * s) * (1 + w0 * s);
  };
  const end = raw(settle);
  return t => (t <= 0 ? 0 : t >= 1 ? 1 : raw(t * settle) / end);
}

const back = (s = 1.70158): EaseFn => t => {
  const u = t - 1;
  return 1 + (s + 1) * u * u * u + s * u * u;
};
const elastic: EaseFn = t => (t <= 0 ? 0 : t >= 1 ? 1 : 2 ** (-10 * t) * Math.sin(((t * 10 - 0.75) * 2 * Math.PI) / 3) + 1);
const bounce: EaseFn = t => {
  const n = 7.5625, d = 2.75;
  if (t < 1 / d) return n * t * t;
  if (t < 2 / d) return n * (t -= 1.5 / d) * t + 0.75;
  if (t < 2.5 / d) return n * (t -= 2.25 / d) * t + 0.9375;
  return n * (t -= 2.625 / d) * t + 0.984375;
};

const NAMED: Record<string, EaseFn> = {
  linear: t => t,
  ease: cubicBezier(0.25, 0.1, 0.25, 1),
  'ease-in': cubicBezier(0.42, 0, 1, 1),
  'ease-out': cubicBezier(0, 0, 0.58, 1),
  'ease-in-out': cubicBezier(0.42, 0, 0.58, 1),
  // Stronger curves that designers actually reach for.
  'in': cubicBezier(0.55, 0, 1, 0.45),
  'out': cubicBezier(0.16, 1, 0.3, 1),
  'in-out': cubicBezier(0.65, 0, 0.35, 1),
  snappy: cubicBezier(0.2, 0.9, 0.1, 1),
  anticipate: cubicBezier(0.6, -0.28, 0.735, 0.045),
  back: back(),
  'back-out': back(),
  'back-in': t => 1 - back()(1 - t),
  elastic,
  bounce,
  spring: spring(),
  'spring-soft': spring(120, 16),
  'spring-bouncy': spring(220, 10),
  hold: t => (t >= 1 ? 1 : 0),
  step: t => (t >= 1 ? 1 : 0),
};
export const easingNames = Object.keys(NAMED);

const cache = new Map<string, EaseFn>();

/** Returns undefined when the string is not a recognized easing. */
export function parseEasing(input: string): EaseFn | undefined {
  const key = input.trim().toLowerCase().replace(/\s+/g, '');
  const hit = cache.get(key);
  if (hit) return hit;
  let fn: EaseFn | undefined = NAMED[key];
  const call = /^([a-z-]+)\(([^)]*)\)$/.exec(key);
  if (!fn && call) {
    const args = call[2]!.split(',').filter(Boolean).map(Number);
    if (args.some(n => !Number.isFinite(n))) return;
    if (call[1] === 'cubic-bezier' && args.length === 4 && args[0]! >= 0 && args[0]! <= 1 && args[2]! >= 0 && args[2]! <= 1) fn = cubicBezier(args[0]!, args[1]!, args[2]!, args[3]!);
    else if (call[1] === 'spring' && args.length >= 1 && args.length <= 3 && args.every(a => a > 0)) fn = spring(args[0], args[1], args[2]);
    else if (call[1] === 'steps' && args.length === 1 && Number.isInteger(args[0]) && args[0]! > 0) {
      const n = args[0]!;
      fn = t => (t >= 1 ? 1 : Math.floor(t * n) / n);
    } else if (call[1] === 'back' && args.length === 1) fn = back(args[0]);
  }
  if (fn) cache.set(key, fn);
  return fn;
}
