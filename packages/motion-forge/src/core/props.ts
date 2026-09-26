/** The animatable property vocabulary. Names follow CSS/SVG; camelCase aliases are accepted. */

export type PropKind = 'transform' | 'number' | 'color' | 'path' | 'draw' | 'text' | 'points';

export const TRANSFORM_PROPS = ['translateX', 'translateY', 'rotate', 'scale', 'scaleX', 'scaleY', 'skewX', 'skewY'] as const;
export type TransformProp = (typeof TRANSFORM_PROPS)[number];

const NUMBER_ATTRS = [
  'opacity', 'fill-opacity', 'stroke-opacity', 'stroke-width', 'stroke-dashoffset', 'stroke-miterlimit',
  'x', 'y', 'width', 'height', 'rx', 'ry', 'cx', 'cy', 'r', 'fx', 'fy', 'fr', 'x1', 'y1', 'x2', 'y2',
  'font-size', 'letter-spacing', 'word-spacing', 'offset', 'stop-opacity', 'flood-opacity', 'stdDeviation',
  'dx', 'dy', 'startOffset', 'baseFrequency', 'scale-attr',
] as const;
const COLOR_ATTRS = ['fill', 'stroke', 'stop-color', 'flood-color', 'color', 'lighting-color'] as const;

export const PROPS: Record<string, PropKind> = {};
for (const p of TRANSFORM_PROPS) PROPS[p] = 'transform';
for (const p of NUMBER_ATTRS) PROPS[p] = 'number';
for (const p of COLOR_ATTRS) PROPS[p] = 'color';
PROPS.d = 'path';
PROPS.draw = 'draw';
PROPS.text = 'text';
PROPS.points = 'points';

const ALIASES: Record<string, string> = {
  rotation: 'rotate', rotateZ: 'rotate', scaleXY: 'scale', translate: 'translate',
  path: 'd', morph: 'd', strokeWidth: 'stroke-width', strokeOpacity: 'stroke-opacity', fillOpacity: 'fill-opacity',
  strokeDashoffset: 'stroke-dashoffset', fontSize: 'font-size', letterSpacing: 'letter-spacing',
  stopColor: 'stop-color', stopOpacity: 'stop-opacity', floodColor: 'flood-color', floodOpacity: 'flood-opacity',
  radius: 'r', trim: 'draw', 'stroke-draw': 'draw', content: 'text', color: 'color',
};

/** Hints for properties agents commonly reach for but that don't exist. */
export const PROPERTY_HINTS: Record<string, string> = {
  translate: 'Use translateX and translateY.',
  transform: 'Animate translateX, translateY, rotate, scale, scaleX, scaleY, skewX or skewY instead of the transform string.',
  left: 'Use translateX.', top: 'Use translateY.',
  background: 'Animate the fill of a background <rect>.',
  'background-color': 'Animate the fill of a background <rect>.',
  blur: 'Put a <filter> with <feGaussianBlur id="…"> in <defs> and animate its stdDeviation.',
  visibility: 'Animate opacity between 0 and 1.',
  display: 'Animate opacity between 0 and 1.',
  'stroke-dasharray': 'Use draw (0..1, or [start, end]) to draw strokes on.',
};

export function normalizeProp(name: string): string | undefined {
  const a = ALIASES[name] ?? name;
  if (PROPS[a]) return a;
  const kebab = a.replace(/[A-Z]/g, c => '-' + c.toLowerCase());
  return PROPS[kebab] ? kebab : undefined;
}

export const TRANSFORM_DEFAULTS: Record<TransformProp, number> = {
  translateX: 0, translateY: 0, rotate: 0, scale: 1, scaleX: 1, scaleY: 1, skewX: 0, skewY: 0,
};

/** Which attribute-properties are meaningful on which elements (for helpful lint). */
export const GEOMETRY_ATTRS: Record<string, string[]> = {
  rect: ['x', 'y', 'width', 'height', 'rx', 'ry'],
  circle: ['cx', 'cy', 'r'],
  ellipse: ['cx', 'cy', 'rx', 'ry'],
  line: ['x1', 'y1', 'x2', 'y2'],
  text: ['x', 'y', 'dx', 'dy', 'font-size', 'letter-spacing', 'word-spacing'],
  tspan: ['x', 'y', 'dx', 'dy', 'font-size', 'letter-spacing'],
  image: ['x', 'y', 'width', 'height'],
  use: ['x', 'y', 'width', 'height'],
  stop: ['offset'],
  radialGradient: ['cx', 'cy', 'r', 'fx', 'fy', 'fr'],
  linearGradient: ['x1', 'y1', 'x2', 'y2'],
  feGaussianBlur: ['stdDeviation'],
  feOffset: ['dx', 'dy'],
  feDropShadow: ['dx', 'dy', 'stdDeviation'],
  feTurbulence: ['baseFrequency'],
  feDisplacementMap: ['scale-attr'],
};
