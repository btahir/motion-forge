import { array as zArray, boolean as zBoolean, discriminatedUnion as zDiscriminatedUnion, enum as zEnum, literal as zLiteral, number as zNumber, strictObject as zStrictObject, string as zString, toJSONSchema as zToJSONSchema, tuple as zTuple, union as zUnion } from 'zod';
import type { z } from 'zod';
import { validPath } from './path';

export const FORMAT_VERSION = 1 as const;
const id = zString().regex(/^[A-Za-z][\w-]{0,79}$/, 'Use a letter followed by letters, numbers, underscores, or hyphens');
const finite = zNumber().finite();
const coordinate = finite.min(-1e6).max(1e6);
const color = zString().regex(/^(#[\da-fA-F]{3}|#[\da-fA-F]{6}|#[\da-fA-F]{8}|none|url\(#[A-Za-z][\w-]{0,79}\))$/, 'Use a hex color, none, or a local gradient reference');
export const numericProperties = ['x', 'y', 'rotation', 'scaleX', 'scaleY', 'opacity', 'originX', 'originY', 'width', 'height', 'radius', 'rx', 'ry', 'x2', 'y2', 'strokeWidth', 'fontSize', 'strokeDashoffset'] as const;
export const properties = [...numericProperties, 'fill', 'stroke'] as const;
export type AnimatedProperty = typeof properties[number];

export const easingSchema = zUnion([
  zEnum(['linear', 'hold', 'ease-in', 'ease-out', 'ease-in-out', 'spring']),
  zStrictObject({ type: zLiteral('cubic'), points: zTuple([finite.min(0).max(1), finite.min(-10).max(10), finite.min(0).max(1), finite.min(-10).max(10)]) }),
  zStrictObject({ type: zLiteral('spring'), stiffness: finite.min(1).max(1000), damping: finite.min(0.1).max(100), mass: finite.min(0.1).max(10) }),
]);
export type Easing = z.infer<typeof easingSchema>;

export const nodeSchema = zStrictObject({
  id,
  name: zString().max(200),
  type: zEnum(['group', 'rect', 'ellipse', 'path', 'line', 'text']),
  parentId: id.optional(),
  visible: zBoolean().default(true),
  locked: zBoolean().default(false),
  x: coordinate.default(0), y: coordinate.default(0),
  rotation: coordinate.default(0),
  scaleX: finite.min(-100).max(100).default(1), scaleY: finite.min(-100).max(100).default(1),
  originX: coordinate.default(0), originY: coordinate.default(0),
  opacity: finite.min(0).max(1).default(1),
  fill: color.default('#ed693a'), stroke: color.default('none'),
  strokeWidth: finite.min(0).max(1000).default(0),
  strokeDasharray: zString().regex(/^[\d.,\s-]*$/).max(300).default(''),
  strokeDashoffset: coordinate.default(0),
  width: finite.min(0).max(100000).default(100), height: finite.min(0).max(100000).default(100),
  radius: finite.min(0).max(100000).default(0),
  rx: finite.min(0).max(100000).default(50), ry: finite.min(0).max(100000).default(50),
  x2: coordinate.default(100), y2: coordinate.default(100),
  d: zString().max(100000).regex(/^[MmLlHhVvCcSsQqTtAaZz\d\s.,+eE-]*$/, 'Unsupported path data').default(''),
  text: zString().max(10000).default(''),
  fontSize: finite.min(1).max(1000).default(24),
  fontFamily: zEnum(['sans-serif', 'serif', 'monospace']).default('sans-serif'),
  fontWeight: zEnum(['400', '500', '600', '700', '800']).default('400'),
  textAnchor: zEnum(['start', 'middle', 'end']).default('start'),
});
export type ForgeNode = z.infer<typeof nodeSchema>;
export type NodeInput = z.input<typeof nodeSchema>;

export const keyframeSchema = zStrictObject({
  time: finite.min(0).max(600000), value: zUnion([finite.min(-1e6).max(1e6), color]),
  easing: easingSchema.default('ease-in-out'),
});
export type Keyframe = z.infer<typeof keyframeSchema>;
export const trackSchema = zStrictObject({
  id, nodeId: id, property: zEnum(properties), keyframes: zArray(keyframeSchema).min(1).max(2000),
});
export type Track = z.infer<typeof trackSchema>;
export const clipSchema = zStrictObject({
  id, name: zString().max(200), duration: finite.min(1).max(600000), tracks: zArray(trackSchema).max(4000),
});
export type Clip = z.infer<typeof clipSchema>;

const inputSchema = zDiscriminatedUnion('type', [
  zStrictObject({ id, name: zString().max(200), type: zLiteral('number'), min: finite, max: finite, default: finite }),
  zStrictObject({ id, name: zString().max(200), type: zLiteral('boolean'), default: zBoolean() }),
]);
export type ForgeInput = z.infer<typeof inputSchema>;
export const stateSchema = zStrictObject({ id, name: zString().max(200), clipId: id, loop: zBoolean().default(false) });
export type ForgeState = z.infer<typeof stateSchema>;
export const transitionSchema = zStrictObject({
  id, from: zUnion([id, zLiteral('*')]), to: id,
  trigger: zDiscriminatedUnion('type', [
    zStrictObject({ type: zLiteral('event'), event: id }),
    zStrictObject({ type: zLiteral('input'), inputId: id, operator: zEnum(['eq', 'gt', 'gte', 'lt', 'lte']), value: zUnion([finite, zBoolean()]) }),
    zStrictObject({ type: zLiteral('complete') }),
  ]),
  duration: finite.min(0).max(10000).default(300),
  easing: easingSchema.default('ease-in-out'),
});
export type Transition = z.infer<typeof transitionSchema>;
export const bindingSchema = zStrictObject({
  id, inputId: id, nodeId: id, property: zEnum(numericProperties), from: coordinate, to: coordinate,
});
export type Binding = z.infer<typeof bindingSchema>;

export const documentSchema = zStrictObject({
  version: zLiteral(FORMAT_VERSION),
  name: zString().min(1).max(200),
  description: zString().max(2000).default(''),
  width: finite.int().min(1).max(8192), height: finite.int().min(1).max(8192),
  background: color.default('#ffffff'),
  nodes: zArray(nodeSchema).max(2000),
  gradients: zArray(zStrictObject({
    id, type: zEnum(['linear', 'radial']),
    x1: finite.min(0).max(1).default(0), y1: finite.min(0).max(1).default(0),
    x2: finite.min(0).max(1).default(1), y2: finite.min(0).max(1).default(1),
    stops: zArray(zStrictObject({ offset: finite.min(0).max(1), color: zString().regex(/^#[\da-fA-F]{6}$/), opacity: finite.min(0).max(1).default(1) })).min(2).max(30),
  })).max(100).default([]),
  clips: zArray(clipSchema).min(1).max(100),
  states: zArray(stateSchema).min(1).max(100),
  initialState: id,
  inputs: zArray(inputSchema).max(100).default([]),
  transitions: zArray(transitionSchema).max(1000).default([]),
  bindings: zArray(bindingSchema).max(2000).default([]),
});
export type ForgeDocument = z.infer<typeof documentSchema>;
export type DocumentInput = z.input<typeof documentSchema>;
export type ValidationIssue = { path: string; message: string };
export type ValidationResult = { success: true; document: ForgeDocument } | { success: false; issues: ValidationIssue[] };

export class DocumentError extends Error {
  readonly issues: ValidationIssue[];
  constructor(issues: ValidationIssue[]) {
    super(issues.map(i => `${i.path || 'document'}: ${i.message}`).join('\n'));
    this.name = 'DocumentError'; this.issues = issues;
  }
}

/** Validate structure and all cross-references. Never executes document content. */
export function validateDocument(value: unknown): ValidationResult {
  const parsed = documentSchema.safeParse(value);
  if (!parsed.success) return { success: false, issues: parsed.error.issues.map(i => ({ path: i.path.join('.'), message: i.message })) };
  const doc = parsed.data;
  const issues: ValidationIssue[] = [];
  const fail = (path: string, message: string) => issues.push({ path, message });
  const unique = (items: { id: string }[], path: string) => {
    const ids = new Set<string>();
    items.forEach((item, i) => { if (ids.has(item.id)) fail(`${path}.${i}.id`, `Duplicate id ${item.id}`); ids.add(item.id); });
    return ids;
  };
  unique(doc.nodes, 'nodes');
  const clipIds = unique(doc.clips, 'clips');
  const stateIds = unique(doc.states, 'states');
  unique(doc.inputs, 'inputs'); unique(doc.transitions, 'transitions'); unique(doc.bindings, 'bindings');
  const gradientIds = unique(doc.gradients, 'gradients');
  const nodes = new Map(doc.nodes.map(n => [n.id, n]));
  const inputs = new Map(doc.inputs.map(n => [n.id, n]));
  const checkColor = (v: string, path: string) => { if (v.startsWith('url(') && !gradientIds.has(v.slice(5, -1))) fail(path, 'Unknown gradient reference'); };
  checkColor(doc.background, 'background');
  doc.nodes.forEach((node, i) => {
    if (node.type === 'path' && !validPath(node.d)) fail(`nodes.${i}.d`, 'Invalid SVG path commands, argument counts, arc flags or coordinate bounds');
    checkColor(node.fill, `nodes.${i}.fill`); checkColor(node.stroke, `nodes.${i}.stroke`);
    if (node.parentId && nodes.get(node.parentId)?.type !== 'group') fail(`nodes.${i}.parentId`, 'Parent must reference a group');
    const ancestors = new Set([node.id]); let parent = node.parentId;
    while (parent && nodes.has(parent)) {
      if (ancestors.has(parent)) { fail(`nodes.${i}.parentId`, 'Cyclic scene hierarchy'); break; }
      if (ancestors.size > 32) { fail(`nodes.${i}.parentId`, 'Maximum scene depth is 32'); break; }
      ancestors.add(parent); parent = nodes.get(parent)?.parentId;
    }
  });
  const validateValue = (prop: AnimatedProperty, value: number | string, path: string) => {
    if (prop === 'fill' || prop === 'stroke') {
      if (typeof value !== 'string') fail(path, 'Color tracks require color values'); else checkColor(value, path);
    } else if (typeof value !== 'number') fail(path, 'Numeric tracks require numeric values');
    else {
      const result = nodeSchema.shape[prop].safeParse(value);
      if (!result.success) fail(path, `Value is outside the allowed range for ${prop}`);
    }
  };
  doc.clips.forEach((clip, i) => {
    unique(clip.tracks, `clips.${i}.tracks`);
    const targets = new Set<string>();
    clip.tracks.forEach((track, j) => {
      const path = `clips.${i}.tracks.${j}`;
      if (!nodes.has(track.nodeId)) fail(`${path}.nodeId`, 'Unknown node');
      const target = `${track.nodeId}:${track.property}`;
      if (targets.has(target)) fail(path, 'Only one track per node/property in a clip'); targets.add(target);
      track.keyframes.forEach((frame, k) => {
        if (frame.time > clip.duration) fail(`${path}.keyframes.${k}.time`, 'Keyframe exceeds clip duration');
        if (k > 0 && frame.time <= track.keyframes[k - 1]!.time) fail(`${path}.keyframes.${k}.time`, 'Keyframes must have unique, ascending times');
        validateValue(track.property, frame.value, `${path}.keyframes.${k}.value`);
      });
    });
  });
  doc.states.forEach((s, i) => { if (!clipIds.has(s.clipId)) fail(`states.${i}.clipId`, 'Unknown clip'); });
  if (!stateIds.has(doc.initialState)) fail('initialState', 'Unknown initial state');
  doc.inputs.forEach((input, i) => {
    if (input.type === 'number' && (input.min >= input.max || input.default < input.min || input.default > input.max)) fail(`inputs.${i}`, 'Number inputs require min < max and a default within range');
  });
  doc.transitions.forEach((t, i) => {
    if (t.from !== '*' && !stateIds.has(t.from)) fail(`transitions.${i}.from`, 'Unknown source state');
    if (!stateIds.has(t.to)) fail(`transitions.${i}.to`, 'Unknown target state');
    if (t.trigger.type === 'input') {
      const input = inputs.get(t.trigger.inputId);
      if (!input) fail(`transitions.${i}.trigger.inputId`, 'Unknown input');
      else if (typeof t.trigger.value !== (input.type === 'number' ? 'number' : 'boolean') || (input.type === 'boolean' && t.trigger.operator !== 'eq')) fail(`transitions.${i}.trigger`, 'Condition type must match the input; boolean inputs support eq only');
    }
  });
  const bindingTargets = new Set<string>();
  doc.bindings.forEach((b, i) => {
    if (inputs.get(b.inputId)?.type !== 'number') fail(`bindings.${i}.inputId`, 'Bindings require a numeric input');
    if (!nodes.has(b.nodeId)) fail(`bindings.${i}.nodeId`, 'Unknown node');
    const target = `${b.nodeId}:${b.property}`;
    if (bindingTargets.has(target)) fail(`bindings.${i}`, 'Only one binding per node/property'); bindingTargets.add(target);
    validateValue(b.property, b.from, `bindings.${i}.from`); validateValue(b.property, b.to, `bindings.${i}.to`);
  });
  return issues.length ? { success: false, issues } : { success: true, document: doc };
}

export function parseDocument(value: unknown): ForgeDocument {
  const result = validateDocument(value);
  if (!result.success) throw new DocumentError(result.issues);
  return result.document;
}
export function parseJSON(text: string): ForgeDocument {
  if (text.length > 5_000_000) throw new DocumentError([{ path: '', message: 'Document exceeds the 5 MB text limit' }]);
  let raw: unknown;
  try { raw = JSON.parse(text); } catch { throw new DocumentError([{ path: '', message: 'Invalid JSON' }]); }
  return parseDocument(raw);
}
export function serializeDocument(document: ForgeDocument): string { return JSON.stringify(parseDocument(document), null, 2); }
export function createDocument(name = 'Untitled animation'): ForgeDocument {
  return parseDocument({ version: 1, name, width: 800, height: 600, nodes: [], clips: [{ id: 'main', name: 'Main animation', duration: 3000, tracks: [] }], states: [{ id: 'idle', name: 'Idle', clipId: 'main', loop: true }], initialState: 'idle' });
}
export function getJSONSchema(): Record<string, unknown> { return zToJSONSchema(documentSchema, { io: 'input' }); }
