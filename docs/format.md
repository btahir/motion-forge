# The animation document

Motion Forge version 1 is plain JSON with no executable code, arbitrary HTML, external assets, or required service. The JSON Schema ships with the package; semantic validation checks the relationships a structural schema cannot describe.

## A minimal animated rectangle

```json
{
  "version": 1,
  "name": "First move",
  "width": 400,
  "height": 240,
  "background": "#f6f3eb",
  "nodes": [
    { "id": "box", "name": "Box", "type": "rect", "x": 40, "y": 80,
      "width": 80, "height": 80, "radius": 16, "fill": "#ee7148" }
  ],
  "clips": [
    { "id": "slide", "name": "Slide", "duration": 1600, "tracks": [
      { "id": "box-x", "nodeId": "box", "property": "x", "keyframes": [
        { "time": 0, "value": 40, "easing": "ease-in-out" },
        { "time": 800, "value": 280, "easing": "ease-in-out" },
        { "time": 1600, "value": 40 }
      ] }
    ] }
  ],
  "states": [{ "id": "idle", "name": "Idle", "clipId": "slide", "loop": true }],
  "initialState": "idle"
}
```

Pass this object to `parseDocument` to fill defaults and validate it. Editing tools should preserve IDs so diffs, tracks and bindings remain meaningful.

## Scene graph

The flat `nodes` array defines drawing order among siblings: later siblings draw on top. A node's optional `parentId` must reference a group. Parent transforms and opacity affect descendants. Cycles and more than 32 levels are rejected.

Supported nodes: `group`, `rect`, `ellipse`, `line`, `path`, `text`. Ellipses are centered at their local origin; rectangles extend from local (0, 0). A line starts at local (0, 0) and ends at (`x2`, `y2`). Paths use SVG path data. Text uses one plain text run and generic sans-serif/serif/monospace families.

Transforms apply as `translate(x,y) translate(originX,originY) rotate(rotation) scale(scaleX,scaleY) translate(-originX,-originY)`. Rotation is degrees. Scale defaults to 1; opacity to 1. Visibility hides the node and subtree. Locks are an editor constraint, not a playback effect.

## Tracks and timing

Each clip has a positive duration in milliseconds and at most one track for each node/property pair. Keyframe times must be unique, ascending, and within the clip. Before/after the first/last key, the endpoint value holds. The **outgoing keyframe** controls easing toward the next key.

Animated numeric properties: `x`, `y`, `rotation`, `scaleX`, `scaleY`, `opacity`, `originX`, `originY`, `width`, `height`, `radius`, `rx`, `ry`, `x2`, `y2`, `strokeWidth`, `fontSize`, `strokeDashoffset`. `fill` and `stroke` support hex color interpolation. Shape path data and text content are editable static properties, not morphing or text animation channels.

Easing values: `linear`, `hold`, `ease-in`, `ease-out`, `ease-in-out`, `spring`; or `{ "type": "cubic", "points": [x1,y1,x2,y2] }`; or `{ "type": "spring", "stiffness": 170, "damping": 18, "mass": 1 }`. Cubic X control points lie in [0,1]. Spring progress may overshoot. Physical durations are normalized to the segment duration; this is a deterministic curve, not a real-time physics integrator.

## States and transitions

A state references one clip and optionally loops. `initialState` names an existing state. Transitions have an ID, `from` (state ID or `*`), `to`, `duration` for blending, easing, and a trigger:

```json
{ "type": "event", "event": "activate" }
```

```json
{ "type": "input", "inputId": "progress", "operator": "gte", "value": 100 }
```

```json
{ "type": "complete" }
```

Inputs are numeric (min, max, default) or boolean (default). Boolean conditions support `eq`; numeric conditions also support `gt`, `gte`, `lt`, `lte`. Conditions are evaluated when that input is set, not continuously during sampling. Completion transitions occur only for non-looping states. Same-state transitions are skipped.

## Bindings and gradients

A binding maps one numeric input linearly from its declared min/max into a property's `from`/`to`. Only one binding per node/property is allowed. Bindings override animation channels and transition blends on that property.

Paints accept 3-, 6-, or 8-digit hex, `none`, or `url(#gradient-id)`. Gradients are local document definitions with linear/radial type and hex-color stops. Linear coordinates x1/y1/x2/y2 are normalized to the target bounding box. Radial gradients use x1/y1 as center and x2 as radius; y2 is unused. React instances namespace gradient IDs to avoid collisions.

## Limits and portability

Artboards are 1–8192 pixels per dimension. A document supports up to 2,000 nodes, 100 clips/states, 100 inputs, 1,000 transitions and 2,000 bindings. Coordinates and keyframes have finite bounds; inspect the shipped schema for exact property limits. These are validation ceilings, not performance guarantees. Keep interactive scenes modest and measure in your target browser.

Unknown properties are rejected. This format does not claim compatibility with arbitrary SVG animation, Rive, Lottie, CSS animations, filters, masks, images, audio, video, or fonts. Import a supported SVG subset or author the document directly.
