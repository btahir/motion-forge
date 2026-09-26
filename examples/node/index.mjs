// Render a Motion SVG on the server: static frames for SSR/emails, and a contact sheet to review.
import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { loadScene, renderSVG, check, formatReport, contactSheet } from 'motion-forge/node';

const require = createRequire(import.meta.url);
const file = require.resolve('motion-forge/presets/like.svg');
const source = readFileSync(file, 'utf8');

console.log(formatReport(check(source), 'like.svg'));
const scene = loadScene(source);
writeFileSync('like-liked.svg', renderSVG(scene, { inputs: { liked: true } }));
writeFileSync('like-sheet.png', contactSheet(scene, { frames: 6 }).png);
console.log('Wrote like-liked.svg (static frame, liked) and like-sheet.png (contact sheet).');
