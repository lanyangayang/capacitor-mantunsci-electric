import { defineConfig } from 'vite';
import { resolve } from 'node:path';

// Demo/dev server config lives at the repo root so `vite` resolves the
// demo entry, the plugin sources and node_modules from one place.
export default defineConfig({
  root: resolve(__dirname, 'demo'),
  server: { port: 5178, open: true },
  resolve: {
    alias: {
      '@plugin': resolve(__dirname, 'src/index.ts'),
    },
  },
});
