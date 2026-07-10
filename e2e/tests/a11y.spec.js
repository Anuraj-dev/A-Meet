import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { stubAuth } from '../helpers/auth.js';

// Room accessibility smoke (#164):
//  1. an axe-core scan of the in-call room page with zero serious/critical
//     violations as the gate;
//  2. a keyboard-only pass over the control bar — every control is reachable
//     with Tab and the toggles respond to the keyboard (Enter/Space), asserted
//     through the aria-pressed state screen readers announce.

async function createRoomAsHost(page) {
  await page.goto('/');
  await page.getByRole('button', { name: 'New meeting' }).click();
  await page.waitForURL(/\/room\/[a-z]{3}-[a-z]{4}-[a-z]{3}/);
}

test.describe('room accessibility baseline', () => {
  test('axe scan of the room page has no serious or critical violations', async ({ context, page }) => {
    await stubAuth(context);
    await createRoomAsHost(page);
    await expect(page.getByRole('button', { name: /microphone/i })).toBeVisible({ timeout: 15_000 });

    const results = await new AxeBuilder({ page }).analyze();
    const blocking = results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
    expect(
      blocking,
      blocking.map((v) => `${v.impact}: ${v.id} — ${v.help} (${v.nodes.length} nodes)`).join('\n'),
    ).toEqual([]);
  });

  test('control bar is fully keyboard-operable', async ({ context, page }) => {
    await stubAuth(context);
    await createRoomAsHost(page);

    const mic = page.getByRole('button', { name: /Turn (off|on) microphone/ });
    await expect(mic).toBeVisible({ timeout: 15_000 });

    // Tab traversal reaches every control-bar button (labels are the a11y
    // contract; "Leave call" is the bar's final control).
    const expected = [
      /Turn (off|on) microphone/,
      /transcript/i,
      /Turn (off|on) camera/,
      /Present now|Stop presenting/,
      'Send a reaction',
      /Raise hand|Lower hand/,
      /Show chat|Hide chat/,
      /Show people|Hide people/,
      'Change layout',
      'Audio settings',
      'More options',
      'Leave call',
    ];
    await mic.focus();
    for (let i = 0; i < expected.length; i += 1) {
      const name = expected[i];
      await expect(page.getByRole('button', { name }).first()).toBeFocused();
      if (i < expected.length - 1) await page.keyboard.press('Tab');
    }

    // Toggles respond to the keyboard and expose their state via aria-pressed.
    const hand = page.getByRole('button', { name: 'Raise hand' });
    await hand.focus();
    await expect(hand).toHaveAttribute('aria-pressed', 'false');
    await page.keyboard.press('Enter');
    const lower = page.getByRole('button', { name: 'Lower hand' });
    await expect(lower).toHaveAttribute('aria-pressed', 'true');
    await page.keyboard.press('Space');
    await expect(page.getByRole('button', { name: 'Raise hand' })).toHaveAttribute('aria-pressed', 'false');

    // The layout chooser opens as a keyboard menu: Enter opens it with menu
    // items focusable, Escape returns focus to the trigger.
    const layout = page.getByRole('button', { name: 'Change layout' });
    await layout.focus();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('menu')).toBeVisible();
    await page.keyboard.press('ArrowDown');
    await expect(page.getByRole('menuitem', { name: 'Tiled' })).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('menu')).toHaveCount(0);
    await expect(layout).toBeFocused();
  });

  test('people panel takes focus as a dialog and Escape returns focus to its toggle', async ({ context, page }) => {
    await stubAuth(context);
    await createRoomAsHost(page);

    const peopleToggle = page.getByRole('button', { name: 'Show people' });
    await expect(peopleToggle).toBeVisible({ timeout: 15_000 });
    await peopleToggle.focus();
    await page.keyboard.press('Enter');

    const dialog = page.getByRole('dialog', { name: 'People' });
    await expect(dialog).toBeVisible();
    // Focus moved into the panel (its heading).
    await expect(dialog.getByRole('heading', { name: /People/ })).toBeFocused();

    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
    // Focus returns to the invoking control.
    await expect(page.getByRole('button', { name: 'Show people' })).toBeFocused();
  });
});
