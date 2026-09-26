import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState, type CSSProperties } from 'react';
import type { PlayerEvent } from '../core/player';
import { renderSVG } from '../core/render';
import { loadScene, type Scene } from '../core/scene';
import { mount, type MotionInstance } from '../dom/mount';

export interface MotionForgeProps {
  /** URL of a Motion SVG file. */
  src?: string;
  /** Motion SVG source (e.g. imported with ?raw). Rendered on the server too. */
  svg?: string;
  /** Controlled input values. */
  inputs?: Record<string, number | boolean>;
  /** Controlled state for the main layer. */
  state?: string;
  autoplay?: boolean;
  reducedMotion?: boolean | 'auto';
  onEvent?: (event: PlayerEvent) => void;
  onStateChange?: (state: string) => void;
  className?: string;
  style?: CSSProperties;
  /** Accessible label; defaults to the file's <title>. */
  title?: string;
}

export interface MotionForgeHandle {
  send(event: string): boolean;
  set(input: string, value: number | boolean): void;
  get(input: string): number | boolean | undefined;
  goto(state: string, blend?: number): boolean;
  play(): void;
  pause(): void;
  readonly state: string | undefined;
  readonly instance: MotionInstance | undefined;
}

export const MotionForge = forwardRef<MotionForgeHandle, MotionForgeProps>(function MotionForge(props, ref) {
  const { src, svg, inputs, state, autoplay, reducedMotion, className, style, title } = props;
  const host = useRef<HTMLDivElement>(null);
  const instance = useRef<MotionInstance | undefined>(undefined);
  const callbacks = useRef(props);
  callbacks.current = props;
  const [fetched, setFetched] = useState<string>();
  const source = svg ?? fetched;

  useEffect(() => {
    if (!src || svg) return;
    let alive = true;
    fetch(src)
      .then(r => (r.ok ? r.text() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then(t => alive && setFetched(t))
      .catch(e => console.warn('[motion-forge] could not load', src, e));
    return () => {
      alive = false;
    };
  }, [src, svg]);

  const scene: Scene | undefined = useMemo(() => (source ? loadScene(source) : undefined), [source]);
  // Server and first client render share this static markup, so hydration matches.
  const initialMarkup = useMemo(() => {
    if (!scene) return '';
    try {
      return renderSVG(scene, { state, inputs }).replace(/ width="[^"]*" height="[^"]*"/, ' width="100%" height="100%" style="display:block"');
    } catch {
      return '';
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scene]);

  useEffect(() => {
    if (!scene || !host.current) return;
    const inst = mount(host.current, scene, {
      state: callbacks.current.state,
      inputs: callbacks.current.inputs,
      autoplay,
      reducedMotion,
      onEvent: e => {
        callbacks.current.onEvent?.(e);
        if (e.type === 'statechange' && e.layer === 'main') callbacks.current.onStateChange?.(e.to);
      },
    });
    if (title) inst.svg.setAttribute('aria-label', title);
    instance.current = inst;
    return () => {
      inst.destroy();
      instance.current = undefined;
    };
  }, [scene, autoplay, reducedMotion, title]);

  useEffect(() => {
    if (!inputs || !instance.current) return;
    for (const [k, v] of Object.entries(inputs)) instance.current.set(k, v);
  }, [inputs, scene]);

  useEffect(() => {
    if (state && instance.current && instance.current.state !== state) instance.current.goto(state, 250);
  }, [state, scene]);

  useImperativeHandle(ref, () => ({
    send: e => instance.current?.send(e) ?? false,
    set: (i, v) => instance.current?.set(i, v),
    get: i => instance.current?.get(i),
    goto: (s, b) => instance.current?.goto(s, b) ?? false,
    play: () => instance.current?.play(),
    pause: () => instance.current?.pause(),
    get state() {
      return instance.current?.state;
    },
    get instance() {
      return instance.current;
    },
  }), []);

  const aspect = scene ? `${scene.viewBox.width} / ${scene.viewBox.height}` : undefined;
  return <div ref={host} className={className} style={{ aspectRatio: aspect, lineHeight: 0, ...style }} dangerouslySetInnerHTML={{ __html: initialMarkup }} />;
});

export type { PlayerEvent };
