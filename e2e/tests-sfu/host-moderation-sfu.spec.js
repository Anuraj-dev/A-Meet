import { test, expect } from '@playwright/test';
import { createPeers } from '../helpers/peers.js';

// SFU-ENABLED host-moderation (#133, finishing #102). The remove + authz cases
// already ship SFU-off (host-moderation.spec.js); these two genuinely need real
// media and so run against a server with mediasoup ON:
//
//   • MUTE-ENFORCED — the server enforces mute by pausing the target's live
//     mediasoup audio producer and emits `sfu-force-muted` only as a side effect
//     of that pause. We assert the TARGET's own mic is actually forced off (its
//     control flips to "Turn on microphone" + it's told it was muted) — proof
//     the producer was paused, not merely that an ignorable event was relayed.
//   • SPOTLIGHT — the host spotlights a peer and the OTHER context's layout
//     re-focuses onto the spotlighted tile (only observable with remote media
//     tiles to focus, i.e. SFU on).
//
// Both contexts run with Chromium's fake camera/mic, so getUserMedia yields a
// synthetic video + audio track the SFU forwards over loopback.

// Distinct 24-hex ids so the server treats them as two different people; the
// FIRST to join a fresh "New meeting" room is its admin (host).
const host = { id: 'aaaaaaaaaaaaaaaaaaaaaaaa', name: 'Hank Host', email: 'hank@example.com', avatar: '' };
const guest = { id: 'bbbbbbbbbbbbbbbbbbbbbbbb', name: 'Gina Guest', email: 'gina@example.com', avatar: '' };

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

// Open the People panel (idempotent: only toggles it on if not already open).
async function openPeople(page) {
  const peopleBtn = page.getByRole('button', { name: /people/i });
  if (!(await page.getByRole('button', { name: `More actions for ${guest.name}` }).count())) {
    await peopleBtn.click();
  }
}

test.describe('SFU host moderation (real media)', () => {
  test('host mute pauses the guest producer → the guest mic is forced off', async ({ browser }) => {
    const { pageA, pageB, close } = await createPeers(browser, { users: [host, guest] });

    const roomId = await createRoomAsHost(pageA);
    await joinRoom(pageB, roomId);

    // Wait until media converges: the host sees the guest's camera tile (its
    // nameplate), which means producers/consumers are wired both ways.
    // Exact match: the tile nameplate is exactly the guest's name, so we don't
    // also (transiently) match the "Gina Guest joined" presence toast.
    await expect(pageA.getByText(guest.name, { exact: true })).toBeVisible({ timeout: 60_000 });

    // The guest joined with its mic on — its own control offers to turn it OFF.
    await expect(pageB.getByRole('button', { name: 'Turn off microphone' })).toBeVisible({ timeout: 30_000 });

    // Host opens People and mutes the guest. The per-person "Mute" item only
    // renders once the guest's audio has reached the host (the menu snapshots
    // the person), so retry-open until it's available, then click it.
    await openPeople(pageA);
    await expect(async () => {
      await pageA.keyboard.press('Escape'); // dismiss any stale (audio-not-yet) menu
      // With no menu open, Escape closes the People panel itself (dialog
      // semantics), so re-open it before reaching for the per-person menu.
      await openPeople(pageA);
      await pageA.getByRole('button', { name: `More actions for ${guest.name}` }).click();
      await expect(pageA.getByRole('menuitem', { name: /^mute$/i })).toBeVisible({ timeout: 1500 });
    }).toPass({ timeout: 30_000 });
    await pageA.getByRole('menuitem', { name: /^mute$/i }).click();

    // ENFORCED: the guest's own mic is forced off — its control now offers to
    // turn the mic ON, and the guest is told it was muted by the admin. This
    // only fires if the server actually paused a live audio producer.
    await expect(pageB.getByText(/muted by the meeting admin/i)).toBeVisible({ timeout: 15_000 });
    await expect(pageB.getByRole('button', { name: 'Turn on microphone' })).toBeVisible({ timeout: 15_000 });

    await close();
  });

  test('host spotlight → the other context re-focuses onto the spotlighted tile', async ({ browser }) => {
    const { pageA, pageB, close } = await createPeers(browser, { users: [host, guest] });

    const roomId = await createRoomAsHost(pageA);
    await joinRoom(pageB, roomId);

    // Media converges: the host sees the guest's tile.
    // Exact match: the tile nameplate is exactly the guest's name, so we don't
    // also (transiently) match the "Gina Guest joined" presence toast.
    await expect(pageA.getByText(guest.name, { exact: true })).toBeVisible({ timeout: 60_000 });

    // No host spotlight yet → no focused stage on either side.
    await expect(pageA.getByTestId('stage-focus')).toHaveCount(0);
    await expect(pageB.getByTestId('stage-focus')).toHaveCount(0);

    // Host spotlights the guest for everyone.
    await openPeople(pageA);
    await pageA.getByRole('button', { name: `More actions for ${guest.name}` }).click();
    await pageA.getByRole('menuitem', { name: /spotlight for everyone/i }).click();

    // The host's (the "other") context re-focuses onto the GUEST's tile: the big
    // focus stage now holds the guest, not the host's own self-tile.
    const hostStage = pageA.getByTestId('stage-focus');
    await expect(hostStage).toBeVisible({ timeout: 15_000 });
    await expect(hostStage.getByText(guest.name, { exact: true })).toBeVisible();
    await expect(hostStage.getByText(/\(You\)/)).toHaveCount(0);

    // …and the guest's own context likewise switches into the focused layout
    // (it's now the spotlighted participant → its self-tile is the big one).
    await expect(pageB.getByTestId('stage-focus')).toBeVisible({ timeout: 15_000 });

    await close();
  });
});
