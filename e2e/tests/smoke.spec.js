import { test, expect } from '@playwright/test';
import { stubAuth } from '../helpers/auth.js';
import { DEFAULT_USER } from '../helpers/constants.js';

// Trivial green smoke test that proves the harness end to end: the ephemeral
// server + DB boot, the built client is served and talks to that API, and the
// auth-stub flips the app into its signed-in state without touching Google.
test.describe('landing smoke', () => {
  test('unauthenticated landing shows the sign-in CTA', async ({ page }) => {
    await page.goto('/');
    await expect(
      page.getByRole('button', { name: 'Sign in with Google' }),
    ).toBeVisible();
    await expect(
      page.getByRole('heading', { name: /Video calls for/i }),
    ).toBeVisible();
  });

  test('stubbed sign-in shows the authenticated home', async ({ context, page }) => {
    // Inject the auth cookie before the app's /api/auth/me check runs.
    await stubAuth(context);
    await page.goto('/');

    // Authenticated landing swaps the CTA for "New meeting" and shows the user.
    await expect(
      page.getByRole('button', { name: 'New meeting' }),
    ).toBeVisible();
    await expect(page.getByText(DEFAULT_USER.name)).toBeVisible();
  });
});
