import { describe, expect, it } from 'vitest';
import { createDocument, parseDocument, parseJSON, validateDocument, serializeDocument, DocumentError, nodeSchema, type ForgeDocument } from './schema';
import { ease, interpolate } from './easing';
import { sampleClip, sampleDocument } from './sample';
import { renderSVG } from './render';
import { ForgePlayer } from './player';
import { deleteNodes, DocumentHistory } from './history';

function fixture(): ForgeDocument {
  const doc = createDocument('Test scene');
  doc.nodes.push(nodeSchema.parse({ id: 'box', name: 'Box', type: 'rect', x: 10, width: 20, height: 30 }));
  doc.clips[0]!.duration = 1000;
  doc.clips[0]!.tracks = [{ id: 'move', nodeId: 'box', property: 'x', keyframes: [{ time: 0, value: 10, easing: 'linear' }, { time: 1000, value: 110, easing: 'linear' }] }];
  doc.states[0]!.loop = false;
  return doc;
}

describe('document contract', () => {
  it('normalizes defaults and preserves an editable JSON round trip', () => {
    const doc = fixture(); expect(parseJSON(serializeDocument(doc))).toEqual(doc);
    expect(doc.nodes[0]!.scaleX).toBe(1);
  });
  it.each([NaN, Infinity, -Infinity])('rejects non-finite authoring coordinates %s', value => {
    const doc = fixture(); doc.nodes[0]!.x = value; expect(validateDocument(doc).success).toBe(false);
  });
  it('rejects unknown fields and script-bearing paints', () => {
    expect(validateDocument({ ...fixture(), onload: 'alert(1)' }).success).toBe(false);
    const doc = fixture(); doc.nodes[0]!.fill = 'url(https://example.com/a.svg)'; expect(validateDocument(doc).success).toBe(false);
  });
  it('rejects invalid cross-references with actionable paths', () => {
    const doc = fixture(); doc.clips[0]!.tracks[0]!.nodeId = 'missing';
    const result = validateDocument(doc); expect(result.success).toBe(false);
    if (!result.success) expect(result.issues).toContainEqual({ path: 'clips.0.tracks.0.nodeId', message: 'Unknown node' });
  });
  it('rejects duplicate identity, unordered frames, and duplicate channels', () => {
    const doc = fixture(); doc.nodes.push({ ...doc.nodes[0]! });
    expect(validateDocument(doc).success).toBe(false); doc.nodes.pop();
    doc.clips[0]!.tracks[0]!.keyframes.reverse(); expect(validateDocument(doc).success).toBe(false);
    const another = fixture(); another.clips[0]!.tracks.push({ ...another.clips[0]!.tracks[0]!, id: 'other' });
    expect(validateDocument(another).success).toBe(false);
  });
  it('rejects cyclic groups and illegal parent types', () => {
    const doc = fixture(); doc.nodes[0]!.parentId = 'box'; expect(validateDocument(doc).success).toBe(false);
    doc.nodes[0]!.type = 'group'; expect(validateDocument(doc).success).toBe(false);
  });
  it('rejects invalid input types, ranges, conditions and bindings', () => {
    const doc = fixture(); doc.inputs = [{ id: 'amount', name: 'Amount', type: 'number', min: 1, max: 1, default: 1 }];
    expect(validateDocument(doc).success).toBe(false);
    doc.inputs = [{ id: 'enabled', name: 'Enabled', type: 'boolean', default: false }];
    doc.bindings = [{ id: 'bind', inputId: 'enabled', nodeId: 'box', property: 'x', from: 0, to: 100 }];
    expect(validateDocument(doc).success).toBe(false);
  });
  it('wraps invalid JSON and overlarge input in DocumentError', () => {
    expect(() => parseJSON('{')).toThrow(DocumentError);
    expect(() => parseJSON(' '.repeat(5_000_001))).toThrow(/5 MB/);
  });
});

describe('independent animation expectations', () => {
  it('samples known values, clamps time and does not mutate source', () => {
    const doc = fixture(); const before = serializeDocument(doc);
    for (const [time, x] of [[-100, 10], [0, 10], [250, 35], [500, 60], [1000, 110], [2000, 110]]) expect(sampleClip(doc, 'main', time!).box!.x).toBe(x);
    expect(serializeDocument(doc)).toBe(before);
    expect(() => sampleClip(doc, 'main', NaN)).toThrow();
  });
  it('holds until a keyframe and uses the outgoing easing', () => {
    const doc = fixture(); doc.clips[0]!.tracks[0]!.keyframes[0]!.easing = 'hold';
    expect(sampleClip(doc, 'main', 999).box!.x).toBe(10); expect(sampleClip(doc, 'main', 1000).box!.x).toBe(110);
  });
  it('solves Bezier x rather than treating time as curve position', () => {
    expect(ease({ type: 'cubic', points: [0, 0, 1, 1] }, 0.25)).toBeCloseTo(0.25, 7);
    expect(ease('ease-in-out', 0.5)).toBeCloseTo(0.5, 7);
    expect(ease('ease-in', 0.5)).toBeCloseTo(0.3153568, 6);
    expect(ease('ease-out', 0.5)).toBeCloseTo(0.6846432, 6);
  });
  it('has finite spring output for under, critical and overdamping', () => {
    for (const damping of [0.1, 16, 20, 100]) for (let i = 0; i <= 100; i++) expect(Number.isFinite(ease({ type: 'spring', stiffness: 100, mass: 1, damping }, i / 100))).toBe(true);
    expect(ease('spring', 0)).toBe(0); expect(ease('spring', 1)).toBe(1);
    expect(ease('spring', 0.25)).toBeGreaterThan(1);
  });
  it('interpolates hex colors and alpha with bounded channels', () => {
    expect(interpolate('#000', '#fff', 0.5)).toBe('#808080ff');
    expect(interpolate('#00000000', '#ffffff00', 0.5)).toBe('#80808000');
    expect(interpolate('none', '#ffffff', 0.5)).toBe('none');
  });
  it('applies numeric bindings after timeline tracks', () => {
    const doc = fixture(); doc.inputs.push({ id: 'progress', name: 'Progress', type: 'number', min: 0, max: 100, default: 0 });
    doc.bindings.push({ id: 'binding', inputId: 'progress', nodeId: 'box', property: 'x', from: 0, to: 400 });
    expect(sampleDocument(doc, 500, { inputs: { progress: 25 } }).box!.x).toBe(100);
    expect(sampleDocument(doc, 500, { inputs: { progress: 500 } }).box!.x).toBe(400);
  });
});

describe('player clock and state transitions', () => {
  it('preserves seek/play equivalence across varied tick partitions', () => {
    for (const step of [1, 5, 25, 100, 250]) {
      const player = new ForgePlayer(fixture()); player.play(); for (let t = 0; t < 500; t += step) player.advance(step);
      expect(player.getSnapshot().frame.box!.x).toBe(60);
    }
  });
  it('completes once, supports reverse and wraps loops in both directions', () => {
    const player = new ForgePlayer(fixture()); const events: string[] = []; player.onEvent(e => events.push(e.type));
    player.play(); player.advance(1000); player.advance(1000); expect(events).toEqual(['complete']); expect(player.getSnapshot().playing).toBe(false);
    player.seek(500); player.setRate(-1); player.play(); player.advance(250); expect(player.getSnapshot().time).toBe(250);
    const doc = fixture(); doc.states[0]!.loop = true; const loop = new ForgePlayer(doc, { autoplay: true }); loop.advance(1250); expect(loop.getSnapshot().time).toBe(250);
    loop.setRate(-1); loop.advance(500); expect(loop.getSnapshot().time).toBe(750);
  });
  it('blends from the currently visible frame, including interrupted transitions', () => {
    const doc = fixture(); doc.clips.push({ id: 'second', name: 'Second', duration: 1000, tracks: [{ id: 'x', nodeId: 'box', property: 'x', keyframes: [{ time: 0, value: 210, easing: 'linear' }] }] });
    doc.states.push({ id: 'active', name: 'Active', clipId: 'second', loop: false });
    doc.transitions.push({ id: 'go', from: '*', to: 'active', trigger: { type: 'event', event: 'go' }, duration: 200, easing: 'linear' });
    doc.transitions.push({ id: 'back', from: '*', to: 'idle', trigger: { type: 'event', event: 'back' }, duration: 200, easing: 'linear' });
    const player = new ForgePlayer(doc); player.seek(500); expect(player.send('go')).toBe(true);
    expect(player.getSnapshot().frame.box!.x).toBe(60); player.advance(100); expect(player.getSnapshot().frame.box!.x).toBe(135);
    player.send('back'); expect(player.getSnapshot().frame.box!.x).toBe(135);
    expect(player.send('unknown')).toBe(false);
  });
  it('type-checks and clamps runtime inputs and supports numeric conditions', () => {
    const doc = fixture(); doc.inputs.push({ id: 'power', name: 'Power', type: 'number', min: 0, max: 100, default: 0 });
    doc.states.push({ id: 'active', name: 'Active', clipId: 'main', loop: true });
    doc.transitions.push({ id: 'power-up', from: 'idle', to: 'active', trigger: { type: 'input', inputId: 'power', operator: 'gte', value: 80 }, duration: 0, easing: 'linear' });
    const player = new ForgePlayer(doc); expect(() => player.setInput('power', true)).toThrow(); expect(() => player.setInput('power', Infinity)).toThrow();
    player.setInput('power', 150); expect(player.getSnapshot().inputs.power).toBe(100); expect(player.getSnapshot().state).toBe('active');
  });
  it('reduced motion shows an end pose without ticking and dispose releases listeners', () => {
    const player = new ForgePlayer(fixture(), { reducedMotion: true, autoplay: true });
    expect(player.getSnapshot().time).toBe(1000); player.play(); player.advance(100); expect(player.getSnapshot().playing).toBe(false);
    let calls = 0; player.subscribe(() => calls++); player.dispose(); player.seek(100); expect(calls).toBe(0);
  });
});

describe('portable scene output and authoring transactions', () => {
  it('escapes user text and renders transforms/visibility without external assets', () => {
    const doc = fixture(); doc.nodes.push(nodeSchema.parse({ id: 'text', type: 'text', name: 'Text', text: '<script>alert("hi")</script>&' }));
    const svg = renderSVG(doc, { time: 500 }); expect(svg).toContain('translate(60 0)'); expect(svg).toContain('&lt;script&gt;'); expect(svg).not.toContain('<script>');
    doc.nodes[0]!.visible = false; expect(renderSVG(doc)).not.toContain('data-node-id="box"');
  });
  it('renders children inside transformed parents regardless of document order', () => {
    const doc = fixture(); doc.nodes[0]!.parentId = 'group'; doc.nodes.push(nodeSchema.parse({ id: 'group', name: 'Group', type: 'group', x: 40 }));
    const svg = renderSVG(parseDocument(doc)); expect(svg.indexOf('data-node-id="group"')).toBeLessThan(svg.indexOf('data-node-id="box"'));
  });
  it('groups a drag into one undo, branches after undo, and rejects edits atomically', () => {
    const history = new DocumentHistory(fixture());
    for (const x of [20, 30, 40]) history.edit('Move', d => { d.nodes[0]!.x = x; }, { group: 'drag-1' });
    expect(history.getSnapshot().document.nodes[0]!.x).toBe(40); history.undo(); expect(history.getSnapshot().document.nodes[0]!.x).toBe(10);
    history.redo(); expect(history.getSnapshot().document.nodes[0]!.x).toBe(40);
    const before = history.getSnapshot(); expect(() => history.edit('Bad edit', d => { d.nodes[0]!.x = NaN; })).toThrow(); expect(history.getSnapshot()).toBe(before);
    history.undo(); history.edit('Name', d => { d.name = 'New'; }); expect(history.getSnapshot().canRedo).toBe(false);
  });
  it('deleting a group deletes descendant animation references atomically', () => {
    const doc = fixture(); doc.nodes.push(nodeSchema.parse({ id: 'group', name: 'Group', type: 'group' })); doc.nodes[0]!.parentId = 'group';
    deleteNodes(doc, ['group']); expect(doc.nodes).toHaveLength(0); expect(doc.clips[0]!.tracks).toHaveLength(0); expect(validateDocument(doc).success).toBe(true);
  });
});

it('finishes a blend even when the destination clip ends before it', () => {
  const doc = fixture(); doc.clips.push({ id: 'short', name: 'Short', duration: 50, tracks: [{ id: 'short-x', nodeId: 'box', property: 'x', keyframes: [{ time: 0, value: 210, easing: 'linear' }] }] }); doc.states.push({ id: 'short-state', name: 'Short', clipId: 'short', loop: false }); doc.transitions.push({ id: 'long-blend', from: 'idle', to: 'short-state', duration: 500, easing: 'linear', trigger: { type: 'event', event: 'go' } });
  const player = new ForgePlayer(doc); let completions = 0; player.onEvent(e => { if (e.type === 'complete') completions++; }); player.send('go'); player.advance(50);
  expect(player.getSnapshot()).toMatchObject({ playing: true, transitioning: true, time: 50 });
  player.advance(450); expect(player.getSnapshot()).toMatchObject({ playing: false, transitioning: false, time: 50 }); expect(player.getSnapshot().frame.box!.x).toBe(210); expect(completions).toBe(1);
});
it('maps extreme finite input ranges without overflow', () => {
  const doc = fixture(); doc.inputs.push({ id: 'huge', name: 'Huge', type: 'number', min: -Number.MAX_VALUE, max: Number.MAX_VALUE, default: 0 }); doc.bindings.push({ id: 'huge-x', nodeId: 'box', property: 'x', inputId: 'huge', from: 0, to: 100 });
  expect(sampleDocument(doc, 0).box!.x).toBe(50); expect(sampleDocument(doc, 0, { inputs: { huge: Number.MAX_VALUE } }).box!.x).toBe(100);
});
it('keeps spring overshoot within exportable geometry limits', () => {
  const doc = fixture(); doc.clips[0]!.tracks = [{ id: 'huge-scale', nodeId: 'box', property: 'scaleX', keyframes: [{ time: 0, value: 0, easing: 'spring' }, { time: 1000, value: 100, easing: 'linear' }] }];
  for (let time = 0; time < 1000; time += 23) { const frame = sampleDocument(doc, time); expect(frame.box!.scaleX).toBeLessThanOrEqual(100); expect(() => renderSVG(doc, { frame })).not.toThrow(); }
});
it('does not inherit object prototype values as animation inputs', () => {
  const doc = fixture(); doc.inputs.push({ id: 'constructor', name: 'Safe ID', type: 'number', min: 0, max: 100, default: 50 }); doc.bindings.push({ id: 'bind', inputId: 'constructor', nodeId: 'box', property: 'x', from: 0, to: 200 });
  expect(sampleDocument(parseDocument(doc), 0).box!.x).toBe(100);
});
