import { parseDocument, type ForgeDocument } from './schema';

export type HistorySnapshot = { document: ForgeDocument; canUndo: boolean; canRedo: boolean; label: string; revision: number };
/** Transactional document history. Failed edits leave the document and history untouched. */
export class DocumentHistory {
  private past: { document: ForgeDocument; label: string }[] = [];
  private future: { document: ForgeDocument; label: string }[] = [];
  private snapshot: HistorySnapshot;
  private listeners = new Set<() => void>();
  private group: string | undefined;
  constructor(document: ForgeDocument, private limit = 100) {
    if (!Number.isInteger(limit) || limit < 1) throw new RangeError('History limit must be a positive integer');
    this.snapshot = { document: parseDocument(document), canUndo: false, canRedo: false, label: 'Opened document', revision: 0 };
  }
  getSnapshot = (): HistorySnapshot => this.snapshot;
  subscribe = (listener: () => void): (() => void) => { this.listeners.add(listener); return () => this.listeners.delete(listener); };
  private publish(document: ForgeDocument, label: string): void {
    this.snapshot = { document, label, revision: this.snapshot.revision + 1, canUndo: this.past.length > 0, canRedo: this.future.length > 0 };
    for (const listener of [...this.listeners]) listener();
  }
  edit(label: string, change: (draft: ForgeDocument) => void, options: { group?: string } = {}): boolean {
    const draft = structuredClone(this.snapshot.document);
    change(draft);
    const next = parseDocument(draft);
    if (JSON.stringify(next) === JSON.stringify(this.snapshot.document)) return false;
    if (!options.group || options.group !== this.group) {
      this.past.push({ document: this.snapshot.document, label: this.snapshot.label });
      if (this.past.length > this.limit) this.past.shift();
    }
    this.group = options.group; this.future = []; this.publish(next, label); return true;
  }
  endGroup(): void { this.group = undefined; }
  undo(): void {
    const previous = this.past.pop(); if (!previous) return;
    this.future.push({ document: this.snapshot.document, label: this.snapshot.label });
    this.group = undefined; this.publish(previous.document, previous.label);
  }
  redo(): void {
    const next = this.future.pop(); if (!next) return;
    this.past.push({ document: this.snapshot.document, label: this.snapshot.label });
    this.group = undefined; this.publish(next.document, next.label);
  }
  replace(document: ForgeDocument): void {
    const parsed = parseDocument(document); this.past = []; this.future = []; this.group = undefined; this.publish(parsed, 'Opened document');
  }
}

export function deleteNodes(draft: ForgeDocument, ids: readonly string[]): void {
  const remove = new Set(ids);
  for (let pass = 0; pass < 33; pass++) for (const node of draft.nodes) if (node.parentId && remove.has(node.parentId)) remove.add(node.id);
  draft.nodes = draft.nodes.filter(n => !remove.has(n.id));
  for (const clip of draft.clips) clip.tracks = clip.tracks.filter(t => !remove.has(t.nodeId));
  draft.bindings = draft.bindings.filter(b => !remove.has(b.nodeId));
}

export function uniqueId(existing: readonly string[], prefix = 'node'): string {
  const ids = new Set(existing); let count = 1;
  while (ids.has(`${prefix}-${count}`)) count++;
  return `${prefix}-${count}`;
}
