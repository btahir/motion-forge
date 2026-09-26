import { defineConfig } from 'tsup';

export default defineConfig([
  {
    entry: { index: 'src/index.ts', element: 'src/element.ts', react: 'src/react/index.tsx', node: 'src/node/index.ts', cli: 'src/cli/index.ts' },
    format: ['esm'],
    dts: { entry: { index: 'src/index.ts', element: 'src/element.ts', react: 'src/react/index.tsx', node: 'src/node/index.ts' } },
    sourcemap: true,
    clean: true,
    target: 'es2022',
    splitting: true,
    external: ['react', 'react-dom', 'react/jsx-runtime', '@resvg/resvg-js'],
    noExternal: ['gifenc'],
  },
  {
    entry: { browser: 'src/browser.ts' },
    format: ['iife'],
    globalName: 'MotionForge',
    minify: true,
    target: 'es2020',
    sourcemap: true,
  },
]);
