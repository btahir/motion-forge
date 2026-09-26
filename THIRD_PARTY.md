# Third-party software

Runtime entry points (`motion-forge`, `motion-forge/element`, `motion-forge/react`) have no third-party dependencies; React is a peer dependency of `motion-forge/react`.

The Node/CLI side depends on:

- [`@resvg/resvg-js`](https://github.com/yisibl/resvg-js), MPL-2.0: rasterizes SVG for `preview`, `record` and `render --out *.png`. Used unmodified as a dependency.
- [`gifenc`](https://github.com/mattdesl/gifenc), MIT: GIF encoding for `record --out *.gif` (bundled into `dist/cli.js` and `dist/node.js`).

The site uses React, CodeMirror 6 and marked (MIT). Preset artwork and characters are original to this project and MIT licensed.
