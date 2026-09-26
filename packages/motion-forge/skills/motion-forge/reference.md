# Motion SVG reference

A Motion SVG is a normal SVG file with one extra block that describes how it moves and reacts. It always renders as a static image anywhere SVG works; with the Motion Forge runtime it plays, responds to clicks, hovers, pointer position and app data.

```xml
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200">
  <title>Bouncing ball</title>
  <ellipse id="shadow" cx="100" cy="172" rx="34" ry="7" fill="#d9d4ca"/>
  <circle id="ball" cx="100" cy="60" r="26" fill="#ff5a1f"/>
  <metadata type="application/motion+json"><![CDATA[
  {
    "states": {
      "idle": {
        "duration": 900,
        "loop": true,
        "animate": {
          "#ball":   { "translateY": { "0%": 0, "50%": { "value": 86, "ease": "in" }, "100%": { "value": 0, "ease": "out" } },
                       "scaleY": { "0%": 1, "48%": 1, "55%": 0.8, "62%": 1 }, "origin": "bottom" },
          "#shadow": { "scale": { "0%": 0.6, "50%": 1, "100%": 0.6 }, "opacity": [0.4, 1, 0.4] }
        }
      }
    }
  }
  ]]></metadata>
</svg>
```

## Artwork rules

- Write ordinary SVG. Give every element you animate an `id` (or a shared `class` for groups of similar elements).
- Always set `viewBox`. Add a `<title>` as the first child (it becomes the accessible label).
- Anything you rotate or scale as a unit should be a `<g>`; animate the group.
- Put the motion block last, inside `<metadata type="application/motion+json"><![CDATA[ … ]]></metadata>`. CDATA means you never escape `<`, `&` or quotes.
- Supported: shapes, paths, groups, `<use>`, text, gradients, patterns, clip paths, masks, filters (blur, drop shadow, …), embedded `data:` images, `<style>` rules and `style=""` (folded into attributes). Removed for safety: scripts, event handlers, `<foreignObject>`, external URLs, SMIL `<animate>`.

## The motion block

```jsonc
{
  "version": 1,                         // optional
  "title": "…",                         // optional, overrides <title>
  "initial": "idle",                    // optional, defaults to the first state
  "inputs": { … },                      // values your app or interactions set
  "states": { "name": { … } },          // the state machine
  "on": { "reset": "idle" },            // events handled in every state
  "transition": 250,                    // default blend between states (ms) or { "blend": 250, "ease": "out" }
  "bind": { … },                        // inputs drive properties continuously
  "interactions": [ … ],                // click/hover/press/pointer/drag/appear, no host code needed
  "layers": { "blink": { "initial": "…", "states": { … } } }   // extra state machines running in parallel
}
```

### States

```jsonc
"waving": {
  "duration": 1600,          // ms or "1.6s"; inferred from ms keyframes; 1000 if only % keys; 0 for poses
  "loop": true,              // true = forever, or a repeat count; default plays once
  "alternate": false,        // ping-pong every other loop
  "ease": "ease-in-out",     // default easing for this state's keyframes
  "animate": {               // CSS selector → properties
    "#arm": { "rotate": [0, -40, -10, -40, 0], "origin": "15% 90%" },
    ".dot": { "translateY": { "0%": 0, "30%": -10, "60%": 0 }, "stagger": 120 }
  },
  "on":   { "wave": "waving", "done": { "to": "idle", "blend": 400, "ease": "spring" } },
  "when": { "level > 80": "alarm", "!enabled": "off" },    // conditions over inputs, checked continuously
  "next": "idle",            // where to go when this (non-looping) state finishes
  "emit": "waved",           // event your app receives when this state starts
  "allowOverflow": true,     // this state leaves the frame on purpose (silences the overflow lint)
  "set": { "progress": 0 }   // inputs to set when this state starts (e.g. a reset state)
}
```

Transitions anywhere (`on`, `when`, `next`, top-level `on`) are a state name or `{ "to": "idle", "blend": 400, "ease": "spring" }`.

- **Pose states** hold values without a timeline: `"open": { "animate": { "#lid": { "rotate": -35 } } }`. The transition blend animates into them, so poses + transitions give you smooth UI states cheaply.
- Switching states always blends from whatever is on screen (default 250ms, `out` easing) so interruptions never jump.
- Properties a state doesn't animate return to their resting value (the value in the SVG) during the blend.
- Exception: if a property was at rest and the new state gives it an explicit `0%` keyframe, it starts exactly there (so a stroke that draws on never flashes fully drawn first).
- When the player starts, it settles into the state that matches the initial inputs without playing the transitions on the way (mounting a like button with `liked: true` shows it liked, silently).

### Keyframes

Any property accepts:

| Form | Meaning |
| --- | --- |
| `42` | Hold 42 for the whole state. The transition into the state animates to it. |
| `[0, 20, 0]` | Evenly spaced keyframes over the duration. |
| `{ "0%": 0, "40%": 20, "100%": 0 }` | Percent of duration. `"from"`/`"to"` also work. |
| `{ "0": 0, "250ms": 20, "0.6s": 0 }` | Absolute times (ms by default). |
| `{ "value": 20, "ease": "spring" }` | Any keyframe value can carry the easing used to arrive at it. |

If there is no 0% key, the animation starts from the element's resting value. After the last key the value holds. `{ "value": v, "ease": "hold" }` jumps at the end of a segment instead of tweening, which is how you reset something invisibly inside a loop.

### Group options (next to the properties)

- `"origin"`: pivot for rotate/scale/skew. `"center"` (default: the element's own center), `"left top"`, `"bottom"`, `"50% 100%"` (of the element's box), or absolute coordinates `"120 80"` in the element's parent space (the artboard, unless it sits inside transformed groups). One origin per element across all states and layers; if two moves need different pivots, wrap the element in a `<g>` and give each its own.
- `"stagger"`: ms offset between each element the selector matches (in document order). In loops the offset wraps, which is how you build loaders.
- `"delay"`: ms before this group starts. In loops it wraps too, so it works as a phase offset.
- `"ease"`: default easing for this group.
- `"curve": "smooth"`: flow through the keyframes (Catmull-Rom) instead of easing to a stop at each one. Use it for arcs, figure-eights, floating and swaying paths.

### Properties

| Property | Values | Notes |
| --- | --- | --- |
| `translateX`, `translateY` | number (user units) | Moves any element. Use these, not `x`/`y`, for motion. |
| `rotate` | degrees | Around `origin`. |
| `scale`, `scaleX`, `scaleY` | number | Around `origin`. `scale` multiplies `scaleX`/`scaleY`. |
| `skewX`, `skewY` | degrees | |
| `opacity`, `fill-opacity`, `stroke-opacity` | 0..1 | |
| `fill`, `stroke`, `stop-color`, `flood-color` | any CSS color | Mixed in OKLab, so fades stay vivid. `"none"` = transparent. |
| `stroke-width`, `stroke-dashoffset` | number | |
| `draw` | 0..1, or a `[start, end]` pair as a keyframe value | Draws a stroke on/off (path, line, circle, rect, ellipse, polyline, polygon). `"draw": [0, 1]` animates 0→1; for a moving segment use pairs: `{ "0%": [0, 0.1], "100%": [0.9, 1] }`. Mark strokes that rest hidden with `data-draw="0"` on the element (static renders respect it too). |
| `d` | path data | Morphs between any two paths, even with different point counts. |
| `points` | point list | Polygon/polyline morph (same number of points). |
| geometry | number | `cx cy r rx ry x y width height x1 y1 x2 y2` on the elements that have them. |
| `stdDeviation`, `dx`, `dy`, `offset` | number | Filter blur/shadow offset, gradient stop offset. Target the filter primitive/stop by id. |
| `font-size`, `letter-spacing` | number | |
| `text` | string | Steps text content (for counters use `bind` with a template). |

camelCase aliases work (`strokeWidth`, `fillOpacity`, `stopColor`, …).

### Easing

`linear`, `ease`, `ease-in`, `ease-out`, `ease-in-out`, stronger `in`, `out`, `in-out`, `snappy`, `anticipate`, `back`, `back-in`, `elastic`, `bounce`, `spring`, `spring-soft`, `spring-bouncy`, `hold`, plus `cubic-bezier(x1, y1, x2, y2)`, `spring(stiffness, damping, mass)`, `steps(n)`. Springs are fitted to the keyframe's duration so they always land on time.

Good defaults: `out` for things arriving, `in` for things leaving, `in-out` for things moving between two places, `spring` for UI that should feel physical, `linear` only for constant rotation or progress.

### Inputs

```jsonc
"inputs": {
  "progress": { "type": "number", "min": 0, "max": 100, "default": 0, "smooth": 300 },
  "liked":    false,                                    // shorthand boolean
  "lookX":    { "type": "number", "min": -1, "max": 1, "default": 0, "smooth": 150 }
}
```

`smooth` (ms) eases the displayed value toward new values, so data changes glide instead of jumping. `"smooth": "spring"` or `"spring(stiffness, damping)"` uses a physical spring that can overshoot (needles, gauges, sliders).

Conditions (`when`) test the target value the moment it is set: `"progress >= 100"`. Prefix with `~` to test the displayed (smoothed) value instead, so a celebration waits for the bar to actually arrive: `"~progress >= 100"`. Conditions support numbers, `true`/`false`, `< <= > >= == !=`, `&& || !`, `+ - * / %` and parentheses.

### Bindings: inputs drive properties

```jsonc
"bind": {
  "#needle": { "rotate": { "input": "progress", "from": -120, "to": 120 }, "origin": "50% 90%" },
  "#bar":    { "width": { "input": "progress", "map": { "0": 0, "50": 90, "100": 200 } } },
  "#face":   { "fill": { "input": "progress", "map": { "0": "#3ecf8e", "70": "#ffb020", "100": "#ff4d4f" } } },
  "#label":  { "text": "{progress}%" }
}
```

`from`/`to` map the input's min..max. `map` takes input values as keys, and any stop can be `{ "value": v, "ease": "out" }`. Text templates (on `<text>` or `<tspan>`) take `{name}` or `{name:1}` (decimal places). Bindings override state animation for the same property; add `"add": true` to a numeric binding to add it on top instead (a head that tilts toward the pointer while it also bobs).

### Interactions (declared in the file, no host code)

```jsonc
"interactions": [
  { "on": "click",   "target": "#heart", "toggle": "liked" },
  { "on": "click",   "target": "#button", "send": "press" },
  { "on": "hover",   "target": "#card", "set": "hovered" },          // boolean input held while hovered
  { "on": "hover",   "target": "#card", "send": "enter", "leave": "exit" },
  { "on": "press",   "target": "#key", "set": "pressed" },
  { "on": "pointer", "x": "lookX", "y": "lookY" },                    // pointer position over the artwork → input range
  { "on": "drag",    "target": "#gauge", "x": "value" },              // drag across the target's box to set an input
  { "on": "drag",    "target": "#knob", "x": "value", "within": "#track" },  // map positions to another element's box
  { "on": "appear",  "send": "intro" },                               // fires once when scrolled into view
  { "on": "click",   "target": "#reset", "set": { "progress": 0 } }
]
```

Clickable targets become keyboard-focusable buttons automatically; drag targets become sliders (arrow keys, Home/End). `pointer` maps over the whole artwork (or `within`) and resets inputs to their defaults when the pointer leaves.

### Layers

Layers are extra state machines that run at the same time as the main one: a character blinks while it waves. Later layers override earlier ones for the same property, and bindings override everything (the checker warns when that hides something). Give a layer `"add": true` to add its numeric/transform values on top instead, e.g. an idle sway layer that keeps swaying while the main state rotates the same group.

```jsonc
"layers": {
  "blink": { "states": { "open": { "duration": 3800, "loop": true, "animate": { ".eye": { "scaleY": { "0%": 1, "92%": 1, "95%": 0.1, "98%": 1 } } } } } }
}
```

### How transforms compose

Animated `translateX/Y`, `rotate`, `scale`, `skew` are applied around the element's `origin`, on top of any `transform` the element already has in the SVG (in the parent's coordinate space). Nested groups compose naturally: animate the arm group, and the hand group inside it too.

## Using it

```html
<script type="module" src="https://cdn.jsdelivr.net/npm/motion-forge/dist/element.js"></script>
<motion-forge src="/like.svg"></motion-forge>
<script>
  const el = document.querySelector('motion-forge');
  el.addEventListener('statechange', e => console.log(e.detail.to));
  el.set('liked', true); el.send('wave');
</script>
```

```tsx
import { MotionForge } from 'motion-forge/react';
import like from './like.svg?raw';
<MotionForge svg={like} inputs={{ liked }} onEvent={e => e.type === 'emit' && track(e.name)} />
```

```js
import { mount } from 'motion-forge';
const anim = mount(document.querySelector('#slot'), svgText);
anim.send('wave'); anim.set('progress', 72);
```

## Checklist before you ship an animation

1. `motion-forge check file.svg` has 0 errors and you understood every warning.
2. `motion-forge preview file.svg` and look at the PNG: every state row, every input sweep. Things should stay inside their frames, rest poses should look finished, and loops should end where they start.
3. The preview also plays every event and boolean toggle through the real state machine ("flow" rows). For custom sequences, `motion-forge record file.svg --send wave@600 --set level=90@1500` prints an event log and writes a PNG grid of frames you can read (`--out x.gif` for people).
4. Motion has purpose: one clear idea per state, 150-400ms for UI feedback, 1-4s for ambient loops, easing that matches physics (`out` arriving, `in` leaving).
