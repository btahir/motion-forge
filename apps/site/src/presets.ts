import { loadScene } from 'motion-forge';

const files = import.meta.glob('../../../packages/motion-forge/presets/*.svg', { query: '?raw', import: 'default', eager: true }) as Record<string, string>;

export interface Preset {
  name: string;
  title: string;
  description: string;
  category: string;
  source: string;
  events: string[];
  inputs: { name: string; type: 'number' | 'boolean'; min: number; max: number; default: number }[];
  states: string[];
  ok: boolean;
}

const ORDER = ['characters', 'illustrations', 'feedback', 'controls', 'icons', 'loaders', 'progress', 'data'];

export const presets: Preset[] = Object.entries(files)
  .map(([path, source]) => {
    const scene = loadScene(source);
    return {
      name: path.split('/').pop()!.replace(/\.svg$/, ''),
      title: scene.title ?? '',
      description: /<desc>([\s\S]*?)<\/desc>/.exec(source)?.[1]?.trim() ?? '',
      category: /data-category="([^"]+)"/.exec(source)?.[1] ?? 'misc',
      source,
      events: [...scene.events],
      inputs: [...scene.inputs.values()].map(i => ({ name: i.name, type: i.type, min: i.min, max: i.max, default: i.default })),
      states: [...(scene.layers[0]?.states.keys() ?? [])],
      ok: scene.ok,
    };
  })
  .filter(p => p.ok)
  .sort((a, b) => {
    const ca = ORDER.indexOf(a.category), cb = ORDER.indexOf(b.category);
    return (ca < 0 ? 99 : ca) - (cb < 0 ? 99 : cb) || a.name.localeCompare(b.name);
  });

export const presetByName = (name: string) => presets.find(p => p.name === name);
export const categories = [...new Set(presets.map(p => p.category))];
