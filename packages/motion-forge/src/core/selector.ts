import type { XElement } from './xml';

/**
 * A compact CSS selector engine over the parsed SVG tree. Supports type, *,
 * #id, .class, [attr], [attr=value], :first-child, :last-child, :nth-child(n|odd|even),
 * descendant and child combinators, and comma lists.
 */
interface Compound {
  tag?: string;
  id?: string;
  classes: string[];
  attrs: [string, string | undefined][];
  pseudo: ((index: number, count: number) => boolean)[];
}
interface Complex {
  parts: Compound[];
  combinators: (' ' | '>')[];
}
export interface ParsedSelector {
  source: string;
  list: Complex[];
  specificity: number;
}

export class SelectorError extends Error {}

const IDENT = /-?[_a-zA-Z][\w-]*/y;

export function parseSelector(source: string): ParsedSelector {
  let i = 0;
  const s = source.trim();
  const ident = (): string => {
    IDENT.lastIndex = i;
    const m = IDENT.exec(s);
    if (!m) throw new SelectorError(`Unexpected "${s[i] ?? 'end'}" in selector "${source}"`);
    i += m[0].length;
    return m[0];
  };
  const list: Complex[] = [];
  let specificity = 0;
  let complex: Complex = { parts: [], combinators: [] };
  let pendingCombinator: ' ' | '>' | undefined;
  while (i <= s.length) {
    const c = s[i];
    if (c === undefined || c === ',') {
      if (!complex.parts.length || pendingCombinator === '>') throw new SelectorError(`Incomplete selector "${source}"`);
      list.push(complex);
      complex = { parts: [], combinators: [] };
      pendingCombinator = undefined;
      i++;
      while (s[i] === ' ') i++;
      if (c === undefined) break;
      continue;
    }
    if (c === ' ' || c === '>') {
      while (s[i] === ' ') i++;
      if (s[i] === '>') {
        pendingCombinator = '>';
        i++;
        while (s[i] === ' ') i++;
      } else if (s[i] !== ',' && s[i] !== undefined) pendingCombinator = pendingCombinator ?? ' ';
      continue;
    }
    const compound: Compound = { classes: [], attrs: [], pseudo: [] };
    if (c === '*') i++;
    else if (/[a-zA-Z]/.test(c)) {
      compound.tag = ident();
      specificity += 1;
    }
    for (;;) {
      const d = s[i];
      if (d === '#') {
        i++;
        compound.id = ident();
        specificity += 10000;
      } else if (d === '.') {
        i++;
        compound.classes.push(ident());
        specificity += 100;
      } else if (d === '[') {
        const end = s.indexOf(']', i);
        if (end === -1) throw new SelectorError(`Unclosed [ in selector "${source}"`);
        const body = s.slice(i + 1, end);
        const eq = body.indexOf('=');
        compound.attrs.push(eq === -1 ? [body.trim(), undefined] : [body.slice(0, eq).trim(), body.slice(eq + 1).trim().replace(/^["']|["']$/g, '')]);
        specificity += 100;
        i = end + 1;
      } else if (d === ':') {
        i++;
        const name = ident();
        specificity += 100;
        if (name === 'first-child') compound.pseudo.push(k => k === 0);
        else if (name === 'last-child') compound.pseudo.push((k, n) => k === n - 1);
        else if (name === 'nth-child') {
          const end = s.indexOf(')', i);
          const arg = s.slice(i + 1, end).trim();
          i = end + 1;
          if (arg === 'odd') compound.pseudo.push(k => k % 2 === 0);
          else if (arg === 'even') compound.pseudo.push(k => k % 2 === 1);
          else if (/^\d+$/.test(arg)) compound.pseudo.push(k => k === Number(arg) - 1);
          else throw new SelectorError(`Unsupported :nth-child(${arg}); use a number, odd or even`);
        } else throw new SelectorError(`Unsupported pseudo-class :${name}`);
      } else break;
    }
    if (pendingCombinator && complex.parts.length) complex.combinators.push(pendingCombinator);
    else if (pendingCombinator === '>' && !complex.parts.length) throw new SelectorError(`Selector "${source}" cannot start with >`);
    pendingCombinator = undefined;
    complex.parts.push(compound);
    if (i < s.length && ![' ', '>', ','].includes(s[i]!)) throw new SelectorError(`Unexpected "${s[i]}" in selector "${source}"`);
  }
  return { source, list, specificity };
}

export interface TreeIndex {
  parent: Map<XElement, XElement | undefined>;
  /** Element children only, for :nth-child. */
  siblings: Map<XElement, XElement[]>;
}

export function indexTree(root: XElement): TreeIndex {
  const parent = new Map<XElement, XElement | undefined>();
  const siblings = new Map<XElement, XElement[]>();
  const visit = (el: XElement, p: XElement | undefined) => {
    parent.set(el, p);
    const kids = el.children.filter((c): c is XElement => c.type === 'el');
    for (const k of kids) {
      siblings.set(k, kids);
      visit(k, el);
    }
  };
  siblings.set(root, [root]);
  visit(root, undefined);
  return { parent, siblings };
}

function matchCompound(el: XElement, c: Compound, idx: TreeIndex): boolean {
  if (c.tag && c.tag !== el.name) return false;
  if (c.id && el.attrs.id !== c.id) return false;
  if (c.classes.length) {
    const cls = (el.attrs.class ?? '').split(/\s+/);
    if (!c.classes.every(k => cls.includes(k))) return false;
  }
  for (const [name, value] of c.attrs) {
    if (!(name in el.attrs)) return false;
    if (value !== undefined && el.attrs[name] !== value) return false;
  }
  if (c.pseudo.length) {
    const sib = idx.siblings.get(el) ?? [el];
    const k = sib.indexOf(el);
    if (!c.pseudo.every(p => p(k, sib.length))) return false;
  }
  return true;
}

function matchComplex(el: XElement, cx: Complex, idx: TreeIndex, part = cx.parts.length - 1): boolean {
  if (!matchCompound(el, cx.parts[part]!, idx)) return false;
  if (part === 0) return true;
  const comb = cx.combinators[part - 1];
  let p = idx.parent.get(el);
  if (comb === '>') return !!p && matchComplex(p, cx, idx, part - 1);
  while (p) {
    if (matchComplex(p, cx, idx, part - 1)) return true;
    p = idx.parent.get(p);
  }
  return false;
}

export function matches(el: XElement, sel: ParsedSelector, idx: TreeIndex): boolean {
  return sel.list.some(cx => matchComplex(el, cx, idx));
}

export function selectAll(root: XElement, sel: ParsedSelector, idx: TreeIndex): XElement[] {
  const out: XElement[] = [];
  const visit = (el: XElement) => {
    if (matches(el, sel, idx)) out.push(el);
    for (const c of el.children) if (c.type === 'el') visit(c);
  };
  visit(root);
  return out;
}
