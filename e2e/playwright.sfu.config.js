import { defineConfig, devices } from '@playwright/test';
import {
  SFU_CLIENT_URL,
  SFU_CLIENT_PORT,
  SFU_SERVER_URL,
} from './helpers/constants.js';

// SFU-ENABLED Playwright harness (#133). Separate from the default config so the
// media-dependent host-moderation specs (enforced mute, spotlight layout) run
// against a server with mediasoup ON, while the fast SFU-off smoke/feature
// specs keep running under playwright.config.js with no native build needed.
//
// This config has its own testDir, its own server launcher, and its own ports,
// so the two harnesses never collide. The matching CI job (e2e-sfu) installs
// deps WITHOUT --ignore-scripts so the mediasoup worker binary exists.
const CI = !!process.env.CI;

export default defineConfig({
  testDir: './tests-sfu',
  fullyParallel: false, // one mediasoup-backed room at a time keeps RTC stable
  forbidOnly: CI,
  // Real WebRTC over loopback is occasionally slow to converge; retry + trace.
  retries: 2,
  workers: 1,
  reporter: CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  // ICE/DTLS + producer/consumer negotiation needs more headroom than a static
  // page load, so the default per-test timeout is bumped.
  timeout: 90_000,
  use: {
    baseURL: SFU_CLIENT_URL,
    trace: 'on-first-retry',
    video: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'chromium-sfu',
      use: {
        ...devices['Desktop Chrome'],
        launchOptions: {
          // Fake camera/mic so getUserMedia resolves headless with a synthetic
          // (moving) video + (beep) audio track — real media for the SFU to
          // forward, with no devices and no permission prompt.
          args: [
            '--use-fake-device-for-media-stream',
            '--use-fake-ui-for-media-stream',
          ],
        },
      },
    },
  ],
  webServer: [
    {
      command: 'node --import tsx server-launcher.sfu.js',
      url: `${SFU_SERVER_URL}/api/health`,
      reuseExistingServer: !CI,
      timeout: 120_000,
      stdout: 'pipe',
      stderr: 'pipe',
    },
    {
      command: `npm --prefix ../client run build && npm --prefix ../client run preview -- --port ${SFU_CLIENT_PORT} --strictPort`,
      url: SFU_CLIENT_URL,
      reuseExistingServer: !CI,
      timeout: 180_000,
      env: { VITE_SERVER_URL: SFU_SERVER_URL },
    },
  ],
});
