# Motion Forge (repo guide for agents)

Read `PRODUCT.md` for the thesis and `STATUS.md` for current state. The format spec is `packages/motion-forge/skills/motion-forge/reference.md`; the agent workflow is `SKILL.md` next to it. Keep them accurate when behavior changes.

- Engine code lives in `packages/motion-forge/src/core` and must run without browser globals. Untrusted SVG always goes through `sanitize` and validation.
- Every diagnostic should say where (JSON path or element), what, and how to fix it.
- Presets in `packages/motion-forge/presets` must pass `pnpm check:presets` and be reviewed with `motion-forge preview` (look at the PNG) after any engine change that could affect them.
- Run `pnpm check` after changes; `pnpm test:e2e` for site changes; `pnpm verify:package` before a release. Stop dev servers you start.
- Don't publish, deploy, or push without the maintainer asking.
