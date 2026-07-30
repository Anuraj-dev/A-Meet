# Chat message rework + background-only transcription — 2026-07-30

Source of truth for the chat/transcription rework tickets. Decisions grilled with Raja on
2026-07-30; chat design consulted with Sol (gpt-5.6-sol).

## Problem Statement

1. Chat messages have no copy affordance — when someone pastes a prompt or snippet into the
   in-meeting chat, other participants have to select text by hand to grab it.
2. Long chat messages are silently destroyed: the server hard-caps every message at 1,000
   characters and slices off the rest with no error. The sender only ever sees the broadcast
   copy, so even their own message appears cut. Pasted newlines also collapse into spaces, and
   URLs render as inert text.
3. The "transcription" feature behaves like captions: an on-screen overlay shows words the
   moment they're spoken. Users found the overlay annoying; the feature's purpose is a meeting
   transcript (who said what, browsable in the panel), not live captioning. The word-by-word
   interim broadcast also fans out to every participant several times per second per speaker —
   pure load with no product value once the overlay is gone.

## Solution

- Every chat bubble gets a copy button (hover/focus-revealed, always visible on touch) that
  copies the full canonical message text.
- Messages are never truncated. The limit rises to 16,000 characters and becomes a visible
  contract: the composer counts down past 14,000 and blocks at 16,000; the server rejects (not
  slices) oversized sends with a structured acknowledgement; the composer keeps the draft and
  shows why. Long messages render collapsed with "Show more / Show less"; newlines are
  preserved; web URLs become safe clickable links.
- Transcription goes background-only: the live captions overlay is deleted, the interim
  broadcast is removed end-to-end, and the transcript panel (which already exists) shows
  finalized speech turns only. The control-bar icon and remaining "captions" wording move to
  transcription language.

## User Stories

1. As a participant, I want a copy button on each chat message, so that I can grab a pasted
   prompt or snippet without hand-selecting text.
2. As a participant on a touch device, I want the copy button always visible, so that I'm not
   locked out of an affordance that needs hover.
3. As a participant, I want copy to yield the complete original message even when the bubble is
   visually collapsed, so that nothing is lost between what was sent and what I copied.
4. As a keyboard/screen-reader user, I want the copy button focusable with a meaningful
   accessible name and announced feedback, so that copying works without a mouse.
5. As a sender, I want my long paste delivered intact up to the limit, so that the tail of a
   large prompt is never silently lost.
6. As a sender, I want a visible error when my message exceeds the limit — with my draft kept
   in the composer — so that I can shorten it instead of losing it.
7. As a sender, I want a character counter to appear as I approach the limit, so that I'm not
   surprised at send time.
8. As a sender, I want pasted newlines preserved in the rendered message, so that structured
   text (lists, code, prompts) stays readable.
9. As a reader, I want messages beyond roughly 800 characters or a dozen lines collapsed behind
   "Show more", so that one giant paste doesn't bury the conversation.
10. As a reader, I want "Show less" to re-collapse an expanded message, so that I control my
    own view.
11. As a participant, I want http/https/www URLs in messages to be clickable links opening in a
    new tab, so that shared links are one click away.
12. As a participant, I want dangerous schemes (javascript:, data:, etc.) left as plain text,
    so that chat can't be used as an injection vector.
13. As a participant, I want each message to have a stable identity, so that the UI (keys,
    copy, future features) behaves predictably.
14. As a room member, I want oversized or over-rate sends to consume proportional rate-limit
    budget, so that one user pasting 16 KB repeatedly can't flood everyone.
15. As a speaker, I want no caption overlay appearing on stage as I talk, so that the meeting
    surface stays clean and transcription is unobtrusive.
16. As a participant, I want the transcript panel to show finalized speech turns with speaker
    and time, so that I can review who said what when I choose to look.
17. As a participant on a weak device/network, I want word-by-word interim traffic gone, so
    that the meeting spends bandwidth and renders on video, not on caption churn.
18. As a user reading the controls, I want the button icon and consent wording to say
    "transcription", not captions, so that the feature's actual behavior matches its label.
19. As a host, I want start/stop and consent behavior unchanged, so that going background-only
    doesn't alter who controls or contributes to the transcript.
20. As a participant, I want the transcript download to keep working exactly as before, so that
    the rework loses no capability I already had.

## Implementation Decisions

- **Never truncate.** Limit becomes 16,000 characters, enforced by rejection. The server stops
  slicing; an over-limit send returns a structured failure and nothing is broadcast.
- **Wire contract (from Sol consult; adopted in full, kept lean):** server-minted `id`
  (UUID), `kind: 'text'` discriminator (sole future-proofing for attachments), `sentAt`
  (server clock), and a send acknowledgement. The room is derived from the socket's
  authenticated membership — the client no longer supplies `roomId`. Composer clears only on
  `ok`. Ack shape:

  ```ts
  type SendChatMessageAck =
    | { ok: true; messageId: string }
    | { ok: false;
        code: 'EMPTY_MESSAGE' | 'MESSAGE_TOO_LONG' | 'RATE_LIMITED' | 'NOT_IN_ROOM';
        message: string; maxLength?: number; retryAfterMs?: number };
  ```

- **Rate limiting is size-weighted:** a message charges roughly `max(1, ceil(utf8Bytes/1000))`
  tokens from the existing chat bucket, with a defensive byte backstop (~64 KiB) on the
  payload.
- **Rendering:** `white-space: pre-wrap` on message text; collapse past ~800 characters or ~12
  rendered lines with local, session-only Show more/Show less state per client.
- **Copy:** MUI icon button at the bubble edge, revealed on row hover and focus-within,
  permanently visible when the device has no hover. Copies the canonical payload text (never
  the collapsed DOM text) via the async clipboard API (HTTPS/localhost — both hold here).
  Success feedback via tooltip/icon swap; failure must not look like success.
- **Links:** tokenizer-based linkification (linkify-it-style) producing React elements — no
  dangerouslySetInnerHTML. Allowlist http/https only (www. normalized to https). New tab with
  `rel="noopener noreferrer"`. No mailto. No link previews.
- **Transcription:** delete the overlay component and its page-level state (latest-caption +
  auto-clear timer). Remove the interim event from the shared contracts, the server's
  room-wide interim emit, and the panel's interim rows — the panel becomes finals-only
  (~1 event per speech turn). The provider session keeps interim results internally (they
  accumulate the final text); only the client-facing broadcast dies. Provider cost unchanged.
- **Naming:** control-bar icon moves from the ClosedCaption pair to a document-style icon
  (Description-style) with a dimmed/slashed off treatment; consent dialog and README rewording
  from "live captions" to "meeting transcription". Labels already say "transcript" and stay.
- **No persistence change:** chat and transcript remain in-memory/ephemeral. Out of scope
  below.

## Testing Decisions

- Existing seams only, no new ones: server socket-handler unit tests (the seam that already
  asserts the old 1000-char cap — that test flips to assert rejection), client component unit
  tests beside the components, and the Playwright chat e2e spec.
- Tests assert external behavior: what a second participant receives, what the sender's
  composer shows on rejection, what copy puts on the clipboard, which schemes render as links,
  that no interim events reach a connected client — never internal state.
- Key behavioral assertions (first TDD slices): 16,001 chars rejected without broadcast and
  draft retained; exactly 16,000 delivered intact; newlines survive round-trip; collapsed copy
  returns full text; javascript:/data: stay plain text; oversized messages drain proportional
  rate-limit tokens; overlay absent while a transcript session is live; panel receives finals
  only.
- Prior art: the existing chat handler describe-block (server), ChatPanel/ControlBar component
  tests (client), and the two-peer chat relay e2e.

## Out of Scope

- Images, file attachments, and any upload/storage infrastructure (the `kind` discriminator is
  the only future-proofing). Videos explicitly out.
- Converting oversized messages into a generated message.txt "attachment" — rejected: with no
  storage it's a fake file; collapse + copy solves the same need.
- Link previews/unfurling (SSRF, privacy, moderation surface).
- mailto: or any non-web scheme linkification.
- Chat or transcript persistence (history for late joiners, reload survival).
- Any change to transcription start/stop authorization, consent flow, or the Groq refinement
  step.
- Interims-while-panel-open subscription model — considered, rejected as complexity without a
  product need.

## Further Notes

- Root cause of the reported "compaction": server-side silent `slice(0, 1000)` on every chat
  message, compounded by newline collapse in the bubble. The toast preview's 2-line clamp is
  intentional and stays.
- The interim kill is the load win: interim traffic ≈ interim rate × contributors ×
  participants fan-out, several per second per speaker; finals are ~1 per speech turn.
- Google Meet's exact chat limit couldn't be verified; A-Meet deliberately exceeds Meet here
  because large-paste sharing is an observed real use case.
