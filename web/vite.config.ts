/// <reference types="vitest/config" />
import { defineConfig } from 'vite'

export default defineConfig({
  base: '/AtomicSimulation/', // GitHub Pages project site: /<repo-name>/
  server: { fs: { allow: ['.', '../artifacts'] } }, // tables are imported from ../artifacts
  test: { include: ['tests/**/*.test.ts'] },
})
