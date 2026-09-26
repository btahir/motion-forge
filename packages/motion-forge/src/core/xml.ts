/**
 * A small, strict-enough XML parser for SVG. It never resolves external
 * entities, never fetches anything, and reports line/column on failure.
 */

export interface XElement {
  type: 'el';
  name: string;
  attrs: Record<string, string>;
  children: XNode[];
  /** Stable preorder index assigned by the scene loader. */
  key?: number;
}
export interface XText {
  type: 'text';
  value: string;
  cdata?: boolean;
}
export type XNode = XElement | XText;

export class XMLError extends Error {
  constructor(
    message: string,
    readonly line: number,
    readonly column: number,
  ) {
    super(`${message} (line ${line}, column ${column})`);
    this.name = 'XMLError';
  }
}

const ENTITIES: Record<string, string> = { lt: '<', gt: '>', amp: '&', quot: '"', apos: "'", nbsp: ' ' };

export function decodeEntities(text: string): string {
  if (!text.includes('&')) return text;
  return text.replace(/&(#x[\da-fA-F]+|#\d+|[a-zA-Z]+);/g, (whole, body: string) => {
    if (body[0] === '#') {
      const code = body[1] === 'x' ? parseInt(body.slice(2), 16) : parseInt(body.slice(1), 10);
      return Number.isFinite(code) && code > 0 && code < 0x110000 ? String.fromCodePoint(code) : whole;
    }
    return ENTITIES[body] ?? whole;
  });
}

export function escapeText(text: string): string {
  return text.replace(/[&<>]/g, c => (c === '&' ? '&amp;' : c === '<' ? '&lt;' : '&gt;'));
}
export function escapeAttr(text: string): string {
  return text.replace(/[&<>"]/g, c => (c === '&' ? '&amp;' : c === '<' ? '&lt;' : c === '>' ? '&gt;' : '&quot;'));
}

const NAME = /[A-Za-z_:][-\w:.]*/y;

export function parseXML(source: string): XElement {
  let i = 0;
  const len = source.length;

  const position = (at: number) => {
    let line = 1;
    let col = 1;
    for (let k = 0; k < at && k < len; k++) {
      if (source.charCodeAt(k) === 10) {
        line++;
        col = 1;
      } else col++;
    }
    return { line, col };
  };
  const fail = (message: string, at = i): never => {
    const { line, col } = position(at);
    throw new XMLError(message, line, col);
  };
  const readName = (): string => {
    NAME.lastIndex = i;
    const match = NAME.exec(source);
    if (!match) fail('Expected a name');
    i += match![0].length;
    return match![0];
  };
  const skipSpace = () => {
    while (i < len && /\s/.test(source[i]!)) i++;
  };

  const root: XElement = { type: 'el', name: '#document', attrs: {}, children: [] };
  const stack: XElement[] = [root];

  while (i < len) {
    const lt = source.indexOf('<', i);
    const textEnd = lt === -1 ? len : lt;
    if (textEnd > i) {
      const raw = source.slice(i, textEnd);
      if (stack.length > 1) stack[stack.length - 1]!.children.push({ type: 'text', value: decodeEntities(raw) });
      else if (raw.trim()) fail('Text outside the root element');
      i = textEnd;
      continue;
    }
    if (source.startsWith('<!--', i)) {
      const end = source.indexOf('-->', i + 4);
      if (end === -1) fail('Unterminated comment');
      i = end + 3;
      continue;
    }
    if (source.startsWith('<![CDATA[', i)) {
      const end = source.indexOf(']]>', i + 9);
      if (end === -1) fail('Unterminated CDATA section');
      stack[stack.length - 1]!.children.push({ type: 'text', value: source.slice(i + 9, end), cdata: true });
      i = end + 3;
      continue;
    }
    if (source.startsWith('<?', i)) {
      const end = source.indexOf('?>', i + 2);
      if (end === -1) fail('Unterminated processing instruction');
      i = end + 2;
      continue;
    }
    if (source.startsWith('<!', i)) {
      // DOCTYPE. Internal subsets can declare entities; we refuse them rather than expand.
      let depth = 0;
      let k = i + 2;
      for (; k < len; k++) {
        const c = source[k];
        if (c === '[') depth++;
        else if (c === ']') depth--;
        else if (c === '>' && depth <= 0) break;
      }
      if (/<!ENTITY/i.test(source.slice(i, k))) fail('Entity declarations are not supported');
      i = k + 1;
      continue;
    }
    if (source.startsWith('</', i)) {
      i += 2;
      const name = readName();
      skipSpace();
      if (source[i] !== '>') fail('Expected >');
      i++;
      const open = stack.pop();
      if (!open || open === root) fail(`Unexpected closing tag </${name}>`);
      if (open!.name !== name) fail(`Mismatched closing tag </${name}>, expected </${open!.name}>`);
      continue;
    }
    // Start tag
    const tagStart = i;
    i++;
    const name = readName();
    const attrs: Record<string, string> = {};
    for (;;) {
      skipSpace();
      if (i >= len) fail('Unterminated start tag', tagStart);
      const c = source[i];
      if (c === '>' || (c === '/' && source[i + 1] === '>')) break;
      const attrName = readName();
      skipSpace();
      if (source[i] !== '=') {
        attrs[attrName] = '';
        continue;
      }
      i++;
      skipSpace();
      const quote = source[i];
      let value: string;
      if (quote === '"' || quote === "'") {
        const end = source.indexOf(quote, i + 1);
        if (end === -1) fail('Unterminated attribute value');
        value = source.slice(i + 1, end);
        i = end + 1;
      } else {
        const m = /[^\s>]+/y;
        m.lastIndex = i;
        const found = m.exec(source);
        value = found ? found[0] : '';
        i += value.length;
      }
      attrs[attrName] = decodeEntities(value);
    }
    const element: XElement = { type: 'el', name, attrs, children: [] };
    const parent = stack[stack.length - 1]!;
    if (parent === root && root.children.some(n => n.type === 'el')) fail('Only one root element is allowed', tagStart);
    parent.children.push(element);
    if (source[i] === '/') i += 2;
    else {
      i++;
      stack.push(element);
    }
  }
  if (stack.length > 1) fail(`Unclosed <${stack[stack.length - 1]!.name}>`);
  const top = root.children.find((n): n is XElement => n.type === 'el');
  if (!top) fail('No root element', 0);
  return top!;
}

export function serializeXML(node: XNode): string {
  if (node.type === 'text') return node.cdata ? `<![CDATA[${node.value}]]>` : escapeText(node.value);
  let out = `<${node.name}`;
  for (const [k, v] of Object.entries(node.attrs)) out += ` ${k}="${escapeAttr(v)}"`;
  if (!node.children.length) return out + '/>';
  out += '>';
  for (const child of node.children) out += serializeXML(child);
  return out + `</${node.name}>`;
}

export function textContent(node: XNode): string {
  if (node.type === 'text') return node.value;
  return node.children.map(textContent).join('');
}

export function walk(node: XElement, visit: (el: XElement, parent: XElement | undefined) => void | false, parent?: XElement): void {
  if (visit(node, parent) === false) return;
  for (const child of node.children) if (child.type === 'el') walk(child, visit, node);
}

export function cloneTree(node: XElement): XElement {
  return {
    type: 'el',
    name: node.name,
    attrs: { ...node.attrs },
    key: node.key,
    children: node.children.map(c => (c.type === 'el' ? cloneTree(c) : { ...c })),
  };
}
