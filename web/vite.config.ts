/// <reference types="vitest/config" />
import { defineConfig } from 'vite'

export default defineConfig({
  base: './', // relative asset paths: works on GitHub Pages under any repo name (no router)
  // three.js is one lazy chunk (~142 kB gzip) that loads after the first paint; the rest stays small.
  build: { chunkSizeWarningLimit: 600 },
  // ES worker: its tables are lazy chunks byte-identical to the page's (no stray annotation comment), so they download once
  worker: { format: 'es', rolldownOptions: { output: { comments: { annotation: false } } } },
  server: { fs: { allow: ['.', '../artifacts'] } }, // tables are imported from ../artifacts
  test: { include: ['tests/**/*.test.ts'] },
})
