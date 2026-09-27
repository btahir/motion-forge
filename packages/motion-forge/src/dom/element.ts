import type { PlayerEvent } from '../core/player';
import { mount, type MotionInstance } from './mount';

/**
 * <motion-forge src="/like.svg"></motion-forge>
 * <motion-forge inputs='{"level": 40}'><svg>…inline Motion SVG…</svg></motion-forge>
 *
 * Events: "motion" (every PlayerEvent), plus "statechange", "emit", "complete", "input".
 */
export class MotionForgeElement extends HTMLElement {
  static observedAttributes = ['src', 'state', 'inputs', 'paused'];
  private instance?: MotionInstance;
  private root: ShadowRoot;
  private loadId = 0;
  private source?: string;
  private controller?: AbortController;

  constructor() {
    super();
    this.root = this.attachShadow({ mode: 'open' });
    const style = document.createElement('style');
    style.textContent = ':host{display:inline-block;line-height:0;vertical-align:middle}:host([hidden]){display:none}';
    this.root.append(style, document.createElement('slot'));
  }

  /** The running instance (after load). */
  get motion(): MotionInstance | undefined {
    return this.instance;
  }
  /** Set Motion SVG source directly. */
  set svg(source: string) {
    this.cancelLoad();
    this.removeAttribute('src');
    this.source = source;
    if (this.isConnected) this.start(source);
  }
  get svg(): string | undefined {
    return this.source;
  }

  connectedCallback() {
    if (this.instance) return;
    const inline = this.querySelector('svg');
    if (this.getAttribute('src')) void this.load(this.getAttribute('src')!);
    else if (this.source) this.start(this.source);
    else if (inline && !this.getAttribute('src')) {
      this.source = new XMLSerializer().serializeToString(inline);
      this.start(this.source);
    }
  }
  disconnectedCallback() {
    this.cancelLoad();
    this.instance?.destroy();
    this.instance = undefined;
  }
  attributeChangedCallback(name: string, old: string | null, value: string | null) {
    if (old === value || !this.isConnected) return;
    if (name === 'src') {
      this.cancelLoad();
      this.source = undefined;
      this.instance?.destroy();
      this.instance = undefined;
      if (value) void this.load(value);
    }
    else if (name === 'state' && value) this.instance?.goto(value, 250);
    else if (name === 'inputs') this.applyInputs();
    else if (name === 'paused') value === null ? this.instance?.play() : this.instance?.pause();
  }

  private async load(src: string) {
    this.cancelLoad();
    const id = ++this.loadId;
    const controller = this.controller = new AbortController();
    try {
      const res = await fetch(src, { signal: controller.signal });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const text = await res.text();
      if (id !== this.loadId || !this.isConnected) return;
      this.source = text;
      this.start(text);
    } catch (e) {
      if (id === this.loadId && this.isConnected) this.dispatchEvent(new CustomEvent('error', { detail: e }));
    }
  }

  private cancelLoad() {
    this.loadId++;
    this.controller?.abort();
    this.controller = undefined;
  }

  private inputValues(): Record<string, number | boolean> {
    try {
      const value: unknown = JSON.parse(this.getAttribute('inputs') ?? '{}');
      if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
      return Object.fromEntries(Object.entries(value).filter(([, v]) => typeof v === 'boolean' || (typeof v === 'number' && Number.isFinite(v))));
    } catch {
      return {};
    }
  }

  private applyInputs() {
    for (const [k, v] of Object.entries(this.inputValues())) this.instance?.set(k, v);
  }

  private start(source: string) {
    this.instance?.destroy();
    const holder = document.createElement('div');
    holder.style.cssText = 'width:100%;height:100%';
    const state = this.getAttribute('state') ?? undefined;
    this.instance = mount(holder, source, {
      state,
      inputs: this.inputValues(),
      autoplay: !this.hasAttribute('paused'),
      onEvent: (e: PlayerEvent) => {
        this.dispatchEvent(new CustomEvent('motion', { detail: e }));
        this.dispatchEvent(new CustomEvent(e.type, { detail: e }));
      },
    });
    const { viewBox } = this.instance.scene;
    this.style.aspectRatio = `${viewBox.width} / ${viewBox.height}`;
    // Hide the light-DOM fallback, show the live render.
    this.root.querySelector('slot')?.remove();
    this.root.querySelector('div')?.remove();
    this.root.append(holder);
    if (!this.instance.scene.ok) console.warn('[motion-forge]', this.instance.scene.diagnostics.filter(d => d.level === 'error').map(d => `${d.at ?? ''} ${d.message}`).join('\n'));
  }

  send(event: string) {
    return this.instance?.send(event) ?? false;
  }
  set(input: string, value: number | boolean) {
    this.instance?.set(input, value);
  }
  get(input: string) {
    return this.instance?.get(input);
  }
  goto(state: string, blend?: number) {
    return this.instance?.goto(state, blend) ?? false;
  }
  play() {
    this.instance?.play();
  }
  pause() {
    this.instance?.pause();
  }
}

export function defineMotionForge(tag = 'motion-forge') {
  if (typeof customElements !== 'undefined' && !customElements.get(tag)) customElements.define(tag, class extends MotionForgeElement {});
}
