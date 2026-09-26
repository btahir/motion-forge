# Performance and lifecycle

Motion Forge's core is a JavaScript clock-driven sampler. React renders the result as SVG. The player entrypoint is independent of the editor and its CSS; import Studio only where people author animations.

## Keep work proportional

Use stable document objects so React does not rebuild players on unrelated renders. Keep scene sizes appropriate for SVG. Group related layers, remove unused channels, and avoid animating long paragraphs or thousands of path nodes without measuring. The schema's ceilings protect format validity; they are not promised smooth-playback limits.

`sampleDocument` is useful for static snapshots. For interactive playback, create `ForgePlayer` once and advance it. `renderSVG` validates export input and builds a complete string, so it is an export/SSR tool rather than the preferred per-frame browser renderer.

## Clock ownership

The pure engine creates no timers. The React host attaches one RAF chain while playing. It cancels work while the document is hidden or the observed player is offscreen, and resets the elapsed-time baseline before resuming. Cleanup removes subscriptions/listeners and cancels RAF. A paused clip needs no continuous clock.

Input bindings are immediate. Transitions blend on wall-clock delta independently of the clip rate; rate zero freezes keyframe time while an active blend can progress. Document this distinction in applications that expose time controls.

## Measuring your scene

Measure both sampling and SVG/React updates in the target device/browser. Compare several scene sizes and keyframe distributions, not only a single empty scene. Measure packaged production builds; development overhead is different. Disable unrelated background work when comparing runs, retain the test scene and describe the conditions.

Run `pnpm benchmark` after `pnpm build:package` to reproduce the sampler and bundle measurements. The raw data is stored in `docs/benchmark-results.json`. No universal FPS or latency guarantee is made. Transfer size depends on bundler configuration, compression, tree shaking and shared dependencies.

## Local measurement — 2026-09-26

Measured on Apple M4 Pro, darwin arm64, Node v24.13.1. Each scene has two tracks per node and two keys per track. Timings cover 1,000 pure samples after 200 warm-up iterations. They do not include browser rendering and are not FPS claims.

| Nodes | Tracks | Sampling p50 | Sampling p95 | One validated SVG export |
| --- | --- | --- | --- | --- |
| 20 | 40 | 0.012 ms | 0.0158 ms | 1.19 ms |
| 100 | 200 | 0.0534 ms | 0.0642 ms | 1.239 ms |
| 500 | 1000 | 0.2691 ms | 0.3321 ms | 3.324 ms |

The minified browser bundles measured with esbuild, including Zod and excluding React peers, were 33214 gzip bytes for core sampling/player imports and 34827 gzip bytes for the React player. Neither pulled in Studio or CSS. These are whole exported-entry measurements, not an assertion that every application will ship the same bytes.
