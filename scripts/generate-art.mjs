import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { renderSVG } from '../packages/motion-forge/dist/core.js';
import { createPreset } from '../packages/motion-forge/dist/presets.js';
import { chromium } from '@playwright/test';
const root = resolve(import.meta.dirname, '..');
const scout = renderSVG(createPreset('scout'), { time: 800 });
await mkdir(resolve(root, 'docs/assets'), { recursive: true });
await writeFile(resolve(root, 'docs/assets/scout.svg'), scout);
const social = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630"><rect width="1200" height="630" fill="#f6f3eb"/><text x="66" y="89" font-family="sans-serif" font-size="26" font-weight="600" fill="#27372b">motion forge<tspan fill="#d86139"> ●</tspan></text><text x="66" y="256" font-family="sans-serif" font-size="64" font-weight="600" letter-spacing="-3" fill="#27372b">Make it move.</text><text x="66" y="335" font-family="Georgia,serif" font-size="72" font-style="italic" letter-spacing="-3" fill="#54715a">Make it yours.</text><text x="70" y="405" font-family="sans-serif" font-size="20" fill="#5d6b56">An open-source studio for interactive motion.</text><text x="70" y="556" font-family="monospace" font-size="14" fill="#52684b">STUDIO · REACT · CLI · PORTABLE JSON</text><g transform="translate(618 22) scale(.95)">${scout.replace(/<svg[^>]*>/, '<g>').replace('</svg>', '</g>')}</g></svg>`;
await writeFile(resolve(root, 'docs/assets/social.svg'), social);
const browser = await chromium.launch();
try { const page = await browser.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 }); await page.setContent(`<style>body{margin:0}</style>${social}`); await page.screenshot({ path: resolve(root, 'apps/site/public/social.png') }); }
finally { await browser.close(); }
console.log('Generated original runtime SVG preview and social artwork.');
