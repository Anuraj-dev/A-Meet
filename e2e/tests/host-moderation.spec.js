import { test, expect } from '@playwright/test';
import { io } from 'socket.io-client';
import { createPeers } from '../helpers/peers.js';
import { makeToken } from '../helpers/auth.js';
import { SERVER_URL, AUTH_COOKIE } from '../helpers/constants.js';

// Two-peer host-moderation propagation (epic stories 10 & 11): the host's
// People-panel actions reach the target peer's own context, server-relayed.
//
// Harness reality this spec is written against:
//  - The backend runs with the SFU OFF, so there are NO remote media tiles. The
//    People panel still lists peers from the socket presence roster (room-users /
//    user-joined, now tagged with each peer's socketId), so the host can target
//    a guest for moderation without any media. We assert on socket-relayed,
//    media-independent outcomes only:
//      • REMOVE  — host ejects the guest; the guest's context leaves the room.
//      • AUTHZ   — a non-host guest never sees the host-only actions.
//  - MUTE-ENFORCED and SPOTLIGHT's visible layout effect both require the SFU
//    (an audio producer to pause; remote tiles to re-focus) and are covered by a
//    separate SFU-enabled job — not here.

// 1x1 transparent PNG, so the roster renders <img alt={name}> and presence is
// assertable by accessible name (mirrors presence-panels.spec.js).
const AVATAR =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';

// Distinct 24-hex ids so the server treats them as two different people; the
// FIRST to join a fresh "New meeting" room is its admin (host).
const host = { id: 'aaaaaaaaaaaaaaaaaaaaaaaa', name: 'Hank Host', email: 'hank@example.com', avatar: AVATAR };
const guest = { id: 'bbbbbbbbbbbbbbbbbbbbbbbb', name: 'Gina Guest', email: 'gina@example.com', avatar: AVATAR };

// Host creates a fresh instant meeting and lands directly in the room.
async function createRoomAsHost(page) {
  await page.goto('/');
  await page.getByRole('button', { name: 'New meeting' }).click();
  await page.waitForURL(/\/room\/[a-z]{3}-[a-z]{4}-[a-z]{3}/);
  return new URL(page.url()).pathname.replace('/room/', '');
}

// Guest joins an existing room via the lobby preview.
async function joinRoom(page, roomId) {
  await page.goto(`/lobby/${roomId}`);
  await page.getByRole('button', { name: 'Join now' }).click();
  await page.waitForURL(new RegExp(`/room/${roomId}$`));
}

test.describe('host moderation propagation', () => {
  test('host removes a guest → the guest is ejected from the room', async ({ browser }) => {
    const { pageA, pageB, close } = await createPeers(browser, { users: [host, guest] });

    const rosterA = pageA.getByTestId('participant-roster');

    // Host starts the meeting; guest joins. Presence propagates both ways.
    const roomId = await createRoomAsHost(pageA);
    await joinRoom(pageB, roomId);
    await expect(rosterA.getByRole('img', { name: guest.name })).toBeVisible({ timeout: 15_000 });

    // Host opens People and removes the guest via the per-person action menu.
    await pageA.getByRole('button', { name: /people/i }).click();
    await pageA.getByRole('button', { name: `More actions for ${guest.name}` }).click();
    await pageA.getByRole('menuitem', { name: /remove from call/i }).click();

    // The guest's own context leaves the room (server → guest `sfu-removed`).
    await pageB.waitForURL((url) => !url.pathname.startsWith('/room/'), { timeout: 15_000 });

    // …and the host's roster drops back to just the host (after the leave grace).
    await expect(rosterA.getByRole('img', { name: guest.name })).toHaveCount(0, { timeout: 15_000 });

    await close();
  });

  test('a non-host guest cannot perform host-only moderation actions', async ({ browser }) => {
    const { pageA, pageB, close } = await createPeers(browser, { users: [host, guest] });

    const rosterB = pageB.getByTestId('participant-roster');

    // Host starts; guest joins and sees the host in their roster.
    const roomId = await createRoomAsHost(pageA);
    await joinRoom(pageB, roomId);
    await expect(rosterB.getByRole('img', { name: host.name })).toBeVisible({ timeout: 15_000 });

    // Guest opens People and the per-person menu for the host.
    await pageB.getByRole('button', { name: /people/i }).click();
    await pageB.getByRole('button', { name: `More actions for ${host.name}` }).click();

    // The local "Pin for me" affordance is available to everyone…
    await expect(pageB.getByRole('menuitem', { name: /pin for me/i })).toBeVisible();
    // …but none of the host-only moderation actions are exposed to the guest.
    await expect(pageB.getByRole('menuitem', { name: /remove from call/i })).toHaveCount(0);
    await expect(pageB.getByRole('menuitem', { name: /^mute$/i })).toHaveCount(0);
    await expect(pageB.getByRole('menuitem', { name: /spotlight for everyone/i })).toHaveCount(0);

    await close();
  });

  test('the server rejects a forged host action from a non-host', async ({ browser }) => {
    // Hiding the UI is not the trust boundary — the server is. Drive a raw
    // socket as the (non-host) guest, bypassing the client entirely, and forge a
    // host-remove against the host. The server must ignore it (caller is not the
    // room admin), so the host stays in the room.
    const { pageA, close } = await createPeers(browser, { users: [host] });
    const roomId = await createRoomAsHost(pageA);
    const rosterA = pageA.getByTestId('participant-roster');
    await expect(rosterA.getByRole('img', { name: host.name })).toBeVisible({ timeout: 15_000 });

    const guestSocket = io(SERVER_URL, {
      extraHeaders: { Cookie: `${AUTH_COOKIE}=${makeToken(guest)}` },
      transports: ['websocket'],
    });
    // Join as the guest and learn the host's socketId from the presence roster
    // (now tagged with socketId), so the forged event targets the real host.
    const hostSocketId = await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('did not receive room-users')), 10_000);
      guestSocket.on('connect', () => guestSocket.emit('join-room', roomId));
      guestSocket.on('connect_error', reject);
      guestSocket.on('room-users', (list) => {
        const h = list.find((u) => u.id === host.id);
        if (h?.socketId) { clearTimeout(timer); resolve(h.socketId); }
      });
    });

    guestSocket.emit('sfu-host-remove', { socketId: hostSocketId });

    // Give the (rejected) action time to round-trip; the host is NOT redirected.
    await pageA.waitForTimeout(1500);
    await expect(pageA).toHaveURL(new RegExp(`/room/${roomId}$`));

    guestSocket.disconnect();
    await close();
  });
});
