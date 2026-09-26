# Motion Forge — release contract

An open-source toolkit for authoring interactive vector graphics. A working visual editor, small runtime, React bindings, CLI, original examples, and public documentation form one product. This is a full initial release, not a prototype or a promise to implement the important parts later.

## Product principles

Motion that feels crafted. A calm, precise studio. Immediate live feedback. Portable source. Local ownership. Human and agent edits operate on the same validated document. No account, mandatory cloud service, or model API.

## Required product surfaces

1. **Core:** versioned typed document, runtime validation with actionable paths, scene hierarchy, keyframes, easing (linear/hold/cubic/spring), deterministic seek, looping, reverse/speed, state transitions and typed inputs, input bindings, safe SVG rendering, export, document operations, JSON schema.
2. **React:** accessible SVG player, imperative playback/seek/event/input API, reduced-motion behavior, visibility/cleanup, SSR-safe import and rendering, callbacks, controlled examples. Player consumers must not receive Studio code/CSS.
3. **Studio:** functioning canvas, layer selection/visibility/locking/order, shape creation, property editing, direct manipulation, zoom/fit, timeline tracks/keyframes, play/pause/seek, easing editor, animation/state/input authoring, keyboard shortcuts, undo/redo, local save/recovery, new/open/import/export. Clear diagnostics and no silent lossy import.
4. **Interchange:** editable JSON round trip, supported SVG import with diagnostics, safe static SVG export at a chosen time, PNG export, React usage export. Explicit SVG subset; no false promise of arbitrary SVG/Rive/Lottie compatibility.
5. **Agent interfaces:** CLI validate/inspect/sample/render/schema, stable structured outputs and exit codes, npm-shipped agent guide/skill, examples that run from packed artifacts. MCP is optional unless it offers functionality unavailable through the documented CLI.
6. **Examples:** original interactive showcase pieces demonstrating character/illustration motion, interface feedback, and data-driven graphics. Usable as starting documents, fully editable in Studio.
7. **Public site:** polished demo/home, embedded/standalone Studio, examples, quickstart, API reference, format guide, import/export, accessibility, performance, troubleshooting. Crawlable rendered content, metadata, sitemap/robots setup, `llms.txt`/full machine documentation, social image, readable source snippets.
8. **Repository:** MIT license, accurate README with visuals and runnable examples, contributing/security/support/changelog, GitHub issue/PR templates and CI, clean package exports, type declarations, no secrets/private paths, release checklist, Vercel configuration and explicit deployment instructions. No public repo/npm release/deployment required by this goal.

## Verification loop

For each slice: define acceptance → implement → test independently → operate UI → inspect visually → fix → record evidence. Track defects and remaining work in `STATUS.md`. A green unit suite alone never closes the product.

### Required release gates

- Strict typecheck and unit/property tests for validation, keyframes/easing, nested transforms, states, bindings, history, import/export, malformed/adversarial documents.
- Integration tests for React playback, refs/callbacks, SSR, reduced motion, cleanup, and controlled inputs.
- End-to-end browser journeys: create/edit/animate/save/reload/reopen/export; inspect emitted output, not only download initiation. State/input editing; undo/redo; diagnostics; keyboard workflows.
- Desktop/mobile visual inspection of home, docs, examples, and Studio; explicit observations and fixes. No clipping, tiny unreadable timelines, or fake controls.
- Accessibility automation plus keyboard operation for the main flows.
- Package build/pack and external consumer smoke tests for ESM, CJS if advertised, TypeScript, React runtime, CSS/Studio, CLI. Verify README examples against the packed package.
- Production static site build and route/content checks. No docs that depend solely on client rendering for discovery. Set production origin without inventing a deployed domain.
- Validate package contents, license attribution, relative links, distributable sizes, no credential/private workspace leakage.
- Run meaningful performance checks, document measured conditions, and avoid unmeasured speed/bundle/compatibility claims.
- Stop agent-started verification servers and remove disposable test outputs before reporting release completion.

## Visual direction

Warm white documentation with ink typography, a burnt-orange accent, disciplined grid, generous whitespace, and editorial examples. Studio is a graphite instrument panel with warm-orange playhead, fine dividers, readable controls, and a light artboard. Hero art must come from the live engine, not a screenshot of a hypothetical product. Original vector work; no borrowed commercial character identities.

## Completion

Audit each numbered requirement against current source and verification output. Keep the thread goal active until all required surfaces and gates are proven. Package availability checks are provisional and do not reserve names. Local readiness is separate from publication/deployment or search indexing.
