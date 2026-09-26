# Contributing

Motion Forge shares one document format across core, Studio, React and CLI. Read PRODUCT.md and docs/format.md before changing semantics.

Use Node 22/24 and pnpm 11. Run `pnpm install`, `pnpm build:package`, then `pnpm dev`. Core source is `packages/motion-forge/src/core`; React, Studio, presets and CLI are adjacent entrypoints. The site is `apps/site`; shared Markdown docs are `docs`.

Changes should include independent behavioral expectations and invalid cases where relevant. Run `pnpm check` and the browser journeys affected by your change. Check actual exported data, keyboard operation and responsive layouts. Do not mistake a snapshot of a button for proof that its action works.

Keep the runtime independent of Studio code/CSS. Validate untrusted documents, preserve unrelated data, and reject unsupported imports explicitly. Never evaluate document strings or interpolate arbitrary SVG/HTML. Add schema migrations before changing persisted format semantics. Breaking format changes require a version change and migration story.

For visual work, capture desktop and phone views, inspect them, then remove disposable captures. Preserve original editable artwork. Do not add external assets without provenance and license information.

Use the pull-request template to explain the user-visible change, validation and remaining limitations. Keep fixes focused. Repository publishing, npm release and deployment are separate maintainer actions described in RELEASE.md.
