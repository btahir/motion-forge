# Deploying the site

The site in `apps/site` is fully static and prerendered.

```sh
SITE_URL=https://your-domain.example pnpm build   # apps/site/dist
```

- Without `SITE_URL` the build is a noindex preview (robots disallow, empty sitemap).
- `vercel.json` is set up for Vercel: install with `pnpm install --frozen-lockfile`, build with `pnpm build`, output `apps/site/dist`.
- The build also emits `llms.txt`, `llms-full.txt`, `reference.md`, `SKILL.md`, `presets.json`, `/presets/*.svg` and `/runtime/motion-forge.js` (the IIFE runtime).
