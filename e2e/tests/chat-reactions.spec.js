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

test.describe('chat send contract', () => {
  test('keeps an over-limit draft, shows its error, and delivers nothing to the other peer', async ({ browser }) => {
    const { pageA, pageB, close } = await joinedPair(browser);
    const chatPanelA = pageA.getByTestId('chat-panel');
    const chatPanelB = pageB.getByTestId('chat-panel');
    const composerA = pageA.getByPlaceholder('Send a message to everyone');
    const overLimit = 'x'.repeat(16_001);

    await openChat(pageA);
    await openChat(pageB);

    // fill() assigns the complete draft in one operation; typing 16k keys would
    // make this contract test slow and unlike a pasted draft.
    await composerA.fill(overLimit);

    await expect(composerA).toHaveValue(overLimit);
    await expect(chatPanelA.getByText(/Messages can be at most 16000 characters/i)).toBeVisible();
    await expect(pageA.getByRole('button', { name: 'Send message' })).toBeDisabled();

    // The send button is disabled, so exercise the OTHER submit path too —
    // Enter in the composer — and confirm the draft is still sitting there
    // afterwards instead of having been consumed by an attempted send.
    await composerA.press('Enter');
    await expect(composerA).toHaveValue(overLimit);

    // Non-delivery only means something once a LATER message has arrived: an
    // empty panel satisfies toHaveCount(0) instantly. Send a normal sentinel
    // from the same peer and wait for B to render it — the over-limit draft was
    // submitted first, had the whole round trip to surface, and still has not.
    const sentinel = `sentinel-after-over-limit-${Date.now()}`;
    await composerA.fill(sentinel);
    await pageA.getByRole('button', { name: 'Send message' }).click();
    await expect(chatPanelB.getByText(sentinel, { exact: true })).toBeVisible({ timeout: 15_000 });
    await expect(chatPanelB.getByText(overLimit, { exact: true })).toHaveCount(0);

    await close();
  });

  test('delivers an exactly-16,000-character message intact and clears the sender composer', async ({ browser }) => {
    const { pageA, pageB, close } = await joinedPair(browser);
    const chatPanelB = pageB.getByTestId('chat-panel');
    const composerA = pageA.getByPlaceholder('Send a message to everyone');
    const exactLimit = 'x'.repeat(16_000);

    await openChat(pageA);
    await openChat(pageB);
    await composerA.fill(exactLimit);
    await pageA.getByRole('button', { name: 'Send message' }).click();

    const receivedMessage = chatPanelB.getByText(exactLimit, { exact: true });
    await expect(receivedMessage).toBeVisible({ timeout: 15_000 });
    await expect(receivedMessage).toHaveText(exactLimit);
    await expect(composerA).toHaveValue('', { timeout: 15_000 });

    await close();
  });

  // The server's own rejection path, end to end. The chat bucket (capacity 20,
  // refill 5/s) charges each send by its serialized payload size, so a burst of
  // ~4 KB messages costs ~5 tokens apiece and drains it within a handful of
  // sends. What is under test is what RoomPage does with the resulting
  // `{ ok:false, code:'RATE_LIMITED', … }` ack: surface its message, KEEP the
  // draft, and stay usable once tokens refill.
  test('surfaces the server rate-limit rejection, keeps the draft, and recovers', async ({ browser }) => {
    // Two-peer setup + a send burst + waiting out a real token refill does not
    // fit the 30 s default; the budget is generous rather than a fixed wait.
    test.setTimeout(120_000);

    const { pageA, pageB, close } = await joinedPair(browser);
    const chatPanelA = pageA.getByTestId('chat-panel');
    const chatPanelB = pageB.getByTestId('chat-panel');
    const composerA = pageA.getByPlaceholder('Send a message to everyone');
    const sendA = pageA.getByRole('button', { name: 'Send message' });
    const rateLimitError = chatPanelA.getByText(/rate limit exceeded/i);

    await openChat(pageA);
    await openChat(pageB);

    // Send `text` from A, retrying ONLY while the server keeps refusing it.
    //
    // Retrying is safe after a RATE_LIMITED ack: the guard dropped the event, so
    // nothing was broadcast. It is NOT safe after RoomPage's 8 s ack timeout —
    // that timeout does not cancel the already-emitted Socket.IO event, so the
    // server may have accepted and broadcast the text while only the ack was
    // late. Re-sending there would manufacture a second LEGITIMATE delivery and
    // corrupt the exact-count assertion below, so an ambiguous settle records a
    // failure and emits nothing further.
    async function sendUntilAccepted(text) {
      let ambiguousSettle = null;
      await expect(async () => {
        await composerA.fill(text);
        await sendA.click();

        // Wait for THIS attempt's ack callback to run: RoomPage clears
        // chatSendPending inside it, so either the draft cleared (ok ack) or the
        // send button came back enabled with the draft intact (a failure path).
        // The window exceeds RoomPage's own 8 s ack timeout, so the callback has
        // certainly fired one way or the other by the time this resolves.
        await expect
          .poll(
            async () => (await composerA.inputValue()) === '' || (await sendA.isEnabled()),
            { timeout: 15_000 },
          )
          .toBe(true);

        if ((await composerA.inputValue()) === '') return; // ok ack → accepted.

        // The draft survived, so this attempt took a failure path — and that
        // same callback wrote chatError in the same React batch that cleared
        // chatSendPending. The copy on screen right now is therefore THIS
        // attempt's: no earlier attempt could have re-enabled the button without
        // also overwriting the very error being read here, and an accepted send
        // clears it outright. RoomPage's two failure copies are distinct, and
        // only the rate-limit one is safe to retry.
        if (!(await rateLimitError.isVisible())) {
          ambiguousSettle = "the send failed without a RATE_LIMITED error — RoomPage showed its ack-timeout copy, and that timeout does not cancel the emitted event, so the server may already have broadcast this text";
          return; // Ends the retry loop without re-sending; asserted below.
        }
        throw new Error('rate limited — retry once the chat bucket refills');
      }).toPass({ timeout: 60_000 });

      expect(
        ambiguousSettle,
        `chat send must settle on a definitive rejection before it is retried; instead ${ambiguousSettle}`,
      ).toBeNull();
    }

    // Burst until the server denies one. Each iteration settles on exactly one
    // of two visible outcomes — accepted (the ok ack clears the composer) or
    // denied (the error surfaces) — so the loop polls real state, never sleeps.
    let blockedDraft = null;
    for (let attempt = 0; attempt < 60 && blockedDraft === null; attempt += 1) {
      const text = `burst-${attempt}-${'x'.repeat(4_000)}`;
      await composerA.fill(text);
      await sendA.click();
      await expect
        .poll(
          async () => (await rateLimitError.isVisible()) || (await composerA.inputValue()) === '',
          { timeout: 15_000 },
        )
        .toBe(true);
      if (await rateLimitError.isVisible()) blockedDraft = text;
    }

    expect(blockedDraft, 'the chat bucket should deny a send within the burst').not.toBeNull();

    // The rejection is visible on A and the draft survived it. Whether the
    // denied send leaked to B is NOT asserted here: the denial ack reaches A
    // over a channel independent of any broadcast reaching B, so a count check
    // at this instant could simply be outrunning the leak. That is established
    // below, ordered behind a later arrival.
    await expect(rateLimitError).toBeVisible();
    await expect(composerA).toHaveValue(blockedDraft);

    // …and that very same draft goes through once the bucket refills, so the
    // limit is a transient back-off rather than a wedged composer.
    await sendUntilAccepted(blockedDraft);
    await expect(rateLimitError).toBeHidden();

    // Now order the non-delivery proof: send a sentinel AFTER the recovery and
    // wait for B to render it. Everything A sent earlier has had its full round
    // trip by then, so the blocked draft must appear on B EXACTLY once — that
    // one copy is the recovery send; a second would be the rate-limited send
    // having leaked through despite its RATE_LIMITED ack.
    const sentinel = `after-recovery-sentinel-${Date.now()}`;
    await sendUntilAccepted(sentinel);
    await expect(chatPanelB.getByText(sentinel, { exact: true })).toBeVisible({ timeout: 15_000 });

    const deliveredDraft = chatPanelB.getByText(blockedDraft, { exact: true });
    await expect(deliveredDraft).toHaveCount(1);
    await expect(deliveredDraft).toBeVisible();

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
