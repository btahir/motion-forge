# Contributing

Read `PRODUCT.md` (why) and `packages/motion-forge/skills/motion-forge/reference.md` (the format). Use Node 22+ and pnpm 11: `pnpm install`, then `pnpm dev`.

- **Engine:** `packages/motion-forge/src/core` (no browser globals). DOM runtime and web component in `src/dom`, React in `src/react`, rendering and previews in `src/node`, CLI and MCP in `src/cli`.
- **Format changes** need an update to `reference.md` (and `SKILL.md` if the workflow changes), a test, and a check that every preset still passes `pnpm check:presets` and looks right in `motion-forge preview`.
- **Diagnostics** must say where, what, and how to fix. Prefer a lint rule over a paragraph of docs.
- **Presets:** original artwork only, shared palette, `<title>` and `<desc>`, 0 errors and 0 warnings, reviewed in `preview`. Mention the events/inputs/emits in `<desc>`.
- **Security:** never execute document content; everything goes through `sanitize`. New SVG features need an allowlist entry and a test.

Run `pnpm check`, plus `pnpm test:e2e` for site changes. Publishing and deployment are maintainer actions (`RELEASE.md`).
