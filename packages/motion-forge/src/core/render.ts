import { sampleDocument, type Frame, type InputValues } from './sample';
import { parseDocument, type ForgeDocument, type ForgeNode } from './schema';

export const escapeXML = (value: string | number): string => String(value).replace(/[<>&"']/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;' })[c]!);
export const number = (value: number): string => String(Math.round(value * 10000) / 10000);
export function nodeTransform(node: ForgeNode): string {
  return `translate(${number(node.x)} ${number(node.y)}) translate(${number(node.originX)} ${number(node.originY)}) rotate(${number(node.rotation)}) scale(${number(node.scaleX)} ${number(node.scaleY)}) translate(${number(-node.originX)} ${number(-node.originY)})`;
}

/** A self-contained SVG using only generated, allowlisted elements and attributes. */
export function renderSVG(document: ForgeDocument, options: { time?: number; state?: string; inputs?: InputValues; frame?: Frame; background?: boolean; title?: string } = {}): string {
  document = parseDocument(options.frame ? { ...document, nodes: document.nodes.map(node => options.frame![node.id] ?? node) } : document);
  const frame = options.frame ? Object.fromEntries(document.nodes.map(node => [node.id, node])) : sampleDocument(document, options.time ?? 0, options);
  const children = new Map<string | undefined, ForgeNode[]>();
  for (const node of document.nodes) { const list = children.get(node.parentId) ?? []; list.push(frame[node.id]!); children.set(node.parentId, list); }
  const renderNode = (node: ForgeNode): string => {
    if (!node.visible) return '';
    const attrs = `data-node-id="${escapeXML(node.id)}" transform="${nodeTransform(node)}" opacity="${number(node.opacity)}" fill="${escapeXML(node.fill)}" stroke="${escapeXML(node.stroke)}" stroke-width="${number(node.strokeWidth)}" stroke-linecap="round" stroke-linejoin="round"${node.strokeDasharray ? ` stroke-dasharray="${escapeXML(node.strokeDasharray)}"` : ''} stroke-dashoffset="${number(node.strokeDashoffset)}"`;
    switch (node.type) {
      case 'group': return `<g ${attrs}>${(children.get(node.id) ?? []).map(renderNode).join('')}</g>`;
      case 'rect': return `<rect ${attrs} width="${number(node.width)}" height="${number(node.height)}" rx="${number(node.radius)}"/>`;
      case 'ellipse': return `<ellipse ${attrs} rx="${number(node.rx)}" ry="${number(node.ry)}"/>`;
      case 'path': return `<path ${attrs} d="${escapeXML(node.d)}"/>`;
      case 'line': return `<line ${attrs} x2="${number(node.x2)}" y2="${number(node.y2)}"/>`;
      case 'text': return `<text ${attrs} font-family="${node.fontFamily}" font-size="${number(node.fontSize)}" font-weight="${node.fontWeight}" text-anchor="${node.textAnchor}">${escapeXML(node.text)}</text>`;
    }
  };
  const defs = document.gradients.map(g => {
    const stops = g.stops.map(s => `<stop offset="${s.offset}" stop-color="${s.color}" stop-opacity="${s.opacity}"/>`).join('');
    return g.type === 'linear' ? `<linearGradient id="${g.id}" x1="${g.x1}" y1="${g.y1}" x2="${g.x2}" y2="${g.y2}">${stops}</linearGradient>` : `<radialGradient id="${g.id}" cx="${g.x1}" cy="${g.y1}" r="${g.x2}">${stops}</radialGradient>`;
  }).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${document.width} ${document.height}" width="${document.width}" height="${document.height}" role="img"><title>${escapeXML(options.title ?? document.name)}</title><defs>${defs}</defs>${options.background === false ? '' : `<rect width="100%" height="100%" fill="${escapeXML(document.background)}"/>`}${(children.get(undefined) ?? []).map(renderNode).join('')}</svg>`;
}
