# Status

**v0.2.0, pre-release.** Rebuilt from the v0.1 visual-editor product (still in git history) into an agent-first format and toolchain. Not yet published to npm; site not yet deployed.

## Verified (2026-09-26, macOS, Node 24)

- `pnpm check`: build, strict typecheck (package, site, React example) and 46 unit/DOM/React/CLI/MCP tests pass.
- `pnpm check:presets`: all 23 presets pass `check` with 0 errors and 0 warnings; each was reviewed visually with `preview`, and flows with `record`.
- `pnpm test:e2e`: 7 Playwright journeys against the dev site (hero interactions, keyboard access in the gallery, playground editing, diagnostics, frames, share links, docs, reduced motion, phone overflow).
- `pnpm verify:package`: packs the tarball (132 KB, no sources or tests), installs it into a clean project with React 19, and exercises ESM imports, types, React SSR, the Node rendering API, and the CLI (`add`, `check`, `preview`, `docs`, `init`).
- Real-world SVG loads: a Heroicon (currentColor, class), a Figma export (gradients, fill-rule) and an Illustrator export (`<style>`, rgb(), onclick, script, external image) all load, with unsafe parts removed and reported.
- Runtime size (esbuild, minified + gzip): ~30 KB for the web component, including validation and diagnostics. See `docs/size.json`.
- Agent evals: two fresh agents given only the skill, reference and CLI (no presets) built three interactive animations from verbatim user prompts: a dark-theme sync-cloud mascot (~6 min, 5 visual iterations), a 0-30 watering-streak plant and an add-to-garden button. All ended at 0 errors, 0 warnings; the files are live on the landing page. Four preset-authoring agents and both evals filed friction reports that drove two engine passes (spring and fixed-duration smoothing, `~displayed` conditions, settle-on-mount, state `set`, flow rows in previews, record strips + event logs, `--bg`, additive layers/bindings, smooth curves, accurate overflow/conflict lint, `data-draw`, drag keyboard access).

## Not done / next

1. Publish to npm (`npm publish` from `packages/motion-forge` after `pnpm build`), then deploy the site (`SITE_URL=https://… pnpm build`, Vercel config in `vercel.json`).
2. Runtime diet: move diagnostic text out of the runtime path (a "lean" build) to get the player under ~15 KB.
3. Lottie export for the animation-only subset (plays anywhere Lottie does), and Lottie import.
4. A human-friendly timeline in the playground for retiming keyframes by dragging.
5. More presets, and community submissions validated by `check` in CI.
