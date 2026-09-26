import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';

const repo = fileURLToPath(new URL('../..', import.meta.url));
export default defineConfig({
  plugins: [react()],
  server: { port: 4176, strictPort: true, fs: { allow: [repo] } },
  preview: { port: 4176, strictPort: true },
});
