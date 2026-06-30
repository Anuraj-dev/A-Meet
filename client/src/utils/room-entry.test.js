import { describe, it, expect } from 'vitest';
import { shouldRedirectToLobby } from './room-entry';

// The lobby/preview gate. A /room/:id URL may only be entered "directly" when it
// carries a deliberate-entry marker in the navigation state: `fromCreate` (the
// creator's instant meeting) or `fromLobby` (clicked Join in the preview). Every
// other arrival at /room — a cold link open, a refresh, the same account opening
// the link in another browser — must be bounced to /lobby first so it sees the
// preview screen and then joins.
describe('shouldRedirectToLobby', () => {
  it('lets the creator instant-join the room (fromCreate marker)', () => {
    expect(shouldRedirectToLobby('/room/abc-defg-hij', { fromCreate: true })).toBe(false);
  });

  it('lets a lobby join through (fromLobby marker)', () => {
    expect(
      shouldRedirectToLobby('/room/abc-defg-hij', { fromLobby: true, startVideoOn: false })
    ).toBe(false);
  });

  it('redirects a cold /room link open to the lobby (no marker)', () => {
    expect(shouldRedirectToLobby('/room/abc-defg-hij', null)).toBe(true);
  });

  it('redirects a /room refresh (state lost) to the lobby', () => {
    expect(shouldRedirectToLobby('/room/abc-defg-hij', undefined)).toBe(true);
  });

  it('redirects when state is present but carries no entry marker', () => {
    expect(shouldRedirectToLobby('/room/abc-defg-hij', { somethingElse: 1 })).toBe(true);
  });

  it('never redirects when already on the lobby path', () => {
    expect(shouldRedirectToLobby('/lobby/abc-defg-hij', null)).toBe(false);
  });

  it('never redirects on unrelated paths', () => {
    expect(shouldRedirectToLobby('/', null)).toBe(false);
  });
});
