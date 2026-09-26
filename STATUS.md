# Build status

## Local release readiness

The full initial local release in PRODUCT.md is implemented and verified. This is a complete scoped vector-animation toolkit and editor, not a claim of arbitrary commercial animation-suite compatibility. Source is available at github.com/btahir/motion-forge. npm publication, site deployment and demand validation remain separate pending steps.

## Delivered

- Core, React player, visual Studio, original editable presets, CLI and interchange APIs.
- Real canvas/layer/property/keyframe/easing/state/input/binding authoring, keyboard shortcuts, transactional history, local recovery and imports/exports.
- Static demo/docs site: home, examples, Studio and nine documentation guides; 13 HTML outputs including 404.
- README with original art and actual Studio screenshot, MIT license, contribution/security/support/release/deployment guides, changelog and attribution.
- Structured schema, npm-shipped agent guide, raw Markdown, llms.txt/full, metadata and robots/sitemap generation.
- GitHub CI/templates, Vercel static configuration, build/pack/site/benchmark verification scripts, Node and React examples.

## Verification

- 73 package unit/integration tests pass.
- 13 browser journeys pass against the production build, including actual exported JSON/SVG/PNG, transformed-parent dragging, input-driven state transitions, reduced motion, hydration, keyboard/locking, rejected imports and recovery.
- Axe A/AA checks pass on home/docs/examples/Studio and phone editor; this is not screen-reader certification.
- Desktop and phone visual review completed across all main surfaces; mobile crowding/canvas size and text contrast were fixed.
- External packed consumers pass ESM/CJS/type declarations/CLI, React 18 and 19 SSR and TypeScript, Studio import, CSS/docs/schema/skill file presence, and basic private-path/private-key scans.
- A clean committed checkout passes frozen install, build, typecheck, unit tests and static site checks.
- Both preview and configured-origin static metadata modes pass verification. Working source has no invented production URL.
- Production dependency audit reports zero known vulnerabilities at September 26, 2026.
- Reproducible measurements in docs/benchmark-results.json and docs/performance.md; measured React bundle 34,827 gzip bytes including validation and excluding React peers, without Studio or CSS.

The detailed requirement audit and practical limits are in docs/VERIFICATION.md. Browser automation was Chromium on macOS; remote CI and deployed behavior remain unobserved.

## Run locally

```sh
pnpm install
pnpm build:package
pnpm dev
```

Open http://127.0.0.1:4176, or /studio/ for the editor. Build output is reproducible and can be regenerated; local source, editable presets, final artwork and tests are retained. Verification servers/browser sessions and disposable test artifacts are cleaned up after verification.

## Before public release

See RELEASE.md and DEPLOYMENT.md. Repository origin is git@github.com:btahir/motion-forge.git. Confirm npm ownership, configure the real security-reporting channel, set the real production SITE_URL, and publish/deploy as explicit follow-up actions. No npm release, donation account or deployed site was created. The npm name availability check does not reserve a name.

## Product showcase

A 45-second silent HyperFrames showcase lives in videos/motion-forge, with editable scenes, original source recordings, capture/preview/verification scripts and final delivery assets. The README embeds a short GIF preview linking to the full MP4. Real Studio footage changes Scout's fill and a body keyframe, plays the animation and exports JSON; the exported edits are verified. Engine-generated footage demonstrates wave/confirm events and the numeric intensity binding.

The final composition passed HyperFrames lint, runtime, layout and contrast checks with zero errors or warnings. Scene and cut snapshots were reviewed. Render metadata and decoded-frame checks are recorded in videos/motion-forge/VERIFICATION.json. HyperFrames remains pinned to 0.8.73: the suggested 0.8.78 upgrade could not be verified because the local npm release-age policy rejected it, so the pin was restored.
