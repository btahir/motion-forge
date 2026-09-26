// Measures what browsers download for each runtime entry (minified, gzip and brotli).
import { build } from 'esbuild';
import { gzipSync, brotliCompressSync } from 'node:zlib';
import { writeFileSync } from 'node:fs';

const pkg = new URL('../packages/motion-forge/', import.meta.url).pathname;
const entries = {
  'web component (motion-forge/element)': 'src/element.ts',
  'vanilla mount (motion-forge)': 'src/dom/mount.ts',
  'React (motion-forge/react, excl. React)': 'src/react/index.tsx',
};
const results = {};
for (const [name, entry] of Object.entries(entries)) {
  const out = await build({ entryPoints: [pkg + entry], bundle: true, minify: true, format: 'esm', write: false, external: ['react', 'react-dom', 'react/jsx-runtime', 'react-dom/server'], absWorkingDir: pkg, logLevel: 'error' });
  const code = out.outputFiles[0].contents;
  results[name] = { minified: code.length, gzip: gzipSync(code, { level: 9 }).length, brotli: brotliCompressSync(code).length };
}
console.table(results);
writeFileSync(new URL('../docs/size.json', import.meta.url), JSON.stringify({ measured: new Date().toISOString().slice(0, 10), results }, null, 2) + '\n');
