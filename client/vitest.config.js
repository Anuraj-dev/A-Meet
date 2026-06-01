import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

// Kept separate from vite.config.js so the production build never depends on
// vitest being installed. The React plugin is declared here directly (rather
// than merged from vite.config.js) so JSX in test files uses the automatic
// runtime — otherwise esbuild's classic transform throws "React is not defined".
export default defineConfig({
  plugins: [react()],
  // Force the automatic JSX runtime at the esbuild layer so test JSX never
  // depends on a `React` global (esbuild's default transform is classic).
  esbuild: { jsx: 'automatic' },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.js'],
    include: ['src/**/*.test.{js,jsx}'],
    css: false,
  },
});
