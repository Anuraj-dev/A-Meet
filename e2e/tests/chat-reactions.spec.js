import { test, expect } from '@playwright/test';
import { createPeers } from '../helpers/peers.js';

// Realtime chat + emoji reaction relay across two peers (epic story 13).
//
// Harness reality this spec is written against:
//  - The backend runs with the SFU OFF, so there are NO remote media tiles. Both
//    chat and reactions are Socket.io-relayed, independent of mediasoup:
//      • chat   → `chat-message` (handlers.js), broadcast by the room id the
//        client passes, so it never depended on the SFU.
//      • reaction → `sfu-reaction` (sfu-handlers.js), which now resolves the room
//        from canonical presence (room-manager) instead of the SFU-only peer map,
//        so it relays on the SFU-off harness too. A peer's reaction surfaces in
//        the *floating* overlay (ReactionsOverlay) — a bottom-left stream that is
//        independent of any video tile — which is what we assert on here.
//  - Controls never auto-hide unless someone is screen-sharing
//    (`controlsShown = !hasScreen || …`), so the chat/reaction buttons and the
//    unread badge are always present without keeping the pointer awake.

// A 1x1 transparent PNG so each roster entry renders an <img alt={name}>, making
// presence assertable by accessible name (same trick as the presence spec).
const AVATAR =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';

// Distinct 24-hex ids so the server's per-user dedupe treats them as two people.
const userA = { id: 'aaaaaaaaaaaaaaaaaaaaaaaa', name: 'Ada Alpha', email: 'ada@example.com', avatar: AVATAR };
const userB = { id: 'bbbbbbbbbbbbbbbbbbbbbbbb', name: 'Bob Bravo', email: 'bob@example.com', avatar: AVATAR };

// A 🎉 is the reaction we send — distinctive, and not present anywhere else in
// the UI, so a text lookup for it can only match the reaction overlay/tile.
const REACTION = '🎉';

// Create a fresh instant meeting as the signed-in host and land directly in the
// room (the "New meeting" path carries the one-shot that skips the lobby).
async function createRoomAsHost(page) {
  await page.goto('/');
  await page.getByRole('button', { name: 'New meeting' }).click();
  await page.waitForURL(/\/room\/[a-z]{3}-[a-z]{4}-[a-z]{3}/);
  return new URL(page.url()).pathname.replace('/room/', '');
}

// Join an existing room through the lobby preview.
async function joinRoom(page, roomId) {
  await page.goto(`/lobby/${roomId}`);
  await page.getByRole('button', { name: 'Join now' }).click();
  await page.waitForURL(new RegExp(`/room/${roomId}$`));
}

// Both peers in the same room, with presence settled both ways — so the socket.io
// room membership the relays broadcast to is established before we send anything.
async function joinedPair(browser) {
  const peers = await createPeers(browser, { users: [userA, userB] });
  const { pageA, pageB } = peers;
  const roomId = await createRoomAsHost(pageA);
  await joinRoom(pageB, roomId);

  const rosterA = pageA.getByTestId('participant-roster');
  const rosterB = pageB.getByTestId('participant-roster');
  await expect(rosterA.getByRole('img', { name: userB.name })).toBeVisible({ timeout: 15_000 });
  await expect(rosterB.getByRole('img', { name: userA.name })).toBeVisible({ timeout: 15_000 });
  return { ...peers, roomId };
}

// Open the single right rail on Chat (its toggle label flips Show/Hide chat).
async function openChat(page) {
  await page.getByRole('button', { name: /chat/i }).click();
  await expect(page.getByTestId('chat-panel')).toBeVisible({ timeout: 15_000 });
}

// Type + send a chat message via the composer's submit button.
async function sendChat(page, text) {
  await page.getByPlaceholder('Send a message to everyone').fill(text);
  await page.getByRole('button', { name: 'Send message' }).click();
}

test.describe('two-peer chat relay', () => {
  test('a message sent by either peer renders for the other with the right author', async ({ browser }) => {
    const { pageA, pageB, close } = await joinedPair(browser);
    const chatPanelA = pageA.getByTestId('chat-panel');
    const chatPanelB = pageB.getByTestId('chat-panel');

    await openChat(pageA);
    await openChat(pageB);

    // A → B.
    await sendChat(pageA, 'Hello from Ada');
    await expect(chatPanelB.getByText('Hello from Ada')).toBeVisible({ timeout: 15_000 });
    // Author is rendered as an exact caption ("Ada Alpha") — exact match avoids
    // colliding with any "… joined" system chip that embeds the same name.
    await expect(chatPanelB.getByText(userA.name, { exact: true })).toBeVisible();

    // B → A (round-trip the other direction).
    await sendChat(pageB, 'Hi from Bob');
    await expect(chatPanelA.getByText('Hi from Bob')).toBeVisible({ timeout: 15_000 });
    await expect(chatPanelA.getByText(userB.name, { exact: true })).toBeVisible();

    await close();
  });
});

test.describe('chat unread badge', () => {
  test('a message arriving while the panel is closed badges the toggle, clearing on open', async ({ browser }) => {
    const { pageA, pageB, close } = await joinedPair(browser);
    const chatToggleB = pageB.getByRole('button', { name: /chat/i });
    const chatPanelB = pageB.getByTestId('chat-panel');

    // B keeps chat closed; A opens chat only to send.
    await expect(chatPanelB).toBeHidden();
    await openChat(pageA);
    await sendChat(pageA, 'ping while closed');

    // B's chat toggle shows an unread count of 1 (the error Badge on the button).
    await expect(chatToggleB.getByText('1')).toBeVisible({ timeout: 15_000 });

    // Opening the panel clears the badge and reveals the message. (MUI's Badge
    // keeps the span mounted with a stale value while it animates out, so assert
    // it is no longer *visible* rather than removed from the DOM.)
    await chatToggleB.click();
    await expect(chatPanelB).toBeVisible();
    await expect(chatPanelB.getByText('ping while closed')).toBeVisible();
    await expect(chatToggleB.getByText('1')).toBeHidden();

    await close();
  });
});

test.describe('two-peer emoji reactions', () => {
  test('a reaction sent by one peer surfaces for the other, echoes to the sender, then auto-dismisses', async ({ browser }) => {
    const { pageA, pageB, close } = await joinedPair(browser);

    // A opens the reaction picker and taps 🎉 (each emoji is an IconButton whose
    // accessible name is the emoji itself).
    await pageA.getByRole('button', { name: 'Send a reaction' }).click();
    await pageA.getByRole('button', { name: REACTION }).click();

    // It reaches B's floating overlay and is echoed back to A's own view. The
    // sender (A) surfaces it in two spots at once — the floating overlay and
    // their own tile — so match the first occurrence rather than asserting a
    // single element.
    await expect(pageB.getByText(REACTION).first()).toBeVisible({ timeout: 15_000 });
    await expect(pageA.getByText(REACTION).first()).toBeVisible({ timeout: 15_000 });

    // It auto-dismisses once the reaction timers elapse (floating 1.8s, per-tile
    // echo 3s) — assert it is gone from both peers afterwards.
    await expect(pageB.getByText(REACTION)).toHaveCount(0, { timeout: 6_000 });
    await expect(pageA.getByText(REACTION)).toHaveCount(0, { timeout: 6_000 });

    await close();
  });
});
