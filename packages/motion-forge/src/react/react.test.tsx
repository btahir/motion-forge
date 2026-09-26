// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, createRef, StrictMode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { renderToString } from 'react-dom/server';
import { MotionForge, ForgeSVG, type MotionForgeHandle } from './index';
import { createPreset } from '../presets';

let root: Root, container: HTMLDivElement, raf: Map<number, FrameRequestCallback>, next: number, motion: boolean;
let mediaListeners: Set<() => void>;
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  container = document.createElement('div'); document.body.append(container); root = createRoot(container);
  raf = new Map(); next = 0; motion = false; mediaListeners = new Set();
  vi.stubGlobal('requestAnimationFrame', (fn: FrameRequestCallback) => { raf.set(++next, fn); return next; });
  vi.stubGlobal('cancelAnimationFrame', (id: number) => raf.delete(id));
  vi.stubGlobal('matchMedia', () => ({ get matches() { return motion; }, addEventListener: (_: string, fn: () => void) => mediaListeners.add(fn), removeEventListener: (_: string, fn: () => void) => mediaListeners.delete(fn) }));
});
afterEach(() => { act(() => root.unmount()); container.remove(); vi.unstubAllGlobals(); });
function tick(now: number) { const pending = [...raf.values()]; raf.clear(); act(() => { for (const fn of pending) fn(now); }); }

describe('React host', () => {
  it('renders an accessible complete SVG on the server', () => {
    const html = renderToString(<MotionForge document={createPreset('scout')}/>);
    expect(html).toContain('<title'); expect(html).toContain('Scout'); expect(html).toContain('data-node-id="visor"'); expect(html).not.toContain('undefined');
  });
  it('namespaces gradients between adjacent instances', () => {
    const doc = createPreset('scout');
    doc.gradients.push({ id: 'color', type: 'linear', x1: 0, y1: 0, x2: 1, y2: 1, stops: [{ offset: 0, color: '#000000', opacity: 1 }, { offset: 1, color: '#ffffff', opacity: 1 }] }); doc.nodes[0]!.fill = 'url(#color)';
    const html = renderToString(<><ForgeSVG document={doc}/><ForgeSVG document={doc}/></>);
    const ids = [...html.matchAll(/<linearGradient id="([^"]+)"/g)].map(m => m[1]);
    expect(ids).toHaveLength(2); expect(new Set(ids).size).toBe(2); ids.forEach(id => expect(html).toContain(`url(#${id})`));
  });
  it('has one RAF chain in StrictMode and cleans up on unmount', () => {
    const ref = createRef<MotionForgeHandle>(); const doc = createPreset('scout');
    act(() => root.render(<StrictMode><MotionForge ref={ref} document={doc}/></StrictMode>));
    expect(raf.size).toBe(1); tick(0); tick(100); tick(200);
    expect(ref.current!.getSnapshot().time).toBe(200); expect(raf.size).toBe(1);
    act(() => root.unmount()); expect(raf.size).toBe(0); expect(mediaListeners.size).toBe(0);
    root = createRoot(container);
  });
  it('supports refs, events, controlled inputs and source replacement', () => {
    const ref = createRef<MotionForgeHandle>(); const onEvent = vi.fn();
    act(() => root.render(<MotionForge ref={ref} document={createPreset('scout')} autoplay={false} onEvent={onEvent}/>));
    expect(raf.size).toBe(0); act(() => { ref.current!.seek(400); ref.current!.send('wave'); });
    expect(onEvent).toHaveBeenCalledWith({ type: 'statechange', from: 'idle', to: 'waving' });
    act(() => root.render(<MotionForge ref={ref} document={createPreset('signal')} inputs={{ intensity: 100 }}/>));
    expect(ref.current!.getSnapshot().frame.needle!.rotation).toBe(135);
    expect(container.querySelector('[data-node-id="needle"]')?.getAttribute('transform')).toContain('rotate(135)');
  });
  it('honors reduced motion at mount and on preference changes', () => {
    motion = true; const ref = createRef<MotionForgeHandle>();
    act(() => root.render(<MotionForge ref={ref} document={createPreset('scout')}/>));
    expect(ref.current!.getSnapshot().playing).toBe(false); expect(ref.current!.getSnapshot().time).toBe(3200); expect(raf.size).toBe(0);
    act(() => { motion = false; mediaListeners.forEach(fn => fn()); }); expect(raf.size).toBe(1);
    act(() => { motion = true; mediaListeners.forEach(fn => fn()); }); expect(raf.size).toBe(0);
  });
  it('does not add hidden-tab elapsed time when visibility resumes', () => {
    const ref = createRef<MotionForgeHandle>();
    act(() => root.render(<MotionForge ref={ref} document={createPreset('scout')}/>)); tick(0); tick(100);
    Object.defineProperty(document, 'hidden', { value: true, configurable: true });
    act(() => document.dispatchEvent(new Event('visibilitychange'))); expect(raf.size).toBe(0);
    Object.defineProperty(document, 'hidden', { value: false, configurable: true });
    act(() => document.dispatchEvent(new Event('visibilitychange'))); tick(100000); tick(100100);
    expect(ref.current!.getSnapshot().time).toBe(200);
  });
});
