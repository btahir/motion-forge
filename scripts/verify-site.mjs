import { readFile, access, readdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';
const root = resolve(import.meta.dirname, '..'); const dist = resolve(root, 'apps/site/dist');
const guides = JSON.parse(await readFile(resolve(root, 'docs/manifest.json'), 'utf8'));
const routes = ['/', '/examples/', '/studio/', ...guides.map(g => `/docs/${g.slug ? `${g.slug}/` : ''}`)];
for (const route of routes) {
  const html = await readFile(resolve(dist, `.${route}index.html`), 'utf8');
  assert.match(html, /<h1[\s>]/, `Missing rendered heading: ${route}`); assert.match(html, /<meta name="description" content="[^"]+"/);
  assert(!html.includes('<!--app-->'), `Unrendered route ${route}`);
  for (const match of html.matchAll(/(?:href|src)="(\/[^"#?]*)/g)) {
    const path = match[1]; if (path.startsWith('//')) continue;
    await access(resolve(dist, `.${path}${path.endsWith('/') ? 'index.html' : ''}`)).catch(() => { throw new Error(`Broken local link/asset on ${route}: ${path}`); });
  }
  if (route.startsWith('/docs/')) assert(html.includes('class="markdown"') && html.includes('<h2>'), `Missing documentation source on ${route}`);
}
for (const name of ['llms.txt', 'llms-full.txt', 'document.schema.json', 'robots.txt', 'sitemap.xml', '404.html', 'social.png', 'icon.svg']) await access(resolve(dist, name));
const docs = await readFile(resolve(dist, 'llms-full.txt'), 'utf8'); assert(docs.includes('ForgePlayer') && docs.includes('parseDocument') && docs.includes('Unsupported'));
const robots = await readFile(resolve(dist, 'robots.txt'), 'utf8'); const sitemap = await readFile(resolve(dist, 'sitemap.xml'), 'utf8');
if (process.env.SITE_URL) { assert(robots.includes(`Sitemap: ${new URL(process.env.SITE_URL).origin}/sitemap.xml`)); assert.equal([...sitemap.matchAll(/<loc>/g)].length, routes.length); }
else { assert(robots.includes('Disallow: /')); assert(!sitemap.includes('<loc>')); }
const assets = await readdir(resolve(dist, 'assets')); assert(assets.some(f => f.startsWith('StudioRoute-') && f.endsWith('.js'))); assert(assets.some(f => f.startsWith('StudioRoute-') && f.endsWith('.css')));
console.log(`Verified ${routes.length} rendered routes, local links/assets, split Studio, metadata setup and agent references.`);
