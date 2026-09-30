/// <reference types="vitest/config" />
import { defineConfig } from 'vite'

export default defineConfig({
  base: './', // relative asset paths: works on GitHub Pages under any repo name (no router)
  // three.js is one lazy chunk (~142 kB gzip) that loads after the first paint; the rest stays small.
  build: { chunkSizeWarningLimit: 600 },
  server: { fs: { allow: ['.', '../artifacts'] } }, // tables are imported from ../artifacts
  test: { include: ['tests/**/*.test.ts'] },
})
