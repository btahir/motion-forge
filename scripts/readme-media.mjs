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

  // Two copies of the same file get the same two clicks: one at real speed, one 4× slower
  // with each phase of the motion named, so the squash, overshoot and settle are visible.
  const W = 680, H = 366, stage = 250, gapX = 60, top = 46;
  const lx = (W - stage * 2 - gapX) / 2, rx = lx + stage + gapX;
  const clicks = [500, 3900], total = 5700, step = 1000 / fps, slow = 4;
  const real = new Player(like), slowed = new Player(like);
  const scaleOf = p => { for (const m of p.frame().values()) if (m.has('scale')) return m.get('scale'); return 1; };
  const phase = p => {
    if (p.state === 'liked') {
      const t = p.time;
      return t < 120 ? 'squash to 0.8' : t < 330 ? 'pop up to 1.3' : t < 600 ? 'spring back to 1' : 'liked';
    }
    return p.transitioning ? 'blend back to grey' : 'idle';
  };
  const tip = [lx + stage * 0.63, top + stage * 0.63];
  const label = (x, text) => `<text x="${x + stage / 2}" y="${top - 16}" text-anchor="middle" font-family="Helvetica, Arial, sans-serif" font-size="15" font-weight="700" fill="#45413a">${text}</text>`;
  const place = (p, x, id) => {
    const tree = renderFrameTree(like, p.frame(), { width: stage, height: stage });
    prefixIds(tree, id);
    tree.attrs.x = String(x);
    tree.attrs.y = String(top);
    delete tree.attrs.xmlns;
    return `<rect x="${x}" y="${top}" width="${stage}" height="${stage}" rx="22" fill="#ffffff" stroke="#e7e0d2"/>${serializeXML(tree)}`;
  };
  const demo = GIFEncoder();
  for (let t = 0; t < total; t += step) {
    for (const c of clicks) if (c > t - step && c <= t) for (const p of [real, slowed]) p.setInput('liked', !p.inputs.liked);
    // Cursor glides in before each click and presses (ripple) on the real-speed heart.
    const next = clicks.find(c => c + 400 > t) ?? clicks[clicks.length - 1];
    const approach = Math.max(0, Math.min(1, 1 - (next - t) / 450));
    const ease = 1 - (1 - approach) ** 3;
    const cx = tip[0] + 60 * (1 - ease), cy = tip[1] + 50 * (1 - ease);
    const since = t - (clicks.filter(c => c <= t).pop() ?? -Infinity);
    const ripple = since >= 0 && since < 360 ? `<circle cx="${tip[0]}" cy="${tip[1]}" r="${6 + since / 12}" fill="none" stroke="#1b1a17" stroke-opacity="${(1 - since / 360) * 0.5}" stroke-width="2"/>` : '';
    const cursor = `<path transform="translate(${cx} ${cy}) scale(${since >= 0 && since < 120 ? 0.9 : 1})" d="M0 0 L0 22 L6 17 L10 27 L14 25 L10 15 L18 15 Z" fill="#1b1a17" stroke="#fffdf8" stroke-width="1.6" stroke-linejoin="round"/>`;
    const moving = phase(slowed);
    const caption = `<text x="${rx + stage / 2}" y="${top + stage + 30}" text-anchor="middle" font-family="Menlo, monospace" font-size="15" font-weight="700" fill="${moving === 'idle' || moving === 'liked' ? '#45413a' : '#c2410c'}">${moving}</text><text x="${rx + stage / 2}" y="${top + stage + 50}" text-anchor="middle" font-family="Menlo, monospace" font-size="12" fill="#787166">scale ${scaleOf(slowed).toFixed(2)}</text>`;
    const liked = real.inputs.liked;
    const status = `<text x="${lx + stage / 2}" y="${top + stage + 30}" text-anchor="middle" font-family="Menlo, monospace" font-size="15" fill="#45413a">liked = <tspan font-weight="700" fill="${liked ? '#e03a58' : '#1b1a17'}">${liked}</tspan></text><text x="${lx + stage / 2}" y="${top + stage + 50}" text-anchor="middle" font-family="Menlo, monospace" font-size="12" fill="#787166">state ${real.state}</text>`;
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}"><rect width="100%" height="100%" fill="#fbf8f1"/>${label(lx, 'Real speed')}${label(rx, '4× slower')}${place(real, lx, 'real-')}${place(slowed, rx, 'slow-')}${ripple}${cursor}${status}${caption}</svg>`;
    const img = rasterize(svg);
    const palette = quantize(img.pixels, 256);
    demo.writeFrame(applyPalette(img.pixels, palette), img.width, img.height, { palette, delay: step });
    real.advance(step);
    slowed.advance(step / slow);
  }
  demo.finish();
  writeFileSync(new URL('like-demo.gif', out), Buffer.from(demo.bytes()));
  writeFileSync(new URL('../apps/site/public/loop/like-demo.gif', import.meta.url), Buffer.from(demo.bytes()));
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
