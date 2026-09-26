# Motion Forge: product brief

## Thesis

Coding agents are becoming the main way software gets built, and they can write animation code, but they can't *see* motion. So illustrated, stateful, interactive animation (mascots, success moments, data widgets, onboarding art, micro-interactions) still lives in designer tools with binary or export-only formats. Motion Forge is the open, text-first format and toolchain that lets an agent author that kind of motion, verify it visually, and ship it, with a human directing.

## Principles

1. **Agent-first.** The primary user is a coding agent acting for a developer. Every surface must be legible to a model: text formats, actionable diagnostics with paths and suggestions, and images of motion over time.
2. **It's just SVG.** Artwork is ordinary SVG (any real export loads); motion is JSON in the same file. Files render statically anywhere and diff cleanly.
3. **Eyes for agents.** `check` (validation + motion lint), `preview` (contact sheets of states, flows and sweeps), `record` (scripted playback as frame grids/GIF/MP4), `inspect` (element map with bounds). If an agent can't see a problem, the tool should surface it.
4. **Interaction is declarative.** States, events, conditions, bindings and pointer interactions live in the file, so it works with zero host code and exposes a clean events/inputs API.
5. **Small, safe runtime.** Web component, React and vanilla; sanitized (no scripts, handlers or external URLs); accessible (titles, keyboard, reduced motion); isolated instances.
6. **Honest.** No claims we haven't measured. No Lottie/Rive compatibility claims.

## Surfaces

- `motion-forge` package: engine (parse, sanitize, validate, sample, state machine), DOM runtime, `<motion-forge>` element, React component, Node rendering (PNG/GIF/MP4), CLI, MCP server, agent skill, 23 presets.
- Site: landing page with live interactive presets, playground (editor, live preview, auto controls, diagnostics, frames, share links), docs, llms.txt.

## Quality bar

- Every preset passes `check` with 0 errors and 0 warnings (intended exceptions use `allowOverflow`) and was visually reviewed in `preview`.
- Unit, DOM/React, CLI and MCP tests; browser journeys for the site; packed-tarball consumer test.
- Agent evals: fresh agents build animations from user prompts using only the skill and CLI; findings feed back into the format and tools.
