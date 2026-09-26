# Static site deployment

This repository is prepared locally; no deployment is performed by build or tests.

## Build locally

```sh
pnpm install --frozen-lockfile
pnpm build
```

Output: `apps/site/dist`. The production build prerenders home, examples, nine documentation routes and a Studio shell. Studio loads as a separate client module. The guides, metadata and plain-text references are present in static files without JavaScript.

Set `SITE_URL` to the **actual public HTTPS origin** when ready to deploy. Do not invent an origin or include a path. With no SITE_URL, pages receive noindex/nofollow, robots disallows crawling, and the sitemap is empty. This protects local/preview builds from advertising fake canonical URLs. The configured origin produces canonical/OG URLs and the sitemap. Building a sitemap does not prove indexing.

## Vercel

Import the public Git repository into Vercel. Set the project root to the repository root (not apps/site). The root vercel.json specifies `pnpm install --frozen-lockfile`, `pnpm build`, and `apps/site/dist`. Select Node 22 or 24 and define SITE_URL for the production environment only. No database, secret, API key, paid add-on or runtime server is required.

Before deployment, confirm the generated canonical/robots/sitemap values with `pnpm verify:site`. The root configuration uses clean static URLs and a real 404 page; it does not rewrite every unknown route to home. After deployment, check status codes, all documented routes, CSS/chunks, social image, canonical URLs and headers on the actual host. Local build success is separate from deployed verification.

## Other static hosts

Serve apps/site/dist with directory indexes and a 404 fallback to 404.html. Preserve MIME types for JavaScript modules, SVG, JSON and CSS. Use long immutable caching for hashed assets and short/revalidated caching for HTML and documentation. The app has no service worker.
