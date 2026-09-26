import type { Easing } from './schema';

export const clamp = (value: number, min = 0, max = 1): number => Math.min(max, Math.max(min, value));
export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

/** Solve x(s)=time, then return y(s). Bisection is stable even for flat tangents. */
export function cubicBezier(t: number, [x1, y1, x2, y2]: readonly number[]): number {
  if (t <= 0) return 0; if (t >= 1) return 1;
  const axis = (s: number, a: number, b: number) => 3 * (1 - s) ** 2 * s * a + 3 * (1 - s) * s ** 2 * b + s ** 3;
  let lo = 0, hi = 1;
  for (let i = 0; i < 32; i++) {
    const mid = (lo + hi) / 2;
    if (axis(mid, x1!, x2!) < t) lo = mid; else hi = mid;
  }
  return axis((lo + hi) / 2, y1!, y2!);
}

function spring(t: number, stiffness: number, damping: number, mass: number): number {
  const w = Math.sqrt(stiffness / mass), z = damping / (2 * Math.sqrt(stiffness * mass));
  const response = (s: number) => {
    if (z < 1) { const wd = w * Math.sqrt(1 - z * z); return 1 - Math.exp(-z * w * s) * (Math.cos(wd * s) + z * w / wd * Math.sin(wd * s)); }
    if (Math.abs(z - 1) < 1e-7) return 1 - (1 + w * s) * Math.exp(-w * s);
    const a = -w * (z - Math.sqrt(z * z - 1)), b = -w * (z + Math.sqrt(z * z - 1));
    return 1 - (b * Math.exp(a * s) - a * Math.exp(b * s)) / (b - a);
  };
  return response(t) / response(1);
}

export function ease(easing: Easing, time: number): number {
  const t = clamp(time);
  if (t === 0 || t === 1) return t;
  if (typeof easing === 'object') return easing.type === 'cubic' ? cubicBezier(t, easing.points) : spring(t, easing.stiffness, easing.damping, easing.mass);
  switch (easing) {
    case 'hold': return 0;
    case 'linear': return t;
    case 'ease-in': return cubicBezier(t, [0.42, 0, 1, 1]);
    case 'ease-out': return cubicBezier(t, [0, 0, 0.58, 1]);
    case 'ease-in-out': return cubicBezier(t, [0.42, 0, 0.58, 1]);
    case 'spring': return spring(t, 180, 16, 1);
  }
}

function rgba(value: string): number[] | null {
  if (!/^#([\da-f]{3}|[\da-f]{6}|[\da-f]{8})$/i.test(value)) return null;
  let hex = value.slice(1);
  if (hex.length === 3) hex = hex.split('').map(c => c + c).join('');
  if (hex.length === 6) hex += 'ff';
  return [0, 2, 4, 6].map(i => parseInt(hex.slice(i, i + 2), 16));
}

export function interpolate(a: number | string, b: number | string, t: number): number | string {
  if (typeof a === 'number' && typeof b === 'number') return lerp(a, b, t);
  if (typeof a === 'string' && typeof b === 'string') {
    const first = rgba(a), last = rgba(b);
    if (first && last) return '#' + first.map((v, i) => Math.round(clamp(lerp(v, last[i]!, t), 0, 255)).toString(16).padStart(2, '0')).join('');
  }
  return t < 1 ? a : b;
}
