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
      include: ['src/**/*.{js,ts}'],
      exclude: ['src/server.{js,ts}'],
      // Coverage floor — the non-decreasing ratchet. `vitest run --coverage`
      // fails when any metric drops below these numbers. They hold today's
      // measured coverage; RAISING them is an intentional, reviewed commit —
      // never lower them to make a drop pass.
      // NOTE: the `branches` floor was recalibrated (72 -> 62) for the Vitest 4
      // upgrade. @vitest/coverage-v8 4.x fully AST-analyzes UNTESTED included
      // files and counts every real branch in them as uncovered, where 3.x gave
      // such files a single placeholder branch (e.g. sfu/config.ts 0 -> 31
      // branches, transcription/groq-refiner.ts 2 -> 36). Total branches grew
      // 499 -> 694 while covered branches went UP (386 -> 436) with identical
      // tests — a denominator/meter change, not a coverage regression.
      thresholds: { lines: 54, functions: 55, branches: 62, statements: 54 },
    },
  },
});
