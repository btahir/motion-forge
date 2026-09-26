# Bring it in. Take it with you.

Editable JSON is the lossless interchange format. SVG and PNG exports capture a static frame. React export produces source code with an embedded, validated animation document.

## JSON

Use `parseJSON` and `serializeDocument` for validation and normalized round trips. Open `.forge.json` or `.json` in Studio. Normalization adds defaults; it does not promise byte-for-byte preservation of whitespace or object key order.

## SVG import

`importSVG(source)` runs in a browser with DOMParser. It returns `{ success, document?, issues }`. Issues include paths and `error`/`warning` severity. Unsupported rendering features cause failure, and Studio leaves the current work unchanged. Review warnings before relying on fidelity.

Supported elements: `svg`, `g`, `rect`, `circle`, `ellipse`, `line`, `path`, `polygon`, `polyline`, and plain `text`. Basic fills/strokes can inherit through groups. Inline supported presentation styles are accepted. Translate, scale and rotate transforms become editable nested groups, preserving transform order. A nonzero viewBox origin becomes a translation group.

Supported paints: hex colors, `none`, and a small explicit basic-name set (black, white, red, green, blue, orange, yellow, gray/grey, transparent). Stroke caps and joins normalize to round with a warning when defaults differ. Explicit non-round caps/joins are rejected. Rectangles need equal corner radii. Text accepts generic font families and the supported numeric weights.

Unsupported: scripts, event handlers, external resources, image/use/foreignObject, filters, masks, clipping paths, gradients on import, animation elements, stylesheets, CSS classes, arbitrary fonts, skew/matrix transforms, percentages, and text spans. DTD/entity declarations and malformed XML are rejected. SVG import does not infer keyframes.

## SVG frame export

```js
import { renderSVG } from 'motion-forge';

const svg = renderSVG(document, {
  time: 800,
  state: 'idle',
  background: true,
  title: 'A friendly explorer',
});
```

Pass `frame: player.getSnapshot().frame` to capture the current visible transition/input pose. Otherwise sampling is static at the supplied time/state/input values. Exports contain generated allowlisted vector elements, escaped text, and local gradient definitions. A valid document is required; arbitrary input is not inserted as raw SVG.

## PNG frame export

```js
import { exportPNG } from 'motion-forge';

const blob = await exportPNG(document, { time: 800, scale: 2 });
```

PNG uses browser SVG rasterization and Canvas 2D. The output is capped at 16 megapixels. The returned Blob is yours to download or store. Generic font rendering can vary by OS/browser. This is a static image, not an animated image/video export.

## React source export

`exportReact(document)` returns a `.tsx` component importing `parseDocument` and `MotionForge`. It embeds portable JSON and supplies a responsive player. Review the component name and placement to fit your application. It needs the package and React installed.

## What is not promised

Version 1 does not provide Rive/Lottie import, arbitrary SVG fidelity, path morphing, skeletal rigs, bitmap assets, audio, video rendering, or editable text shaping. Those features have different format/runtime requirements. The supported subset is explicit so a successful import is meaningful.
