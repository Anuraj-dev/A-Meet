import { test, expect } from '@playwright/test';
import { stubAuth } from '../helpers/auth.js';
import { createPeers } from '../helpers/peers.js';

// Two-peer presence propagation + right-rail panel switching (epic stories 9 & 12).
//
// Harness reality this spec is written against:
//  - The backend runs with the SFU OFF, so there are NO remote media tiles. The
//    participant *roster* the user sees is the socket-relayed presence list
//    (room-users / user-joined / user-left), surfaced in the top-overlay avatar
//    group + count. We assert on that, never on a video tile.
//  - Transcription providers are not configured in the harness, so the Transcript
//    rail cannot be opened (its toggle no-ops). Panel mutual-exclusivity is
//    therefore exercised across the Chat and People rails, which share the same
//    single right-rail slot as Transcript (one `activePanel` in RoomPage).

// A 1x1 transparent PNG. Giving each peer a real (data-URI) avatar makes the
// roster render an <img alt={name}>, so presence is assertable by accessible
// name instead of a brittle initial/letter.
const AVATAR =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';

// Distinct 24-hex ids so the server's per-user dedupe treats them as two people.
const userA = { id: 'aaaaaaaaaaaaaaaaaaaaaaaa', name: 'Ada Alpha', email: 'ada@example.com', avatar: AVATAR };
const userB = { id: 'bbbbbbbbbbbbbbbbbbbbbbbb', name: 'Bob Bravo', email: 'bob@example.com', avatar: AVATAR };

// Create a fresh instant meeting as the signed-in host and land directly in the
// room (the "New meeting" path carries the one-shot that skips the lobby).
async function createRoomAsHost(page) {
  await page.goto('/');
  await page.getByRole('button', { name: 'New meeting' }).click();
  await page.waitForURL(/\/room\/[a-z]{3}-[a-z]{4}-[a-z]{3}/);
  return new URL(page.url()).pathname.replace('/room/', '');
}

test.describe('two-peer presence', () => {
  test('a joining peer appears in the other peer’s roster, and leaving removes them', async ({ browser }) => {
    const { contextB, pageA, pageB, close } = await createPeers(browser, { users: [userA, userB] });

    // Peer A starts the meeting and is alone — only their own avatar is present.
    const roomId = await createRoomAsHost(pageA);
    await expect(pageA.getByRole('img', { name: userA.name })).toBeVisible({ timeout: 15_000 });
    await expect(pageA.getByRole('img', { name: userB.name })).toHaveCount(0);

    // Peer B joins the same room through the lobby preview.
    await pageB.goto(`/lobby/${roomId}`);
    await pageB.getByRole('button', { name: 'Join now' }).click();
    await pageB.waitForURL(new RegExp(`/room/${roomId}$`));

    // Presence propagates both ways: each peer's roster now shows the other.
    await expect(pageA.getByRole('img', { name: userB.name })).toBeVisible({ timeout: 15_000 });
    await expect(pageB.getByRole('img', { name: userA.name })).toBeVisible({ timeout: 15_000 });

    // The same socket event is also surfaced as a chat system message for A.
    await pageA.locator('button:has([data-testid="ChatOutlinedIcon"])').click();
    await expect(pageA.getByText(`${userB.name} joined`)).toBeVisible({ timeout: 15_000 });

    // Peer B leaves deliberately (immediate leave-room, no disconnect grace).
    await pageB.locator('button:has([data-testid="CallEndIcon"])').first().click();
    await pageB.waitForURL((url) => !url.pathname.startsWith('/room/'));

    // A's roster returns to just themselves, and the leave is announced.
    await expect(pageA.getByRole('img', { name: userB.name })).toHaveCount(0, { timeout: 15_000 });
    await expect(pageA.getByText(`${userB.name} left`)).toBeVisible({ timeout: 15_000 });

    await close();
  });
});

test.describe('right-rail panel switching', () => {
  test('opening Chat and People is mutually exclusive (single right rail)', async ({ browser }) => {
    const context = await browser.newContext();
    await stubAuth(context, userA);
    const page = await context.newPage();
    await createRoomAsHost(page);

    const chatToggle = page.locator('button:has([data-testid="ChatOutlinedIcon"])');
    const peopleToggle = page.locator('button:has([data-testid="PeopleAltIcon"])');
    const chatPanel = page.getByText('In-call messages');
    const peoplePanel = page.getByPlaceholder('Search people');

    // Nothing open on entry.
    await expect(chatToggle).toBeVisible({ timeout: 15_000 });
    await expect(chatPanel).toBeHidden();
    await expect(peoplePanel).toBeHidden();

    // Open Chat.
    await chatToggle.click();
    await expect(chatPanel).toBeVisible();
    await expect(peoplePanel).toBeHidden();

    // Open People — Chat closes (only one rail at a time).
    await peopleToggle.click();
    await expect(peoplePanel).toBeVisible();
    await expect(chatPanel).toBeHidden();

    // Re-open Chat — People closes.
    await chatToggle.click();
    await expect(chatPanel).toBeVisible();
    await expect(peoplePanel).toBeHidden();

    await context.close();
  });
});
