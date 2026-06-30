// Routing rule for the lobby/preview gate (Google-Meet behaviour).
//
// Instant-join is a one-shot tied to the ACT of entering a meeting, not to who
// owns it: only the creator's freshly-made instant meeting (`fromCreate`) and a
// deliberate Join from the preview (`fromLobby`) may land straight on /room. Any
// other arrival at /room/:id — a cold link open, a page refresh, or even the
// same account opening the link in another browser — must be bounced to /lobby
// so it sees the preview screen first, then joins.
//
// Identity is deliberately NOT used here: the host opening their own link in a
// second browser should still see the preview, exactly like Google Meet.
type RoomEntryNavigationState = {
  fromCreate?: unknown;
  fromLobby?: unknown;
} | null | undefined;

export function shouldRedirectToLobby(pathname: string, navState: RoomEntryNavigationState): boolean {
  if (!pathname.startsWith('/room/')) return false;
  return !(navState?.fromCreate || navState?.fromLobby);
}
