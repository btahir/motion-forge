import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadScene } from '../core/scene';

export const VERSION = '0.2.0';
const here = dirname(fileURLToPath(import.meta.url));
export const packageRoot = existsSync(join(here, '../presets')) ? join(here, '..') : join(here, '../..');
export const presetDir = join(packageRoot, 'presets');
export const skillDir = join(packageRoot, 'skills/motion-forge');

export interface PresetInfo {
  name: string;
  title: string;
  category: string;
  description: string;
  events: string[];
  inputs: string[];
  emits: string[];
  file: string;
}

export function listPresets(): PresetInfo[] {
  if (!existsSync(presetDir)) return [];
  return readdirSync(presetDir)
    .filter(f => f.endsWith('.svg'))
    .sort()
    .map(f => {
      const file = join(presetDir, f);
      const src = readFileSync(file, 'utf8');
      const scene = loadScene(src);
      const desc = /<desc>([\s\S]*?)<\/desc>/.exec(src)?.[1]?.trim() ?? '';
      return {
        name: basename(f, '.svg'),
        title: scene.title ?? basename(f, '.svg'),
        category: /data-category="([^"]+)"/.exec(src)?.[1] ?? 'misc',
        description: desc,
        events: [...scene.events],
        inputs: [...scene.inputs.keys()],
        emits: [...new Set(scene.layers.flatMap(l => [...l.states.values()].flatMap(s => s.emit)))],
        file,
      };
    });
}

