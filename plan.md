# A-Meet — Fix plan: audio quality, join, participant visibility

> All milestones (M0–M6) are complete. This plan tracks the post-launch
> **feedback/fix** phase. Branch: `fix/audio-join-visibility`.

## Problem (user feedback, priority order)
1. **Audio (non-negotiable):** voice breaking during speech; cracking during silence;
   sometimes a participant can't be heard at all (worst). **Bad even in local dev (2 tabs)** →
   client/codec issue, not NAT.
2. **Join by code sometimes fails** ("Check your meeting code").
3. **Other participants not visible** — especially across different networks.

## Root causes (from code)
- Remote audio rides the camera `<video>` element; late audio track on an already-bound stream
  isn't rendered (Chrome), and `setRemoteStreams` reuses the same stream ref so `srcObject` never
  rebinds → "can't hear." Layout switches remount the tile → audio drops.
- Audio producer sets no Opus `codecOptions` (no FEC/DTX/NACK); router codec is stereo → breaking.
- UI-sound `AudioContext` (`sounds.js`) `suspend()` doesn't release the device on PipeWire → crackle.
- TURN/coturn is wired only to the dead P2P `webrtc.js`; live mediasoup transports get no `iceServers`.
- Join code isn't normalized (lowercase-only codes 404 on uppercase/whitespace).
- No diagnostics for ICE state / packet loss / jitter.

## Phases (execute in order: A → B → C → F → D → E)

### Phase A — Audio rendering robustness  *(fixes "can't hear" + relayout dropouts)*  ✅
- [x] A1 `useMediasoup`: publish a fresh `new MediaStream(stream.getTracks())` snapshot into state on
      every track add/remove (remote cameras + screens) so bound elements re-bind `srcObject`.
- [x] A2 New `RemoteAudio.jsx`: hidden `<audio autoPlay playsInline>` per peer, rebinds `srcObject` on
      fresh-ref change, `.play().catch()`; mounted once in `RoomPage` outside the tile layout.
- [x] A3 Remote camera `VideoTile`s set `muted` (grid/presentation rail + solo); audio via `RemoteAudio`.
- [x] A4 `VideoTile`'s existing `useEffect([stream])` now rebinds on the fresh ref → late tracks render.
- Refinement vs plan: reused `remoteStreams` + fresh refs instead of a parallel audio-stream state;
  the `<audio>` element ignores video tracks, so one combined stream feeds both sink + muted tile.

### Phase B — Opus codec tuning  *(fixes voice breaking)*  ✅
- [x] B1 Audio `produce()` `codecOptions`: `{ opusStereo:false, opusFec:true, opusDtx:true, opusNack:true, opusPtime:20 }`.
- [x] B2 Mono enforced via `opusStereo:false` (producer-side fmtp); router left stereo-capable in
      `sfu/config.js` for zero negotiation risk. DTX is a knob to revisit if silence artifacts persist.

### Phase C — UI-sound AudioContext  *(fixes cracking in silence)*  ✅
- [x] C1 `sounds.js`: `scheduleIdleClose` fully `close()`s + nulls `ctx`/`master` after a 1.2s debounce,
      lazy recreate per cue. Removed gesture pre-priming and enable-time pre-create (both held the
      device open). Device is now only held while a cue actually sounds.

### Phase F — Diagnostics overlay  *(measure the fixes)*  ✅
- [x] F1 `useMediasoup` polls consumer `getStats()` (dev-only) → `rtcStats`; new `RtcStatsOverlay.jsx`
      shows per-consumer kbps / packet loss / jitter / FEC + recv-transport state. No-op in prod.
- [x] F2 Server `sfu-create-transport`: logs `iceselectedtuplechange` (negotiated path) + warns on
      `icestatechange`/`dtlsstatechange` failures. (Implemented in `useMediasoup`, not a separate hook.)

### Phase D — Wire coturn into the live SFU  *(cross-network visibility/audio)*  ✅ code / ⚠️ infra
- [x] D1 New `services/ice-config.js` — single ICE source (STUN + TURN udp/tcp/tls + `VITE_FORCE_RELAY`
      debug policy); `webrtc.js` now re-exports it.
- [x] D2 `useMediasoup` passes `iceServers` + `iceTransportPolicy` to both send/recv transports.
- [x] D3 Prod verified via SSH (read-only). **announcedIp=13.49.185.86 ✅**. Repo `coturn/turnserver.conf`
      hardened: added `external-ip`, constrained relay `min/max-port`, stdout logging.
- **⚠️ Server-side action items for Anuraj (cannot fix from repo):**
  1. coturn had **no `external-ip`** → relay advertises the private IP → dead across networks. Apply the
     new conf with `external-ip=13.49.185.86/172.31.22.215`, then `docker compose -f
     docker-compose.coturn.yml up -d --force-recreate`.
  2. server `.env` `TURN_DOMAIN=ameet.raja-dev` is missing `.me`; ensure the **client** build
     (`VITE_TURN_DOMAIN`) points at a hostname that resolves to 13.49.185.86 (e.g. `api.ameet.raja-dev.me`).
  3. AWS security group: open **UDP+TCP 40000–40100** (mediasoup), **UDP/TCP 3478** + **UDP 49160–49200**
     (coturn relay). Direct path needs the mediasoup range; relay needs 3478 + the relay band.
  4. `ameet-server` shows **147 pm2 restarts** — investigate separately (crash loop?).

### Phase E — Join-by-code hardening  ✅
- [x] E1 `LandingPage.handleJoin` lowercases + strips spaces; `RoomGuard` canonicalizes the URL
      (redirects non-canonical → lowercase) so peers never split into different SFU rooms.
- [x] E2 Server `getRoom` lowercases the lookup param.
- [x] E3 Ended rooms now return **HTTP 410** `{ ended:true }`; `RoomGuard` renders `<CheckMeetingCode ended />`
      ("This meeting has ended") instead of the generic wrong-code screen.
- Also refactored `RoomGuard` to derive status (no setState-in-effect) — lint-clean.

## Verification
- 2 tabs/browsers: both directions audible; no dropout on camera toggle or grid↔presentation↔solo;
  no crackle in silence; stats overlay shows ~0 loss, rising `bytesReceived`.
- `chrome://webrtc-internals`: inbound audio shows FEC under loss, DTX gaps in silence.
- Cross-network: force relay flag → media still flows.
- Join: UPPERCASE / spaces / pasted URL all join.
- `npm run build` + lint clean.

## Constraints
- No AI attribution anywhere (commits/PRs/code/docs). Commit only when Anuraj asks.
