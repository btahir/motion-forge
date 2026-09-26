'use client';
import { forwardRef, useEffect, useId, useImperativeHandle, useMemo, useRef, useSyncExternalStore, type ReactNode, type SVGProps } from 'react';
import { ForgePlayer, type PlayerEvent, type PlayerSnapshot } from '../core/player';
import { nodeTransform } from '../core/render';
import { parseDocument, type ForgeDocument, type ForgeNode } from '../core/schema';
import { sampleDocument, type Frame, type InputValues } from '../core/sample';

export type ForgeSVGProps = Omit<SVGProps<SVGSVGElement>, 'children'> & { document: ForgeDocument; frame?: Frame; background?: boolean; title?: string; children?: ReactNode };
/** Static SVG scene. Validates the document once per identity; animated frames come from ForgePlayer. */
export const ForgeSVG = forwardRef<SVGSVGElement, ForgeSVGProps>(function ForgeSVG({ document: source, frame: suppliedFrame, background = true, title, children, ...props }, ref) {
  const document = useMemo(() => parseDocument(source), [source]);
  const initialFrame = useMemo(() => sampleDocument(document, 0), [document]);
  const frame = suppliedFrame ?? initialFrame;
  const prefix = `mf-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}-`;
  const paint = (value: string) => {
    if (/^url\(#[A-Za-z][\w-]{0,79}\)$/.test(value)) return document.gradients.some(g => g.id === value.slice(5, -1)) ? `url(#${prefix}${value.slice(5, -1)})` : 'none';
    return /^(#[\da-fA-F]{3}|#[\da-fA-F]{6}|#[\da-fA-F]{8}|none)$/.test(value) ? value : 'none';
  };
  const descendants = new Map<string | undefined, ForgeNode[]>();
  for (const base of document.nodes) { const list = descendants.get(base.parentId) ?? []; list.push(frame[base.id] ?? base); descendants.set(base.parentId, list); }
  const render = (node: ForgeNode): ReactNode => {
    if (!node.visible) return null;
    const common = { 'data-node-id': node.id, transform: nodeTransform(node), opacity: node.opacity, fill: paint(node.fill), stroke: paint(node.stroke), strokeWidth: node.strokeWidth, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, strokeDasharray: node.strokeDasharray || undefined, strokeDashoffset: node.strokeDashoffset };
    switch (node.type) {
      case 'group': return <g key={node.id} {...common}>{descendants.get(node.id)?.map(render)}</g>;
      case 'rect': return <rect key={node.id} {...common} width={node.width} height={node.height} rx={node.radius}/>;
      case 'ellipse': return <ellipse key={node.id} {...common} rx={node.rx} ry={node.ry}/>;
      case 'path': return <path key={node.id} {...common} d={node.d}/>;
      case 'line': return <line key={node.id} {...common} x2={node.x2} y2={node.y2}/>;
      case 'text': return <text key={node.id} {...common} fontFamily={node.fontFamily} fontSize={node.fontSize} fontWeight={node.fontWeight} textAnchor={node.textAnchor}>{node.text}</text>;
    }
  };
  return <svg ref={ref} xmlns="http://www.w3.org/2000/svg" viewBox={`0 0 ${document.width} ${document.height}`} role="img" aria-labelledby={`${prefix}title`} {...props}>
    <title id={`${prefix}title`}>{title ?? document.name}</title>
    <defs>{document.gradients.map(g => { const stops = g.stops.map((s, i) => <stop key={i} offset={s.offset} stopColor={s.color} stopOpacity={s.opacity}/>); return g.type === 'linear' ? <linearGradient key={g.id} id={`${prefix}${g.id}`} x1={g.x1} y1={g.y1} x2={g.x2} y2={g.y2}>{stops}</linearGradient> : <radialGradient key={g.id} id={`${prefix}${g.id}`} cx={g.x1} cy={g.y1} r={g.x2}>{stops}</radialGradient>; })}</defs>
    {background ? <rect width="100%" height="100%" fill={paint(document.background)}/> : null}
    {descendants.get(undefined)?.map(render)}{children}
  </svg>;
});

/** Owns only the browser clock. Pauses elapsed time while hidden or offscreen. */
export function usePlayerClock(player: ForgePlayer, element?: React.RefObject<Element | null>): void {
  useEffect(() => {
    let request = 0, previous: number | undefined, inView = true;
    const tick = (now: number) => {
      request = 0;
      if (document.hidden || !inView || !player.getSnapshot().playing) { previous = undefined; return; }
      const delta = previous === undefined ? 0 : now - previous;
      previous = now;
      if (delta) player.advance(delta);
      if (player.getSnapshot().playing && !request) request = requestAnimationFrame(tick);
    };
    const sync = () => {
      if (!document.hidden && inView && player.getSnapshot().playing && !request) request = requestAnimationFrame(tick);
      else if (document.hidden || !inView || !player.getSnapshot().playing) { cancelAnimationFrame(request); request = 0; previous = undefined; }
    };
    const unsubscribe = player.subscribe(sync);
    document.addEventListener('visibilitychange', sync);
    const observer = typeof IntersectionObserver !== 'undefined' && element?.current ? new IntersectionObserver(entries => { inView = entries[0]?.isIntersecting ?? true; sync(); }) : undefined;
    if (observer && element?.current) observer.observe(element.current);
    sync();
    return () => { unsubscribe(); cancelAnimationFrame(request); observer?.disconnect(); document.removeEventListener('visibilitychange', sync); };
  }, [player, element]);
}
export type MotionForgeHandle = Pick<ForgePlayer, 'play' | 'pause' | 'seek' | 'setRate' | 'setState' | 'setInput' | 'send' | 'reset' | 'getSnapshot'>;
export type MotionForgeProps = Omit<ForgeSVGProps, 'frame'> & {
  autoplay?: boolean;
  inputs?: InputValues;
  state?: string;
  rate?: number;
  reducedMotion?: 'respect' | 'always' | 'never';
  onEvent?: (event: PlayerEvent) => void;
  onFrame?: (snapshot: PlayerSnapshot) => void;
};
export const MotionForge = forwardRef<MotionForgeHandle, MotionForgeProps>(function MotionForge({ document, autoplay = true, inputs, state, rate = 1, reducedMotion = 'respect', onEvent, onFrame, ...props }, ref) {
  const player = useMemo(() => new ForgePlayer(document), [document]);
  const snapshot = useSyncExternalStore(player.subscribe, player.getSnapshot, player.getSnapshot);
  const svg = useRef<SVGSVGElement>(null);
  // Subscribe callbacks before effects that can trigger state changes; changing callbacks does not restart the player.
  const callbacks = useRef({ onEvent, onFrame });
  useEffect(() => { callbacks.current = { onEvent, onFrame }; }, [onEvent, onFrame]);
  useEffect(() => player.onEvent(event => callbacks.current.onEvent?.(event)), [player]);
  useEffect(() => player.subscribe(() => callbacks.current.onFrame?.(player.getSnapshot())), [player]);
  useEffect(() => {
    const query = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => { player.setReducedMotion(reducedMotion === 'always' || (reducedMotion === 'respect' && query.matches)); if (autoplay) player.play(); else player.pause(); };
    update(); query.addEventListener('change', update); return () => { query.removeEventListener('change', update); player.pause(); };
  }, [player, reducedMotion, autoplay]);
  useEffect(() => { player.setRate(rate); }, [player, rate]);
  useEffect(() => { if (state && state !== player.getSnapshot().state) player.setState(state); }, [player, state]);
  useEffect(() => { if (inputs) for (const [id, value] of Object.entries(inputs)) if (player.getSnapshot().inputs[id] !== value) player.setInput(id, value); }, [player, inputs]);
  usePlayerClock(player, svg);
  useImperativeHandle(ref, () => ({ play: () => player.play(), pause: () => player.pause(), seek: time => player.seek(time), setRate: value => player.setRate(value), setState: id => player.setState(id), setInput: (id, value) => player.setInput(id, value), send: event => player.send(event), reset: () => player.reset(), getSnapshot: player.getSnapshot }), [player]);
  return <ForgeSVG ref={svg} document={player.document} frame={snapshot.frame} {...props}/>;
});
