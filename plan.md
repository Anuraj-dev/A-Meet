# A-Meet — Project Plan

## Vision
Google Meet clone, built from scratch as a learning and portfolio project.
Stack: MERN · JavaScript · Material UI · Socket.io · mediasoup SFU.

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
| M8 | Per-participant output volume (Discord-style) | ✅ Done |
| M9 | Connection stability + in-call UX fixes | 🚧 Code done; prod verify pending |
| M10 | Landing 3D + Lobby redesign (ember/smoke system) | 🚧 In progress |

---

## M7 — Meeting-Room Fixes (in-call UX)

> Branch: `feat/meeting-room-fixes`. Fixes the seven in-call issues Anuraj flagged,
> plus layout polish and a level-reactive speaking indicator.

### Issues → tasks
- [x] M7.1 **Output volume** — master speaker-volume slider, applied to every `RemoteAudio` element.  *(issue 1)*
- [x] M7.2 **Input volume** — mic input gain via a Web Audio GainNode; the raw track stays the default and is only swapped for a processed track when gain ≠ 1, so the live path is untouched otherwise.  *(issue 1)*
- [x] M7.3 **Infinity-loop fix** — presenter no longer gets a hall-of-mirrors. Window/tab shares preview live; whole-monitor shares show a "You're presenting" card (the only way to fully kill the feedback when you capture the screen that shows the call).  *(issue 2)*
- [x] M7.4 **Sharer visibility + multi-share** — the sharer's camera tile always stays in the rail; when several people present, a thumbnail switcher picks the stage; each share is name-attributed.  *(issue 5)*
- [x] M7.5 **Reactions** — keep the per-tile avatar emoji popup AND add a Google-Meet bottom-left floating emoji stream.  *(issue 3)*
- [x] M7.6 **Screen-share controls** — auto-hide during share, reveal on hover, an up-arrow to pin them up (stage reflows to sit above the bar so it isn't covered), and a down-arrow to drop them again.  *(issue 4)*
- [x] M7.7 **Top-right overlap** — participant count / avatars no longer collide with the camera rail.  *(issue 6)*
- [x] M7.8 **Stop-share propagation** — server `sfu-close-producer` closes the server Producer (cascades to consumers); the native browser "Stop sharing" also tears down. Remote screen disappears the instant the presenter stops.  *(issue 7)*
- [x] M7.9 **Auto picture-in-picture** — mini player opens the moment the tab goes inactive and auto-closes on return.  *(issue 7)*
- [x] M7.10 **Speaking indicator** — level-reactive pulsing rings from client-side AnalyserNode metering (analyser-only, never wired to the speakers).  *(extra)*
- [x] M7.11 **Layout polish** — grid / presentation / rail / control-bar spacing and fidelity.  *(extra)*
- [x] M7.12 `npm run build` passes — zero errors
- [x] M7.15 **Alone layout** — when no remote peers, show local camera tile full-screen with invite overlay (was showing blank placeholder)
- [x] M7.16 **Screen share self-view** — always show live screen feed for local sharer; replaced "You're presenting" card with VideoTile + floating stop button
- [x] M7.17 **Auto-PiP reliability** — pre-warm canvas loop when tiles exist so `visibilitychange` can call `requestPictureInPicture()` without async delays; removed `active` from auto-pip effect deps
- [x] M7.18 **"You are presenting" card** — local monitor shares show Google Meet-style card with "Show my screen anyway" / "Stop presenting"; `showScreenAnyway` state resets per share session; remote shares always show live feed
- [x] M7.19 **Stop presenting header button** — replaced passive "Presenting" chip in top bar with clickable red "Stop presenting" chip (matches Google Meet top-bar button)
- [x] M7.20 **Audio survives bandwidth drops** — root cause: camera was a single VP8 encoding, so when a viewer's downlink dipped the SFU couldn't degrade it and the saturated transport broke the audio sharing the path. Fix: camera simulcast (3 spatial layers × L1T3 temporal) so the SFU sheds video layers per-receiver, plus `consumer.setPriority(255)` on audio so the SFU reserves voice bitrate before video. Audio Opus FEC/NACK/DTX was already in place.
- [x] M7.21 **Screenshot to clipboard** — "Take screenshot" in the More menu composites the current camera tiles (+ on-stage share) to a 1280×720 PNG and copies it to the clipboard (`ClipboardItem`), with a file-download fallback for browsers without image clipboard write. Canvas compositing extracted to shared `utils/video-composite.js` (reused by PiP + screenshot).
- [x] M7.22 **Audio input onChange fix** — `setAudioDevice` in `useLobbyMedia` now calls `setPreviewStream` after device swap (matches `setVideoDevice`); fixes stale preview stream and broken speaking-level indicator after mic change.
- [x] M7.23 **Scheduled-meeting context** — `RoomGuard` saves the room-metadata response and exposes it via `RoomMetaContext`; `LobbyPage` shows meeting title + scheduled time; `RoomPage` header shows the title when present.
- [x] M7.24 **Audio gain rearchitected (GMeet/Discord model)** — GainNode is now always in the signal chain, built eagerly in `setupSfu` before `produce()`. AudioContext `sampleRate` matches the captured track to prevent PipeWire resampling. `setMicGain` is now fully synchronous (only updates `gain.value`) — no `replaceTrack`, no async, no race. Fixes broken gain above 100%, broken gain below 100%, and the unity (100%) transition bug caused by racing async `replaceTrack` calls.
- [x] M7.25 **Schedule button on landing page** — `ScheduleMeetingDialog` was imported and state-managed but never rendered; added the render with the correct `open`, `onClose`, `existing`, `onSaved` props.
- [x] M7.13 Manual verify (Anuraj)
- [x] M7.14 /journal M7

### Implementation notes
- **Parallel build-out:** logic (`useMediasoup`, `usePictureInPicture`, server `sfu-close-producer`) and presentational pieces (`VideoTile` rings, `RemoteAudio` volume, `ControlBar`, `ReactionsOverlay`, `useAudioLevel`) are built against fixed contracts; `RoomPage` integrates them.
- **PipeWire safety:** all metering uses a single AnalyserNode-only AudioContext; mic gain routes through a `MediaStreamAudioDestinationNode` (separate sink). Nothing connects to `audioCtx.destination` — that crackles the live call on Linux.
- **Screen-share self-view tradeoff:** see M7.3 — fully killing the loop for monitor captures means the presenter sees a card, not a live self-mirror, in that one case.

---

## M8 — Individual participant output volume control (Discord-style)

> Branch: `feat/individual-output-volume`. Per-participant volume slider revealed by
> hovering a remote tile then clicking ⋮ — mirrors how Discord lets you control each
> person's output level independently. Master output volume still applies globally.
> Volumes are per-session (no persistence needed — socketIds change each call).

### Tasks
- [x] M8.1 **Per-peer volume state** — `peerVolumes` map keyed by socketId in `RoomPage`; `handlePeerVolumeChange` updates it and logs via `appLogger`.
- [x] M8.2 **RemoteAudio refactor** — rename `volume` → `masterVolume`, add `peerVolumes` map prop; each `PeerAudio` receives `finalVol = clamp(masterVolume × peerVolume, 0, 1)` and logs the applied value.
- [x] M8.3 **VideoTile 3-dot menu** — hover-reveal `MoreVert` button (bottom-right, remote tiles only); click opens a `Popover` with per-person volume slider (0–100%).
- [x] M8.4 **Wire in RoomPage** — pass `showVolumeControl`, `peerVolume`, `onPeerVolumeChange` to all remote tile entries (grid, solo layout, presentation rail).
- [ ] M8.5 Manual verify (Anuraj) + `/journal M8`

---

## M9 — Connection stability + in-call UX fixes

> Branch: `fix/m8-connection-and-ui-stability`. Fixes the prod report: two people on
> the same link both saw "You're the only one here", raise-hand looked broken, and the
> per-peer volume 3-dot was undiscoverable.

### Tasks
- [x] M9.1 **mediasoup announced-IP resolution** — `resolveAnnouncedIp()` runs at
  startup: keeps a usable public env value, else auto-detects the EC2 public IPv4 via
  IMDSv2 (tight timeout, fail-fast off-EC2), else logs a loud actionable error. Root
  cause of "can't see each other": a private/loopback announced IP means remote
  browsers can't reach the media ports, so `produce()` never completes and no peer
  ever becomes visible. `.env.example` documented.
- [x] M9.2 **Presence survives reconnect** — `join-room` is re-emitted on every socket
  `connect` (not just mount), so a network blip / server restart no longer silently
  drops a participant from everyone's list. Unexpected drops defer `user-left` by a
  short grace window and suppress the paired `user-joined` on a quick rejoin, so peers
  don't get leave→join churn (chat spam + join chime) on a blip/reload. An intentional
  leave ("Leave call") emits `leave-room` first, so peers see it instantly — no lag.
  Raise-hand state is re-asserted after SFU reconnect too.
- [x] M9.3 **Raise-hand visible locally in all layouts** — alone + solo self-tiles now
  receive `handRaised` (previously only grid/rail did), so raising your hand while
  alone actually shows the indicator.
- [x] M9.4 **Per-peer volume discoverability** — the remote-tile volume button is now
  persistently visible (subtle when idle, full on hover/open), larger touch target,
  and shows a muted icon at 0% — was hover-only and invisible on touch.
- [x] M9.5 **ControlBar declutter** — Audio settings moves into the More menu on mobile
  (with a group divider) so the bar isn't overcrowded on small screens.
- [x] M9.6 `npm run build` passes; lint introduces zero new issues; `resolveAnnouncedIp`
  runtime-tested off-EC2.
- [ ] M9.7 Manual verify in prod (Anuraj): set/confirm `MEDIASOUP_ANNOUNCED_IP` =
  EC2 public IP (or rely on auto-detect), redeploy, test with two devices.

---

## M10 — Landing 3D + Lobby redesign (ember/smoke design system)

> Branch: `redesign/landing-3d-meeting`. Unifies the product on ONE design language.
> The landing was reworked around a cinematic 3D meeting visual + a slow `EtherealShadow`
> smoke backdrop ("smoke, not glow"). The lobby still wore the OLD skin (cold purple bg,
> bright coral + neon teal, Three.js orb, glow blobs, shimmer + pulse) and is being brought
> onto the same system. Design decisions below were settled with Anuraj via a grilling pass.

### Design tokens (lobby adopts the landing's `DK`)
- bg `#0c0b12 → #140f0c` (warm graphite) · ink `#f4efe9` · dim `#a89f97` · faint `#6f675f`
- accent: coral `#ff6b4a` → **ember** `#e8623d` (+ `emberDark #d4502c` for hover/active)
- support: teal `#1fa98f` → **sage** `#7d9183`
- lines `0.09 / 0.16` · fonts unchanged (Bricolage Grotesque display, Plus Jakarta Sans body)

### Landing (done in this branch)
- [x] M10.1 Landing redesigned: 3D meeting hero + `EtherealShadow` smoke backdrop; `framer-motion`
  added; committed + pushed.

### Lobby redesign — frontend (this pass)
- [x] M10.2 **Avatar bug fix** — Google `lh3.googleusercontent.com` photo 429/403s when a
  `Referer` header is sent → MUI falls back to the "A" initial. Add `<meta name="referrer"
  content="no-referrer">` to `client/index.html` (covers both the header `<Avatar>` and
  `VideoTile`'s CSS `background-image`), plus `imgProps={{ referrerPolicy: 'no-referrer' }}`
  on the header Avatar as belt-and-suspenders.
- [x] M10.3 **Palette swap** — replace lobby `DK` with the landing's ember/sage/graphite tokens.
- [x] M10.4 **Remove the old skin** — delete `LobbyOrb` (Three.js) + `three` import, the two glow
  blobs, and the `shimmer` / `coralGlowPulse` / `controlsFloat` / `blobDrift1/2` keyframes.
- [x] M10.5 **Subdued backdrop** — shared `EtherealShadow` at ~55% opacity, edge-weighted, with a
  center scrim so the preview card + dropdowns stay crisp (preview keeps focus).
- [x] M10.6 **Motion** — replace custom `panelSlide`/CSS entrances with the landing's `framer-motion`
  `container`/`item` staggered rise (both pages animate identically). Keep the preview mouse-tilt.
- [x] M10.7 **Header identity** — avatar-only with a thin ember ring; name in a `Tooltip` on hover
  (removes the weak inline name + the duplication with the preview pill). Keep `BrandMark`.
- [x] M10.8 **Eyebrow** — replace the "ALMOST THERE" pill with the landing-style eyebrow (ember rule
  + sage uppercase). Copy follows Google Meet wording (e.g. "Your meeting's ready" / "Ready to
  join?"), no fake presence text (lobby has no participant data yet).
- [x] M10.9 **Join panel** — `Ready to join?` heading kept; room code + lock recolored sage/ember
  (drop teal glow); **Join now** = landing's flat ember `primaryBtn` (no pulse/shimmer/lift,
  hover → emberDark); Leave button retuned to the ember line.
- [x] M10.10 **Preview card** — top-left pill becomes a clean `● {name}  You` with an ember dot
  (drop "looking good"); card border/shadow retuned graphite + faint ember; control buttons
  (`PreviewToggle` + settings) recolored to the ember on/off states. No brand watermark.
- [x] M10.11 **Device dropdowns** — keep both under the preview; add a leading Videocam/Mic icon in
  each field; ember focus ring, graphite menu panel, ember hover, checkmark on the active device.
- [ ] M10.12 `npm run build` passes; lint introduces zero new issues; Anuraj manual verify.

### Lobby — instant-join gate
- [x] M10.13 **Instant-join (Google-Meet behaviour)** — the *act of creating* an instant meeting
  drops the creator straight into the room; everyone else opening the meeting link sees the
  lobby/preview first, then joins. Implemented as a **one-shot navigation marker, not identity**:
  "New meeting" navigates to `/room/:id` with `state:{ fromCreate:true }`, the lobby's Join
  navigates with `state:{ fromLobby:true, …devicePrefs }`, and `RoomGuard` bounces any `/room/:id`
  arrival lacking one of those markers to `/lobby/:id` (cold link open, refresh, **or the same
  account opening the link in another browser** — the bug an identity/`isHost` approach caused).
  `RoomPage` already defaults cam/mic on with default devices when there's no lobby nav state, so
  the drop-in works cleanly. Decision logic extracted to `utils/room-entry.js`
  (`shouldRedirectToLobby`); covered by `room-entry.test.js` (7) + `RoomGuard.test.jsx` (4, render
  + router + mocked API). Backend needs no change — the original `isHost` field was reverted.

---

## Conventions (quick ref)
- Files: `kebab-case`; Components: `PascalCase.jsx`; Models: `PascalCase` singular
- Ports: server `5000` · client `5173` · MongoDB `27017` · mongo-express `8081`
- Commits only when Anuraj asks
