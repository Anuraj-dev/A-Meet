import { test, expect } from '@playwright/test';
import { createPeers } from '../helpers/peers.js';

// SFU-ENABLED screen share (#162). Screen share genuinely needs real media: the
// sharer produces a screen track that the SFU forwards to the other peer, whose
// layout then switches to the presentation stage. So this runs against a server
// with mediasoup ON (mirrors host-moderation-sfu.spec.js).
//
// getDisplayMedia has no headless picker, so we stub it on the SHARER's context
// to yield a real, forwardable MediaStreamTrack from a canvas — the SFU still
// forwards it and the OTHER peer still consumes it, so the share/unshare path is
// exercised end to end; only the OS picker is bypassed.

const host = { id: 'aaaaaaaaaaaaaaaaaaaaaaaa', name: 'Hank Host', email: 'hank@example.com', avatar: '' };
const guest = { id: 'bbbbbbbbbbbbbbbbbbbbbbbb', name: 'Gina Guest', email: 'gina@example.com', avatar: '' };

// Replace getDisplayMedia with a canvas-backed stream so sharing needs no picker.
async function stubDisplayMedia(page) {
  await page.addInitScript(() => {
    navigator.mediaDevices.getDisplayMedia = async () => {
      const canvas = Object.assign(document.createElement('canvas'), { width: 320, height: 240 });
      const ctx = canvas.getContext('2d');
      // Repaint so the captured track keeps producing frames for the SFU.
      setInterval(() => {
        ctx.fillStyle = `hsl(${Date.now() / 20 % 360},70%,50%)`;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
      }, 100);
      return canvas.captureStream(10);
    };
  });
}

async function createRoomAsHost(page) {
  await page.goto('/');
  await page.getByRole('button', { name: 'New meeting' }).click();
  await page.waitForURL(/\/room\/[a-z]{3}-[a-z]{4}-[a-z]{3}/);
  return new URL(page.url()).pathname.replace('/room/', '');
}

async function joinRoom(page, roomId) {
  await page.goto(`/lobby/${roomId}`);
  await page.getByRole('button', { name: 'Join now' }).click();
  await page.waitForURL(new RegExp(`/room/${roomId}$`));
}

test.describe('SFU screen share (real media)', () => {
  test('the host presents → the guest sees the presentation; stopping tears it down', async ({ browser }) => {
    const { pageA, pageB, close } = await createPeers(browser, { users: [host, guest] });
    await stubDisplayMedia(pageA);

    const roomId = await createRoomAsHost(pageA);
    await joinRoom(pageB, roomId);

    // Media converges: the host sees the guest's camera tile (exact match avoids
    // the transient "Gina Guest joined" presence toast).
    await expect(pageA.getByText(guest.name, { exact: true })).toBeVisible({ timeout: 60_000 });

    // No presentation yet on the guest's side.
    await expect(pageB.getByText(`${host.name}'s screen`)).toHaveCount(0);

    // Host presents. Its control flips to the "stop" state…
    await pageA.getByRole('button', { name: 'Present now' }).click();
    await expect(pageA.getByRole('button', { name: 'Stop presenting' })).toBeVisible({ timeout: 30_000 });

    // …and the guest's layout switches to the presentation stage, labelled with
    // the sharer — proof the screen track was forwarded and consumed.
    await expect(pageB.getByText(`${host.name}'s screen`)).toBeVisible({ timeout: 30_000 });

    // Host stops presenting → the guest's presentation stage is torn down.
    await pageA.getByRole('button', { name: 'Stop presenting' }).click();
    await expect(pageA.getByRole('button', { name: 'Present now' })).toBeVisible({ timeout: 30_000 });
    await expect(pageB.getByText(`${host.name}'s screen`)).toHaveCount(0, { timeout: 30_000 });

    await close();
  });
});
