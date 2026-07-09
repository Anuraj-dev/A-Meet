import { test, expect } from '@playwright/test';
import { stubAuth } from '../helpers/auth.js';

// Raise-hand is a pure-UI flow (a local toggle surfaced on your own tile + a
// control-bar label flip), so it runs in the fast SFU-off suite: it needs no
// remote media. We assert the two things a user actually sees — the visible
// hand indicator on the self tile and the button toggling Raise/Lower.

const AVATAR =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
const user = { id: 'aaaaaaaaaaaaaaaaaaaaaaaa', name: 'Ada Alpha', email: 'ada@example.com', avatar: AVATAR };

async function createRoomAsHost(page) {
  await page.goto('/');
  await page.getByRole('button', { name: 'New meeting' }).click();
  await page.waitForURL(/\/room\/[a-z]{3}-[a-z]{4}-[a-z]{3}/);
}

test.describe('raise hand', () => {
  test('raising shows the hand indicator and flips the button; lowering clears it', async ({ browser }) => {
    const context = await browser.newContext();
    await stubAuth(context, user);
    const page = await context.newPage();
    await createRoomAsHost(page);

    const raiseBtn = page.getByRole('button', { name: 'Raise hand' });

    // Entry state: hand is down — the button offers to raise it and no hand
    // indicator is on the self tile.
    await expect(raiseBtn).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText('✋')).toHaveCount(0);

    // Raise: the self tile now shows the hand emoji and the button flips to Lower.
    await raiseBtn.click();
    await expect(page.getByText('✋')).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole('button', { name: 'Lower hand' })).toBeVisible();

    // Lower: the indicator clears and the button flips back to Raise.
    await page.getByRole('button', { name: 'Lower hand' }).click();
    await expect(page.getByText('✋')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Raise hand' })).toBeVisible();

    await context.close();
  });
});
