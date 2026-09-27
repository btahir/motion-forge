// Generates real CLI output for the landing page: a check report and a contact sheet.
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { check, formatReport, contactSheet, loadScene } from 'motion-forge/node';

// The landing page's loop shows one file throughout: the like button from the README.
const example = new URL('../../../examples/like.svg', import.meta.url);
mkdirSync(new URL('../src/generated/', import.meta.url), { recursive: true });
mkdirSync(new URL('../public/loop/', import.meta.url), { recursive: true });
let out = { file: 'like.svg', check: '(example missing)', sheet: '/icon.svg' };
if (existsSync(example)) {
  const source = readFileSync(example, 'utf8');
  const report = formatReport(check(source), 'like.svg').split('\n').slice(1).join('\n');
  const sheet = contactSheet(loadScene(source), { frames: 6, cell: 150, name: 'like.svg' });
  writeFileSync(new URL('../public/loop/like-sheet.png', import.meta.url), sheet.png);
  out = { file: 'like.svg', check: report, sheet: '/loop/like-sheet.png' };
}
writeFileSync(new URL('../src/generated/loop.json', import.meta.url), JSON.stringify(out, null, 2) + '\n');
console.log(`Generated landing-page CLI output from ${out.file}`);
