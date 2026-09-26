import { readFile, writeFile, mkdir, copyFile, readdir } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { render } from '../dist-server/entry-server.js';

const root = resolve(import.meta.dirname, '../../..');
const pkg = resolve(root, 'packages/motion-forge');
const out = resolve(import.meta.dirname, '../dist');
const template = await readFile(resolve(out, 'index.html'), 'utf8');
const rawOrigin = process.env.SITE_URL;
let origin = '';
if (rawOrigin) {
  const url = new URL(rawOrigin);
  if (url.protocol !== 'https:' || url.pathname !== '/') throw new Error('SITE_URL must be an https origin');
  origin = url.origin;
}
const routes = [
  { path: '/', title: 'Motion Forge: animations your agent can write, see and ship', description: 'Interactive animation as plain text: SVG plus a JSON state machine. Coding agents write it, the CLI shows them every frame, and a small runtime plays it anywhere. MIT.' },
  { path: '/playground/', title: 'Playground · Motion Forge', description: 'Edit a Motion SVG and watch it live: states, inputs, interactions, diagnostics and frame-by-frame previews. Share a link to your animation.' },
  { path: '/docs/', title: 'Motion SVG reference · Motion Forge', description: 'The complete Motion SVG format: states, keyframes, easing, inputs, bindings, interactions, layers, and the agent workflow.' },
  { path: '/404.html', title: 'Not found · Motion Forge', description: 'This page could not be found.' },
];
const esc = s => s.replace(/[<>&"]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' })[c]);
for (const route of routes) {
  const canonical = origin && route.path !== '/404.html' ? origin + route.path : '';
  const meta = [
    `<meta property="og:type" content="website"/>`,
    `<meta property="og:title" content="${esc(route.title)}"/>`,
    `<meta property="og:description" content="${esc(route.description)}"/>`,
    `<meta name="twitter:card" content="summary_large_image"/>`,
    origin ? `<meta property="og:image" content="${origin}/social.png"/>` : '',
    canonical ? `<link rel="canonical" href="${canonical}"/>` : '<meta name="robots" content="noindex"/>',
    `<link rel="icon" type="image/svg+xml" href="/icon.svg"/>`,
    `<link rel="alternate" type="text/plain" href="/llms.txt" title="LLM documentation"/>`,
  ].join('');
  const html = template
    .replace('<title>Motion Forge</title>', `<title>${esc(route.title)}</title>`)
    .replace('<meta name="description" content="" />', `<meta name="description" content="${esc(route.description)}" />`)
    .replace('<!--meta-->', meta)
    .replace('<div id="root">', '<div id="root" data-rendered="true">')
    .replace('<!--app-->', render(route.path));
  const file = resolve(out, route.path === '/404.html' ? '404.html' : `.${route.path}index.html`);
  await mkdir(dirname(file), { recursive: true });
  await writeFile(file, html);
}

// Machine-readable docs, presets and the runtime.
const reference = await readFile(resolve(pkg, 'skills/motion-forge/reference.md'), 'utf8');
const skill = await readFile(resolve(pkg, 'skills/motion-forge/SKILL.md'), 'utf8');
await writeFile(resolve(out, 'reference.md'), reference);
await writeFile(resolve(out, 'SKILL.md'), skill);
await writeFile(resolve(out, 'llms-full.txt'), `# Motion Forge — complete agent documentation\n\n${skill}\n\n---\n\n${reference}`);
await mkdir(resolve(out, 'presets'), { recursive: true });
const { loadScene } = await import('motion-forge');
const index = [];
for (const f of (await readdir(resolve(pkg, 'presets'))).filter(f => f.endsWith('.svg')).sort()) {
  const src = await readFile(resolve(pkg, 'presets', f), 'utf8');
  await copyFile(resolve(pkg, 'presets', f), resolve(out, 'presets', f));
  const scene = loadScene(src);
  index.push({ name: f.replace('.svg', ''), title: scene.title, description: /<desc>([\s\S]*?)<\/desc>/.exec(src)?.[1]?.trim() ?? '', category: /data-category="([^"]+)"/.exec(src)?.[1] ?? 'misc', events: [...scene.events], inputs: [...scene.inputs.keys()], url: `${origin}/presets/${f}` });
}
await writeFile(resolve(out, 'presets.json'), JSON.stringify(index, null, 2) + '\n');
await mkdir(resolve(out, 'runtime'), { recursive: true });
await copyFile(resolve(pkg, 'dist/browser.global.js'), resolve(out, 'runtime/motion-forge.js'));
await writeFile(
  resolve(out, 'llms.txt'),
  `# Motion Forge\n\n> Interactive animation as plain text. A Motion SVG is an SVG with a JSON motion block (states, keyframes, springs, morphs, inputs, bindings, interactions). Coding agents write it, verify it with \`npx motion-forge check\` and look at \`npx motion-forge preview\` contact sheets; the runtime plays it via <motion-forge>, React or mount().\n\n## Docs\n- [Agent skill](${origin}/SKILL.md): workflow and taste rules for agents\n- [Format reference](${origin}/reference.md): complete Motion SVG spec\n- [Everything in one file](${origin}/llms-full.txt)\n\n## Presets\n${index.map(p => `- [${p.title}](${p.url}): ${p.description}`).join('\n')}\n\n## Tools\n- CLI: npx motion-forge (new, add, list, check, preview, record, render, inspect, docs, init, dev, mcp)\n- MCP: { "command": "npx", "args": ["motion-forge", "mcp"] }\n`,
);
await writeFile(resolve(out, 'robots.txt'), origin ? `User-agent: *\nAllow: /\nSitemap: ${origin}/sitemap.xml\n` : 'User-agent: *\nDisallow: /\n');
await writeFile(resolve(out, 'sitemap.xml'), `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${origin ? routes.filter(r => r.path !== '/404.html').map(r => `<url><loc>${origin}${r.path}</loc></url>`).join('') : ''}</urlset>\n`);
console.log(`Prerendered ${routes.length} pages, ${index.length} presets.${origin ? ` Origin ${origin}` : ' No SITE_URL: noindex preview build.'}`);
