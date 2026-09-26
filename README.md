# Motion Forge

**Animations your agent can write, see, and ship.**

Motion Forge makes interactive animation plain text. A *Motion SVG* is an ordinary SVG with a small JSON block describing states, keyframes, springs, morphs, inputs and interactions. Coding agents write it fluently, the CLI turns motion into things a model can read (diagnostics, element maps, frame-by-frame contact sheets), and a ~30 KB runtime plays it anywhere.

![Eight Motion Forge presets reacting to clicks and data: a robot waving, a like button, a toggle, a progress ring, a gauge, a theme toggle, a notification bell and an upload cloud](docs/media/gallery.gif)

<sub>Every frame above was rendered by Motion Forge’s own engine from the files in [`presets/`](packages/motion-forge/presets), driven by scripted events and inputs.</sub>

## Why this exists

Agents can already write CSS transitions and Framer Motion code. What they can’t do is *see* motion, so illustrated, stateful animation (mascots, success moments, data widgets, onboarding art) has stayed locked in designer tools with binary formats: Rive (paid to export, closed editor) and Lottie (After Effects JSON, interactivity as a vendor extension).

Motion Forge is built around the agent’s loop:

| Step | What happens |
| --- | --- |
| **Write** | Plain SVG plus JSON: states, keyframes, easing, inputs, bindings, interactions. Any real SVG works: Figma, Illustrator, icon sets. |
| **Check** | `motion-forge check` validates everything and lints motion: loop seams, clipping, layer conflicts, dead states, no-op tracks, with JSON paths and “did you mean”. |
| **See** | `motion-forge preview` renders a contact sheet: every state over time, every event and toggle played through the real state machine, and input sweeps. `record` scripts clicks and data into a frame grid, GIF or MP4. |
| **Ship** | `<motion-forge src="like.svg">`, `<MotionForge svg={…}>` in React (with SSR), or `mount(el, svg)`. Events and inputs are the API. |

![Contact sheet produced by motion-forge preview for the like button](docs/media/preview-like.png)

## Quick start

```sh
npx motion-forge init                 # installs the agent skill + an AGENTS.md note
npm i motion-forge
```

Then ask your agent for what you want: “a like button that pops”, “make our mascot wave when the upload finishes”, “a gauge for CPU usage in our brand colors”. The skill tells it to start from a preset or a template, check, look at the preview, and iterate.

Doing it by hand:

```sh
npx motion-forge list                          # 23 presets: characters, feedback, controls, loaders, data…
npx motion-forge add like --dir src/motion     # copy one into your project
npx motion-forge check src/motion/like.svg
npx motion-forge preview src/motion/like.svg   # writes a PNG contact sheet
npx motion-forge dev src/motion/like.svg       # live preview with controls, reloads on save
```

## The format in one screen

```xml
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200">
  <title>Like button</title>
  <path id="heart" d="M100 160 C 40 120 …" fill="#d8d2c6"/>
  <metadata type="application/motion+json"><![CDATA[
  {
    "inputs": { "liked": false },
    "states": {
      "off": { "animate": { "#heart": { "fill": "#d8d2c6", "scale": 1 } }, "when": { "liked": "pop" } },
      "pop": {
        "duration": 450,
        "animate": { "#heart": { "fill": "#ff4d6d", "scale": { "0%": 0.6, "60%": 1.25, "100%": { "value": 1, "ease": "spring" } } } },
        "when": { "!liked": "off" },
        "emit": "liked"
      }
    },
    "interactions": [{ "on": "click", "target": "#heart", "toggle": "liked" }]
  }
  ]]></metadata>
</svg>
```

It renders as a static heart anywhere SVG works (GitHub, Figma, `<img>`). With the runtime it’s a keyboard-accessible button that pops with a spring and tells your app `liked`.

What the format covers: state machines with events, conditions and `next`; parallel layers (blink while waving); springs and 20+ easings; stagger; smooth curves through keyframes; path morphing between any shapes; stroke drawing; OKLab color blends; input bindings with maps, text templates and spring smoothing; click, hover, press, pointer-follow, drag (keyboard-accessible) and scroll-into-view interactions. Full reference: [`skills/motion-forge/reference.md`](packages/motion-forge/skills/motion-forge/reference.md).

## Using it in an app

```html
<script type="module" src="https://cdn.jsdelivr.net/npm/motion-forge/dist/element.js"></script>
<motion-forge src="/like.svg"></motion-forge>
<script>
  const like = document.querySelector('motion-forge');
  like.addEventListener('emit', e => console.log(e.detail.name)); // "liked"
  like.set('liked', true);
</script>
```

```tsx
import { MotionForge } from 'motion-forge/react';
import like from './like.svg?raw';

<MotionForge svg={like} inputs={{ liked }} onEvent={e => e.type === 'emit' && track(e.name)} />;
```

```js
import { mount } from 'motion-forge';
const anim = mount(document.querySelector('#slot'), svgText);
anim.send('wave');
anim.set('progress', 72);
```

The runtime respects `prefers-reduced-motion`, pauses offscreen, isolates instances (ids are prefixed, Shadow DOM for the web component), and settles into the right state for the initial inputs without replaying transitions.

## For agents and tools

- **Skill:** `npx motion-forge init` copies [`SKILL.md`](packages/motion-forge/skills/motion-forge/SKILL.md) and the reference into `.claude/skills/`, and adds a note to `AGENTS.md` for Cursor, Codex and friends.
- **MCP:** `{ "command": "npx", "args": ["motion-forge", "mcp"] }` exposes `motion_docs`, `motion_presets`, `motion_check`, `motion_inspect`, `motion_preview` and `motion_render` (these return images), and `motion_record`.
- **CLI:** every command prints text an agent can act on; `--json` where structure helps. `motion-forge docs` prints the full reference.
- **Web:** the site serves `llms.txt`, `llms-full.txt`, `reference.md` and `presets.json`.

## How it compares

| | Motion Forge | Lottie | Rive |
| --- | --- | --- | --- |
| Source | SVG + JSON text | After Effects JSON | Binary `.riv` |
| Interactive states | Built in | dotLottie extension | Built in |
| Authoring | Your agent, your editor, the playground | After Effects / Lottie Creator | Rive editor (export needs a paid plan) |
| Agent can verify visually | `check`, `preview`, `record` | — | Through the editor |
| Web runtime, gzip | ~30 KB | ~76 KB (lottie-web) | ~900 KB (canvas + wasm) |
| License | MIT | MIT runtime | MIT runtime, closed editor |

Motion Forge doesn’t import or export Lottie/Rive files, and it isn’t a designer timeline tool. It’s for the workflow where your agent authors and you direct. Sizes: [`docs/size.json`](docs/size.json) (`pnpm size`); Lottie/Rive measured from their npm builds, September 2026.

## Develop

```sh
pnpm install
pnpm dev            # builds the package, runs the site at http://127.0.0.1:4176
pnpm check          # build + typecheck + unit tests
pnpm check:presets  # every preset passes check
pnpm test:e2e       # Playwright journeys against the site
pnpm verify:package # pack, install into a clean project, exercise every entry point + CLI
```

Layout: `packages/motion-forge` (engine, runtime, React, CLI, presets, skill) and `apps/site` (landing page, playground, docs; static, prerendered, Vercel-ready).

## Status

v0.2, pre-release: not yet published to npm, site not yet deployed. See [STATUS.md](STATUS.md) for what’s verified and what’s next.

## License

[MIT](LICENSE)
