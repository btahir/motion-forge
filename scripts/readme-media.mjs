// Renders the README media with Motion Forge itself: a gallery GIF of presets reacting
// to scripted interactions, plus a real `preview` contact sheet.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import gifenc from 'gifenc';
const { GIFEncoder, applyPalette, quantize } = gifenc;
import { loadScene, Player, renderFrameTree, prefixIds, serializeXML, contactSheet, rasterize } from '../packages/motion-forge/dist/node.js';

const dir = new URL('../packages/motion-forge/presets/', import.meta.url);
const out = new URL('../docs/media/', import.meta.url);
mkdirSync(out, { recursive: true });

// name, script: [ms, action]
const cast = [
  ['scout', [[500, p => p.send('wave')], [2600, p => p.send('celebrate')]]],
  ['like', [[700, p => p.setInput('liked', true)], [3300, p => p.setInput('liked', false)]]],
  ['toggle', [[600, p => p.setInput('on', true)], [2400, p => p.setInput('on', false)]]],
  ['progress-ring', [[200, p => p.setInput('progress', 45)], [1400, p => p.setInput('progress', 100)]]],
  ['gauge', [[300, p => p.setInput('value', 86)], [2200, p => p.setInput('value', 28)]]],
  ['sun-moon', [[900, p => p.setInput('dark', true)], [3000, p => p.setInput('dark', false)]]],
  ['bell', [[800, p => p.send('notify')], [900, p => p.setInput('count', 4)]]],
  ['upload', [[400, p => p.send('start')], [600, p => p.setInput('progress', 100)]]],
];
const cell = 190, gap = 14, pad = 18, cols = 4, fps = 20, seconds = 4.4;
const rows = Math.ceil(cast.length / cols);
const W = pad * 2 + cols * cell + (cols - 1) * gap, H = pad * 2 + rows * cell + (rows - 1) * gap;
const actors = cast.map(([name, script]) => {
  const scene = loadScene(readFileSync(new URL(`${name}.svg`, dir), 'utf8'));
  return { name, scene, player: new Player(scene), script: [...script] };
});
const gif = GIFEncoder();
const frames = Math.round(seconds * fps);
for (let i = 0; i < frames; i++) {
  const t = (i * 1000) / fps;
  const parts = actors.map((a, n) => {
    while (a.script.length && a.script[0][0] <= t) a.script.shift()[1](a.player);
    const tree = renderFrameTree(a.scene, a.player.frame(), { width: cell - 24, height: cell - 24 });
    prefixIds(tree, `a${n}-`);
    const x = pad + (n % cols) * (cell + gap), y = pad + Math.floor(n / cols) * (cell + gap);
    tree.attrs.x = String(x + 12);
    tree.attrs.y = String(y + 12);
    delete tree.attrs.xmlns;
    a.player.advance(1000 / fps);
    return `<rect x="${x}" y="${y}" width="${cell}" height="${cell}" rx="18" fill="#fffdf8" stroke="#e7e0d2"/>${serializeXML(tree)}`;
  });
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}"><rect width="100%" height="100%" fill="#f3eee3"/>${parts.join('')}</svg>`;
  const img = rasterize(svg);
  const palette = quantize(img.pixels, 256);
  gif.writeFrame(applyPalette(img.pixels, palette), img.width, img.height, { palette, delay: 1000 / fps });
}
gif.finish();
writeFileSync(new URL('gallery.gif', out), Buffer.from(gif.bytes()));
console.log(`Wrote docs/media/gallery.gif (${W}×${H}, ${frames} frames)`);

// The README's "format in one screen" example: the exact file, clicked twice, plus the
// contact sheet `motion-forge preview` produces for it.
{
  const source = readFileSync(new URL('../examples/like.svg', import.meta.url), 'utf8');
  const like = loadScene(source);
  writeFileSync(new URL('preview-like.png', out), contactSheet(like, { frames: 6, cell: 130, name: 'examples/like.svg' }).png);

  const W = 520, H = 300, stage = 220, sx = (W - stage) / 2, sy = 22;
  const clicks = [700, 2700], total = 4600, step = 1000 / fps;
  const player = new Player(like);
  const emitted = [];
  player.on(e => { if (e.type === 'emit') emitted.push(e.name); });
  const tip = [sx + stage * 0.62, sy + stage * 0.62]; // where the cursor clicks, over the heart
  const demo = GIFEncoder();
  let lastEmitAt = -Infinity;
  for (let t = 0; t < total; t += step) {
    for (const c of clicks) if (c > t - step && c <= t) { const before = emitted.length; player.setInput('liked', !player.inputs.liked); if (emitted.length > before) lastEmitAt = t; }
    const tree = renderFrameTree(like, player.frame(), { width: stage, height: stage });
    prefixIds(tree, 'demo-');
    tree.attrs.x = String(sx);
    tree.attrs.y = String(sy);
    delete tree.attrs.xmlns;
    // Cursor glides in before each click and presses (ripple) on it.
    const next = clicks.find(c => c + 400 > t) ?? clicks[clicks.length - 1];
    const approach = Math.max(0, Math.min(1, 1 - (next - t) / 450));
    const ease = 1 - (1 - approach) ** 3;
    const cx = tip[0] + 60 * (1 - ease), cy = tip[1] + 50 * (1 - ease);
    const since = t - clicks.filter(c => c <= t).pop();
    const ripple = since >= 0 && since < 360 ? `<circle cx="${tip[0]}" cy="${tip[1]}" r="${6 + since / 12}" fill="none" stroke="#1b1a17" stroke-opacity="${(1 - since / 360) * 0.5}" stroke-width="2"/>` : '';
    const cursor = `<path transform="translate(${cx} ${cy}) scale(${since >= 0 && since < 120 ? 0.9 : 1})" d="M0 0 L0 22 L6 17 L10 27 L14 25 L10 15 L18 15 Z" fill="#1b1a17" stroke="#fffdf8" stroke-width="1.6" stroke-linejoin="round"/>`;
    const liked = player.inputs.liked;
    const status = `<text x="${W / 2}" y="${H - 34}" text-anchor="middle" font-family="Menlo, monospace" font-size="15" fill="#45413a">state <tspan font-weight="700" fill="#1b1a17">${player.state}</tspan>   ·   liked = <tspan font-weight="700" fill="${liked ? '#e03a58' : '#1b1a17'}">${liked}</tspan></text>`;
    const emitNote = t - lastEmitAt < 1300 ? `<text x="${W / 2}" y="${H - 12}" text-anchor="middle" font-family="Menlo, monospace" font-size="13" fill="#c2410c">emit "liked" → your app</text>` : '';
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}"><rect width="100%" height="100%" fill="#fbf8f1"/><rect x="${sx}" y="${sy}" width="${stage}" height="${stage}" rx="22" fill="#ffffff" stroke="#e7e0d2"/>${serializeXML(tree)}${ripple}${cursor}${status}${emitNote}</svg>`;
    const img = rasterize(svg);
    const palette = quantize(img.pixels, 256);
    demo.writeFrame(applyPalette(img.pixels, palette), img.width, img.height, { palette, delay: step });
    player.advance(step);
  }
  demo.finish();
  writeFileSync(new URL('like-demo.gif', out), Buffer.from(demo.bytes()));
  console.log('Wrote docs/media/like-demo.gif and docs/media/preview-like.png');
}

// Social card (1200×630) for the site, rendered the same way.
{
  const scout = loadScene(readFileSync(new URL('scout.svg', dir), 'utf8'));
  const p = new Player(scout);
  p.send('wave');
  p.advance(520);
  const tree = renderFrameTree(scout, p.frame(), { width: 470, height: 470 });
  prefixIds(tree, 'soc-');
  tree.attrs.x = '690';
  tree.attrs.y = '90';
  delete tree.attrs.xmlns;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630"><rect width="1200" height="630" fill="#fbf8f1"/><rect x="660" y="60" width="500" height="510" rx="40" fill="#f3eee3"/>${serializeXML(tree)}
<text x="72" y="130" font-family="Helvetica, Arial, sans-serif" font-size="26" font-weight="700" fill="#c2410c" letter-spacing="2">MOTION FORGE</text>
<text font-family="Helvetica, Arial, sans-serif" font-size="68" font-weight="800" fill="#1b1a17"><tspan x="72" y="240">Animations your</tspan><tspan x="72" y="322">agent can <tspan fill="#ff5a1f">write,</tspan></tspan><tspan x="72" y="404"><tspan fill="#ff5a1f">see</tspan> and <tspan fill="#ff5a1f">ship.</tspan></tspan></text>
<text x="72" y="490" font-family="Menlo, monospace" font-size="26" fill="#45413a">$ npx motion-forge init</text>
<text x="72" y="550" font-family="Helvetica, Arial, sans-serif" font-size="24" fill="#787166">Interactive SVG + a JSON state machine · MIT</text></svg>`;
  writeFileSync(new URL('../apps/site/public/social.png', import.meta.url), rasterize(svg).png);
  console.log('Wrote apps/site/public/social.png');
}
