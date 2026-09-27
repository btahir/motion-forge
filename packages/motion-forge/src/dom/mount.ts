import { Player, type PlayerEvent, type PlayerOptions } from '../core/player';
import { frameAttributes, prefixIds, TEXT } from '../core/render';
import { loadScene, type Scene } from '../core/scene';
import { cloneTree, type XElement } from '../core/xml';
import type { RInteraction } from '../core/scene';

const SVG_NS = 'http://www.w3.org/2000/svg';
let instanceCount = 0;

export interface MountOptions extends Omit<PlayerOptions, 'reducedMotion'> {
  /** Start playing immediately (default true). */
  autoplay?: boolean;
  /** true, false, or "auto" to follow prefers-reduced-motion (default). */
  reducedMotion?: boolean | 'auto';
  /** Pause the clock while the animation is scrolled out of view (default true). */
  pauseOffscreen?: boolean;
  /** Called for state changes, completions, emitted events and input changes. */
  onEvent?: (event: PlayerEvent) => void;
  /** Disable the interactions declared in the file (default false). */
  disableInteractions?: boolean;
}

export interface MotionInstance {
  readonly player: Player;
  readonly scene: Scene;
  readonly svg: SVGSVGElement;
  readonly state: string;
  send(event: string): boolean;
  set(input: string, value: number | boolean): void;
  get(input: string): number | boolean | undefined;
  goto(state: string, blend?: number): boolean;
  play(): void;
  pause(): void;
  readonly playing: boolean;
  /** Scrub the current state to a time in ms (pauses playback). */
  seek(ms: number): void;
  on(listener: (event: PlayerEvent) => void): () => void;
  destroy(): void;
}

function build(tree: XElement, byKey: Element[]): SVGElement {
  const el = document.createElementNS(SVG_NS, tree.name);
  for (const [k, v] of Object.entries(tree.attrs)) {
    if (k === 'xmlns') continue;
    if (k === 'xml:space') el.setAttributeNS('http://www.w3.org/XML/1998/namespace', 'xml:space', v);
    else el.setAttribute(k, v);
  }
  for (const c of tree.children) {
    if (c.type === 'text') el.appendChild(document.createTextNode(c.value));
    else el.appendChild(build(c, byKey));
  }
  if (tree.key !== undefined) byKey[tree.key] = el;
  return el;
}

/**
 * Renders a Motion SVG into `target` and runs it. Accepts SVG source or a loaded Scene.
 * Everything the file declares (states, inputs, interactions) works without host code.
 */
export function mount(target: Element | ShadowRoot, source: string | Scene, options: MountOptions = {}): MotionInstance {
  const scene = typeof source === 'string' ? loadScene(source) : source;
  const reduceQuery = typeof matchMedia === 'function' ? matchMedia('(prefers-reduced-motion: reduce)') : undefined;
  const reduced = options.reducedMotion === 'auto' || options.reducedMotion === undefined ? !!reduceQuery?.matches : options.reducedMotion;
  const player = new Player(scene, { ...options, reducedMotion: reduced });

  const tree = cloneTree(scene.root);
  prefixIds(tree, `mf${++instanceCount}-`);
  const byKey: Element[] = [];
  const svg = build(tree, byKey) as SVGSVGElement;
  svg.removeAttribute('width');
  svg.removeAttribute('height');
  svg.setAttribute('width', '100%');
  svg.setAttribute('height', '100%');
  svg.style.display = 'block';
  svg.style.overflow = scene.root.attrs.overflow ?? 'hidden';
  svg.style.userSelect = 'none';
  svg.style.touchAction = scene.interactions.some(i => i.on === 'drag') ? 'none' : '';
  const interactive = !options.disableInteractions && scene.interactions.length > 0;
  svg.setAttribute('role', interactive ? 'group' : 'img');
  if (scene.title) svg.setAttribute('aria-label', scene.title);
  target.replaceChildren(svg);

  // Attribute writer with a per-attribute cache.
  const written = new Map<Element, Record<string, string>>();
  const write = () => {
    const attrs = frameAttributes(scene, player.frame());
    for (const [key, a] of attrs) {
      const el = byKey[key];
      if (!el) continue;
      let prev = written.get(el);
      if (!prev) written.set(el, (prev = {}));
      for (const name in a) {
        const v = a[name]!;
        if (prev[name] === v) continue;
        prev[name] = v;
        if (name === TEXT) el.textContent = v;
        else if (v === '' && name === 'transform') el.removeAttribute('transform');
        else if (name === 'stroke-dasharray' && v === 'none') el.removeAttribute('stroke-dasharray');
        else el.setAttribute(name, v);
      }
    }
  };

  // Clock.
  let playing = options.autoplay !== false;
  let raf = 0;
  let last = 0;
  let visible = true;
  let destroyed = false;
  let ticking = false;
  const tick = (now: number) => {
    raf = 0;
    if (destroyed) return;
    const dt = last ? Math.min(now - last, 100) : 16;
    last = now;
    ticking = true;
    try {
      if (playing && visible) player.advance(dt);
      write();
    } finally {
      ticking = false;
    }
    if (!destroyed && playing && visible && player.active) raf = requestAnimationFrame(tick);
    else last = 0;
  };
  const wake = () => {
    if (!raf && !destroyed && !ticking && visible) raf = requestAnimationFrame(tick);
  };
  const unsubscribe = player.on(e => {
    options.onEvent?.(e);
    wake();
  });
  write();
  wake();

  const cleanups: (() => void)[] = [unsubscribe];
  if (reduceQuery && (options.reducedMotion === undefined || options.reducedMotion === 'auto')) {
    const change = () => {
      player.setReducedMotion(reduceQuery.matches);
      write();
      wake();
    };
    reduceQuery.addEventListener('change', change);
    cleanups.push(() => reduceQuery.removeEventListener('change', change));
  }
  if (options.pauseOffscreen !== false && typeof IntersectionObserver === 'function') {
    const io = new IntersectionObserver(entries => {
      visible = entries.some(e => e.isIntersecting);
      if (visible) wake();
      else {
        if (raf) cancelAnimationFrame(raf);
        raf = 0;
        last = 0;
      }
    });
    io.observe(svg);
    cleanups.push(() => io.disconnect());
  }

  // Interactions declared in the file.
  if (interactive) {
    const listen = (el: Element, type: string, fn: (e: Event) => void, opts?: AddEventListenerOptions) => {
      el.addEventListener(type, fn, opts);
      cleanups.push(() => el.removeEventListener(type, fn, opts));
    };
    const fire = (it: RInteraction) => {
      if (it.send) player.send(it.send);
      if (it.toggle) player.setInput(it.toggle, !player.getInput(it.toggle));
      if (it.set) for (const [k, v] of Object.entries(it.set)) player.setInput(k, v);
      wake();
    };
    const control = (el: Element, it: RInteraction, button = true) => {
      if (!el.hasAttribute('tabindex')) el.setAttribute('tabindex', '0');
      if (button && (!el.hasAttribute('role') || el === svg)) el.setAttribute('role', 'button');
      if (!el.hasAttribute('aria-label') && !el.hasAttribute('aria-labelledby')) el.setAttribute('aria-label', el.querySelector('title')?.textContent ?? it.send ?? it.toggle ?? it.hold ?? 'Activate');
      // Keep the browser focus indicator for keyboard focus. Chrome's SVG stylesheet also rings
      // SVG elements focused by a mouse click, so hide it only when focus isn't :focus-visible.
      const styled = el as SVGElement;
      listen(el, 'focus', () => {
        let visible = true;
        try { visible = el.matches(':focus-visible'); } catch { /* selector unsupported: keep the ring */ }
        if (!visible) styled.style.setProperty('outline', 'none');
      });
      listen(el, 'blur', () => styled.style.removeProperty('outline'));
    };
    const boxFor = (it: RInteraction, el: Element): DOMRect => (it.withinEl !== undefined && byKey[it.withinEl] ? byKey[it.withinEl]! : it.on === 'drag' ? el : svg).getBoundingClientRect();
    const mapPointer = (it: RInteraction, e: PointerEvent, box: DOMRect) => {
      const fx = box.width ? Math.min(1, Math.max(0, (e.clientX - box.left) / box.width)) : 0.5;
      const fy = box.height ? Math.min(1, Math.max(0, (e.clientY - box.top) / box.height)) : 0.5;
      for (const [input, f] of [[it.x, fx], [it.y, fy]] as const) {
        if (!input) continue;
        const def = scene.inputs.get(input)!;
        player.setInput(input, def.min + (def.max - def.min) * f);
      }
      wake();
    };
    for (const it of scene.interactions) {
      const els = it.els.map(k => byKey[k]).filter((e): e is Element => !!e);
      for (const el of els) {
        const html = el as SVGElement;
        switch (it.on) {
          case 'click':
            control(el, it);
            html.style.cursor = 'pointer';
            if (it.toggle) {
              const sync = () => el.setAttribute('aria-pressed', String(!!player.getInput(it.toggle!)));
              sync();
              cleanups.push(player.on(e => { if (e.type === 'input' && e.name === it.toggle) sync(); }));
            }
            listen(el, 'click', () => fire(it));
            listen(el, 'keydown', e => {
              const k = (e as KeyboardEvent).key;
              if (e.target === el && !(e as KeyboardEvent).repeat && (k === 'Enter' || k === ' ')) {
                e.preventDefault();
                fire(it);
              }
            });
            break;
          case 'hover':
          case 'press': {
            control(el, it, it.on === 'press');
            const [down, up] = it.on === 'hover' ? ['pointerenter', 'pointerleave'] : ['pointerdown', 'pointerup'];
            if (it.on === 'press') html.style.cursor = 'pointer';
            const activate = () => {
              if (it.hold) player.setInput(it.hold, true);
              fire({ ...it, hold: undefined });
            };
            listen(el, down!, activate);
            const release = () => {
              if (it.hold) player.setInput(it.hold, false);
              if (it.leave) player.send(it.leave);
              wake();
            };
            listen(el, up!, release);
            if (it.on === 'press') {
              listen(el, 'pointerleave', release);
              listen(el, 'pointercancel', release);
              listen(el, 'keydown', e => {
                const key = e as KeyboardEvent;
                if (e.target === el && !key.repeat && (key.key === 'Enter' || key.key === ' ')) {
                  e.preventDefault();
                  activate();
                }
              });
              listen(el, 'keyup', e => {
                if (e.target === el && ['Enter', ' '].includes((e as KeyboardEvent).key)) { e.preventDefault(); release(); }
              });
              listen(el, 'blur', release);
            }
            if (it.on === 'hover') {
              listen(el, 'focus', () => {
                if (it.hold) player.setInput(it.hold, true);
                fire({ ...it, hold: undefined });
              });
              listen(el, 'blur', release);
            }
            break;
          }
          case 'pointer': {
            const zone = el === svg ? svg : el;
            listen(zone, 'pointermove', e => mapPointer(it, e as PointerEvent, it.withinEl !== undefined && byKey[it.withinEl] ? byKey[it.withinEl]!.getBoundingClientRect() : svg.getBoundingClientRect()));
            listen(zone, 'pointerleave', () => {
              for (const input of [it.x, it.y]) if (input) player.setInput(input, scene.inputs.get(input)!.default);
              wake();
            });
            break;
          }
          case 'drag': {
            html.style.cursor = 'grab';
            let dragging = false;
            let box: DOMRect | undefined;
            // Keyboard and screen readers get a slider.
            const input = it.x ?? it.y;
            if (input) {
              const def = scene.inputs.get(input)!;
              if (!el.hasAttribute('tabindex')) el.setAttribute('tabindex', '0');
              el.setAttribute('role', 'slider');
              el.setAttribute('aria-valuemin', String(def.min));
              el.setAttribute('aria-valuemax', String(def.max));
              el.setAttribute('aria-orientation', it.x ? 'horizontal' : 'vertical');
              if (!el.hasAttribute('aria-label')) el.setAttribute('aria-label', input);
              const sync = () => el.setAttribute('aria-valuenow', String(Math.round(Number(player.getInput(input)) * 100) / 100));
              sync();
              cleanups.push(player.on(e => e.type === 'input' && e.name === input && sync()));
              listen(el, 'keydown', e => {
                const key = (e as KeyboardEvent).key;
                const stepSize = (def.max - def.min) / 20;
                const cur = Number(player.getInput(input));
                const next = key === 'ArrowRight' || key === 'ArrowUp' ? cur + stepSize : key === 'ArrowLeft' || key === 'ArrowDown' ? cur - stepSize : key === 'Home' ? def.min : key === 'End' ? def.max : undefined;
                if (next === undefined) return;
                e.preventDefault();
                player.setInput(input, next);
                wake();
              });
            }
            listen(el, 'pointerdown', e => {
              dragging = true;
              box = boxFor(it, el);
              (el as Element).setPointerCapture?.((e as PointerEvent).pointerId);
              html.style.cursor = 'grabbing';
              mapPointer(it, e as PointerEvent, box);
              if (it.send) player.send(it.send);
            });
            listen(el, 'pointermove', e => {
              if (dragging) mapPointer(it, e as PointerEvent, box ?? boxFor(it, el));
            });
            const end = () => {
              if (!dragging) return;
              dragging = false;
              html.style.cursor = 'grab';
              if (it.leave) player.send(it.leave);
              wake();
            };
            listen(el, 'pointerup', end);
            listen(el, 'pointercancel', end);
            listen(el, 'lostpointercapture', end);
            break;
          }
          case 'appear': {
            if (typeof IntersectionObserver !== 'function') {
              fire(it);
              break;
            }
            let done = false;
            const io = new IntersectionObserver(
              entries => {
                if (!done && entries.some(e => e.isIntersecting)) {
                  done = true;
                  fire(it);
                  io.disconnect();
                }
              },
              { threshold: 0.35 },
            );
            io.observe(el);
            cleanups.push(() => io.disconnect());
            break;
          }
        }
      }
    }
  }

  const instance: MotionInstance = {
    player,
    scene,
    svg,
    get state() {
      return player.state;
    },
    get playing() {
      return playing;
    },
    send: e => {
      const r = player.send(e);
      wake();
      return r;
    },
    set: (i, v) => {
      player.setInput(i, v);
      wake();
    },
    get: i => player.getInput(i),
    goto: (s, blend) => {
      const r = player.goto(s, { blend });
      wake();
      return r;
    },
    play: () => {
      playing = true;
      wake();
    },
    pause: () => {
      playing = false;
    },
    seek: ms => {
      playing = false;
      player.seek(ms);
      write();
    },
    on: l => player.on(l),
    destroy: () => {
      destroyed = true;
      if (raf) cancelAnimationFrame(raf);
      for (const c of cleanups) c();
      svg.remove();
    },
  };
  return instance;
}
