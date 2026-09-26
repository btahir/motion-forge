import { describe, expect, it } from 'vitest';
import { check } from './check';
import { mixColor, parseColor } from './color';
import { parseEasing, spring } from './easing';
import { alignPaths, parsePath, parseTransform, pathLength } from './geometry';
import { Player } from './player';
import { frameAttributes, prefixIds, renderSVG } from './render';
import { sanitize } from './sanitize';
import { loadScene } from './scene';
import { indexTree, parseSelector, selectAll } from './selector';
import { parseXML, serializeXML, XMLError } from './xml';

const motionSVG = (body: string, motion: object, viewBox = '0 0 200 200') =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}"><title>t</title>${body}<metadata type="application/motion+json"><![CDATA[${JSON.stringify(motion)}]]></metadata></svg>`;

describe('xml', () => {
  it('round-trips elements, attributes, entities and CDATA', () => {
    const tree = parseXML('<?xml version="1.0"?><!-- c --><svg a="1 &amp; 2"><text>x &lt; y</text><g/></svg>');
    expect(tree.attrs.a).toBe('1 & 2');
    expect(serializeXML(tree)).toBe('<svg a="1 &amp; 2"><text>x &lt; y</text><g/></svg>');
  });
  it('reports line and column', () => {
    try {
      parseXML('<svg>\n  <g>\n</svg>');
      throw new Error('should fail');
    } catch (e) {
      expect(e).toBeInstanceOf(XMLError);
      expect((e as XMLError).line).toBe(3);
    }
  });
  it('refuses entity declarations', () => {
    expect(() => parseXML('<!DOCTYPE svg [<!ENTITY x "boom">]><svg>&x;</svg>')).toThrow(/Entity/);
  });
});

describe('sanitize', () => {
  it('removes scripts, handlers and external references but keeps geometry', () => {
    const { root, issues } = sanitize(parseXML('<svg><script>alert(1)</script><rect x="5" y="6" width="1" height="1" onclick="x()"/><image href="https://e.com/a.png"/><use href="#r"/><circle fill="url(https://e.com/#p)"/></svg>'));
    const out = serializeXML(root);
    expect(out).not.toMatch(/script|onclick|https/);
    expect(out).toContain('x="5"');
    expect(out).toContain('href="#r"');
    expect(issues.length).toBeGreaterThanOrEqual(3);
  });
  it('folds <style> rules and style="" into attributes by specificity', () => {
    const { root } = sanitize(parseXML('<svg><style>.a{fill:red} #b{fill:blue} rect{stroke:#000}</style><rect class="a" id="b" style="opacity:.5"/><rect class="a"/></svg>'));
    expect(serializeXML(root)).toBe('<svg><rect class="a" id="b" stroke="#000" fill="blue" opacity=".5"/><rect class="a" stroke="#000" fill="red"/></svg>');
  });
  it('extracts the motion block', () => {
    const { motionSource } = sanitize(parseXML('<svg><metadata type="application/motion+json"><![CDATA[{"states":{}}]]></metadata></svg>'));
    expect(motionSource).toBe('{"states":{}}');
  });
});

describe('selectors', () => {
  const tree = parseXML('<svg><g id="a"><circle class="dot"/><circle class="dot big"/></g><rect class="dot"/></svg>');
  const idx = indexTree(tree);
  const q = (s: string) => selectAll(tree, parseSelector(s), idx).map(e => e.name + (e.attrs.class ? '.' + e.attrs.class : ''));
  it('supports ids, classes, types, combinators and nth-child', () => {
    expect(q('.dot')).toEqual(['circle.dot', 'circle.dot big', 'rect.dot']);
    expect(q('#a > *')).toEqual(['circle.dot', 'circle.dot big']);
    expect(q('#a .big')).toEqual(['circle.dot big']);
    expect(q('circle:nth-child(2), rect')).toEqual(['circle.dot big', 'rect.dot']);
  });
});

describe('easing and color', () => {
  it('lands exactly on endpoints', () => {
    for (const name of ['ease', 'out', 'spring', 'spring(300, 8)', 'cubic-bezier(0.2, 1.4, 0.4, 1)', 'bounce', 'elastic', 'steps(4)']) {
      const f = parseEasing(name)!;
      expect(f(0), name).toBeCloseTo(0, 5);
      expect(f(1), name).toBeCloseTo(1, 5);
    }
    expect(Math.max(...Array.from({ length: 50 }, (_, i) => spring(220, 10)(i / 50)))).toBeGreaterThan(1); // underdamped springs overshoot
    expect(parseEasing('wobbly')).toBeUndefined();
  });
  it('parses CSS colors and mixes in OKLab', () => {
    expect(parseColor('#f00')).toEqual([1, 0, 0, 1]);
    expect(parseColor('rgb(0 128 255 / 50%)')![3]).toBe(0.5);
    expect(parseColor('hsl(120, 100%, 50%)')!.map(v => Math.round(v * 255))).toEqual([0, 255, 0, 255]);
    const mid = mixColor([1, 0, 0, 1], [0, 0, 1, 1], 0.5);
    expect(mid[0]).toBeGreaterThan(0.4); // not muddy gray
    expect(mixColor([1, 0, 0, 0], [0, 0, 1, 1], 0.5)[2]).toBeGreaterThan(0.9); // transparent borrows hue
  });
});

describe('geometry', () => {
  it('parses every path command form', () => {
    const p = parsePath('M10 10h10v10H10zm5 5l1-1 1 1q1 1 2 0t2 0c1 1 2 1 3 0s2-1 3 0a2 2 0 011 1A3 3 0 1 0 40 40')!;
    expect(p.length).toBe(2);
    expect(p[0]!.closed).toBe(true);
    expect(pathLength(parsePath('M0 0 L30 40')!)).toBeCloseTo(50, 3);
    expect(pathLength(parsePath('M10 0 A10 10 0 1 1 -10 0 A10 10 0 1 1 10 0')!)).toBeCloseTo(2 * Math.PI * 10, 0);
  });
  it('parses transform lists', () => {
    expect(parseTransform('translate(10 20) scale(2)')).toEqual([2, 0, 0, 2, 10, 20]);
    expect(parseTransform('rotate(90 10 10)')!.map(v => Math.round(v) + 0)).toEqual([0, 1, -1, 0, 20, 0]);
    expect(parseTransform('nonsense')).toBeUndefined();
  });
  it('aligns shapes with different point counts for morphing', () => {
    const [a, b] = alignPaths(parsePath('M0 0L10 0L10 10Z')!, parsePath('M0 0L10 0L10 10L0 10L5 5Z')!);
    expect(a[0]!.segs.length).toBe(b[0]!.segs.length);
  });
});

describe('scene + player', () => {
  const svg = motionSVG('<g id="arm"><rect x="100" y="100" width="20" height="60"/></g><circle id="c" cx="50" cy="50" r="10" fill="#000"/><circle class="d" cx="10" cy="190" r="2"/><circle class="d" cx="20" cy="190" r="2"/>', {
    inputs: { level: { type: 'number', min: 0, max: 100, default: 0 }, on: false },
    states: {
      idle: { duration: 1000, loop: true, animate: { '#arm': { rotate: [0, 90, 0], origin: 'top' }, '.d': { translateY: { '0%': 0, '50%': -5, '100%': 0 }, stagger: 250 } }, on: { go: 'burst' }, when: { 'level > 50': 'hot' } },
      burst: { duration: 400, animate: { '#c': { r: [10, 30] } }, next: 'idle', emit: 'burst-start' },
      hot: { animate: { '#c': { fill: '#ff0000' } }, when: { 'level <= 50': 'idle' } },
    },
    bind: { '#c': { 'fill-opacity': { input: 'level', from: 0.2, to: 1 } } },
    transition: 0,
  });
  it('loads cleanly', () => {
    const s = loadScene(svg);
    expect(s.diagnostics.filter(d => d.level === 'error')).toEqual([]);
    expect(s.origins.get(s.elements.findIndex(e => e.attrs.id === 'arm'))).toEqual([110, 100]);
  });
  it('samples keyframes with the origin applied', () => {
    const s = loadScene(svg);
    const p = new Player(s);
    p.advance(250);
    const arm = s.elements.findIndex(e => e.attrs.id === 'arm');
    expect(p.frame().get(arm)!.get('rotate')).toBeGreaterThan(40);
    expect(frameAttributes(s, p.frame()).get(arm)!.transform).toMatch(/^translate\(110 100\) rotate\([\d.]+\) translate\(-110 -100\)$/);
  });
  it('staggers matched elements and wraps loops', () => {
    const s = loadScene(svg);
    const p = new Player(s, { hold: true });
    p.seek(250);
    const dots = s.elements.map((e, i) => (e.attrs.class === 'd' ? i : -1)).filter(i => i >= 0);
    const f = p.frame();
    expect(f.get(dots[0]!)!.get('translateY')).toBeCloseTo(-2.5, 0);
    expect(f.get(dots[1]!)!.get('translateY')).toBeCloseTo(0, 5);
  });
  it('handles events, emits, next, and conditions', () => {
    const s = loadScene(svg);
    const p = new Player(s);
    const events: string[] = [];
    p.on(e => events.push(e.type === 'statechange' ? `${e.from}>${e.to}` : e.type === 'emit' ? `emit:${e.name}` : e.type));
    expect(p.send('nope')).toBe(false);
    p.send('go');
    expect(p.state).toBe('burst');
    p.advance(450);
    expect(p.state).toBe('idle');
    p.setInput('level', 80);
    expect(p.state).toBe('hot');
    p.setInput('level', 10);
    expect(p.state).toBe('idle');
    expect(events).toEqual(['idle>burst', 'emit:burst-start', 'complete', 'burst>idle', 'input', 'idle>hot', 'input', 'hot>idle']);
  });
  it('blends from what is on screen when interrupted', () => {
    const s = loadScene(motionSVG('<circle id="c" cx="50" cy="50" r="10"/>', { states: { a: { animate: { '#c': { translateX: 0 } } }, b: { animate: { '#c': { translateX: 100 } } } }, on: { a: 'a', b: { to: 'b', blend: 200, ease: 'linear' } } }));
    const p = new Player(s);
    p.send('b');
    p.advance(100);
    const c = s.elements.findIndex(e => e.attrs.id === 'c');
    expect(p.frame().get(c)!.get('translateX')).toBeCloseTo(50, 5);
  });
  it('binds inputs with maps and text templates, with smoothing', () => {
    const s = loadScene(motionSVG('<rect id="bar" x="0" y="0" width="0" height="4"/><text id="t" x="0" y="20">0</text>', {
      inputs: { v: { type: 'number', min: 0, max: 100, default: 0, smooth: 200 } },
      states: { idle: {} },
      bind: { '#bar': { width: { input: 'v', map: { 0: 0, 50: 80, 100: 100 } } }, '#t': { text: '{v:1}%' } },
    }));
    const p = new Player(s);
    p.setInput('v', 50, true);
    const bar = s.elements.findIndex(e => e.attrs.id === 'bar');
    const t = s.elements.findIndex(e => e.attrs.id === 't');
    expect(p.frame().get(bar)!.get('width')).toBe(80);
    expect(p.frame().get(t)!.get('text')).toBe('50.0%');
    p.setInput('v', 100);
    p.advance(16);
    const w = p.frame().get(bar)!.get('width') as number;
    expect(w).toBeGreaterThan(80);
    expect(w).toBeLessThan(100);
  });
  it('runs layers in parallel', () => {
    const s = loadScene(motionSVG('<circle id="eye" cx="10" cy="10" r="5"/><rect id="b" width="10" height="10"/>', {
      states: { idle: { duration: 1000, loop: true, animate: { '#b': { rotate: [0, 360] } } } },
      layers: { blink: { states: { open: { duration: 500, loop: true, animate: { '#eye': { scaleY: [1, 0.1, 1] } } } } } },
    }));
    const p = new Player(s);
    p.advance(250);
    const eye = s.elements.findIndex(e => e.attrs.id === 'eye');
    expect(p.frame().get(eye)!.get('scaleY')).toBeCloseTo(0.1, 1);
    expect(p.stateOf('blink')).toBe('open');
  });
  it('freezes loops and completes one-shots under reduced motion', () => {
    const s = loadScene(svg);
    const p = new Player(s, { reducedMotion: true });
    p.advance(500);
    const arm = s.elements.findIndex(e => e.attrs.id === 'arm');
    expect(p.frame().get(arm)!.get('rotate')).toBe(0);
    p.send('go');
    const c = s.elements.findIndex(e => e.attrs.id === 'c');
    expect(p.frame().get(c)!.get('r')).toBe(30);
  });
  it('draws strokes with dash arrays and hides zero-length caps', () => {
    const s = loadScene(motionSVG('<path id="p" d="M0 0 L100 0" stroke="#000"/>', { states: { a: { duration: 100, animate: { '#p': { draw: [0, 1] } } } } }));
    const p = new Player(s, { hold: true });
    const k = s.elements.findIndex(e => e.attrs.id === 'p');
    p.seek(50);
    expect(frameAttributes(s, p.frame()).get(k)!['stroke-dasharray']).toMatch(/^50 /);
    p.seek(0);
    expect(Number(frameAttributes(s, p.frame()).get(k)!['stroke-dashoffset'])).toBeLessThan(-100);
    p.seek(100);
    expect(frameAttributes(s, p.frame()).get(k)!['stroke-dasharray']).toBe('none');
  });
  it('morphs paths with different structures', () => {
    const s = loadScene(motionSVG('<path id="p" d="M0 0 L10 0 L10 10 Z"/>', { states: { a: { duration: 100, animate: { '#p': { d: ['M0 0 L10 0 L10 10 Z', 'M0 0 C 5 -5 10 5 10 10 L 0 10 L 5 5 Z'] } } } } }));
    const svgOut = renderSVG(s, { time: 50 });
    expect(svgOut).toMatch(/d="M[^"]*C[^"]*Z"/);
  });
});

describe('diagnostics', () => {
  it('explains mistakes with paths and suggestions', () => {
    const s = loadScene(motionSVG('<rect id="button" width="10" height="10"/><g id="grp"/>', {
      states: { idle: { animate: { '#buton': { opacity: 0 }, '#grp': { x: 5 }, '#button': { rotation: 10, blur: 2 } }, on: { go: 'idel' }, nxt: 'idle' } },
    }));
    const msgs = s.diagnostics.filter(d => d.level === 'error').map(d => `${d.at} | ${d.message} | ${d.hint ?? ''}`);
    expect(msgs.some(m => m.includes('#buton') && m.includes('Did you mean "#button"'))).toBe(true);
    expect(msgs.some(m => m.includes('"x" has no effect on <g#grp>') && m.includes('translateX'))).toBe(true);
    expect(msgs.some(m => m.includes('Unknown property "blur"') && m.includes('feGaussianBlur'))).toBe(true);
    expect(msgs.some(m => m.includes('Unknown target state "idel"') && m.includes('Did you mean "idle"'))).toBe(true);
    expect(msgs.some(m => m.includes('Unknown state key "nxt"') && m.includes('"next"'))).toBe(true);
    // rotation is an accepted alias
    expect(msgs.some(m => m.includes('rotation'))).toBe(false);
  });
  it('locates JSON syntax errors in the file', () => {
    const s = loadScene('<svg viewBox="0 0 10 10">\n<metadata type="application/motion+json"><![CDATA[\n{ "states": { "a": {}, } }\n]]></metadata></svg>');
    const d = s.diagnostics.find(d => d.code === 'motion.json')!;
    expect(d.at).toMatch(/file line 3/);
  });
  it('lints loop seams, overflow, static channels and unreachable states', () => {
    const r = check(motionSVG('<circle id="c" cx="100" cy="100" r="20"/><circle id="s" cx="30" cy="30" r="5"/>', {
      states: {
        idle: { duration: 1000, loop: true, animate: { '#c': { translateX: [0, 30], scale: { '0%': 1, '100%': 1 } }, '#s': { translateY: [0, -60, 0] } } },
        orphan: { animate: { '#c': { opacity: 0 } } },
      },
    }));
    const codes = r.diagnostics.map(d => d.code);
    expect(codes).toContain('motion.loop-seam');
    expect(codes).toContain('motion.static');
    expect(codes).toContain('motion.overflow');
    expect(codes).toContain('motion.unreachable');
    expect(r.ok).toBe(true);
  });
});

describe('render', () => {
  it('prefixes ids and references for multiple instances', () => {
    const tree = parseXML('<svg><defs><linearGradient id="g"/></defs><rect fill="url(#g)"/><use href="#g"/><rect fill="url(#other)"/></svg>');
    prefixIds(tree, 'x-');
    expect(serializeXML(tree)).toBe('<svg><defs><linearGradient id="x-g"/></defs><rect fill="url(#x-g)"/><use href="#x-g"/><rect fill="url(#other)"/></svg>');
  });
  it('renders plain SVG without a motion block', () => {
    const out = renderSVG(loadScene('<svg viewBox="0 0 10 10"><rect width="5" height="5" style="fill:red"/></svg>'));
    expect(out).toContain('fill="red"');
  });
});

describe('second-pass features', () => {
  const idx = (s: ReturnType<typeof loadScene>, id: string) => s.elements.findIndex(e => e.attrs.id === id);
  it('settles into the state matching initial inputs without replaying transitions', () => {
    const s = loadScene(motionSVG('<circle id="c" cx="10" cy="10" r="5"/>', {
      inputs: { on: false },
      states: { off: { when: { on: 'popping' } }, popping: { duration: 500, animate: { '#c': { r: [5, 9] } }, next: 'onState' }, onState: { animate: { '#c': { r: 9 } }, when: { '!on': 'off' } } },
    }));
    const p = new Player(s, { inputs: { on: true } });
    expect(p.state).toBe('onState');
    expect(p.frame().get(idx(s, 'c'))!.get('r')).toBe(9);
  });
  it('supports spring smoothing that overshoots and conditions on displayed values', () => {
    const s = loadScene(motionSVG('<rect id="b" width="1" height="1"/>', {
      inputs: { v: { type: 'number', min: 0, max: 100, default: 0, smooth: 'spring(300, 10)' } },
      states: { a: { when: { '~v >= 100': 'b' } }, b: {} },
      bind: { '#b': { width: { input: 'v', from: 0, to: 100 } } },
    }));
    const p = new Player(s);
    p.setInput('v', 100);
    expect(p.state).toBe('a'); // target reached, displayed value not yet
    let peak = 0;
    for (let i = 0; i < 60; i++) {
      p.advance(16);
      peak = Math.max(peak, p.frame().get(idx(s, 'b'))!.get('width') as number);
    }
    expect(peak).toBeGreaterThan(100);
    expect(p.state).toBe('b');
  });
  it('sets inputs on state entry and composes additive bindings and layers', () => {
    const s = loadScene(motionSVG('<g id="g"><rect width="10" height="10"/></g>', {
      inputs: { tilt: { type: 'number', min: -1, max: 1, default: 0 }, n: { type: 'number', min: 0, max: 10, default: 5 } },
      states: { idle: { animate: { '#g': { rotate: 10 } }, on: { reset: 'zero' } }, zero: { set: { n: 0 } } },
      layers: { sway: { add: true, states: { s: { animate: { '#g': { translateX: 4 } } } } } },
      bind: { '#g': { rotate: { input: 'tilt', from: -20, to: 20, add: true } } },
    }));
    const p = new Player(s, { inputs: { tilt: 0.5 } });
    const g = p.frame().get(idx(s, 'g'))!;
    expect(g.get('rotate')).toBeCloseTo(20, 5);
    expect(g.get('translateX')).toBeCloseTo(4, 5);
    p.send('reset');
    expect(p.getInput('n')).toBe(0);
  });
  it('curves smoothly through keyframes', () => {
    const s = loadScene(motionSVG('<circle id="c" cx="0" cy="0" r="1"/>', { states: { a: { duration: 300, animate: { '#c': { translateX: [0, 10, 0, -10], curve: 'smooth', ease: 'linear' } } } } }));
    const p = new Player(s, { hold: true });
    p.seek(100);
    expect(p.frame().get(idx(s, 'c'))!.get('translateX')).toBeCloseTo(10, 5);
    p.seek(90); // approaching the peak, velocity has not stopped
    expect(p.frame().get(idx(s, 'c'))!.get('translateX')).toBeGreaterThan(9.5);
  });
  it('flags layer conflicts and respects allowOverflow', () => {
    const r = check(motionSVG('<circle id="c" cx="100" cy="100" r="20"/>', {
      states: { a: { duration: 1000, loop: true, animate: { '#c': { rotate: [0, 360] } } }, fly: { allowOverflow: true, duration: 500, animate: { '#c': { translateY: [0, -400] } } } },
      on: { go: 'fly' },
      layers: { spin: { states: { s: { duration: 1000, loop: true, animate: { '#c': { rotate: [0, 360] } } } } } },
    }));
    const codes = r.diagnostics.map(d => d.code);
    expect(codes).toContain('motion.conflict');
    expect(codes).not.toContain('motion.overflow');
  });
  it('rests strokes at data-draw', () => {
    const s = loadScene(motionSVG('<path id="p" d="M0 0L100 0" stroke="#000" data-draw="0"/>', { states: { a: { animate: { '#p': { opacity: 1 } } }, b: { duration: 100, animate: { '#p': { draw: [0, 1] } } } } }));
    const attrs = frameAttributes(s, new Player(s).frame()).get(idx(s, 'p'))!;
    expect(Number(attrs['stroke-dashoffset'])).toBeLessThan(-100);
  });
  it('clamps bindings whose map covers part of the input range, and smooths in exactly `smooth` ms', () => {
    const s = loadScene(motionSVG('<g id="leaf"><rect width="4" height="4"/></g>', {
      inputs: { streak: { type: 'number', min: 0, max: 30, default: 0, smooth: 300 } },
      states: { a: { when: { '~streak >= 30': 'b' } }, b: {} },
      bind: { '#leaf': { scale: { input: 'streak', map: { 3: 0, 5: 1 } } } },
    }));
    const p = new Player(s);
    expect(p.frame().get(idx(s, 'leaf'))!.get('scale')).toBe(0);
    p.setInput('streak', 30);
    p.advance(280);
    expect(p.state).toBe('a');
    p.advance(40);
    expect(p.state).toBe('b');
    expect(p.frame().get(idx(s, 'leaf'))!.get('scale')).toBe(1);
  });
});
