/// <reference types="vitest/config" />
import { defineConfig } from 'vite'

export default defineConfig({
  base: './', // relative asset paths: works on GitHub Pages under any repo name (no router)
  server: { fs: { allow: ['.', '../artifacts'] } }, // tables are imported from ../artifacts
  test: { include: ['tests/**/*.test.ts'] },
})
