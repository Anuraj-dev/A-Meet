import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    setupFiles: ['./test/setup.js'],
    include: ['test/**/*.test.js'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json-summary'],
      // Measure application source only; the process entrypoint (server.js)
      // boots the HTTP/socket server and isn't unit-testable, so it's excluded
      // rather than dragging the floor down as permanent dead weight.
      include: ['src/**/*.js'],
      exclude: ['src/server.js'],
      // Coverage floor — the non-decreasing ratchet. `vitest run --coverage`
      // fails when any metric drops below these numbers. They hold today's
      // measured coverage; RAISING them is an intentional, reviewed commit —
      // never lower them to make a drop pass.
      thresholds: { lines: 54, functions: 55, branches: 72, statements: 54 },
    },
  },
});
