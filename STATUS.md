# Build status

## Current phase

Active construction and browser verification. Full release completion is **not** established. Follow all requirements in PRODUCT.md; do not reduce scope to the features currently present.

## Implemented

- Versioned validated document, safe generated SVG, deterministic keyframes/easing, pure clock player, state transitions, inputs/bindings, transactional history.
- React player and static SVG component: SSR, gradient namespacing, refs/callbacks, reduced-motion and visibility handling. Runtime entrypoint is separate from Studio.
- Original editable Scout, Made it, and Signal presets.
- Explicit-subset SVG importer with rejection diagnostics, JSON/React/SVG/PNG export code.
- CLI validate/inspect/sample/render/schema/preset, structured diagnostics and exit codes.
- Studio canvas drag, layers, visibility/locks/order, shape creation, inspector, keyframes/easing, state/input/binding panels, undo/redo, keyboard shortcuts, local recovery and file workflows.
- Vite React site with live homepage, examples, initial documentation, lazy Studio. Detailed docs/static prerender/SEO and release files are still incomplete.
- Package builds ESM/CJS/declarations; postbuild produces JSON schema, CSS and executable CLI.

## Verified evidence (September 26, 2026)

- Package and site strict typechecks passed before latest UI fixes.
- 50 unit/integration tests passed: core, SVG import/security diagnostics, React SSR/mount/ref/cleanup/reduced motion/visibility, original preset sampling and CLI.
- First Playwright pass: create/keyframe/export JSON/undo/redo/reload/reopen passed; drag/nudge/lock passed; rejected import preserves document passed.
- First browser visual review: desktop homepage and Studio render without page errors or framework overlays. Original SVG character visibly renders from runtime.
- Found state-creation selection bug: changing to newly created state used previous player document. Fixed selection bridge; retesting.
- Found low contrast in supporting site text. Adjusted colors; accessibility rerun pending.
- First mobile review found cramped homepage navigation and undersized Studio canvas. Changed phone navigation to two rows and Studio panels to stacked layout; visual recheck pending.

## Next work / unresolved

1. Finish current Playwright/a11y rerun, visually inspect revised desktop/mobile routes. Add PNG output verification, state input condition tests, easing/keyframe editing tests, recovery failure preservation and keyboard/accessibility coverage.
2. Audit core edges (transition completion during long blend; public malformed frame bounds; importer normalization/unsupported namespace diagnostics; documentation of tick-boundary completion semantics). Add meaningful tests.
3. Complete static prerender routes and detailed API/format/import-export/accessibility/performance/troubleshooting guides. Add llms.txt, llms-full, sitemap/robots configuration, social image and accurate metadata.
4. MIT license/README/screenshots/source examples/CONTRIBUTING/SECURITY/SUPPORT/changelog, GitHub workflows/templates, npm-shipped agent guide, Vercel/release instructions. No deployment or publication requested.
5. Build/pack external consumer ESM/CJS/TS/React/Studio/CLI checks, README examples, package-content/security/license audit and performance measurements.
6. Final requirement-by-requirement PRODUCT.md audit. Stop verification servers/browser and remove disposable outputs at completion.

## Local workflow

Repo: `maybe_delete/motion-forge`. `pnpm build:package` must run before site typecheck/first dev start because site imports the packaged exports. `pnpm dev` runs Vite at 127.0.0.1:4176. `pnpm test` runs package tests; `pnpm exec playwright test` runs browser journeys (reuses local dev server). Site build currently references a prerender script still to be implemented.

`motion-forge` returned npm 404 on September 26; name is not reserved. No Git repo initialized, public repo created, package published, or site deployed.
