import { createDocument, parseDocument, serializeDocument, type ForgeDocument, type ForgeNode, type NodeInput } from './schema';
import { renderSVG } from './render';
import type { Frame } from './sample';

export type ImportIssue = { path: string; message: string; severity: 'error' | 'warning' };
export type SVGImportResult = { success: true; document: ForgeDocument; issues: ImportIssue[] } | { success: false; issues: ImportIssue[] };
const names: Record<string, string> = { black: '#000000', white: '#ffffff', red: '#ff0000', green: '#008000', blue: '#0000ff', orange: '#ffa500', yellow: '#ffff00', gray: '#808080', grey: '#808080', transparent: '#00000000' };
const common = ['id', 'fill', 'stroke', 'stroke-width', 'opacity', 'transform', 'stroke-linecap', 'stroke-linejoin', 'stroke-dasharray', 'stroke-dashoffset', 'display', 'visibility', 'style'];
const attrs: Record<string, string[]> = { svg: ['xmlns', 'xmlns:xlink', 'width', 'height', 'viewBox', 'version', 'role', 'aria-label'], g: [], rect: ['x', 'y', 'width', 'height', 'rx', 'ry'], circle: ['cx', 'cy', 'r'], ellipse: ['cx', 'cy', 'rx', 'ry'], line: ['x1', 'y1', 'x2', 'y2'], path: ['d'], polygon: ['points'], polyline: ['points'], text: ['x', 'y', 'font-family', 'font-size', 'font-weight', 'text-anchor'] };
const paintProps = ['fill', 'stroke', 'stroke-width', 'stroke-dasharray', 'stroke-dashoffset', 'font-family', 'font-size', 'font-weight', 'text-anchor'] as const;
/** Browser SVG importer. Unsupported rendering features are errors, never silently discarded. */
export function importSVG(source: string): SVGImportResult {
  const issues: ImportIssue[] = [];
  const fail = (path: string, message: string) => issues.push({ path, message, severity: 'error' });
  if (source.length > 5_000_000) return { success: false, issues: [{ path: '', message: 'SVG exceeds the 5 MB text limit', severity: 'error' }] };
  if (/<!DOCTYPE|<!ENTITY/i.test(source)) return { success: false, issues: [{ path: '', message: 'Document types and entities are not supported', severity: 'error' }] };
  if (typeof DOMParser === 'undefined') return { success: false, issues: [{ path: '', message: 'SVG import needs a browser DOMParser. JSON and SVG export also work in Node.', severity: 'error' }] };
  const xml = new DOMParser().parseFromString(source, 'image/svg+xml');
  if (xml.querySelector('parsererror') || xml.documentElement.localName !== 'svg') return { success: false, issues: [{ path: '', message: 'Invalid SVG XML', severity: 'error' }] };
  const root = xml.documentElement;
  const num = (raw: string | null | undefined, fallback: number, location: string): number => {
    if (raw == null || raw === '') return fallback;
    if (!/^[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?(?:px)?$/.test(raw.trim())) { fail(location, `Expected a number or px value, received ${raw}`); return fallback; }
    const value = Number(raw.trim().replace(/px$/, ''));
    if (!Number.isFinite(value)) { fail(location, 'Expected a finite value'); return fallback; }
    return value;
  };
  const vb = root.getAttribute('viewBox')?.trim().split(/[\s,]+/).map(Number);
  if (vb && (vb.length !== 4 || vb.some(v => !Number.isFinite(v)) || vb[2]! <= 0 || vb[3]! <= 0)) fail('svg.viewBox', 'Expected four finite numbers with positive width and height');
  if (vb && (root.hasAttribute('width') || root.hasAttribute('height'))) issues.push({ path: 'svg', message: 'Artboard dimensions use the viewBox; display width/height attributes are normalized.', severity: 'warning' });
  if (vb && (vb[2] !== Math.round(vb[2]!) || vb[3] !== Math.round(vb[3]!))) fail('svg.viewBox', 'Fractional viewBox dimensions are unsupported; use integer dimensions');
  const doc = createDocument(root.querySelector('title')?.textContent?.trim().slice(0, 200) || 'Imported SVG');
  doc.background = 'none';
  doc.width = Math.round(vb?.[2] ?? num(root.getAttribute('width'), 800, 'svg.width'));
  doc.height = Math.round(vb?.[3] ?? num(root.getAttribute('height'), 600, 'svg.height'));
  const nodes: NodeInput[] = [];
  let counter = 0;
  const add = (node: Omit<NodeInput, 'id'>): string => { const id = `svg-${++counter}`; nodes.push({ ...node, id }); return id; };
  let rootParent: string | undefined;
  if (vb && (vb[0] || vb[1])) rootParent = add({ name: 'ViewBox origin', type: 'group', x: -vb[0]!, y: -vb[1]! });
  const color = (raw: string, location: string): string => {
    const value = names[raw.toLowerCase()] ?? raw;
    if (!/^(#[\da-fA-F]{3}|#[\da-fA-F]{6}|#[\da-fA-F]{8}|none)$/.test(value)) { fail(location, `Unsupported paint ${raw}. Use hex colors or supported basic color names.`); return '#000000'; }
    return value;
  };
  const visit = (element: Element, parentId: string | undefined, inherited: Record<string, string>, location: string, depth = 0): void => {
    if (nodes.length > 2000 || depth > 30) { fail(location, 'SVG exceeds scene size or nesting limit'); return; }
    const tag = element.localName;
    if (element.namespaceURI && element.namespaceURI !== 'http://www.w3.org/2000/svg') { fail(location, 'Unsupported element namespace'); return; }
    if (tag === 'title' || tag === 'desc') return;
    if (!Object.hasOwn(attrs, tag) || (tag === 'svg' && element !== root)) { fail(location, `Unsupported <${tag}>. Flatten it to basic shapes before importing.`); return; }
    const values: Record<string, string> = { ...inherited };
    for (const attribute of Array.from(element.attributes)) {
      if (![...common, ...attrs[tag]!].includes(attribute.name)) fail(`${location}.${attribute.name}`, 'Unsupported attribute');
      values[attribute.name] = attribute.value;
    }
    if (element.hasAttribute('style')) for (const declaration of element.getAttribute('style')!.split(';').filter(s => s.trim())) {
      const colon = declaration.indexOf(':'); const key = declaration.slice(0, colon).trim(), value = declaration.slice(colon + 1).trim();
      if (![...paintProps, 'opacity', 'display', 'visibility'].includes(key)) fail(`${location}.style.${key}`, 'Unsupported style property');
      else values[key] = value;
    }
    for (const [key, supported] of [['stroke-linecap', 'round'], ['stroke-linejoin', 'round']] as const) {
      // Our runtime deliberately uses round caps and joins. Preserve no false fidelity claim.
      if (values[key] && values[key] !== supported) fail(`${location}.${key}`, `Only ${supported} is supported`);
    }
    if ((values.stroke ?? 'none') !== 'none' && (!values['stroke-linecap'] || !values['stroke-linejoin'])) issues.push({ path: location, message: 'Stroke caps and joins are normalized to round.', severity: 'warning' });
    if (values.visibility && values.visibility !== 'visible' && values.visibility !== 'hidden') fail(`${location}.visibility`, 'Only visible or hidden is supported');
    if (values.display && values.display !== 'none' && values.display !== 'inline') fail(`${location}.display`, 'Only inline or none is supported');
    if (values.transform) {
      const pattern = /([a-zA-Z]+)\s*\(([^)]*)\)/g;
      let match: RegExpExecArray | null, consumed = '';
      while ((match = pattern.exec(values.transform))) {
        consumed += match[0];
        const args = match[2]!.trim().split(/[\s,]+/).map(Number);
        const method = match[1];
        if (args.some(v => !Number.isFinite(v))) { fail(`${location}.transform`, 'Invalid transform values'); continue; }
        let transform: Partial<NodeInput> | undefined;
        if (method === 'translate' && args.length >= 1 && args.length <= 2) transform = { x: args[0], y: args[1] ?? 0 };
        else if (method === 'scale' && args.length >= 1 && args.length <= 2) transform = { scaleX: args[0], scaleY: args[1] ?? args[0] };
        else if (method === 'rotate' && (args.length === 1 || args.length === 3)) transform = { rotation: args[0], originX: args[1] ?? 0, originY: args[2] ?? 0 };
        else fail(`${location}.transform`, `Unsupported ${method} transform`);
        if (transform) parentId = add({ name: `${method} transform`, type: 'group', parentId, ...transform });
      }
      if (values.transform.replace(/[\s,]/g, '') !== consumed.replace(/[\s,]/g, '')) fail(`${location}.transform`, 'Invalid transform syntax');
    }
    const n = (key: string, fallback = 0) => num(values[key], fallback, `${location}.${key}`);
    const base: Omit<NodeInput, 'id' | 'type'> = { parentId, name: (values.id || tag).slice(0, 200), fill: color(values.fill ?? '#000000', `${location}.fill`), stroke: color(values.stroke ?? 'none', `${location}.stroke`), strokeWidth: n('stroke-width', 1), opacity: n('opacity', 1), strokeDasharray: values['stroke-dasharray'] === 'none' ? '' : (values['stroke-dasharray'] ?? ''), strokeDashoffset: n('stroke-dashoffset'), visible: values.display !== 'none' && values.visibility !== 'hidden' };
    if (tag === 'svg' || tag === 'g') {
      const id = add({ ...base, type: 'group' });
      const next: Record<string, string> = {};
      for (const key of [...paintProps, 'stroke-linecap', 'stroke-linejoin']) if (values[key]) next[key] = values[key];
      Array.from(element.children).forEach((child, i) => visit(child, id, next, `${location}/${child.localName}[${i}]`, depth + 1));
      return;
    }
    if (element.children.length) fail(location, 'Nested elements are supported only in groups');
    switch (tag) {
      case 'rect': {
        const rx = n('rx', n('ry')); const ry = n('ry', rx);
        if (rx !== ry) fail(location, 'Rectangles require equal rx and ry');
        add({ ...base, type: 'rect', x: n('x'), y: n('y'), width: n('width'), height: n('height'), radius: rx }); break;
      }
      case 'circle': case 'ellipse': add({ ...base, type: 'ellipse', x: n('cx'), y: n('cy'), rx: tag === 'circle' ? n('r') : n('rx'), ry: tag === 'circle' ? n('r') : n('ry') }); break;
      case 'line': add({ ...base, type: 'line', x: n('x1'), y: n('y1'), x2: n('x2') - n('x1'), y2: n('y2') - n('y1') }); break;
      case 'path': add({ ...base, type: 'path', d: values.d ?? '' }); break;
      case 'polygon': case 'polyline': {
        const points = (values.points ?? '').trim().split(/[\s,]+/).map(Number);
        if (points.length < 4 || points.length % 2 || points.some(p => !Number.isFinite(p))) fail(location, 'Expected coordinate pairs');
        add({ ...base, type: 'path', d: points.map((p, i) => `${i % 2 ? '' : i ? 'L' : 'M'} ${p}`).join(' ') + (tag === 'polygon' ? ' Z' : '') }); break;
      }
      case 'text': {
        const family = values['font-family'] ?? 'sans-serif', weight = values['font-weight'] ?? '400', anchor = values['text-anchor'] ?? 'start';
        add({ ...base, type: 'text', x: n('x'), y: n('y'), text: element.textContent ?? '', fontSize: n('font-size', 16), fontFamily: family as ForgeNode['fontFamily'], fontWeight: weight as ForgeNode['fontWeight'], textAnchor: anchor as ForgeNode['textAnchor'] }); break;
      }
    }
  };
  visit(root, rootParent, {}, 'svg');
  if (issues.some(i => i.severity === 'error')) return { success: false, issues };
  try { return { success: true, document: parseDocument({ ...doc, nodes }), issues }; }
  catch (error) { return { success: false, issues: [...issues, { path: 'document', message: error instanceof Error ? error.message : String(error), severity: 'error' }] }; }
}

export function exportReact(document: ForgeDocument): string {
  const json = serializeDocument(document).replace(/</g, '\\u003c').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
  return `import { parseDocument } from 'motion-forge';\nimport { MotionForge } from 'motion-forge/react';\n\nconst animation = parseDocument(${json});\n\nexport default function Animation() {\n  return <MotionForge document={animation} style={{ width: '100%', height: 'auto' }} />;\n}\n`;
}
/** Browser PNG export. Rasterization is bounded to 16 megapixels. */
export async function exportPNG(document: ForgeDocument, options: { time?: number; state?: string; scale?: number; frame?: Frame } = {}): Promise<Blob> {
  const scale = options.scale ?? 1;
  if (!Number.isFinite(scale) || scale <= 0 || document.width * document.height * scale * scale > 16_777_216) throw new RangeError('PNG dimensions must be positive and at most 16 megapixels');
  const svg = renderSVG(document, options);
  const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
  try {
    const image = new Image();
    await new Promise<void>((resolve, reject) => { image.onload = () => resolve(); image.onerror = () => reject(new Error('Could not rasterize SVG')); image.src = url; });
    const canvas = globalThis.document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(document.width * scale)); canvas.height = Math.max(1, Math.round(document.height * scale));
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Canvas 2D is unavailable');
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    return await new Promise<Blob>((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('PNG export failed')), 'image/png'));
  } finally { URL.revokeObjectURL(url); }
}
