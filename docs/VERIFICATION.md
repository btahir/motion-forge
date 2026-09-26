# Local verification — September 26, 2026

This is evidence for the local initial release, not publication, deployment, adoption, or universal compatibility.

## Product contract audit

| Required surface | Implementation and evidence |
| --- | --- |
| Portable core | `packages/motion-forge/src/core`: strict schema and semantic validation, graph, tracks, interpolation, pure clock, states/inputs/bindings, safe SVG, transactions. Unit tests exercise invalid references, cycles, ordering, nonfinite values, hostile paints/text, deterministic stepping, interruption, long blends and extreme ranges. |
| React | Separate `react` entrypoint; SSR, stable external-store subscription, imperative API and callbacks, one RAF chain, reduced motion, hidden-tab lifecycle. Unit integration tests and production browser checks exercise these. React 18/19 and TypeScript smoke-tested from the packed artifact. |
| Studio | Real canvas drag including transformed parents, layer operations/locks, typed inspector, keyframes/custom curves/springs, state/input/transition/binding editing, keyboard, history, file flows and recovery. Browser tests inspect the emitted document and rendered transforms. |
| Interchange | JSON round trip/reopen, explicit-subset SVG import with diagnostics, frame SVG/PNG and React source export. Browser tests reject unsupported files without replacing work; PNG dimensions and a known pixel are asserted. |
| Agent interfaces | CLI validate/inspect/sample/render/schema/preset; structured exits/diagnostics. External consumer runs actual installed executable. Agent skill and schema ship in tarball. MCP omitted because CLI/runtime expose the needed operations. |
| Original examples | Scout character, Made it feedback, Signal data dial; all editable and validated. Independent samples across their clips stay finite; production controls change actual SVG attributes. |
| Site/docs | Thirteen generated HTML pages including 404, twelve public routes, nine guides; raw Markdown, llms.txt/full, schema, metadata, robots/sitemap and original social art. Static verifier checks links/assets and rendered content. Studio loads separately. |
| Repository/release | MIT, README with original SVG, contributing/security/support/changelog, attribution, GitHub CI/templates, pack/install verifier, examples, Vercel config, release/deployment instructions. Git is local; no remote/release/deployment was created. |

## Automated checks

- Strict TypeScript across package, site and React example.
- Package unit/integration suite, including property-style invariants over timeline samples and adversarial fixtures.
- Thirteen Chromium browser journeys: full edit/animate/save/recover/reopen, drag/nudge/lock, state/input/binding authoring, condition transitions, rejected imports, actual SVG/PNG output, easing edits, phone viewport, hydration/interactivity and reduced motion.
- Axe WCAG A/AA checks on home, docs, examples, Studio and the phone editor pass. This is not a screen-reader certification.
- Packed external consumer checks: ESM/CJS exports, type declarations, React 18 and 19 SSR/typechecking, Studio/CSS presence, CLI outputs, shipped docs/schema/skill and basic private-path/private-key scan.
- Production dependency audit reported zero known vulnerabilities at this date. This is a point-in-time registry advisory check, not a security guarantee.
- Reproducible sampler/bundle measurements are recorded in `benchmark-results.json` and the performance guide. No browser-FPS claim is made.

## Visual review

Inspected desktop homepage, Studio, API guide and example gallery; inspected phone versions of all four. Fixed mobile header crowding, changed phone Studio to a full-width canvas with stacked panels, and increased supporting-text contrast. Reviewed the generated character artwork and live SVG rendering. Added a visible pause control to the looping Scout demo. Desktop timeline/panels scroll independently; phone timeline preserves readable lanes with horizontal scrolling.

## Practical boundaries

- This initial product has an explicit vector subset. It does not claim arbitrary SVG/Rive/Lottie compatibility, bitmap/audio/video support, rigs or path morphing.
- Node 24 was used locally. CI is configured for Node 22 and 24; remote CI execution remains unobserved until a repository is pushed.
- Browser automation ran Chromium on macOS. Safari/Firefox and screen-reader behavior are not certified by these results.
- Fonts use generic families and vary by platform. Storage recovery is browser-local; export JSON for a portable copy.
- No SITE_URL is configured in the working preview: robots blocks crawling, canonicals are omitted and the sitemap is empty. The release owner must provide the real production origin and verify the deployed host.
