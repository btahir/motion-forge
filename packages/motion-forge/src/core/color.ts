/** Colors are RGBA tuples in 0..1. Interpolation happens in OKLab so mixes stay vivid. */
export type RGBA = [number, number, number, number];

const NAMED: Record<string, string> = {
  black: '000000', white: 'ffffff', red: 'ff0000', green: '008000', blue: '0000ff', yellow: 'ffff00',
  orange: 'ffa500', purple: '800080', pink: 'ffc0cb', gray: '808080', grey: '808080', silver: 'c0c0c0',
  navy: '000080', teal: '008080', maroon: '800000', olive: '808000', lime: '00ff00', aqua: '00ffff',
  cyan: '00ffff', fuchsia: 'ff00ff', magenta: 'ff00ff', gold: 'ffd700', coral: 'ff7f50', tomato: 'ff6347',
  salmon: 'fa8072', crimson: 'dc143c', indigo: '4b0082', violet: 'ee82ee', orchid: 'da70d6', plum: 'dda0dd',
  tan: 'd2b48c', brown: 'a52a2a', chocolate: 'd2691e', beige: 'f5f5dc', ivory: 'fffff0', khaki: 'f0e68c',
  lavender: 'e6e6fa', mintcream: 'f5fffa', skyblue: '87ceeb', steelblue: '4682b4', royalblue: '4169e1',
  dodgerblue: '1e90ff', deepskyblue: '00bfff', turquoise: '40e0d0', seagreen: '2e8b57', forestgreen: '228b22',
  limegreen: '32cd32', darkgreen: '006400', firebrick: 'b22222', darkred: '8b0000', hotpink: 'ff69b4',
  deeppink: 'ff1493', slategray: '708090', slategrey: '708090', darkgray: 'a9a9a9', darkgrey: 'a9a9a9',
  lightgray: 'd3d3d3', lightgrey: 'd3d3d3', whitesmoke: 'f5f5f5', gainsboro: 'dcdcdc', dimgray: '696969',
  dimgrey: '696969', goldenrod: 'daa520', wheat: 'f5deb3', snow: 'fffafa', linen: 'faf0e6', peru: 'cd853f',
  sienna: 'a0522d', midnightblue: '191970', rebeccapurple: '663399', transparent: '00000000',
};

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);

function hex(h: string): RGBA | undefined {
  if (!/^[\da-f]+$/i.test(h)) return;
  if (h.length === 3 || h.length === 4) h = [...h].map(c => c + c).join('');
  if (h.length !== 6 && h.length !== 8) return;
  const n = (k: number) => parseInt(h.slice(k, k + 2), 16) / 255;
  return [n(0), n(2), n(4), h.length === 8 ? n(6) : 1];
}

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  h = ((h % 360) + 360) % 360;
  const k = (n: number) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => l - a * Math.max(-1, Math.min(k(n) - 3, 9 - k(n), 1));
  return [f(0), f(8), f(4)];
}

/** Parses hex, rgb(), hsl(), and common names. Returns undefined for anything else. */
export function parseColor(input: string, currentColor = '#000000'): RGBA | undefined {
  const value = input.trim().toLowerCase();
  if (value === 'currentcolor') return parseColor(currentColor);
  if (value[0] === '#') return hex(value.slice(1));
  if (NAMED[value]) return hex(NAMED[value]!);
  const fn = /^(rgba?|hsla?)\(([^)]*)\)$/.exec(value);
  if (!fn) return;
  const parts = fn[2]!.split(/[\s,/]+/).filter(Boolean);
  if (parts.length < 3) return;
  const num = (p: string, scale: number) => (p.endsWith('%') ? (parseFloat(p) / 100) * scale : parseFloat(p));
  const alpha = parts[3] !== undefined ? clamp01(num(parts[3], 1)) : 1;
  if (fn[1]!.startsWith('rgb')) {
    const rgb = parts.slice(0, 3).map(p => clamp01(num(p, 255) / 255));
    if (rgb.some(Number.isNaN)) return;
    return [rgb[0]!, rgb[1]!, rgb[2]!, alpha];
  }
  const h = parseFloat(parts[0]!);
  const s = clamp01(parseFloat(parts[1]!) / 100);
  const l = clamp01(parseFloat(parts[2]!) / 100);
  if ([h, s, l].some(Number.isNaN)) return;
  return [...hslToRgb(h, s, l), alpha];
}

export function formatColor([r, g, b, a]: RGBA): string {
  const h = (v: number) => Math.round(clamp01(v) * 255).toString(16).padStart(2, '0');
  return a >= 0.999 ? `#${h(r)}${h(g)}${h(b)}` : `#${h(r)}${h(g)}${h(b)}${h(a)}`;
}

const toLinear = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const toGamma = (c: number) => (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055);

function toOklab([r, g, b]: RGBA): [number, number, number] {
  const lr = toLinear(r), lg = toLinear(g), lb = toLinear(b);
  const l = Math.cbrt(0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb);
  const m = Math.cbrt(0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb);
  const s = Math.cbrt(0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb);
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
}
function fromOklab(L: number, A: number, B: number): [number, number, number] {
  const l = (L + 0.3963377774 * A + 0.2158037573 * B) ** 3;
  const m = (L - 0.1055613458 * A - 0.0638541728 * B) ** 3;
  const s = (L - 0.0894841775 * A - 1.291485548 * B) ** 3;
  return [
    clamp01(toGamma(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s)),
    clamp01(toGamma(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s)),
    clamp01(toGamma(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s)),
  ];
}

export function mixColor(a: RGBA, b: RGBA, t: number): RGBA {
  if (t <= 0) return a;
  if (t >= 1) return b;
  const alpha = a[3] + (b[3] - a[3]) * t;
  // Fully transparent endpoints borrow the other color so fades don't pass through gray.
  const ca = a[3] === 0 ? b : a;
  const cb = b[3] === 0 ? a : b;
  const x = toOklab(ca), y = toOklab(cb);
  const [r, g, bl] = fromOklab(x[0] + (y[0] - x[0]) * t, x[1] + (y[1] - x[1]) * t, x[2] + (y[2] - x[2]) * t);
  return [r, g, bl, alpha];
}
