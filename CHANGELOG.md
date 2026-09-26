# Changelog

## 0.2.0 (unreleased)

Rebuilt around agents. The v0.1 visual Studio and custom JSON scene format are gone.

- **Motion SVG format:** plain SVG plus an embedded JSON motion block (states, events, conditions, `next`, layers, keyframes, springs, stagger, smooth curves, morphing, stroke drawing, OKLab colors, inputs with spring smoothing, bindings, text templates, declarative click/hover/press/pointer/drag/appear interactions).
- **Real SVG in:** Figma, Illustrator and icon-set exports load as-is; `<style>` and `style=""` are folded into attributes; scripts, handlers, external URLs and SMIL are removed with warnings.
- **Agent tooling:** `check` (validation + motion lint), `preview` (state, flow and sweep contact sheets), `record` (frame grid/GIF/MP4 + event log), `render`, `sample`, `inspect`, `docs`, `init` (installs the skill), `dev` (live preview), `mcp` (MCP server with image-returning tools).
- **Runtime:** `<motion-forge>` web component, React component with SSR, `mount()`; reduced motion, offscreen pausing, keyboard access, instance isolation.
- **23 presets** across characters, illustrations, feedback, controls, icons, loaders, progress and data.
- New site: live preset gallery, playground with share links, docs, llms.txt.
