import { describe, expect, it } from 'vitest';
import { loadScene } from './scene';
import { Player } from './player';
import { check } from './check';
import { prefixIds, renderSVG } from './render';
import { parseXML, serializeXML } from './xml';

const source = (motion: object, body = '<circle id="c" cx="50" cy="50" r="10"/>') => `<svg viewBox="0 0 100 100">${body}<metadata type="application/motion+json"><![CDATA[${JSON.stringify(motion)}]]></metadata></svg>`;

describe('untrusted documents', () => {
  it.each(['<html><img src="x" onerror="alert(1)"/></html>', '<script>alert(1)</script>', '<evil:svg/>'])('fails closed for %s', input => {
    const scene = loadScene(input);
    expect(scene.ok).toBe(false);
    expect(renderSVG(scene)).toMatch(/^<svg /);
    expect(renderSVG(scene)).not.toMatch(/onerror|script|img|evil/);
  });
  it('rejects oversized and deeply nested files with diagnostics', () => {
    for (const input of ['<svg>' + '<g>'.repeat(200) + '</g>'.repeat(200) + '</svg>', '<svg>' + ' '.repeat(2_000_001) + '</svg>']) {
      expect(loadScene(input).diagnostics.some(d => d.code === 'svg.xml')).toBe(true);
    }
  });
  it('rejects duplicate XML attributes', () => {
    expect(loadScene('<svg viewBox="0 0 10 10" viewBox="0 0 20 20"/>').ok).toBe(false);
  });
  it('turns pathological motion expressions into diagnostics instead of crashing the host', () => {
    const condition = '('.repeat(15000) + 'value' + ')'.repeat(15000);
    const scene = loadScene(source({ inputs: { value: false }, states: { idle: { when: { [condition]: 'done' } }, done: {} } }));
    expect(scene.ok).toBe(false);
    expect(() => renderSVG(scene)).not.toThrow();
  });
  it('rejects malicious paint fallbacks', () => {
    expect(renderSVG(loadScene('<svg><circle fill="url(#local) url(https://example.com/paint)"/></svg>'))).not.toContain('example.com');
  });
  it('diagnoses invalid text precision and still renders safely', () => {
    const scene = loadScene(source({ inputs: { n: 0 }, states: { idle: {} }, bind: { '#t': { text: '{n:101}' } } }, '<text id="t">0</text>'));
    expect(check(scene).diagnostics.some(d => d.message.includes('precision'))).toBe(true);
    expect(() => renderSVG(scene)).not.toThrow();
  });
  it('isolates accessible references as well as gradients and use elements', () => {
    const root = parseXML('<svg aria-labelledby="title desc" aria-describedby="desc"><title id="title">A</title><desc id="desc">B</desc><path id="shape"/><use href="#shape"/></svg>');
    prefixIds(root, 'a-');
    expect(serializeXML(root)).toContain('aria-labelledby="a-title a-desc"');
    expect(serializeXML(root)).toContain('aria-describedby="a-desc"');
    expect(serializeXML(root)).toContain('href="#a-shape"');
  });
});

describe('state-machine boundaries', () => {
  it('keeps timer-only states active and consumes the exact remaining time', () => {
    const scene = loadScene(source({ transition: 0, states: { wait: { duration: 75, next: 'done' }, done: { duration: 100, animate: { '#c': { translateX: [0, 10] } } } } }));
    const large = new Player(scene), small = new Player(scene);
    expect(large.active).toBe(true);
    large.advance(130);
    for (let i = 0; i < 13; i++) small.advance(10);
    expect(large.state).toBe('done');
    expect(large.time).toBe(55);
    expect(large.frame()).toEqual(small.frame());
  });
  it('bounds condition cycles that mutate inputs on entry', () => {
    const scene = loadScene(source({ transition: 0, inputs: { flag: false }, states: { idle: { on: { go: 'a' } }, a: { set: { flag: true }, when: { flag: 'b' } }, b: { set: { flag: false }, when: { '!flag': 'a' } } } }));
    const player = new Player(scene);
    let changes = 0;
    player.on(e => { if (e.type === 'statechange') changes++; });
    expect(() => player.send('go')).not.toThrow();
    expect(changes).toBeLessThanOrEqual(9);
  });
  it('does not treat prototype property names as stored input values', () => {
    const scene = loadScene(source(JSON.parse('{"inputs":{"__proto__":false,"constructor":false},"states":{"idle":{}},"bind":{"#c":{"opacity":{"input":"__proto__","from":0,"to":1}}}}')));
    const player = new Player(scene);
    player.setInput('__proto__', true);
    expect(player.getInput('__proto__')).toBe(true);
    expect(Object.hasOwn(player.inputs, '__proto__')).toBe(true);
    expect(player.frame().get(1)?.get('opacity')).toBe(1);
  });
  it('switches reduced motion at runtime without resetting input targets', () => {
    const scene = loadScene(source({ inputs: { progress: { min: 0, max: 100, smooth: 500 } }, states: { spin: { duration: 1000, loop: true, animate: { '#c': { rotate: [0, 360] } } } }, bind: { '#c': { translateX: { input: 'progress', from: 0, to: 50 } } } }));
    const player = new Player(scene);
    player.setInput('progress', 100);
    player.advance(100);
    player.setReducedMotion(true);
    expect(player.active).toBe(false);
    expect(player.frame().get(1)?.get('rotate')).toBe(0);
    expect(player.frame().get(1)?.get('translateX')).toBe(50);
    player.setReducedMotion(false);
    expect(player.active).toBe(true);
  });
  it('ignores non-finite clock values', () => {
    const player = new Player(loadScene(source({ states: { idle: {} } })));
    player.advance(Infinity);
    player.seek(NaN);
    expect(player.time).toBe(0);
  });
});
