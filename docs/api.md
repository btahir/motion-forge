# API reference

The package exports ESM and CommonJS with matching TypeScript declarations. Do not import internal `dist/chunk-*` files. They are implementation details.

## Package entrypoints

| Import | Purpose |
| --- | --- |
| `motion-forge` | Validation, sampling, clock player, history, interchange |
| `motion-forge/react` | `MotionForge`, `ForgeSVG`, `usePlayerClock`, React types |
| `motion-forge/studio` | `ForgeStudio`, `addShape`, `duplicateNode`, `setKeyframe` |
| `motion-forge/studio.css` | Scoped editor styles |
| `motion-forge/presets` | `createPreset`, `presetCatalog`, `PresetId` |
| `motion-forge/schema.json` | Structural JSON Schema; semantic validation is also required |

## Validation and documents

- `createDocument(name?)` creates an empty 800 × 600 scene with a 3-second looping state.
- `validateDocument(unknown)` returns `{ success: true, document }` or `{ success: false, issues }`. Each issue has a `path` and `message`.
- `parseDocument(unknown)` returns a normalized document, or throws `DocumentError` with `issues`.
- `parseJSON(string)` also checks JSON syntax and a 5-million-character input limit.
- `serializeDocument(document)` validates and serializes pretty JSON.
- `getJSONSchema()` returns the format's structural schema. Run `validateDocument` as well to check IDs, references, cycles, track ordering and property ranges.

Documents passed to engines/components must be treated as immutable. Editing should produce a new validated object; mutating a player's public document or snapshot in place is unsupported.

## Pure sampling

`sampleDocument(document, time, { state?, inputs?, loop? })` returns a `Frame`: node ID → sampled node. Default state is `initialState`. Time is clamped unless `loop: true` is explicit. Bindings apply after keyframe sampling. Sampling does not fire transitions.

`sampleClip(document, clipId, time)` samples only a clip. `sampleTrack(track, time)` returns a property value. `ease(easing, progress)` evaluates a normalized easing curve. `interpolate(from, to, progress)` interpolates numeric or hex-color values. Non-interpolable paints switch at the endpoint.

## ForgePlayer

```ts
const player = new ForgePlayer(document, {
  autoplay: false,
  reducedMotion: false,
});
```

| Method | Behavior |
| --- | --- |
| `play()` / `pause()` | Change clock playback state |
| `advance(deltaMs)` | Advance a finite, non-negative elapsed duration |
| `seek(timeMs)` | Clamp to current clip; cancel blending; do not fire completion |
| `setRate(rate)` | Finite playback multiplier between -16 and 16; 0 freezes the clip clock |
| `setState(id)` | Enter a state immediately at time zero; starts playback unless reduced motion |
| `send(event)` | Take first matching event transition; return whether one was taken |
| `setInput(id, value)` | Validate type, clamp numeric range, evaluate matching input transitions |
| `setReducedMotion(boolean)` | When enabled, show final pose and pause |
| `getSnapshot()` | Stable snapshot until the next publication |
| `subscribe(listener)` | Subscribe to changes; returns unsubscribe |
| `onEvent(listener)` | Observe `statechange` and `complete`; returns unsubscribe |
| `reset()` | Restore initial state, defaults, time zero and paused playback |
| `dispose()` | Release subscriptions and stop advancement; do not reuse the instance |

Snapshots contain `state`, `time`, `duration`, `playing`, `rate`, `inputs`, `frame`, and `transitioning`. Hosts own the clock. `advance` does not read wall time or schedule work.

Event transitions and input conditions take at most one transition per operation, in document order. Transitions to the current state are skipped. Numeric bindings update immediately; a blend interpolates from the visible captured frame toward the new state. On a completion transition, the new clip starts at zero at that host tick; leftover elapsed time is not carried into the new clip. Use consistent frame increments when replaying eventful simulations.

## MotionForge React props

| Prop | Default / behavior |
| --- | --- |
| `document` | Required normalized `ForgeDocument`; stable identity recommended |
| `autoplay` | `true`; changes update playback |
| `title` | Document name; accessible SVG title |
| `inputs` | Optional object of input values; supplied changes are applied |
| `state` | Optional state selection, applied when the prop changes |
| `rate` | `1` |
| `reducedMotion` | `respect`, `always`, or `never`; default `respect` |
| `onEvent` | Receives `statechange` or `complete` |
| `onFrame` | Receives published snapshots, including API updates |
| `background` | `true` |
| Other SVG props | `className`, `style`, event handlers and ARIA attributes |

A `MotionForgeHandle` ref exposes playback, seek/rate/state/input/event/reset methods and `getSnapshot`. It intentionally does not expose `advance` or `dispose`; React owns clock attachment and cleanup. A new document creates a fresh player. State/input props synchronize when their values change, rather than vetoing internal state-machine transitions.

`ForgeSVG` renders a static accessible scene. Its optional `frame` is intended for frames returned by the core. `usePlayerClock(player, elementRef?)` attaches RAF and visibility handling to an existing player; it removes listeners and cancels RAF on cleanup. With an element ref, offscreen time is suspended through IntersectionObserver when available.

## ForgeStudio props

`initialDocument` is used only on first mount. If recovery is enabled and saved JSON exists, recovery takes precedence. `storageKey` defaults to `motion-forge:studio:v1`; pass `false` for no persistence. `onChange(document)` observes document edits, including recovery. `className` applies to the editor root. Use a React `key` to start an entirely new editor instance with a different initial document.

## History and edits

`new DocumentHistory(document, limit = 100)` stores validated, transactional edits. Call `edit(label, draft => { ... }, { group? })`, `undo`, `redo`, `endGroup`, or `replace`. `getSnapshot` and `subscribe` support external-store subscriptions. Failed edits leave history untouched. A shared group key merges a continuous gesture into one undo step. `replace` validates and resets history.

`deleteNodes(draft, ids)` removes descendants and referencing tracks/bindings. `uniqueId(existingIds, prefix?)` generates a non-colliding ID. Studio's `setKeyframe` inserts or replaces one keyframe and sorts its channel.
