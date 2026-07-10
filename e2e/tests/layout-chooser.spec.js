import { test, expect } from '@playwright/test';
import { stubAuth } from '../helpers/auth.js';

// The layout chooser is a pure-UI flow (no remote media needed to prove the
// grid re-arranges), so it runs in the fast SFU-off suite. We assert the
// user-visible effect: choosing a focused layout mounts the focus stage, and
// choosing the tiled layout tears it back down to the grid.

const AVATAR =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
const user = { id: 'aaaaaaaaaaaaaaaaaaaaaaaa', name: 'Ada Alpha', email: 'ada@example.com', avatar: AVATAR };

async function createRoomAsHost(page) {
  await page.goto('/');
  await page.getByRole('button', { name: 'New meeting' }).click();
  await page.waitForURL(/\/room\/[a-z]{3}-[a-z]{4}-[a-z]{3}/);
}

// Open the layout chooser menu and pick a layout by its label.
async function chooseLayout(page, label) {
  await page.getByRole('button', { name: 'Change layout' }).click();
  await page.getByRole('menuitem', { name: label }).click();
}

test.describe('layout chooser', () => {
  test('switching between focused and tiled layouts re-arranges the stage', async ({ browser }) => {
    const context = await browser.newContext();
    await stubAuth(context, user);
    const page = await context.newPage();
    await createRoomAsHost(page);

    const focusStage = page.getByTestId('stage-focus');

    // Auto layout on entry — no dedicated focus stage.
    await expect(page.getByRole('button', { name: 'Change layout' })).toBeVisible({ timeout: 15_000 });
    await expect(focusStage).toHaveCount(0);

    // Spotlight → the focus stage mounts (a single tile takes the stage).
    await chooseLayout(page, 'Spotlight');
    await expect(focusStage).toBeVisible({ timeout: 15_000 });

    // Tiled → the focus stage is torn down and the grid takes over.
    await chooseLayout(page, 'Tiled');
    await expect(focusStage).toHaveCount(0);

    await context.close();
  });
});
