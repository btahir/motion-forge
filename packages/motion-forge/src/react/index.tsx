import { forwardRef, useEffect, useId, useImperativeHandle, useMemo, useRef, useState, type CSSProperties } from 'react';
import { Player, type PlayerEvent } from '../core/player';
import { prefixIds, renderFrameTree } from '../core/render';
import { serializeXML } from '../core/xml';
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
  /** Fetch or validation failure. */
  onError?: (error: Error) => void;
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
  const id = useId();
  const [fetched, setFetched] = useState<{ src: string; text: string }>();
  const source = svg ?? (fetched?.src === src ? fetched?.text : undefined);

  useEffect(() => {
    if (!src || svg !== undefined) return;
    let alive = true;
    const controller = new AbortController();
    fetch(src, { signal: controller.signal })
      .then(r => (r.ok ? r.text() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then(t => alive && setFetched({ src, text: t }))
      .catch(e => {
        if (alive) callbacks.current.onError?.(e instanceof Error ? e : new Error(String(e)));
      });
    return () => {
      alive = false;
      controller.abort();
    };
  }, [src, svg]);

  const scene: Scene | undefined = useMemo(() => (source ? loadScene(source) : undefined), [source]);
  // Server and first client render share this static markup, so hydration matches.
  const initialMarkup = useMemo(() => {
    if (!scene?.ok) return '';
    try {
      const tree = renderFrameTree(scene, new Player(scene, { state, inputs, reducedMotion: reducedMotion === true }).frame());
      prefixIds(tree, `mf-${id}-`);
      tree.attrs.width = '100%';
      tree.attrs.height = '100%';
      tree.attrs.style = 'display:block';
      tree.attrs.role = scene.interactions.length ? 'group' : 'img';
      if (title ?? scene.title) tree.attrs['aria-label'] = (title ?? scene.title)!;
      return serializeXML(tree);
    } catch {
      return '';
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scene, id]);

  useEffect(() => {
    if (!scene || !host.current) return;
    if (!scene.ok) {
      callbacks.current.onError?.(new Error(scene.diagnostics.filter(d => d.level === 'error').map(d => `${d.at ?? ''}: ${d.message}`).join('\n')));
      return;
    }
    const inst = mount(host.current, scene, {
      state: callbacks.current.state,
      inputs: callbacks.current.inputs,
      autoplay: callbacks.current.autoplay,
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
  }, [scene, reducedMotion]);

  useEffect(() => {
    const inst = instance.current;
    if (inst) autoplay === false ? inst.pause() : inst.play();
  }, [autoplay, scene]);

  useEffect(() => {
    const svg = instance.current?.svg;
    if (svg) {
      const label = title ?? scene?.title;
      if (label) svg.setAttribute('aria-label', label);
      else svg.removeAttribute('aria-label');
    }
  }, [title, scene]);

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
