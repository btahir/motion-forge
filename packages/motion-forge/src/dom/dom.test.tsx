// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderToString } from 'react-dom/server';
import { act, createElement, createRef } from 'react';
import { createRoot, hydrateRoot } from 'react-dom/client';
import { mount } from './mount';
import { defineMotionForge } from './element';
import { MotionForge, type MotionForgeHandle } from '../react';
import type { MotionForgeElement } from './element';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
afterEach(() => { document.body.replaceChildren(); vi.unstubAllGlobals(); });

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
    ia.destroy(); ib.destroy();
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
  it('isolates IDs and renders accessible titles before hydration', () => {
    const host = document.createElement('div');
    host.innerHTML = renderToString(createElement('div', null, createElement(MotionForge, { svg: LIKE, title: 'First' }), createElement(MotionForge, { svg: LIKE, title: 'Second' })));
    const ids = [...host.querySelectorAll('[id]')].map(e => e.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(host.querySelector('svg')?.getAttribute('aria-label')).toBe('First');
    expect(host.querySelector('svg')?.getAttribute('width')).toBe('100%');
  });
  it('never server-renders untrusted HTML', () => {
    expect(renderToString(createElement(MotionForge, { svg: '<html><img src="x" onerror="alert(1)"/></html>' }))).not.toContain('<img');
  });
  it('hydrates without errors and preserves playback state across prop updates', async () => {
    const host = document.createElement('div');
    const ref = createRef<MotionForgeHandle>();
    const props = { svg: LIKE, inputs: { liked: true }, autoplay: false, ref };
    host.innerHTML = renderToString(createElement(MotionForge, props));
    document.body.append(host);
    const errors: unknown[] = [];
    let root: ReturnType<typeof hydrateRoot>;
    await act(async () => { root = hydrateRoot(host, createElement(MotionForge, props), { onRecoverableError: e => errors.push(e) }); });
    expect(ref.current?.state).toBe('on');
    const instance = ref.current?.instance;
    await act(async () => { root!.render(createElement(MotionForge, { ...props, autoplay: true, title: 'Changed' })); });
    expect(ref.current?.instance).toBe(instance);
    expect(ref.current?.instance?.playing).toBe(true);
    expect(ref.current?.state).toBe('on');
    expect(errors).toEqual([]);
    await act(async () => root!.unmount());
  });
  it('clears stale fetched artwork when src changes and reports load failures', async () => {
    const fetcher = vi.fn().mockResolvedValueOnce({ ok: true, text: async () => LIKE }).mockRejectedValueOnce(new Error('offline'));
    vi.stubGlobal('fetch', fetcher);
    const host = document.createElement('div');
    const root = createRoot(host), onError = vi.fn();
    await act(async () => root.render(createElement(MotionForge, { src: '/a.svg', onError })));
    expect(host.querySelector('svg')).toBeTruthy();
    await act(async () => root.render(createElement(MotionForge, { src: '/b.svg', onError })));
    expect(host.querySelector('svg')).toBeNull();
    expect(onError).toHaveBeenCalledWith(expect.objectContaining({ message: 'offline' }));
    await act(async () => root.unmount());
  });
});

describe('web component lifecycle', () => {
  it('settles initial inputs before the first visible frame, even while paused', () => {
    defineMotionForge();
    const el = document.createElement('motion-forge') as MotionForgeElement;
    el.setAttribute('inputs', '{"liked":true}');
    el.setAttribute('paused', '');
    el.svg = LIKE;
    expect(el.motion).toBeUndefined();
    document.body.append(el);
    expect(el.motion?.state).toBe('on');
    expect(el.shadowRoot?.querySelector('[id$="heart"]')?.getAttribute('fill')).toBe('#ff0000');
    el.remove();
  });
  it('cancels detached requests and does not create an orphan animation', async () => {
    defineMotionForge();
    let finish!: (value: unknown) => void;
    const fetcher = vi.fn((_url: string, _options: RequestInit) => new Promise(resolve => { finish = resolve; }));
    vi.stubGlobal('fetch', fetcher);
    const el = document.createElement('motion-forge') as MotionForgeElement;
    el.setAttribute('src', '/a.svg');
    document.body.append(el);
    el.remove();
    finish({ ok: true, text: async () => LIKE });
    await new Promise(r => setTimeout(r, 0));
    expect(el.motion).toBeUndefined();
    expect(fetcher.mock.calls[0]?.[1]?.signal?.aborted).toBe(true);
  });
});

describe('scheduling and accessibility', () => {
  it('does not fork animation loops when player events fire during a frame', () => {
    const queue = new Map<number, FrameRequestCallback>();
    let serial = 0;
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => { queue.set(++serial, cb); return serial; });
    vi.stubGlobal('cancelAnimationFrame', (id: number) => queue.delete(id));
    const svg = '<svg viewBox="0 0 10 10"><metadata type="application/motion+json">{"transition":0,"states":{"a":{"duration":10,"next":"b"},"b":{"duration":10,"next":"a"}}}</metadata></svg>';
    const instance = mount(document.createElement('div'), svg);
    for (let i = 1; i <= 5; i++) {
      const [id, cb] = [...queue][0]!;
      queue.delete(id); cb(i * 16);
      expect(queue.size).toBe(1);
    }
    instance.destroy();
    expect(queue.size).toBe(0);
  });
  it('makes root click actions focusable and announces toggle state', () => {
    const instance = mount(document.createElement('div'), LIKE.replace('"target": "#heart", ', ''));
    expect(instance.svg.getAttribute('tabindex')).toBe('0');
    instance.svg.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
    expect(instance.svg.getAttribute('aria-pressed')).toBe('true');
    instance.svg.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', repeat: true }));
    expect(instance.get('liked')).toBe(true);
    instance.destroy();
  });
  it('supports keyboard press and release, including blur', () => {
    const instance = mount(document.createElement('div'), LIKE.replace('"on": "click"', '"on": "press"').replace('"toggle": "liked"', '"set": "liked"'));
    const heart = instance.svg.querySelector('[id$="heart"]')!;
    expect(heart.getAttribute('tabindex')).toBe('0');
    heart.dispatchEvent(new KeyboardEvent('keydown', { key: ' ' }));
    expect(instance.get('liked')).toBe(true);
    heart.dispatchEvent(new KeyboardEvent('keyup', { key: ' ' }));
    expect(instance.get('liked')).toBe(false);
    heart.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
    heart.dispatchEvent(new Event('blur'));
    expect(instance.get('liked')).toBe(false);
    instance.destroy();
  });
});
