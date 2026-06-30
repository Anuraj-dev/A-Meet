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
    include: ['src/**/*.test.{js,jsx,ts,tsx}'],
    css: false,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json-summary'],
      // Measure application source only; tests, the test harness, and the app
      // entrypoint don't represent testable behavior and would skew the number.
      include: ['src/**/*.{js,jsx,ts,tsx}'],
      exclude: ['src/**/*.test.{js,jsx,ts,tsx}', 'src/test/**', 'src/main.jsx'],
      // Coverage floor — the non-decreasing ratchet. `vitest run --coverage`
      // fails when any metric drops below these numbers. They hold today's
      // measured coverage; RAISING them is an intentional, reviewed commit —
      // never lower them to make a drop pass.
      thresholds: { lines: 18, functions: 33, branches: 64, statements: 18 },
    },
  },
});
