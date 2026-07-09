import { test, expect } from '@playwright/test';
import { stubAuth } from '../helpers/auth.js';

// Fullscreen a tile is a pure-UI flow (the Fullscreen API on a tile element), so
// it runs in the fast SFU-off suite. The alone layout renders a chromeless self
// tile with no options menu, so we first switch to the tiled layout — that
// renders the self tile with its per-tile options menu (pin/spotlight/
// fullscreen). We then assert the observable effect: document.fullscreenElement
// becomes set on enter and clears on exit.

const AVATAR =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
const user = { id: 'aaaaaaaaaaaaaaaaaaaaaaaa', name: 'Ada Alpha', email: 'ada@example.com', avatar: AVATAR };

async function createRoomAsHost(page) {
  await page.goto('/');
  await page.getByRole('button', { name: 'New meeting' }).click();
  await page.waitForURL(/\/room\/[a-z]{3}-[a-z]{4}-[a-z]{3}/);
}

const inFullscreen = (page) => page.evaluate(() => document.fullscreenElement !== null);

async function toggleFullscreenViaTileMenu(page) {
  await page.getByRole('button', { name: 'Tile options' }).click();
  await page.getByRole('menuitem', { name: 'Fullscreen' }).click();
}

test.describe('tile fullscreen', () => {
  test('the tile menu enters and exits fullscreen', async ({ browser }) => {
    const context = await browser.newContext();
    await stubAuth(context, user);
    const page = await context.newPage();
    await createRoomAsHost(page);

    // Switch to the tiled layout so the self tile exposes its options menu.
    await page.getByRole('button', { name: 'Change layout' }).click();
    await page.getByRole('menuitem', { name: 'Tiled' }).click();

    // Nothing is fullscreen on entry.
    await expect(page.getByRole('button', { name: 'Tile options' })).toBeVisible({ timeout: 15_000 });
    expect(await inFullscreen(page)).toBe(false);

    // Enter fullscreen from the tile menu.
    await toggleFullscreenViaTileMenu(page);
    await expect.poll(() => inFullscreen(page), { timeout: 10_000 }).toBe(true);

    // Exit fullscreen from the tile menu.
    await toggleFullscreenViaTileMenu(page);
    await expect.poll(() => inFullscreen(page), { timeout: 10_000 }).toBe(false);

    await context.close();
  });
});
