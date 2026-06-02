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

## Conventions (quick ref)
- Files: `kebab-case`; Components: `PascalCase.jsx`; Models: `PascalCase` singular
- Ports: server `5000` · client `5173` · MongoDB `27017` · mongo-express `8081`
- Commits only when Anuraj asks
