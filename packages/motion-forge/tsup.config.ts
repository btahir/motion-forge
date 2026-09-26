import { defineConfig } from 'tsup';

export default defineConfig({
  entry: { core: 'src/core/index.ts', react: 'src/react/index.tsx', presets: 'src/presets/index.ts', studio: 'src/studio/index.tsx', cli: 'src/cli/index.ts' },
  format: ['esm', 'cjs'],
  dts: true,
  sourcemap: true,
  clean: true,
  target: 'es2022',
  external: ['react', 'react-dom', 'react/jsx-runtime'],
});
