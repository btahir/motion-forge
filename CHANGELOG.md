# Changelog

## 0.2.0 (unreleased)

Rebuilt around agents. The v0.1 visual Studio and custom JSON scene format are gone.

- **Motion SVG format:** plain SVG plus an embedded JSON motion block (states, events, conditions, `next`, layers, keyframes, springs, stagger, smooth curves, morphing, stroke drawing, OKLab colors, inputs with spring smoothing, bindings, text templates, declarative click/hover/press/pointer/drag/appear interactions).
- **SVG imports:** supported vector artwork from Figma, Illustrator and icon sets; `<style>` and `style=""` are folded into attributes; scripts, handlers, external URLs and SMIL are removed with warnings.
- **Agent tooling:** `check` (validation + motion lint), `preview` (state, flow and sweep contact sheets), `record` (frame grid/GIF/MP4 + event log), `render`, `sample`, `inspect`, `docs`, `init` (installs the skill), `dev` (live preview), `mcp` (MCP server with image-returning tools).
- **Runtime:** `<motion-forge>` web component, React component with SSR, `mount()`; reduced motion, offscreen pausing, keyboard access, instance isolation.
- **23 presets** across characters, illustrations, feedback, controls, icons, loaders, progress and data.
- New site: live preset gallery, playground with share links, docs, llms.txt.

### Review hardening

- Fail closed on non-SVG roots; bound source size/nesting, diagnose malformed expressions and text precision, and preserve accessible ID references across inline copies.
- Bound recursive state-entry conditions, keep timer-only states alive, preserve exact completion boundaries, and prevent duplicate animation clocks. Follow live reduced-motion changes and cancel offscreen frames.
- Isolate React SSR IDs, preserve instances on title/playback updates, report errors, and cancel stale fetches. Apply web-component initial inputs before rendering and cancel detached loads.
- Complete root-click/press keyboard behavior, announce toggle values, preserve focus indicators and support lost pointer capture.
- Preview every handled state/event pair and both boolean directions; validate render options and scripts, record exact action times, and expose recordStrip from the Node API. `check --strict` fails on warnings.
- Reproducible runtime size comparison: `pnpm size:compare` measures pinned Lottie, dotLottie and Rive packages alongside Motion Forge (31 KB vs 76 KB / 532 KB / 916 KB gzip, JS + wasm).
- The README and landing-page example is now a real file, `examples/like.svg`, shown verbatim (a test keeps them identical). The README adds a GIF of it being clicked and its own contact sheet; the site runs it live next to the code, and its check output and contact sheet come from the same file.
- `preview` flow frames name the layer states a flow changes (`+80ms idle · hover/over`), so layer-only changes no longer look like nothing happened.
- Clickable SVG elements no longer show Chrome's focus ring after a mouse click; keyboard focus still shows it.
- Package metadata links the website and repository.
- Add playground import, draft recovery, pause/restart/scrubbing, event logs, bounded share decoding and truthful clipboard status. Improve text contrast and keyboard scrolling.
- Verify actual packed TypeScript exports in a clean consumer. Correct comparisons to acknowledge Rive's RML/CLI and remove unsupported comparative size claims.
