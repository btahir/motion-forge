// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { renderToString } from 'react-dom/server';
import { createElement } from 'react';
import { mount } from './mount';
import { defineMotionForge } from './element';
import { MotionForge } from '../react';

const LIKE = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><title>Like</title>
<defs><linearGradient id="g"><stop offset="0" stop-color="#f00"/></linearGradient></defs>
<circle id="heart" cx="50" cy="50" r="20" fill="#cccccc"/><rect id="bg" width="10" height="10" fill="url(#g)"/>
<metadata type="application/motion+json"><![CDATA[{
  "inputs": { "liked": false },
  "states": {
    "off": { "animate": { "#heart": { "fill": "#cccccc" } }, "when": { "liked": "on" } },
    "on": { "animate": { "#heart": { "fill": "#ff0000", "scale": 1.2 } }, "when": { "!liked": "off" }, "emit": "liked" }
  },
  "transition": 0,
  "interactions": [{ "on": "click", "target": "#heart", "toggle": "liked" }]
}]]></metadata></svg>`;

describe('mount', () => {
  it('renders, prefixes ids, and runs click interactions without host code', async () => {
    const host = document.createElement('div');
    document.body.append(host);
    const events: string[] = [];
    const inst = mount(host, LIKE, { reducedMotion: false, onEvent: e => e.type === 'emit' && events.push(e.name) });
    const heart = host.querySelector('[id$="heart"]')!;
    expect(host.querySelector('rect')!.getAttribute('fill')).toMatch(/^url\(#mf\d+-g\)$/);
    expect(heart.getAttribute('role')).toBe('button');
    expect(heart.getAttribute('tabindex')).toBe('0');
    heart.dispatchEvent(new Event('click'));
    expect(inst.get('liked')).toBe(true);
    expect(inst.state).toBe('on');
    await new Promise(r => setTimeout(r, 50));
    expect(heart.getAttribute('fill')).toBe('#ff0000');
    expect(events).toEqual(['liked']);
    heart.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
    expect(inst.get('liked')).toBe(false);
    inst.destroy();
    expect(host.children.length).toBe(0);
  });
  it('keeps two instances independent', () => {
    const a = document.createElement('div'), b = document.createElement('div');
    const ia = mount(a, LIKE), ib = mount(b, LIKE);
    ia.set('liked', true);
    expect(ib.get('liked')).toBe(false);
    expect(a.querySelector('linearGradient')!.id).not.toBe(b.querySelector('linearGradient')!.id);
  });
});

describe('web component', () => {
  it('upgrades inline SVG and exposes send/set', async () => {
    defineMotionForge();
    const el = document.createElement('motion-forge') as HTMLElement & { set(i: string, v: boolean): void; get(i: string): unknown };
    el.innerHTML = LIKE;
    const onChange = vi.fn();
    el.addEventListener('statechange', onChange);
    document.body.append(el);
    expect(el.shadowRoot!.querySelector('svg')).toBeTruthy();
    el.set('liked', true);
    expect(el.get('liked')).toBe(true);
    expect(onChange).toHaveBeenCalled();
    expect(el.style.aspectRatio).toBe('100 / 100');
  });
});

describe('react', () => {
  it('server-renders the static first frame', () => {
    const html = renderToString(createElement(MotionForge, { svg: LIKE, inputs: { liked: true } }));
    expect(html).toContain('<svg');
    expect(html).toContain('aspect-ratio:100 / 100');
    expect(html).not.toContain('metadata');
  });
});
