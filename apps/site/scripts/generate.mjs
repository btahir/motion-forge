// Generates real CLI output for the landing page: a check report and a contact sheet.
import { mkdirSync, readFileSync, readdirSync, writeFileSync, existsSync } from 'node:fs';
import { check, formatReport, contactSheet, loadScene } from 'motion-forge/node';

const presets = new URL('../../../packages/motion-forge/presets/', import.meta.url);
const files = existsSync(presets) ? readdirSync(presets).filter(f => f.endsWith('.svg')) : [];
const pick = ['like.svg', 'scout.svg', files[0]].find(f => f && files.includes(f));
mkdirSync(new URL('../src/generated/', import.meta.url), { recursive: true });
mkdirSync(new URL('../public/loop/', import.meta.url), { recursive: true });
let out = { file: 'like.svg', check: '(no presets yet)', sheet: '/icon.svg' };
if (pick) {
  const source = readFileSync(new URL(pick, presets), 'utf8');
  const report = formatReport(check(source), pick).split('\n').slice(1).join('\n');
  const scene = loadScene(source);
  const moving = scene.layers[0] ? [...scene.layers[0].states.values()].filter(s => s.channels.length && s.duration > 0).map(s => s.name) : undefined;
  const sheet = contactSheet(scene, { frames: 6, cell: 150, name: pick, states: moving?.length ? moving : undefined });
  writeFileSync(new URL(`../public/loop/${pick.replace('.svg', '')}-sheet.png`, import.meta.url), sheet.png);
  out = { file: pick, check: report, sheet: `/loop/${pick.replace('.svg', '')}-sheet.png` };
}
writeFileSync(new URL('../src/generated/loop.json', import.meta.url), JSON.stringify(out, null, 2) + '\n');
console.log(`Generated landing-page CLI output from ${out.file}`);
