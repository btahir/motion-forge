import { describe, expect, it } from 'vitest';
import { loadScene } from '../core/scene';
import { parseXML, serializeXML, textContent } from '../core/xml';
import { contactSheet, parseScript, recordFrames, recordStrip } from './preview';

const scene = (motion: object) => loadScene(`<svg viewBox="0 0 20 20"><circle id="c" cx="10" cy="10" r="3"/><metadata type="application/motion+json">${JSON.stringify(motion)}</metadata></svg>`);

describe('agent eyes', () => {
  it('covers events outside the initial state and beyond the old six-event cap', () => {
    const states = Object.fromEntries(Array.from({ length: 8 }, (_, i) => [`s${i}`, { on: { [`event${i}`]: `s${(i + 1) % 8}` } }]));
    const sheet = contactSheet(scene({ states, transition: 0 }), { frames: 2, cell: 40 });
    for (let i = 0; i < 8; i++) expect(sheet.rows.some(r => r.title.includes(`send event${i} from main/s${i}`) && r.title.includes(`s${i} → s${(i + 1) % 8}`))).toBe(true);
  });
  it('covers both boolean directions and a single-frame numeric sweep', () => {
    const sheet = contactSheet(scene({ inputs: { active: false, progress: 0 }, states: { idle: {} }, bind: { '#c': { opacity: { input: 'progress', from: 0, to: 1 } } } }), { frames: 1, cell: 40 });
    expect(sheet.rows.some(r => r.title.includes('active false → true'))).toBe(true);
    expect(sheet.rows.some(r => r.title.includes('active true → false'))).toBe(true);
    expect(sheet.svg).not.toContain('NaN');
    expect(sheet.rows.find(r => r.title.includes('input sweep'))?.labels).toEqual(['progress=0']);
  });
  it('names the layer state a flow changes in each frame label', () => {
    const s = scene({
      inputs: { hovered: false },
      states: { idle: {} },
      layers: { hover: { states: { rest: { when: { hovered: 'over' } }, over: { animate: { '#c': { scale: 1.1 } }, when: { '!hovered': 'rest' } } } } },
    });
    const row = contactSheet(s, { frames: 3, cell: 40 }).rows.find(r => r.title.includes('hovered false → true'));
    expect(row?.labels.at(-1)).toMatch(/idle · hover\/over$/);
  });
  it.each(['go@-1', 'go@NaN', 'value=nope@100', 'value=@0', '@1', 'go@1@2', 'goto:@0'])('rejects malformed script %s', value => {
    expect(() => parseScript([value])).toThrow();
  });
  it('applies scripts at their exact timestamp instead of the next video frame', () => {
    const s = scene({ states: { idle: { on: { go: 'done' } }, done: {} }, transition: 0 });
    const { log } = recordStrip(s, { script: parseScript(['go@25']), fps: 10, duration: 200 });
    expect(log.some(l => l.startsWith('25ms') && l.includes('idle → done'))).toBe(true);
  });
  it.each([0, -1, NaN, Infinity, 1000])('rejects invalid recording fps %s', fps => {
    expect(() => recordFrames(scene({ states: { idle: {} } }), { fps }, () => {})).toThrow(/fps/);
  });
  it('reports misspelled preview states', () => {
    expect(() => contactSheet(scene({ states: { idle: {} } }), { states: ['idel'] })).toThrow('Unknown state');
  });
  it('exercises global reset events from completed states', () => {
    const sheet = contactSheet(scene({ states: { idle: {}, done: {} }, on: { reset: 'idle' }, transition: 0 }), { frames: 2, cell: 40 });
    expect(sheet.rows.some(r => r.title.includes('send reset from main/done') && r.title.includes('done → idle'))).toBe(true);
  });
  it('includes script actions in the final frame interval in the event log', () => {
    const { log } = recordStrip(scene({ states: { idle: { on: { go: 'done' } }, done: {} }, transition: 0 }), { script: parseScript(['go@175']), fps: 10, duration: 200 });
    expect(log.some(l => l.startsWith('175ms') && l.includes('idle → done'))).toBe(true);
  });
  it('shows a completed one-shot before resetting it, rather than its blank first frame', () => {
    const sheet = contactSheet(scene({ states: { idle: {}, success: { duration: 100, animate: { '#c': { fill: ['#000000', '#ff0000'] } } } }, on: { reset: 'idle' }, transition: 0 }), { frames: 2, cell: 40 });
    const tree = parseXML(sheet.svg);
    const title = tree.children.findIndex(n => n.type === 'el' && n.name === 'text' && textContent(n).includes('send reset from main/success'));
    const frame = tree.children.slice(title + 1).find(n => n.type === 'el' && n.name === 'svg')!;
    expect(serializeXML(frame)).toContain('fill="#ff0000"');
  });
});
