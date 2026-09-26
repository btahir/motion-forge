/** Path parsing, affine matrices, bounds, lengths and shape morphing. */

export type Point = [number, number];
/** Absolute cubic segment: control 1, control 2, end. */
export type Cubic = [number, number, number, number, number, number];
export interface Subpath {
  start: Point;
  segs: Cubic[];
  closed: boolean;
}
export type Matrix = [number, number, number, number, number, number];
export interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

export const IDENTITY: Matrix = [1, 0, 0, 1, 0, 0];

export function multiply(m: Matrix, n: Matrix): Matrix {
  return [
    m[0] * n[0] + m[2] * n[1],
    m[1] * n[0] + m[3] * n[1],
    m[0] * n[2] + m[2] * n[3],
    m[1] * n[2] + m[3] * n[3],
    m[0] * n[4] + m[2] * n[5] + m[4],
    m[1] * n[4] + m[3] * n[5] + m[5],
  ];
}
export function apply(m: Matrix, x: number, y: number): Point {
  return [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];
}

/** Parses an SVG transform list. Returns undefined when it can't. */
export function parseTransform(input: string | undefined): Matrix | undefined {
  if (!input || !input.trim()) return IDENTITY;
  let m = IDENTITY;
  const re = /(matrix|translate|scale|rotate|skewX|skewY)\s*\(([^)]*)\)\s*,?\s*/gy;
  let pos = 0;
  const text = input.trim();
  re.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = re.exec(text))) {
    pos = re.lastIndex;
    const a = match[2]!.trim().split(/[\s,]+/).filter(Boolean).map(Number);
    if (a.some(n => !Number.isFinite(n))) return;
    let t: Matrix;
    switch (match[1]) {
      case 'matrix':
        if (a.length !== 6) return;
        t = a as Matrix;
        break;
      case 'translate':
        t = [1, 0, 0, 1, a[0] ?? 0, a[1] ?? 0];
        break;
      case 'scale':
        t = [a[0] ?? 1, 0, 0, a[1] ?? a[0] ?? 1, 0, 0];
        break;
      case 'rotate': {
        const r = ((a[0] ?? 0) * Math.PI) / 180, c = Math.cos(r), s = Math.sin(r);
        const cx = a[1] ?? 0, cy = a[2] ?? 0;
        t = [c, s, -s, c, cx - c * cx + s * cy, cy - s * cx - c * cy];
        break;
      }
      case 'skewX':
        t = [1, 0, Math.tan(((a[0] ?? 0) * Math.PI) / 180), 1, 0, 0];
        break;
      default:
        t = [1, Math.tan(((a[0] ?? 0) * Math.PI) / 180), 0, 1, 0, 0];
    }
    m = multiply(m, t);
  }
  return pos === text.length ? m : undefined;
}

const PARAMS: Record<string, number> = { m: 2, l: 2, h: 1, v: 1, c: 6, s: 4, q: 4, t: 2, a: 7, z: 0 };

export interface PathTokens {
  commands: string[];
  args: number[][];
}

export function tokenizePath(d: string): PathTokens | undefined {
  const commands: string[] = [];
  const args: number[][] = [];
  let i = 0;
  const n = d.length;
  let cmd = '';
  const num = /[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?/y;
  const skip = () => {
    while (i < n && /[\s,]/.test(d[i]!)) i++;
  };
  skip();
  while (i < n) {
    const c = d[i]!;
    if (/[MmLlHhVvCcSsQqTtAaZz]/.test(c)) {
      cmd = c;
      i++;
      if (c === 'z' || c === 'Z') {
        commands.push(c);
        args.push([]);
      }
      skip();
      if (c !== 'z' && c !== 'Z' && (i >= n || /[A-Za-z]/.test(d[i]!))) return;
      continue;
    }
    if (!cmd || cmd === 'z' || cmd === 'Z') return;
    const count = PARAMS[cmd.toLowerCase()]!;
    const values: number[] = [];
    for (let k = 0; k < count; k++) {
      skip();
      if (cmd.toLowerCase() === 'a' && (k === 3 || k === 4)) {
        if (d[i] !== '0' && d[i] !== '1') return;
        values.push(d[i] === '1' ? 1 : 0);
        i++;
        continue;
      }
      num.lastIndex = i;
      const m = num.exec(d);
      if (!m) return;
      values.push(Number(m[0]));
      i += m[0].length;
    }
    commands.push(cmd);
    args.push(values);
    // Implicit repeats: extra pairs after M are L.
    if (cmd === 'M') cmd = 'L';
    else if (cmd === 'm') cmd = 'l';
    skip();
  }
  return commands.length && /[Mm]/.test(commands[0]!) ? { commands, args } : undefined;
}

function arcToCubics(x1: number, y1: number, rx: number, ry: number, angle: number, large: number, sweep: number, x2: number, y2: number): Cubic[] {
  if (rx === 0 || ry === 0 || (x1 === x2 && y1 === y2)) return [[x1, y1, x2, y2, x2, y2]];
  const phi = (angle * Math.PI) / 180, cos = Math.cos(phi), sin = Math.sin(phi);
  const dx = (x1 - x2) / 2, dy = (y1 - y2) / 2;
  const xp = cos * dx + sin * dy, yp = -sin * dx + cos * dy;
  rx = Math.abs(rx);
  ry = Math.abs(ry);
  const lambda = (xp * xp) / (rx * rx) + (yp * yp) / (ry * ry);
  if (lambda > 1) {
    rx *= Math.sqrt(lambda);
    ry *= Math.sqrt(lambda);
  }
  const sign = large === sweep ? -1 : 1;
  const num = rx * rx * ry * ry - rx * rx * yp * yp - ry * ry * xp * xp;
  const coef = sign * Math.sqrt(Math.max(0, num / (rx * rx * yp * yp + ry * ry * xp * xp)));
  const cxp = (coef * rx * yp) / ry, cyp = (-coef * ry * xp) / rx;
  const cx = cos * cxp - sin * cyp + (x1 + x2) / 2, cy = sin * cxp + cos * cyp + (y1 + y2) / 2;
  const ang = (ux: number, uy: number, vx: number, vy: number) => {
    const a = Math.atan2(ux * vy - uy * vx, ux * vx + uy * vy);
    return a;
  };
  const theta = ang(1, 0, (xp - cxp) / rx, (yp - cyp) / ry);
  let delta = ang((xp - cxp) / rx, (yp - cyp) / ry, (-xp - cxp) / rx, (-yp - cyp) / ry);
  if (!sweep && delta > 0) delta -= 2 * Math.PI;
  if (sweep && delta < 0) delta += 2 * Math.PI;
  const parts = Math.ceil(Math.abs(delta) / (Math.PI / 2));
  const step = delta / parts;
  const k = (4 / 3) * Math.tan(step / 4);
  const out: Cubic[] = [];
  let t = theta;
  const point = (a: number): Point => [cx + rx * Math.cos(a) * cos - ry * Math.sin(a) * sin, cy + rx * Math.cos(a) * sin + ry * Math.sin(a) * cos];
  const deriv = (a: number): Point => [-rx * Math.sin(a) * cos - ry * Math.cos(a) * sin, -rx * Math.sin(a) * sin + ry * Math.cos(a) * cos];
  for (let p = 0; p < parts; p++) {
    const a1 = t, a2 = t + step;
    const p1 = point(a1), p2 = point(a2), d1 = deriv(a1), d2 = deriv(a2);
    out.push([p1[0] + k * d1[0], p1[1] + k * d1[1], p2[0] - k * d2[0], p2[1] - k * d2[1], p2[0], p2[1]]);
    t = a2;
  }
  const last = out[out.length - 1]!;
  last[4] = x2;
  last[5] = y2;
  return out;
}

const line = (x1: number, y1: number, x2: number, y2: number): Cubic => [x1 + (x2 - x1) / 3, y1 + (y2 - y1) / 3, x1 + ((x2 - x1) * 2) / 3, y1 + ((y2 - y1) * 2) / 3, x2, y2];

export function pathToSubpaths(tokens: PathTokens): Subpath[] {
  const out: Subpath[] = [];
  let cur: Subpath | undefined;
  let x = 0, y = 0, sx = 0, sy = 0;
  let lastC: Point | undefined, lastQ: Point | undefined;
  tokens.commands.forEach((command, idx) => {
    const a = tokens.args[idx]!;
    const rel = command === command.toLowerCase();
    const C = command.toUpperCase();
    const ox = rel ? x : 0, oy = rel ? y : 0;
    const ensure = () => {
      if (!cur) {
        cur = { start: [x, y], segs: [], closed: false };
        out.push(cur);
      }
      return cur;
    };
    let nextC: Point | undefined, nextQ: Point | undefined;
    switch (C) {
      case 'M':
        x = a[0]! + ox;
        y = a[1]! + oy;
        sx = x;
        sy = y;
        cur = { start: [x, y], segs: [], closed: false };
        out.push(cur);
        break;
      case 'L':
      case 'H':
      case 'V':
      case 'T': {
        let nx = x, ny = y;
        if (C === 'L' || C === 'T') {
          nx = a[0]! + ox;
          ny = a[1]! + oy;
        } else if (C === 'H') nx = a[0]! + ox;
        else ny = a[0]! + oy;
        if (C === 'T') {
          const q: Point = lastQ ? [2 * x - lastQ[0], 2 * y - lastQ[1]] : [x, y];
          ensure().segs.push([x + (2 / 3) * (q[0] - x), y + (2 / 3) * (q[1] - y), nx + (2 / 3) * (q[0] - nx), ny + (2 / 3) * (q[1] - ny), nx, ny]);
          nextQ = q;
        } else ensure().segs.push(line(x, y, nx, ny));
        x = nx;
        y = ny;
        break;
      }
      case 'C':
      case 'S': {
        const c1: Point = C === 'C' ? [a[0]! + ox, a[1]! + oy] : lastC ? [2 * x - lastC[0], 2 * y - lastC[1]] : [x, y];
        const o = C === 'C' ? 2 : 0;
        const c2: Point = [a[o]! + ox, a[o + 1]! + oy];
        const e: Point = [a[o + 2]! + ox, a[o + 3]! + oy];
        ensure().segs.push([c1[0], c1[1], c2[0], c2[1], e[0], e[1]]);
        nextC = c2;
        x = e[0];
        y = e[1];
        break;
      }
      case 'Q': {
        const q: Point = [a[0]! + ox, a[1]! + oy];
        const e: Point = [a[2]! + ox, a[3]! + oy];
        ensure().segs.push([x + (2 / 3) * (q[0] - x), y + (2 / 3) * (q[1] - y), e[0] + (2 / 3) * (q[0] - e[0]), e[1] + (2 / 3) * (q[1] - e[1]), e[0], e[1]]);
        nextQ = q;
        x = e[0];
        y = e[1];
        break;
      }
      case 'A': {
        const ex = a[5]! + ox, ey = a[6]! + oy;
        ensure().segs.push(...arcToCubics(x, y, a[0]!, a[1]!, a[2]!, a[3]!, a[4]!, ex, ey));
        x = ex;
        y = ey;
        break;
      }
      case 'Z':
        if (cur) {
          if (x !== sx || y !== sy) cur.segs.push(line(x, y, sx, sy));
          cur.closed = true;
        }
        x = sx;
        y = sy;
        cur = undefined;
        break;
    }
    lastC = nextC;
    lastQ = nextQ;
  });
  return out;
}

export function parsePath(d: string): Subpath[] | undefined {
  const tokens = tokenizePath(d);
  return tokens ? pathToSubpaths(tokens) : undefined;
}

const fmt = (n: number) => {
  const r = Math.round(n * 100) / 100;
  return Object.is(r, -0) ? '0' : String(r);
};

export function subpathsToD(paths: Subpath[]): string {
  return paths
    .map(p => `M${fmt(p.start[0])} ${fmt(p.start[1])}` + p.segs.map(s => `C${s.map(fmt).join(' ')}`).join('') + (p.closed ? 'Z' : ''))
    .join('');
}

function cubicPoint(p0: Point, s: Cubic, t: number): Point {
  const u = 1 - t;
  return [
    u * u * u * p0[0] + 3 * u * u * t * s[0] + 3 * u * t * t * s[2] + t * t * t * s[4],
    u * u * u * p0[1] + 3 * u * u * t * s[1] + 3 * u * t * t * s[3] + t * t * t * s[5],
  ];
}

/** Flattens subpaths to polylines for bounds, length and hit estimates. */
export function flatten(paths: Subpath[], steps = 12): Point[][] {
  return paths.map(p => {
    const pts: Point[] = [p.start];
    let prev = p.start;
    for (const s of p.segs) {
      for (let k = 1; k <= steps; k++) pts.push(cubicPoint(prev, s, k / steps));
      prev = [s[4], s[5]];
    }
    return pts;
  });
}

export function pathLength(paths: Subpath[]): number {
  let total = 0;
  for (const pts of flatten(paths, 24)) for (let k = 1; k < pts.length; k++) total += Math.hypot(pts[k]![0] - pts[k - 1]![0], pts[k]![1] - pts[k - 1]![1]);
  return total;
}

export function boundsOfPoints(points: Iterable<Point>, m: Matrix = IDENTITY): Box | undefined {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const [px, py] of points) {
    const [x, y] = apply(m, px, py);
    if (x < x0) x0 = x;
    if (y < y0) y0 = y;
    if (x > x1) x1 = x;
    if (y > y1) y1 = y;
  }
  return x0 === Infinity ? undefined : { x: x0, y: y0, width: x1 - x0, height: y1 - y0 };
}

export function unionBoxes(boxes: (Box | undefined)[]): Box | undefined {
  const pts: Point[] = [];
  for (const b of boxes) if (b) pts.push([b.x, b.y], [b.x + b.width, b.y + b.height]);
  return boundsOfPoints(pts);
}

export function transformBox(b: Box, m: Matrix): Box {
  return boundsOfPoints([[b.x, b.y], [b.x + b.width, b.y], [b.x, b.y + b.height], [b.x + b.width, b.y + b.height]], m)!;
}

// ---------------------------------------------------------------- morphing

function splitCubic(p0: Point, s: Cubic, t: number): [Cubic, Cubic] {
  const lerp = (a: Point, b: Point): Point => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
  const p1: Point = [s[0], s[1]], p2: Point = [s[2], s[3]], p3: Point = [s[4], s[5]];
  const a = lerp(p0, p1), b = lerp(p1, p2), c = lerp(p2, p3);
  const d = lerp(a, b), e = lerp(b, c), f = lerp(d, e);
  return [
    [a[0], a[1], d[0], d[1], f[0], f[1]],
    [e[0], e[1], c[0], c[1], p3[0], p3[1]],
  ];
}

function segStarts(p: Subpath): Point[] {
  const starts: Point[] = [p.start];
  for (let i = 0; i < p.segs.length - 1; i++) starts.push([p.segs[i]![4], p.segs[i]![5]]);
  return starts;
}

function subdivideTo(p: Subpath, count: number): Subpath {
  const segs = p.segs.slice();
  if (!segs.length) segs.push([p.start[0], p.start[1], p.start[0], p.start[1], p.start[0], p.start[1]]);
  while (segs.length < count) {
    const starts = segStarts({ ...p, segs });
    let best = 0, bestLen = -1;
    segs.forEach((s, i) => {
      const st = starts[i]!;
      const len = Math.hypot(s[4] - st[0], s[5] - st[1]) + Math.hypot(s[0] - st[0], s[1] - st[1]) * 0.01;
      if (len > bestLen) {
        bestLen = len;
        best = i;
      }
    });
    const [a, b] = splitCubic(starts[best]!, segs[best]!, 0.5);
    segs.splice(best, 1, a, b);
  }
  return { start: p.start, segs, closed: p.closed };
}

function rotateClosed(p: Subpath, shift: number): Subpath {
  if (!shift) return p;
  const segs = [...p.segs.slice(shift), ...p.segs.slice(0, shift)];
  const prev = p.segs[shift - 1]!;
  return { start: [prev[4], prev[5]], segs, closed: true };
}

function centroid(p: Subpath): Point {
  const pts = segStarts(p);
  return [pts.reduce((s, q) => s + q[0], 0) / pts.length, pts.reduce((s, q) => s + q[1], 0) / pts.length];
}

/** Makes two shapes structurally compatible so every number can be interpolated. */
export function alignPaths(a: Subpath[], b: Subpath[]): [Subpath[], Subpath[]] {
  a = a.slice();
  b = b.slice();
  const pad = (list: Subpath[], other: Subpath[]) => {
    while (list.length < other.length) {
      const src = list[list.length - 1] ?? other[list.length]!;
      const c = centroid(src);
      list.push({ start: c, segs: [[c[0], c[1], c[0], c[1], c[0], c[1]]], closed: other[list.length]!.closed });
    }
  };
  pad(a, b);
  pad(b, a);
  const outA: Subpath[] = [], outB: Subpath[] = [];
  a.forEach((pa, i) => {
    let pb = b[i]!;
    const n = Math.max(pa.segs.length, pb.segs.length, 1);
    let sa = subdivideTo(pa, n);
    let sb = subdivideTo(pb, n);
    if (sa.closed && sb.closed && n > 1) {
      const startsA = segStarts(sa);
      let best = 0, bestCost = Infinity;
      for (let shift = 0; shift < n; shift++) {
        const startsB = segStarts(rotateClosed(sb, shift));
        let cost = 0;
        for (let k = 0; k < n; k++) cost += (startsA[k]![0] - startsB[k]![0]) ** 2 + (startsA[k]![1] - startsB[k]![1]) ** 2;
        if (cost < bestCost) {
          bestCost = cost;
          best = shift;
        }
      }
      sb = rotateClosed(sb, best);
    }
    outA.push(sa);
    outB.push(sb);
    pb = sb;
  });
  return [outA, outB];
}

export function lerpSubpaths(a: Subpath[], b: Subpath[], t: number): Subpath[] {
  const l = (x: number, y: number) => x + (y - x) * t;
  return a.map((pa, i) => {
    const pb = b[i]!;
    return {
      start: [l(pa.start[0], pb.start[0]), l(pa.start[1], pb.start[1])],
      segs: pa.segs.map((s, k) => s.map((v, j) => l(v, pb.segs[k]![j]!)) as Cubic),
      closed: pa.closed || pb.closed,
    };
  });
}

export function sameStructure(a: PathTokens, b: PathTokens): boolean {
  if (a.commands.length !== b.commands.length) return false;
  for (let i = 0; i < a.commands.length; i++) {
    if (a.commands[i] !== b.commands[i]) return false;
    const c = a.commands[i]!.toLowerCase();
    if (c === 'a' && (a.args[i]![3] !== b.args[i]![3] || a.args[i]![4] !== b.args[i]![4])) return false;
  }
  return true;
}

export function tokensToD(t: PathTokens): string {
  return t.commands.map((c, i) => c + t.args[i]!.map(fmt).join(' ')).join('');
}
