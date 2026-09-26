import { writeFile } from 'node:fs/promises';
import { cpus, platform, arch } from 'node:os';
import { performance } from 'node:perf_hooks';
import { gzipSync } from 'node:zlib';
import { build } from 'esbuild';
import { parseDocument, sampleDocument, renderSVG } from '../packages/motion-forge/dist/core.js';
const scenes = [];
for (const count of [20, 100, 500]) {
  const nodes = Array.from({ length: count }, (_, i) => ({ id: `box-${i}`, name: 'Box', type: 'rect', x: (i % 25) * 25, y: Math.floor(i / 25) * 25, width: 15, height: 15 }));
  const tracks = nodes.flatMap(n => ['x', 'rotation'].map(property => ({ id: `${n.id}-${property}`, nodeId: n.id, property, keyframes: [{ time: 0, value: property === 'x' ? n.x : 0, easing: 'ease-in-out' }, { time: 1000, value: property === 'x' ? n.x + 15 : 360 }] })));
  const doc = parseDocument({ version: 1, name: 'Benchmark', width: 640, height: 560, nodes, clips: [{ id: 'main', name: 'Main', duration: 1000, tracks }], states: [{ id: 'idle', name: 'Idle', clipId: 'main', loop: true }], initialState: 'idle' });
  for (let i = 0; i < 200; i++) sampleDocument(doc, i);
  const timings = [];
  for (let i = 0; i < 1000; i++) { const start = performance.now(); sampleDocument(doc, i % 1000); timings.push(performance.now() - start); }
  timings.sort((a, b) => a - b);
  const start = performance.now(); const svg = renderSVG(doc, { time: 500 }); const exportMs = performance.now() - start;
  scenes.push({ nodes: count, tracks: tracks.length, sampleP50Ms: +timings[500].toFixed(4), sampleP95Ms: +timings[950].toFixed(4), svgExportMs: +exportMs.toFixed(3), svgBytes: Buffer.byteLength(svg) });
}
const bundle = async entry => {
  const result = await build({ stdin: { contents: entry, resolveDir: process.cwd(), sourcefile: 'benchmark-entry.js' }, bundle: true, minify: true, format: 'esm', platform: 'browser', write: false, external: ['react', 'react-dom', 'react/jsx-runtime'], metafile: true });
  const code = result.outputFiles[0].contents;
  const inputs = Object.keys(result.metafile.inputs);
  if (inputs.some(p => p.includes('/src/studio/') || p.endsWith('/dist/studio.js') || p.endsWith('.css'))) throw new Error('Runtime bundle pulled in Studio or CSS');
  return { minifiedBytes: code.length, gzipBytes: gzipSync(code).length, editorOrCSSIncluded: false };
};
const bundles = { core: await bundle("export { ForgePlayer, parseDocument, sampleDocument } from './packages/motion-forge/dist/core.js'"), react: await bundle("export { MotionForge } from './packages/motion-forge/dist/react.js'") };
const result = { date: new Date().toISOString().slice(0, 10), node: process.version, platform: `${platform()} ${arch()}`, cpu: cpus()[0]?.model, method: '1000 samples after 200 warmup iterations; 2 tracks/node, 2 keys/track. Node sampler only, not browser FPS. One validated SVG export per size. esbuild minified browser bundles include Zod, exclude React peers; gzip is local compression.', scenes, bundles };
await writeFile(new URL('../docs/benchmark-results.json', import.meta.url), JSON.stringify(result, null, 2) + '\n');
console.log(JSON.stringify(result, null, 2));
