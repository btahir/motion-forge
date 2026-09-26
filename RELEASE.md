# Releasing

1. `pnpm install && pnpm check && pnpm check:presets && pnpm test:e2e && pnpm verify:package`
2. Bump `packages/motion-forge/package.json` version and `VERSION` in `packages/motion-forge/src/cli/paths.ts`; update `CHANGELOG.md`.
3. `cd packages/motion-forge && npm publish --access public`
4. Site: set `SITE_URL` to the production origin and deploy (Vercel uses `vercel.json`: `pnpm build`, output `apps/site/dist`).
5. Regenerate README media if presets changed: `pnpm build:package && node scripts/readme-media.mjs`.
