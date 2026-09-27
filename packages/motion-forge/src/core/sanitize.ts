import { indexTree, matches, parseSelector, type ParsedSelector } from './selector';
import { textContent, type XElement, type XNode } from './xml';

export interface Diagnostic {
  level: 'error' | 'warning' | 'info';
  code: string;
  message: string;
  /** JSON path into the motion block, or an element description for SVG issues. */
  at?: string;
  hint?: string;
}

const ELEMENTS = new Set([
  'svg', 'g', 'defs', 'symbol', 'use', 'path', 'rect', 'circle', 'ellipse', 'line', 'polyline', 'polygon',
  'text', 'tspan', 'textPath', 'linearGradient', 'radialGradient', 'stop', 'clipPath', 'mask', 'pattern',
  'marker', 'image', 'title', 'desc', 'filter', 'feGaussianBlur', 'feOffset', 'feBlend', 'feColorMatrix',
  'feFlood', 'feComposite', 'feMerge', 'feMergeNode', 'feDropShadow', 'feMorphology', 'feTurbulence',
  'feDisplacementMap', 'feComponentTransfer', 'feFuncR', 'feFuncG', 'feFuncB', 'feFuncA',
]);
/** Wrappers whose children are kept even though the wrapper is not. */
const UNWRAP = new Set(['a', 'switch']);
const SMIL = new Set(['animate', 'animateTransform', 'animateMotion', 'animateColor', 'set']);

/** Presentation properties that may appear as attributes or in CSS. */
export const PRESENTATION = new Set([
  'fill', 'fill-opacity', 'fill-rule', 'stroke', 'stroke-width', 'stroke-opacity', 'stroke-linecap',
  'stroke-linejoin', 'stroke-miterlimit', 'stroke-dasharray', 'stroke-dashoffset', 'opacity', 'visibility',
  'display', 'color', 'clip-path', 'clip-rule', 'mask', 'filter', 'paint-order', 'vector-effect',
  'shape-rendering', 'font-family', 'font-size', 'font-weight', 'font-style', 'letter-spacing', 'word-spacing',
  'text-anchor', 'dominant-baseline', 'alignment-baseline', 'baseline-shift', 'stop-color', 'stop-opacity',
  'flood-color', 'flood-opacity', 'lighting-color', 'marker-start', 'marker-mid', 'marker-end', 'mix-blend-mode',
  'isolation', 'color-interpolation-filters', 'transform-origin', 'text-decoration',
]);
const GEOMETRY = new Set([
  'x', 'y', 'width', 'height', 'rx', 'ry', 'cx', 'cy', 'r', 'fx', 'fy', 'fr', 'x1', 'y1', 'x2', 'y2', 'points',
  'd', 'pathLength', 'viewBox', 'preserveAspectRatio', 'dx', 'dy', 'rotate', 'textLength', 'lengthAdjust',
  'startOffset', 'offset', 'gradientUnits', 'gradientTransform', 'spreadMethod', 'patternUnits',
  'patternContentUnits', 'patternTransform', 'clipPathUnits', 'maskUnits', 'maskContentUnits', 'filterUnits',
  'primitiveUnits', 'in', 'in2', 'result', 'stdDeviation', 'mode', 'values', 'type', 'operator', 'k1', 'k2', 'k3',
  'k4', 'radius', 'scale', 'xChannelSelector', 'yChannelSelector', 'baseFrequency', 'numOctaves', 'seed',
  'stitchTiles', 'tableValues', 'slope', 'intercept', 'amplitude', 'exponent', 'refX', 'refY', 'markerWidth',
  'markerHeight', 'orient', 'markerUnits', 'method', 'spacing', 'side', 'href',
]);
const GENERAL = new Set(['id', 'class', 'transform', 'role', 'focusable', 'tabindex', 'lang', 'xml:space', 'xmlns', 'version', 'overflow', 'clip', 'style']);
const EDITOR_NS = /^(inkscape|sodipodi|sketch|serif|figma|i|x|graph|adobe|dc|cc|rdf|xmlns):/;
const URL_PROPS = new Set(['fill', 'stroke', 'clip-path', 'mask', 'filter', 'marker-start', 'marker-mid', 'marker-end']);

function describe(el: XElement): string {
  return `<${el.name}${el.attrs.id ? ` id="${el.attrs.id}"` : ''}>`;
}

/** Returns a safe local url(#id) value, "none", a plain paint, or undefined when unsafe. */
function safePaintValue(value: string): string | undefined {
  const v = value.trim();
  if (!/url\(/i.test(v)) return /[<>{}\\]|expression|javascript:/i.test(v) ? undefined : v;
  const m = /^url\(\s*['"]?#([\w.:-]+)['"]?\s*\)(\s+.*)?$/i.exec(v);
  if (m?.[2] && /url\(|[<>{}\\]|expression|javascript:/i.test(m[2])) return;
  return m ? `url(#${m[1]})${m[2] ?? ''}` : undefined;
}

interface CSSRule {
  selector: ParsedSelector;
  order: number;
  decls: [string, string][];
}

function parseDeclarations(text: string): [string, string][] {
  const out: [string, string][] = [];
  for (const part of text.split(';')) {
    const colon = part.indexOf(':');
    if (colon === -1) continue;
    const name = part.slice(0, colon).trim().toLowerCase();
    const value = part.slice(colon + 1).replace(/!important/i, '').trim();
    if (name && value) out.push([name, value]);
  }
  return out;
}

function parseCSS(css: string, issues: Diagnostic[], startOrder: number): CSSRule[] {
  const rules: CSSRule[] = [];
  const text = css.replace(/\/\*[\s\S]*?\*\//g, '');
  let i = 0;
  let order = startOrder;
  while (i < text.length) {
    const open = text.indexOf('{', i);
    if (open === -1) break;
    const prelude = text.slice(i, open).trim();
    let depth = 1, k = open + 1;
    for (; k < text.length && depth; k++) {
      if (text[k] === '{') depth++;
      else if (text[k] === '}') depth--;
    }
    const body = text.slice(open + 1, k - 1);
    i = k;
    if (prelude.startsWith('@')) {
      if (!/^@font-face/i.test(prelude)) issues.push({ level: 'warning', code: 'svg.css-at-rule', message: `Ignored CSS ${prelude.split(/\s/)[0]} rule inside <style>` });
      continue;
    }
    for (const sel of prelude.split(',')) {
      try {
        rules.push({ selector: parseSelector(sel), order: order++, decls: parseDeclarations(body) });
      } catch {
        issues.push({ level: 'warning', code: 'svg.css-selector', message: `Ignored unsupported CSS selector "${sel.trim()}"` });
      }
    }
  }
  return rules;
}

export interface SanitizeResult {
  root: XElement;
  motionSource?: string;
  issues: Diagnostic[];
}

/**
 * Converts arbitrary SVG into the safe, animatable subset:
 * scripts, event handlers, external references and foreign content are removed;
 * CSS from <style> and style="" is folded into presentation attributes so runtime
 * attribute writes always win.
 */
export function sanitize(input: XElement): SanitizeResult {
  const issues: Diagnostic[] = [];
  const warn = (code: string, message: string, hint?: string) => issues.push({ level: 'warning', code, message, hint });
  if (input.name !== 'svg' && input.name !== 'svg:svg') {
    // Invalid input must never become raw HTML in React/SSR, even if a caller
    // renders an invalid scene to show diagnostics alongside it.
    return { root: { type: 'el', name: 'svg', attrs: { viewBox: '0 0 100 100' }, children: [] }, issues: [{ level: 'error', code: 'svg.root', at: '<root>', message: `Root element must be <svg>, found <${input.name}>`, hint: 'Provide an SVG document, not HTML or a foreign namespace.' }] };
  }
  let motionSource: string | undefined;
  let css = '';
  const dropped = new Map<string, number>();
  const note = (what: string) => dropped.set(what, (dropped.get(what) ?? 0) + 1);

  const clean = (el: XElement, isRoot: boolean): XNode[] => {
    const name = el.name.replace(/^svg:/, '');
    if (name === 'metadata' || (name === 'script' && /motion\+json/i.test(el.attrs.type ?? ''))) {
      if (/motion\+json/i.test(el.attrs.type ?? '') || (!motionSource && /^\s*\{/.test(textContent(el)) && /"states"|"version"/.test(textContent(el)))) {
        if (motionSource !== undefined) warn('motion.multiple', 'More than one motion block found; using the first');
        else motionSource = textContent(el);
      }
      return [];
    }
    if (name === 'style') {
      css += '\n' + textContent(el);
      return [];
    }
    if (SMIL.has(name)) {
      note(`<${name}> (SMIL animation; describe motion in the motion block instead)`);
      return [];
    }
    if (EDITOR_NS.test(name) || name.includes(':')) return [];
    const unwrap = UNWRAP.has(name);
    if (!unwrap && !ELEMENTS.has(name)) {
      note(`<${name}>`);
      return [];
    }
    const attrs: Record<string, string> = {};
    for (const [rawName, value] of Object.entries(el.attrs)) {
      let attr = rawName === 'xlink:href' ? 'href' : rawName;
      if (/^on/i.test(attr)) {
        note(`${attr}="…" event handler`);
        continue;
      }
      if (attr.startsWith('xmlns')) {
        if (isRoot && attr === 'xmlns') attrs.xmlns = 'http://www.w3.org/2000/svg';
        continue;
      }
      if (EDITOR_NS.test(attr) || attr === 'data-name') continue;
      if (attr.startsWith('data-') || attr.startsWith('aria-')) {
        attrs[attr] = value;
        continue;
      }
      if (!PRESENTATION.has(attr) && !GEOMETRY.has(attr) && !GENERAL.has(attr)) {
        if (!['width', 'height'].includes(attr)) note(`${attr}="…" attribute`);
        continue;
      }
      if (attr === 'href') {
        const safe = value.startsWith('#') || (name === 'image' && /^data:image\/(png|jpe?g|gif|webp);base64,[\w+/=\s]+$/i.test(value));
        if (!safe) {
          note(`external reference ${attr}="${value.slice(0, 40)}"`);
          continue;
        }
      }
      if (URL_PROPS.has(attr)) {
        const safe = safePaintValue(value);
        if (safe === undefined) {
          note(`${attr}="${value.slice(0, 40)}" (only local url(#id) references are allowed)`);
          continue;
        }
        attrs[attr] = safe;
        continue;
      }
      attr = attr === 'xml:space' ? 'xml:space' : attr;
      attrs[attr] = value;
    }
    if (name === 'image' && !attrs.href) return [];
    const children: XNode[] = [];
    for (const child of el.children) {
      if (child.type === 'text') {
        if (['text', 'tspan', 'textPath', 'title', 'desc'].includes(name)) children.push({ type: 'text', value: child.value });
      } else children.push(...clean(child, false));
    }
    if (unwrap) return children;
    return [{ type: 'el', name, attrs, children }];
  };

  const root = clean(input, true)[0] as XElement;

  // Fold CSS into attributes: presentation attributes < <style> rules (by specificity, order) < style="".
  const rules = css.trim() ? parseCSS(css, issues, 0).sort((a, b) => a.selector.specificity - b.selector.specificity || a.order - b.order) : [];
  const idx = rules.length ? indexTree(root) : undefined;
  const fold = (el: XElement) => {
    const decls: [string, string][] = [];
    if (idx) for (const rule of rules) if (matches(el, rule.selector, idx)) decls.push(...rule.decls);
    if (el.attrs.style) decls.push(...parseDeclarations(el.attrs.style));
    delete el.attrs.style;
    for (const [prop, value] of decls) {
      if (prop === 'transform') {
        const converted = value.replace(/(-?[\d.]+)(deg|px)/g, '$1').replace(/translate(X|Y)\(([^)]+)\)/g, (_, axis: string, v: string) => (axis === 'X' ? `translate(${v} 0)` : `translate(0 ${v})`));
        if (/^[\w\s(),.-]*$/.test(converted)) el.attrs.transform = converted;
        else note('CSS transform with units');
        continue;
      }
      if (prop === 'transform-box') continue;
      if (!PRESENTATION.has(prop)) {
        if (!['font', 'cursor', 'pointer-events', 'user-select', 'enable-background'].includes(prop)) note(`CSS property ${prop}`);
        continue;
      }
      if (URL_PROPS.has(prop)) {
        const safe = safePaintValue(value);
        if (safe === undefined) {
          note(`CSS ${prop} with an external reference`);
          continue;
        }
        el.attrs[prop] = safe;
      } else if (!/[<>{}\\]|expression|javascript:/i.test(value)) el.attrs[prop] = value;
    }
    for (const c of el.children) if (c.type === 'el') fold(c);
  };
  if (root) fold(root);

  for (const [what, count] of dropped) warn('svg.removed', `Removed ${what}${count > 1 ? ` ×${count}` : ''}`, 'Motion Forge renders a safe static-vector subset of SVG.');
  return { root, motionSource, issues };
}

export { describe as describeElement };
