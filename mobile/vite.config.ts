import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

const here = (p: string) => fileURLToPath(new URL(p, import.meta.url));

// The game logic is shared with the website: it is compiled straight from the engine's source.
export default defineConfig({
  base: './',
  resolve: {
    alias: {
      '@axia/engine': here('../packages/engine/src/index.ts'),
      zod: here('./node_modules/zod'),
    },
  },
  server: { fs: { allow: ['..'] } },
  build: {
    outDir: 'dist',
    target: 'es2020',
    chunkSizeWarningLimit: 2000,
  },
});
