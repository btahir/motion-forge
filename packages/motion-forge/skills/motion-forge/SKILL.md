---
name: motion-forge
description: Create interactive animations (animated icons, loaders, toggles, success/error feedback, mascots and characters, onboarding illustrations, data gauges, hover and click effects) as Motion SVG files, verify them visually with the motion-forge CLI, and wire them into React or plain HTML. Use when the user asks for an animation, an animated illustration or icon, micro-interactions, a Lottie- or Rive-style asset, or motion that reacts to clicks, hover, pointer or app state.
---

# Motion Forge

A Motion SVG is plain SVG plus a JSON motion block: a state machine, keyframes, inputs, bindings and interactions. You write it as text, the CLI shows you what it looks like, and the runtime plays it in any web app.

Full format: `reference.md` in this folder (or run `npx motion-forge docs`).

## Workflow (follow it every time)

1. **Start from something close.** Run `npx motion-forge list`. If a preset is near what the user wants, `npx motion-forge add <preset> --dir <assets dir>` and adapt it. Otherwise `npx motion-forge new <path>.svg`.
2. **Draw the artwork first.** Clean SVG with a `viewBox`, a `<title>`, and ids on everything that moves. Group parts that move together (`<g id="arm">`). Keep 8-12% padding inside the viewBox so scale-ups and overshoot don't clip.
3. **Design the states before the keyframes.** Name them after what the user sees (`idle`, `hover`, `loading`, `success`). Decide how you get between them: events (`on`), input conditions (`when`), `next` after a one-shot, or interactions in the file.
4. **Write the motion block.** Prefer poses + blends for UI states, keyframed loops for ambient motion, bindings for data. Set `origin` for anything that rotates or scales around a joint.
5. **Check:** `npx motion-forge check <file>`. Fix every error. Read the warnings; loop seams, overflow and static channels are almost always real bugs. Use `check --strict <file>` when CI should reject warnings.
6. **Look:** `npx motion-forge preview <file> --out /tmp/<name>.png`, then open the PNG with your image-reading tool. Each state is a row of frames over time; every event and boolean toggle gets a "flow" row played through the real state machine (blends, `next`, conditions); each bound input gets a sweep row. If the app has a dark or colored background, add `--bg '<color>'` so you judge contrast on the real surface. Judge it like a motion designer: silhouettes readable, spacing even, nothing clipped, rest poses complete, loops seamless, no flashes between states.
7. **Play custom flows:** `npx motion-forge record <file> --send <event>@600 --set <input>=<value>@1200` prints an event log (state changes, emits) and writes a PNG grid of frames over time to read. Include reversal/interruption and reset paths. Preview flow rows start directly in each source state and exercise both boolean directions; they are not exhaustive reachability tests. Use `--out x.gif` only for humans.
8. **Iterate** until the preview looks intentional. Then wire it in (below) and tell the user which events/inputs the file exposes.

## Wiring it into an app

- React: `import { MotionForge } from 'motion-forge/react'` then `<MotionForge svg={source} inputs={{ progress }} onEvent={…} />` (`src="/file.svg"` also works; `svg` renders on the server).
- Anything else: `import 'motion-forge/element'` then `<motion-forge src="/file.svg"></motion-forge>`, with `el.send(event)`, `el.set(input, value)` and `statechange`/`emit` DOM events.
- Vanilla: `import { mount } from 'motion-forge'`; `mount(el, svgText)` returns `{ send, set, goto, play, pause, destroy }`.
- Install: `npm i motion-forge`.

## Taste rules

- One idea per state. UI feedback 150-400ms; attention loops 1-4s; nothing jittery under 60ms.
- Arrivals use `out`/`spring`; departures use `in`; anticipation before big moves (`anticipate`, or a small counter-move keyframe).
- Overlap and stagger (20-80ms) make groups feel alive; identical timing looks mechanical.
- Squash and stretch around the contact point (`origin: "bottom"`), not the center.
- Respect the palette the user already has. Pull colors from their CSS/theme when you can.
- Loops must end exactly where they start (the checker flags seams). Blinks, breathing and floating belong in `layers` so they keep running during other states.
- Celebrate when the value the user sees arrives: `"~progress >= 100"` waits for smoothed values; `"progress >= 100"` fires instantly.
- Strokes that should start hidden get `data-draw="0"` in the SVG. A bare value in a state holds it; the transition animates into it.

## Things that are not supported

Arbitrary JavaScript, external images/fonts/URLs, SMIL, skeletal bones, and 3D. Text renders with the host's fonts; outline text into paths when the exact typeface matters.
