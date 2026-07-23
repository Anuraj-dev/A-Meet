import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['test/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json-summary'],
      // Measure the unit-testable adapter logic only. The process entrypoints
      // (index.ts boots the gateway client; bot.ts wires the login/dispatch;
      // register-commands.ts is a one-shot ops script) talk to real Discord and
      // aren't unit-testable, so they're excluded rather than dragging the floor.
      include: ['src/**/*.ts'],
      exclude: ['src/index.ts', 'src/bot.ts', 'src/register-commands.ts'],
      // Non-decreasing ratchet — `vitest run --coverage` fails when any metric
      // drops below these. Raising them is an intentional, reviewed commit;
      // never lower them to make a drop pass.
      thresholds: { lines: 90, functions: 90, branches: 85, statements: 90 },
    },
  },
});
