import { test, expect } from '@playwright/test';
import { stubAuth } from '../helpers/auth.js';

// Fullscreen a tile is a pure-UI flow (the Fullscreen API on a tile element), so
// it runs in the fast SFU-off suite. Solo, only the FOCUS layout renders a tile
// with the per-tile options menu (pin/spotlight/fullscreen): the alone layout's
// self tile is chromeless, and the tiled grid shows the "You're the only one
// here" invite block instead of tiles while no remotes are present. So we switch
// to the Spotlight layout — its focus falls back to the self tile — wait for the
// focus stage to mount, and drive fullscreen from that tile's menu. We assert
// the observable effect: document.fullscreenElement becomes set on enter and
// clears on exit. Exit uses Escape (the standard user
// gesture): once the tile is fullscreen, the MUI menu portals OUTSIDE the
// fullscreen element's top layer, so re-clicking the menu item is unreliable.

const AVATAR =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
const user = { id: 'aaaaaaaaaaaaaaaaaaaaaaaa', name: 'Ada Alpha', email: 'ada@example.com', avatar: AVATAR };

async function createRoomAsHost(page) {
  await page.goto('/');
  await page.getByRole('button', { name: 'New meeting' }).click();
  await page.waitForURL(/\/room\/[a-z]{3}-[a-z]{4}-[a-z]{3}/);
}

const inFullscreen = (page) => page.evaluate(() => document.fullscreenElement !== null);

test.describe('tile fullscreen', () => {
  test('the tile menu enters fullscreen and Escape exits it', async ({ browser }) => {
    const context = await browser.newContext();
    await stubAuth(context, user);
    const page = await context.newPage();
    await createRoomAsHost(page);

    // Switch to the Spotlight layout: solo, its focus falls back to the self
    // tile — the only solo tile that exposes the options menu. Wait for the
    // focus stage to mount before reaching for the menu (the same deterministic
    // signal layout-chooser.spec.js asserts on).
    await page.getByRole('button', { name: 'Change layout' }).click();
    await page.getByRole('menuitem', { name: 'Spotlight' }).click();
    await expect(page.getByTestId('stage-focus')).toBeVisible({ timeout: 15_000 });

    // Nothing is fullscreen on entry.
    await expect(page.getByRole('button', { name: 'Tile options' })).toBeVisible({ timeout: 15_000 });
    expect(await inFullscreen(page)).toBe(false);

    // Enter fullscreen from the tile menu.
    await page.getByRole('button', { name: 'Tile options' }).click();
    await page.getByRole('menuitem', { name: 'Fullscreen' }).click();
    await expect.poll(() => inFullscreen(page), { timeout: 10_000 }).toBe(true);

    // Exit with Escape — the standard user gesture. The tile menu can't be
    // re-used here: MUI portals it outside the fullscreen element's top layer.
    await page.keyboard.press('Escape');
    await expect.poll(() => inFullscreen(page), { timeout: 10_000 }).toBe(false);

    await context.close();
  });
});
