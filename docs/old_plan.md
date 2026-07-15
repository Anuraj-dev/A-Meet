# Old plan.md (archived 2026-07-05)

> This is the pre-`docs/STATE.md` `plan.md`, kept verbatim for its detailed milestone history
> and load-bearing "why". `docs/STATE.md` is now the live entry point — read that first; come
> here only when you need the full backstory on a specific milestone. Not updated going forward;
> new milestones are tracked in `docs/STATE.md` and `docs/decisions.md`.

# A-Meet — Project Plan

## Vision
Google Meet clone, built from scratch as a learning and portfolio project.
Stack: MERN · TypeScript (strict) · Material UI · Socket.io · mediasoup SFU.

---

## Milestone Overview

| # | Focus | Status |
|---|-------|--------|
| M0 | Repo scaffold, Docker, DB connection | ✅ Done |
| M1 | Auth (Google OAuth → JWT cookie) | ✅ Done |
| M2 | Socket rooms + basic WebRTC mesh | ✅ Done |
| M3 | Auth hardening + meeting CRUD | ✅ Done |
| M4 | mediasoup SFU migration | ✅ Done |
| M5 | Screen share + reactions + raise hand + chat toggle | ✅ Done |
| M6 | Aperture UI overhaul (landing + lobby) | ✅ Done — PR #5 |
| M7 | Meeting-room fixes (in-call UX) | ✅ Done |
| M8 | Per-participant output volume (Discord-style) | 🚧 Code done; [ ] M8.5 manual verify + journal |
| M9 | Connection stability + in-call UX fixes | 🚧 Code done; [ ] M9.7 prod verify pending |
| M10 | Landing 3D + Lobby redesign (ember/smoke system) | 🚧 Code done; [ ] M10.12 build/lint check + manual verify |
| M11 | Shared live transcription (English) | ✅ Done |
| M12 | Meeting-room redesign (ember re-skin + Meet feature parity) | 🚧 Code done; [~] M12.11 manual verify + journal pending |

---

## Platform / Infra (parallel track, not milestone-numbered)

This work runs alongside the feature milestones above and isn't tracked by milestone number,
but it's substantial and load-bearing — read the linked docs before touching CI, deploy, or
type-checking config.

- ✅ **TypeScript migration** — `client/src`, `server/src`, and `shared/src` (new `@a-meet/contracts`
  workspace) are all fully migrated to strict TypeScript. Only a handful of client test/setup
  files remain `.js`. Details, migration strategy, and per-package status: `docs/typescript-migration.md`.
- ✅ **CI/CD & test gates** — ESLint (all 3 workspaces), `npm audit --audit-level=high`, Vitest with
  a non-decreasing coverage ratchet, and a Playwright E2E harness split into SFU-off (`e2e/tests/`)
  and SFU-on (`e2e/tests-sfu/`) jobs. Full rules: `CONTRIBUTING.md`; workflows: `.github/workflows/`.
- ✅ **Production deployment & observability** — Docker image → ECR → self-healing EC2 (Elastic IP +
  CloudWatch auto-recovery), SSM-resolved secrets, CloudWatch Logs → metric filters → SNS → Telegram
  alarm **and recovery (OK)** notifications. Details: `README.md` Deployment section, `deploy/`.
  Known follow-ups: no automated rollback on failed post-deploy health check; coturn's TLS listener
  (5349) isn't provisioned with a cert yet; EC2 instance role's ECR-pull permission isn't captured
  in the repo's IAM policy files.

---

## Completed milestones (M0–M9, M11) — summary

Full task-by-task history has been condensed here to keep this file scannable; the
non-obvious *why* behind each decision is kept below since it's still load-bearing.

- **M0–M4** — repo/Docker/DB scaffold, Google OAuth → JWT httpOnly cookie auth, Socket.io
  presence rooms, then a full migration from a WebRTC mesh to a mediasoup SFU.
- **M5** — screen share via SFU + presentation layout, emoji reactions, raise-hand, chat
  toggle with unread badge.
- **M6** — "Aperture" landing + lobby UI overhaul (PR #5).
- **M7** — in-call UX fixes: master + per-peer output volume, mic input gain via Web Audio
  GainNode, screen-share feedback-loop fix (window/tab shares preview live; whole-monitor
  shares show a "You're presenting" card), multi-share thumbnail switcher, Google Meet-style
  floating reaction stream, auto-hide/pin share controls, auto picture-in-picture on tab
  blur, level-reactive speaking rings, scheduled-meeting title/time context in lobby/room,
  and a screenshot-to-clipboard feature (canvas compositing shared with PiP).
- **M8** — Discord-style per-participant output volume: `peerVolumes` map keyed by socketId,
  `finalVol = clamp(masterVolume × peerVolume, 0, 1)`, 3-dot popover on remote tiles.
- **M9** — connection-stability fixes for the prod report ("two people on the same link both
  saw 'you're the only one here'"): `resolveAnnouncedIp()` auto-detects the EC2 public IPv4
  via IMDSv2 at startup when no usable public IP is configured (root cause: a
  private/loopback announced IP means remote browsers can't reach the media ports, so
  `produce()` never completes and no peer becomes visible); `join-room` re-emits on every
  socket reconnect with a grace-window on unexpected drops so a blip doesn't cause
  leave→join churn; raise-hand now shows in every layout, not just grid/rail.
- **M11** — shared live transcription: Deepgram Nova-3 streaming captions + Groq Whisper
  Large V3 turn refinement, one-time participant consent, server-authoritative ordering/
  dedup/reconnect snapshots, AudioWorklet 16kHz PCM capture per participant, canonical
  `.txt` download.

### Known constraints (carried forward — don't re-break these)
- **Audio routing:** all client-side metering uses a single AnalyserNode-only AudioContext;
  mic gain routes through a `MediaStreamAudioDestinationNode` (separate sink). **Never**
  connect anything to `audioCtx.destination` — that crackles the live call on Linux/PipeWire.
- **Mic gain architecture:** the GainNode is always in the signal chain (built eagerly in
  `setupSfu` before `produce()`), and `setMicGain` only touches `gain.value` synchronously —
  no `replaceTrack`, no async, no race. AudioContext `sampleRate` matches the captured track
  to avoid PipeWire resampling.
- **Camera simulcast + audio priority:** camera uses 3-spatial-layer simulcast so the SFU can
  shed video layers per-receiver under bad downlink instead of saturating the transport (which
  previously broke audio too); `consumer.setPriority(255)` on audio reserves voice bitrate.
- **Instant-join is a navigation marker, not an identity check:** "New meeting" navigates with
  `state:{fromCreate:true}`, lobby Join navigates with `state:{fromLobby:true}`, and `RoomGuard`
  bounces any arrival lacking one of those markers back to the lobby. Do NOT reintroduce an
  `isHost`/identity-based redirect — that broke the same account opening a link in two browsers.
  Logic lives in `utils/room-entry.ts` (`shouldRedirectToLobby`).
- **Host mute/unmute is consent-based:** host mute is an enforced server-side producer pause;
  there is deliberately no force-unmute. Host "unmute" is a request-to-unmute prompt — muting
  keeps the track live, so a forced resume would leak audio without consent.

---

## M10 — Landing 3D + Lobby redesign (ember/smoke design system)

> Branch: `redesign/landing-3d-meeting`. Unifies the product on ONE design language: the
> landing's cinematic 3D hero + slow `EtherealShadow` smoke backdrop, now extended to the lobby
> (which wore the old cold-purple/coral/teal Three.js-orb skin). Settled with Anuraj via a grilling pass.

**Shipped:** landing 3D hero + smoke backdrop (`framer-motion`); lobby avatar 429/403 fix
(`referrerPolicy: no-referrer`); lobby palette swapped to the landing's `DK` tokens (ember
`#e8623d`/`emberDark #d4502c`, sage `#7d9183`, warm graphite bg, Bricolage/Plus Jakarta fonts);
old Three.js `LobbyOrb` + glow-blob keyframes removed; subdued shared `EtherealShadow` backdrop;
motion unified via `framer-motion` staggered rise; header identity simplified to avatar + tooltip
name; join panel and preview card re-themed to ember/sage; device dropdowns get icons + ember
focus states.

### Remaining
- [ ] M10.12 `npm run build` passes; lint introduces zero new issues; Anuraj manual verify.

---

## M12 — Meeting-room redesign (ember re-skin + Meet feature parity)

> Branch: `redesign/landing-3d-meeting`. The landing + lobby moved onto the warm
> ember/sage/graphite `DK` system (M10) but the **room** still wore the old cold blue/purple
> skin. This milestone re-skins the room onto the same system AND closes the biggest
> Google-Meet feature gaps (participants panel, pin/spotlight, layout chooser, host moderation).
> Design decisions settled with Anuraj via a grilling pass.

### Locked decisions
- **Skin:** room adopts the landing's `DK` tokens. North star = match Google Meet *behavior*.
  Ember = UI accent (active/focus); sage = support.
- **Speaking cue stays GREEN** (`#34d399`) — most legible live-voice signal on warm graphite;
  replicates Meet behavior (animated active-speaker ring + per-tile mic-level bars + red mute).
  Flag for later if Anuraj wants Meet's blue.
- **Side panels = single right rail** — Chat ↔ People ↔ Transcript switch (opening one closes
  the others), like Meet. Reuses the ChatPanel shell + control-bar badges.
- **Pin vs Spotlight:** local **pin** (any user, client-only state) + host **spotlight**
  (server relay → everyone).
- **Host mute = enforced** server-side producer pause; **no force-unmute** — see "Known
  constraints" above.

### Shipped
- **Phase 0 (re-skin):** room palette swapped to `DK`; fonts → Bricolage/Plus Jakarta; keyframes
  retuned (speaker-pulse stays green, everything else ember); build passes.
- **Phase 1 (People panel + rail):** `activePanel` makes Chat/People/Transcript mutually
  exclusive; `PeoplePanel` built (searchable, per-person mic/cam/raise-hand/speaking state,
  local Pin, host actions: mute/remove/mute-all/ask-to-unmute/spotlight).
- **Phase 2 (Pin/Spotlight/Layout):** `pinnedKey`/`spotlightKey` drive `renderFocusLayout`
  (spotlight wins over pin); per-tile options menu (Pin/Unpin, Spotlight, Fullscreen); layout
  chooser (Auto/Tiled/Spotlight/Sidebar) with grid pagination (9 desktop / 6 mobile).
- **Phase 3 (host moderation):** server events `sfu-host-mute`, `sfu-mute-all`,
  `sfu-request-unmute`, `sfu-request-unmute-all`, `sfu-host-remove`, `sfu-spotlight` (host-verified,
  in `sfu-handlers.ts`); client wiring for forced-mute, unmute-request snackbar, remove→leave,
  and spotlight-follows-host.

### Remaining
- [~] M12.11 Build passes; client + server tests green; zero new lint errors. Anuraj manual
  verify (needs 2 peers) + `/journal M12` still pending.

### Known test-coverage gaps for this milestone (from the 2026-07-04 codebase quality report)
Mute-all, ask-to-unmute(-all), and pin's visible layout effect currently have **no automated
test at any level** (unit or E2E) — only the manual checklist in `TESTING-M12.md`. Screen share,
raise-hand, fullscreen, and the layout chooser/pagination also have no E2E coverage. Worth
automating before `/journal M12` and moving on to M13+.

---

## Conventions (quick ref)
- Files: `kebab-case`; Components: `PascalCase.tsx`; Models: `PascalCase` singular
- Ports: server `5000` · client `5173` · MongoDB `27017` · mongo-express `8081`
- Commits only when Anuraj asks
