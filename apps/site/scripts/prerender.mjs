import { readFile, writeFile, mkdir, copyFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { render } from '../dist-server/entry-server.js';
const root = resolve(import.meta.dirname, '../../..');
const out = resolve(import.meta.dirname, '../dist');
const guides = JSON.parse(await readFile(resolve(root, 'docs/manifest.json'), 'utf8'));
const template = await readFile(resolve(out, 'index.html'), 'utf8');
const rawOrigin = process.env.SITE_URL;
let origin = '';
if (rawOrigin) { const url = new URL(rawOrigin); if (url.protocol !== 'https:' || url.pathname !== '/' || url.search || url.hash || url.username || url.password) throw new Error('SITE_URL must be a public HTTPS origin, with no path or credentials'); origin = url.origin; }
const routes = [
  { path: '/', title: 'Motion Forge — Make it move. Make it yours.', description: 'An open-source studio and toolkit for interactive vector animation. Create visually, edit with code, and ship to React. No account required.' },
  { path: '/examples/', title: 'Interactive examples — Motion Forge', description: 'Explore original, editable vector animations: Scout the explorer, a spring-driven confirmation, and a data-connected instrument.' },
  { path: '/studio/', title: 'Animation Studio — Motion Forge', description: 'A local visual editor for interactive vector animation. Edit layers, keyframes, states and inputs, then export portable source.' },
  ...guides.map(g => ({ path: `/docs/${g.slug ? `${g.slug}/` : ''}`, title: `${g.title} — Motion Forge`, description: g.description })),
  { path: '/404.html', title: 'Page not found — Motion Forge', description: 'This page could not be found.' },
];
const escape = s => s.replace(/[<>&"]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' })[c]);
for (const route of routes) {
  const canonical = origin && route.path !== '/404.html' ? `${origin}${route.path}` : '';
  const metadata = `<meta property="og:type" content="website"/><meta property="og:site_name" content="Motion Forge"/><meta property="og:title" content="${escape(route.title)}"/><meta property="og:description" content="${escape(route.description)}"/><meta name="twitter:card" content="summary_large_image"/>${origin ? `<meta property="og:image" content="${origin}/social.png"/><meta name="twitter:image" content="${origin}/social.png"/>` : ''}${canonical ? `<link rel="canonical" href="${canonical}"/><meta property="og:url" content="${canonical}"/>` : '<meta name="robots" content="noindex,nofollow"/>'}<link rel="icon" type="image/svg+xml" href="/icon.svg"/>`;
  // Studio is an interactive client route; its shell and description remain crawlable.
  const html = template.replace('<title>Motion Forge — Make it move. Make it yours.</title>', `<title>${escape(route.title)}</title>`).replace(/<meta name="description" content="[^"]*"\s*\/>/, `<meta name="description" content="${escape(route.description)}"/>`).replace('<!--meta-->', metadata).replace('<div id="root">', '<div id="root" data-rendered="true">').replace('<!--app-->', route.path === '/studio/' ? '<main class="studio-loading"><h1>Motion Forge Studio</h1><p>Create interactive vector animations with layers, keyframes, states and typed inputs. The editor loads in your browser.</p><noscript>Enable JavaScript to use Studio. Documentation and examples remain available.</noscript><a href="/docs/studio/">Read the Studio guide</a></main>' : render(route.path));
  const file = resolve(out, route.path === '/404.html' ? '404.html' : `.${route.path}index.html`); await mkdir(dirname(file), { recursive: true }); await writeFile(file, html);
}
await mkdir(resolve(out, 'docs'), { recursive: true });
const bodies = [];
for (const guide of guides) { const body = await readFile(resolve(root, `docs/${guide.file}.md`), 'utf8'); bodies.push(body); await copyFile(resolve(root, `docs/${guide.file}.md`), resolve(out, `docs/${guide.file}.md`)); }
await copyFile(resolve(root, 'packages/motion-forge/schema/document.schema.json'), resolve(out, 'document.schema.json'));
await writeFile(resolve(out, 'llms-full.txt'), '# Motion Forge — complete documentation\n\n' + bodies.join('\n\n---\n\n'));
await writeFile(resolve(out, 'llms.txt'), '# Motion Forge\n\n> Open-source interactive vector animation toolkit: visual Studio, pure engine, React player and local CLI.\n\n## Documentation\n' + guides.map(g => `- [${g.title}](${origin}/docs/${g.slug ? `${g.slug}/` : ''}): ${g.description}`).join('\n') + `\n\n- [Complete reference](${origin}/llms-full.txt)\n- [Structural JSON Schema](${origin}/document.schema.json)\n\nUse parseDocument for semantic validation in addition to the schema. Import supports an explicit SVG subset, not arbitrary Rive/Lottie/SVG compatibility.\n`);
await writeFile(resolve(out, 'robots.txt'), origin ? `User-agent: *\nAllow: /\nSitemap: ${origin}/sitemap.xml\n` : 'User-agent: *\nDisallow: /\n');
await writeFile(resolve(out, 'sitemap.xml'), `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${origin ? routes.filter(r => r.path !== '/404.html').map(r => `<url><loc>${origin}${r.path}</loc></url>`).join('') : ''}</urlset>\n`);
console.log(`Prerendered ${routes.length} pages. ${origin ? `Canonical origin: ${origin}` : 'No SITE_URL: preview is noindex; sitemap is intentionally empty.'}`);
