// Measures what browsers download for each runtime entry (minified, gzip and brotli).
// `pnpm size -- --compare` also downloads pinned Lottie/Rive packages from npm and measures
// the files a browser loads for them, so the comparison is reproducible from this repo.
import { build } from 'esbuild';
import { gzipSync, brotliCompressSync } from 'node:zlib';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const measure = code => ({ minified: code.length, gzip: gzipSync(code, { level: 9 }).length, brotli: brotliCompressSync(code).length });

const pkg = new URL('../packages/motion-forge/', import.meta.url).pathname;
const entries = {
  'web component (motion-forge/element)': 'src/element.ts',
  'vanilla mount (motion-forge)': 'src/dom/mount.ts',
  'React (motion-forge/react, excl. React)': 'src/react/index.tsx',
};
const results = {};
for (const [name, entry] of Object.entries(entries)) {
  const out = await build({ entryPoints: [pkg + entry], bundle: true, minify: true, format: 'esm', write: false, external: ['react', 'react-dom', 'react/jsx-runtime', 'react-dom/server'], absWorkingDir: pkg, logLevel: 'error' });
  results[name] = measure(out.outputFiles[0].contents);
}
console.table(results);

const outFile = new URL('../docs/size.json', import.meta.url);
const previous = existsSync(outFile) ? JSON.parse(readFileSync(outFile, 'utf8')) : {};
let compare = previous.compare;

if (process.argv.includes('--compare')) {
  // Files a browser downloads to play an animation with each runtime (JS + WebAssembly).
  const targets = [
    { name: 'lottie-web (full)', spec: 'lottie-web@5.13.0', files: ['build/player/lottie.min.js'] },
    { name: 'lottie-web (SVG renderer only)', spec: 'lottie-web@5.13.0', files: ['build/player/lottie_svg.min.js'] },
    { name: '@lottiefiles/dotlottie-web (state machines)', spec: '@lottiefiles/dotlottie-web@0.80.0', files: ['dist/index.js', 'dist/dotlottie-player.wasm'] },
    { name: '@rive-app/canvas', spec: '@rive-app/canvas@2.43.1', files: ['rive.js', 'rive.wasm'] },
  ];
  const temp = mkdtempSync(join(tmpdir(), 'mf-size-'));
  try {
    compare = {};
    for (const t of targets) {
      const tarball = execFileSync('npm', ['pack', t.spec, '--silent'], { cwd: temp, encoding: 'utf8' }).trim().split('\n').pop();
      const dir = join(temp, t.spec.replace(/[@/]/g, '_'));
      execFileSync('mkdir', ['-p', dir]);
      execFileSync('tar', ['-xzf', join(temp, tarball), '-C', dir]);
      const parts = t.files.map(f => measure(readFileSync(join(dir, 'package', f))));
      compare[t.name] = { package: t.spec, files: t.files, ...Object.fromEntries(['minified', 'gzip', 'brotli'].map(k => [k, parts.reduce((s, p) => s + p[k], 0)])) };
    }
  } finally {
    rmSync(temp, { recursive: true, force: true });
  }
  console.table(compare);
}

writeFileSync(outFile, JSON.stringify({ measured: new Date().toISOString().slice(0, 10), method: 'esbuild minified ESM bundles; gzip level 9 and brotli via node:zlib. Comparisons sum the JS and WebAssembly files each package loads in a browser.', results, ...(compare ? { compare } : {}) }, null, 2) + '\n');
