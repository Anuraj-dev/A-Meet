import { defineConfig, devices } from '@playwright/test';
import { CLIENT_URL, CLIENT_PORT, SERVER_URL } from './helpers/constants.js';

// Shared Playwright harness (#74). Provides the config, an ephemeral
// app+DB stack, Chromium fake-media flags, and helpers; the actual feature
// E2E scenarios live in #35 and plug into this.
const CI = !!process.env.CI;

export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  forbidOnly: CI,
  // Flaky-test guard required by the issue: retry twice and capture a trace on
  // the first retry so failures are debuggable without rerunning by hand.
  retries: 2,
  workers: CI ? 1 : undefined,
  reporter: CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: CLIENT_URL,
    trace: 'on-first-retry',
    video: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        launchOptions: {
          // Grant + fake camera/mic so getUserMedia resolves headless with no
          // real devices and no permission prompt — required for media scenarios.
          args: [
            '--use-fake-device-for-media-stream',
            '--use-fake-ui-for-media-stream',
          ],
        },
      },
    },
  ],
  // Two ephemeral servers, started fresh per run (reused locally for speed):
  //  1. the API + Socket.io server on a throwaway in-memory Mongo (SFU off),
  //  2. the built client served by `vite preview`, built to talk to that API.
  webServer: [
    {
      command: 'node --import tsx server-launcher.js',
      url: `${SERVER_URL}/api/health`,
      reuseExistingServer: !CI,
      timeout: 120_000,
      stdout: 'pipe',
      stderr: 'pipe',
    },
    {
      // VITE_SERVER_URL is baked in at build time so the client's axios/socket
      // point at the ephemeral API instead of the dev default.
      command: `npm --prefix ../client run build && npm --prefix ../client run preview -- --port ${CLIENT_PORT} --strictPort`,
      url: CLIENT_URL,
      reuseExistingServer: !CI,
      timeout: 180_000,
      env: { VITE_SERVER_URL: SERVER_URL },
    },
  ],
});
