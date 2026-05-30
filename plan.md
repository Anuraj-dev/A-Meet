# A-Meet — Master Build Plan

> **Single source of truth.** Every chat/agent reads this FIRST (see `CLAUDE.md`).
> Tick checkboxes as work completes. M1–M6 get expanded to micro-steps at the start of their milestone.

---

## Context — why this project & this plan

**A-Meet** is a Google Meet clone built from scratch by Anuraj (strong on MERN, **new to WebRTC,
SFU, and WebSockets**). It is a learning + portfolio project: the goal is to genuinely *understand*
real-time media, not hide it behind a hosted product. The repo at `/home/raja/Anuraj-Dev/A Meet`
started empty (greenfield).

This plan exists because the hard parts (WebRTC, SFU) are unfamiliar, so we build in **staged
milestones** — each one teaches one new concept and is independently runnable. The plan is the
contract that survives across multiple chats, so any fresh session can pick up exactly where we left off.

**Locked decisions:** MERN · **JavaScript** (not TS) · **Material UI only** (no Bootstrap) ·
Google Fonts · Passport `google-oauth20` + **JWT in httpOnly cookie** · **Joi** (API) + Mongoose (DB) ·
Socket.io signaling · **mediasoup** self-built SFU · **Docker** for MongoDB + mongo-express GUI ·
CI/CD deferred to M6.

---

## Operating rituals (apply to EVERY step)

1. **Read → Do → Journal.**
   - **Read** the relevant context first (this `plan.md`, the files you're about to touch, and any
     library doc you're unsure of) *before* writing code. Never act blind.
   - **Do** the step.
   - **/journal** at the **end of each milestone** (not every step) + on any major breakthrough.
2. **Update `plan.md`** — tick the step's checkbox the moment it's done, so status is always live.
3. **Model usage:** Opus for architecture / learning a new concept (M2 & M4 especially) / nasty bugs /
   security review; **Sonnet** for routine coding (most of M0, M1, M3); Haiku for trivial edits.
4. **Chat boundaries:** roughly **one chat per milestone** (two for the big ones, M4 especially).
   Start a fresh chat at each milestone boundary; the new chat reads `plan.md` + `CLAUDE.md` + memory
   and continues cleanly.
5. **Built-in skills, not custom agents:** use `/code-review`, `/security-review`, `/review`,
   `/git-commit` rather than building bespoke subagents.
6. **Commits** happen only when Anuraj explicitly asks (git is initialized in M0, but commits are on request).
   When committing/opening PRs: **zero Claude/Anthropic attribution** — see Attribution policy in Conventions.

---

## Conventions

- **Ports:** server `5000` · client (Vite) `5173` · MongoDB `27017` · mongo-express `8081`.
- **Layout:** monorepo — `client/` + `server/` + root `docker-compose.yml` + root `package.json`
  (scripts via `concurrently`).
- **Secrets:** Claude scaffolds `.env` + `.env.example` with empty keys; **Anuraj pastes real secrets**.
  `.env` is git-ignored.
- **Auth flow:** Passport Google strategy with `session: false`; on callback, mint a JWT and set it as
  an **httpOnly cookie**; protected routes/sockets verify that cookie. (No `express-session` needed.)
- **Naming:** files `kebab-case` (`auth.routes.js`), React components `PascalCase.jsx`, Mongoose
  models `PascalCase` singular (`User`, `Room`).
- **Far-milestone rule:** M1–M6 below are ordered step-lists. At the **start** of each, expand it into
  micro-steps in `plan.md` using current library APIs (esp. mediasoup in M4), then execute.
- **Attribution policy (STRICT — non-negotiable):** Never add any Claude/Anthropic attribution
  anywhere. No `Co-Authored-By: Claude`, no "Generated with Claude Code", no "written by Claude",
  no AI/tool/company mention — in commit messages, PR titles/bodies, code comments, or docs.
  All commits and PRs are authored as Anuraj alone. `CLAUDE.md` states this rule explicitly.

---

## Milestone 0 — Scaffold, Docker DB, Google Auth  *(detailed to micro-steps)*

**Outcome:** `docker compose up` runs Mongo + mongo-express GUI; `npm run dev` runs client+server;
you log in with Google, land on a page, click **New Meeting** → a room is created in Mongo → you're
routed to a placeholder room page. No WebRTC yet.

### M0.0 — Project contract files (do FIRST) ✅
- [x] Create `plan.md` at repo root = this document (the living plan).
- [x] Create `CLAUDE.md` at repo root: short pointer to plan.md + ritual + **strict Attribution policy** + conventions.
- [x] Create `.gitignore` (`node_modules`, `.env`, `client/dist`, `*.log`, `.DS_Store`).
- [x] `git init` (repo initialized on `main`). Commits await Anuraj's go-ahead.

### M0.1 — Root scaffold ✅
- [x] Create root `package.json` (private). Scripts: `dev`, `dev:server`, `dev:client`, `docker:up`, `docker:down`, `docker:logs`.
- [x] `npm i -D concurrently` at root.
- [x] Create `server/` directory (`client/` is created by Vite in M0.5).

### M0.2 — Docker: MongoDB + mongo-express ✅
- [x] Create root `docker-compose.yml`:
      - service **mongo** (`mongo:7`), named volume `mongo-data`, port `27017:27017`,
        env `MONGO_INITDB_ROOT_USERNAME` / `MONGO_INITDB_ROOT_PASSWORD` (from root `.env`).
      - service **mongo-express** (`mongo-express:1.0.2`), port `8081:8081`, `depends_on: mongo`,
        env `ME_CONFIG_MONGODB_SERVER`, `ME_CONFIG_MONGODB_ADMINUSERNAME/PASSWORD`,
        `ME_CONFIG_MONGODB_URL`, `ME_CONFIG_BASICAUTH=false` (local-dev only, no login prompt —
        1.0.2 mishandles the BASICAUTH_USERNAME/PASSWORD env vars).
- [x] Create root `.env` (local dev creds) + `.env.example`.
- [x] `docker compose up -d`; GUI verified at `http://localhost:8081` (HTTP 200).

### M0.3 — Server scaffold (Express + Mongoose + Passport) ✅
- [x] `cd server && npm init -y`.
- [x] Install: `express mongoose dotenv cors cookie-parser passport passport-google-oauth20 jsonwebtoken joi nanoid` + dev `nodemon`.
- [x] `server/.env` + `.env.example`: `PORT=5000`, `MONGO_URI` (points at docker mongo w/ creds + authSource=admin),
      `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `JWT_SECRET`, `CLIENT_URL=http://localhost:5173`,
      `SERVER_URL=http://localhost:5000`.
- [x] Structure: `server/src/{config,models,routes,controllers,middleware}` + `app.js` + `server.js`.
- [x] `config/db.js` — Mongoose connect with logging.
- [x] `config/passport.js` — Google strategy (`session:false`); find-or-create User by `googleId`.
- [x] `models/User.js` — `{ googleId, name, email, avatar }` + timestamps.
- [x] `middleware/auth.js` — read JWT from httpOnly cookie, verify, attach `req.user`.
- [x] `controllers/auth.controller.js` + `routes/auth.routes.js` —
      `GET /api/auth/google`, `GET /api/auth/google/callback` (mint JWT → set cookie → redirect to client),
      `GET /api/auth/me` (protected), `POST /api/auth/logout` (clear cookie).
- [x] `app.js` — `cors({ origin: CLIENT_URL, credentials:true })`, `cookieParser`, `express.json`,
      `passport.initialize()`, mount routes, central error handler.
- [x] `server.js` — connect DB then `app.listen(PORT)`.

### M0.4 — Room model + create/validate endpoints ✅
- [x] `models/Room.js` — `{ roomId (unique, nanoid), host: ref User, active, participants:[] }` + timestamps.
- [x] `controllers/room.controller.js` + `routes/room.routes.js` —
      `POST /api/rooms` (protected → create room, return `roomId`),
      `GET /api/rooms/:roomId` (validate room exists/active).
- [x] **Joi** validation schemas for room inputs (defense-in-depth alongside Mongoose).

### M0.5 — Client scaffold (Vite + Material UI) ✅
- [x] `npm create vite@latest client -- --template react`; `cd client && npm i`.
- [x] Install: `@mui/material @emotion/react @emotion/styled @mui/icons-material react-router-dom axios`.
      Google Fonts via `<link>` in `index.html`.
- [x] `vite.config.js` — dev proxy `/api` → `http://localhost:5000`.
- [x] Structure: `src/{pages,components,context,api,theme}`.
- [x] `theme/theme.js` — MUI dark theme (Meet-like); wrap app in `ThemeProvider` + `CssBaseline`.
- [x] `api/axios.js` — instance, `withCredentials:true`.
- [x] `context/AuthContext.jsx` — load `/api/auth/me` on mount; expose `user`, `login`, `logout`.
- [x] `pages/LandingPage.jsx` — logged-out: "Sign in with Google"; logged-in: **New Meeting** +
      "Join with code" input.
- [x] `pages/RoomPage.jsx` — placeholder (real video lands in M2+).
- [x] `components/ProtectedRoute.jsx` + routing in `App.jsx`. Build verified (vite build clean).

### M0.6 — Wire auth end-to-end (Anuraj sets up Google Cloud OAuth)
- [x] Anuraj creates an OAuth Client in Google Cloud Console; paste ID/secret into `server/.env`.
      Authorized origin `http://localhost:5173`; redirect URI `http://localhost:5000/api/auth/google/callback`.
- [x] Manual test: login → Google → callback → cookie set → `/me` returns user → New Meeting → room in
      Mongo (verify in mongo-express) → routed to `/room/:roomId`.

### M0.7 — Close out
- [ ] Run `/init` to refine `CLAUDE.md`; ensure it points to `plan.md`.
- [ ] Tick all M0 checkboxes; set "Current milestone: M1" in `CLAUDE.md`.
- [ ] **/journal** the M0 milestone.

---

## Milestone 1 — WebSockets in isolation (Socket.io chat)

**Outcome:** Two logged-in browser tabs join the same room, send chat messages in real time, and
see join/leave presence notifications. No media yet — pure Socket.io learning milestone.

### M1.0 — Install packages
- [x] `cd server && npm i socket.io`
- [x] `cd client && npm i socket.io-client`

### M1.1 — Attach Socket.io to the HTTP server
- [x] In `server/src/server.js`, wrap the Express app in `http.createServer(app)` and pass it
      to `new Server(httpServer, { cors: { origin: process.env.CLIENT_URL, credentials: true } })`.
- [x] Export `io` from a module (`server/src/socket/io.js`) so other files can import it without
      circular deps. Update `server.js` to import and initialise from that module.
- [x] `httpServer.listen(PORT)` instead of `app.listen(PORT)`.

### M1.2 — Socket auth middleware
- [x] Create `server/src/middleware/socket-auth.js`: parse `socket.handshake.headers.cookie`
      with the `cookie` npm module (already a transitive dep), extract the JWT cookie by name,
      `jwt.verify` it, attach `socket.user = payload`; call `next()` on success,
      `next(new Error('unauthorized'))` on failure.
- [x] Register: `io.use(socketAuth)` before any `io.on('connection', …)`.

### M1.3 — In-memory room map + server-side event handlers
- [x] Create `server/src/socket/room-manager.js`: export a `Map<roomId, Map<socketId, user>>`.
      Helpers: `addUser(roomId, socketId, user)`, `removeUser(socketId)`,
      `getRoomUsers(roomId)`, `getUserRoom(socketId)`.
- [x] Create `server/src/socket/handlers.js` and register it via `io.on('connection', …)`:
      - `join-room(roomId)` → add to map, emit `room-users` to sender, broadcast `user-joined`
        to room.
      - `chat-message({ roomId, text })` → broadcast `chat-message` to room (with sender info).
      - `disconnect` → look up user's room, remove from map, broadcast `user-left` to room.

### M1.4 — Client socket service
- [x] Create `client/src/services/socket.js`: create & export one `io(import.meta.env.VITE_SERVER_URL, { withCredentials: true })` instance (lazy-connect).
- [x] Add `VITE_SERVER_URL=http://localhost:5000` to `client/.env` (and `.env.example`).
- [x] In `RoomPage.jsx` `useEffect`: `socket.emit('join-room', roomId)` on mount;
      return cleanup that calls `socket.disconnect()`.

### M1.5 — Chat UI in RoomPage
- [x] Add state: `messages` (array of `{ type: 'chat'|'event', sender, text, ts }`), `input` string,
      `users` (online list).
- [x] Socket listeners in the same `useEffect`: `chat-message` → append to messages;
      `user-joined` / `user-left` → append event entry + update users list; `room-users` → seed list.
- [x] Render with MUI: scrollable `Box` for the message list (auto-scroll to bottom via `useRef`);
      `TextField` + `IconButton` (Send) pinned at the bottom; a compact user-presence chip row at the top.
      Keep it simple — no drawer, no sidebar — everything inline in RoomPage for now.

### M1.6 — Verify & close out
- [ ] Two browser tabs (or incognito), same Google account or two accounts, same room URL.
      Messages appear in both tabs; join/leave toasts/events show; refresh reconnects cleanly.
- [ ] **/journal M1.**

> **Why first:** builds the persistent-connection mental model you'll reuse for ALL signaling, with
> zero media complexity.

---

## Milestone 2 — WebRTC P2P 1:1, by hand  *(the key learning milestone — Opus)*

**Outcome:** Two logged-in tabs in the same room negotiate a direct peer-to-peer connection (no media
server) and see each other's live camera + hear each other's mic. Built by hand to genuinely learn
`getUserMedia` → `RTCPeerConnection` → SDP offer/answer → trickle ICE. Chat from M1 still works.

**Mental model (read before coding):**
- `getUserMedia` grabs the local camera/mic as a `MediaStream` (each track added to the peer connection).
- An `RTCPeerConnection` (PC) is the pipe between two browsers. STUN servers help each side discover its
  public-facing address for NAT traversal (no media flows through STUN — it's discovery only).
- **SDP offer/answer** = the two sides exchanging "here's what media/codecs I support." Caller makes an
  **offer**, callee replies with an **answer**. Each side sets the other's as its *remote description*.
- **Trickle ICE** = candidates (possible network paths) are discovered async and sent as they appear,
  rather than waiting. Each side `addIceCandidate`s the other's. Candidates that arrive before the
  remote description is set must be **buffered**, then flushed.
- **Who calls whom (no glare):** the **newcomer initiates** offers to everyone already present; existing
  peers only ever answer. Since one side never offers, there's no offer collision to resolve.
- Signaling is **socket-addressed**: every WebRTC message carries `to`/`from` *socketId* (a logged-in
  user can have multiple tabs = multiple peers), kept separate from M1's userId-deduped presence events.

### M2.0 — Signaling design note (do FIRST, no code) ✅
- [x] Decide events + addressing (above). Newcomer-initiates avoids glare → no perfect-negotiation
      rollback needed for 1:1. Keep WebRTC events fully separate from M1 chat/presence events.

### M2.1 — Server: WebRTC signaling relay ✅
- [x] Create `server/src/socket/webrtc.js` with its own ready-tracking
      (`Map<roomId, Set<socketId>>` + reverse `Map<socketId, roomId>`), and `registerWebrtcHandlers(io, socket)`:
      - `webrtc-ready(roomId)` → reply to sender `webrtc-peers` = socketIds **already** ready in the
        room (sender added to the set *after* computing the list, so it never includes self).
      - `webrtc-offer({ to, description })` → relay to `to` as `webrtc-offer({ from, description })`.
      - `webrtc-answer({ to, description })` → relay as `webrtc-answer({ from, description })`.
      - `webrtc-ice-candidate({ to, candidate })` → relay as `webrtc-ice-candidate({ from, candidate })`.
      - `disconnect` → drop from ready set, broadcast `webrtc-peer-left({ socketId })` to the room
        (socketId-level, so peers tear down the exact PC — distinct from M1's deduped `user-left`).
- [x] In `handlers.js`, call `registerWebrtcHandlers(io, socket)` inside the existing `connection` callback.

### M2.2 — Client: ICE config + VideoTile component ✅
- [x] `client/src/services/webrtc.js` — export `ICE_SERVERS` (Google public STUN:
      `stun:stun.l.google.com:19302` + a backup) and a `createPeerConnection()` factory.
- [x] `client/src/components/VideoTile.jsx` — `<video autoPlay playsInline>` that attaches a
      `MediaStream` via a ref (`el.srcObject = stream`); `muted` prop (local tile muted to avoid echo);
      shows a name label.

### M2.3 — Client: useWebRTC hook (the orchestration) ✅
- [x] `client/src/hooks/useWebRTC.js` — `useWebRTC(roomId)` returning `{ localStream, remoteStreams }`
      (`remoteStreams` keyed by socketId). In one effect:
      - `getUserMedia({ video, audio })` → set `localStream` (guard against StrictMode double-mount with a
        `cancelled` flag that stops the orphaned stream).
      - `createPeer(peerId)`: new PC, add all local tracks, `onicecandidate`→emit `webrtc-ice-candidate`,
        `ontrack`→store `e.streams[0]` under peerId, cache in a `Map` ref.
      - `webrtc-peers` → for each peerId: `createOffer`→`setLocalDescription`→emit `webrtc-offer`.
      - `webrtc-offer` → `createPeer`, `setRemoteDescription`, flush buffered candidates, `createAnswer`→
        `setLocalDescription`→emit `webrtc-answer`.
      - `webrtc-answer` → `setRemoteDescription` on that PC, flush buffered candidates.
      - `webrtc-ice-candidate` → if remoteDescription set `addIceCandidate`, else buffer in a `Map` ref.
      - `webrtc-peer-left` → close PC, drop from remoteStreams.
      - After media ready + listeners registered, emit `webrtc-ready(roomId)`.
      - Cleanup: `socket.off` all WebRTC events, close all PCs, stop local tracks, clear state.
        (Socket connect/join/disconnect stays owned by RoomPage's existing chat effect.)

### M2.4 — RoomPage: render local + remote tiles alongside chat ✅
- [x] Call `useWebRTC(roomId)`; restructure body into a flex row: **video area** (grid of VideoTiles —
      local first, muted; then one per remote stream) + the existing **chat panel** (width ~360, on the
      right). Header/presence unchanged. Keep it functional — responsive polish + controls are M3.

### M2.5 — Verify & close out
- [ ] Two tabs (two Google accounts, or two tabs same account), same room URL: grant cam/mic, both see
      each other's live video + hear audio; chat still works; closing one tab tears down the other's tile
      cleanly; refresh re-negotiates. Check `chrome://webrtc-internals` if a connection won't establish.
- [ ] **/journal M2.** *(Opus throughout this milestone.)*

---

## Milestone 3 — Pre-call screen + controls polish

**Outcome:** Users land on a lobby page before joining, pick their camera/mic, preview their video,
then join the room. In-call controls are polished: connection-state badge per peer, renegotiation
when a camera that was unavailable at join time is turned on, a proper Leave button, and a 1:1
responsive layout (remote full-screen, local as PiP).

**What M2 already shipped (don't redo):** in-call `toggleVideo` / `toggleAudio` (`track.enabled`),
`webrtc-media-state` signal, placeholder-avatar tile when cam off, `hasCamera` / `hasMic` flags.

### M3.0 — `useLobbyMedia` hook + LobbyPage
- [x] Create `client/src/hooks/useLobbyMedia.js`:
      - Request audio + video independently (same pattern as `useWebRTC`) → `enumerateDevices()` to
        get labeled device lists.
      - Expose: `previewStream`, `videoDevices`, `audioDevices`, `selectedVideoId`, `selectedAudioId`,
        `videoOn`, `audioOn`, `setVideoDevice(id)`, `setAudioDevice(id)`, `toggleVideo()`,
        `toggleAudio()`, `stop()` (stop all preview tracks for handoff to room).
      - On `setVideoDevice`: stop old video tracks, re-acquire with new `deviceId: { exact: id }`.
      - On `setAudioDevice`: stop old audio tracks, re-acquire with new `deviceId: { exact: id }`.
- [x] Create `client/src/pages/LobbyPage.jsx`:
      - Two-column layout (MUI): left = local video preview (`VideoTile`), right = controls.
      - Controls: camera device `Select`, mic device `Select`, cam/mic toggle `IconButton`s,
        display name (read-only from `AuthContext`), **"Join now"** `Button`.
      - On "Join now": call `stop()` (release preview tracks), navigate to `/room/:roomId` passing
        `{ videoDeviceId, audioDeviceId }` in `location.state`.

### M3.1 — Route wiring: Landing → Lobby → Room
- [x] `client/src/App.jsx`: add `/lobby/:roomId` route (wrapped in `ProtectedRoute`).
- [x] `client/src/pages/LandingPage.jsx`: change both `handleNewMeeting` and `handleJoin` to
      navigate to `/lobby/:roomId` instead of `/room/:roomId`.

### M3.2 — Device constraints in useWebRTC
- [x] `client/src/hooks/useWebRTC.js`:
      - Accept second arg `devices = {}` (`{ videoDeviceId, audioDeviceId }`).
      - In `init()`, use `{ deviceId: { exact: videoDeviceId } }` when `videoDeviceId` is provided,
        otherwise fall back to `true` — for both audio and video.
      - Store device IDs in a ref so `toggleVideo` (renegotiation path in M3.3) can use them.
- [x] `client/src/pages/RoomPage.jsx`: `useLocation()` → read `state.videoDeviceId` /
      `state.audioDeviceId` → pass to `useWebRTC`.

### M3.3 — Mid-call renegotiation (cam-on after unavailable)
- [x] `client/src/hooks/useWebRTC.js`:
      - In `getOrCreatePeer`: add `pc.onnegotiationneeded` handler → if `pc.signalingState === 'stable'`,
        `createOffer → setLocalDescription → emit webrtc-offer`. Guard with `try/catch`.
      - `toggleVideo`: if no video tracks exist and user wants camera on:
        `getUserMedia({ video: deviceId ? { deviceId: { exact } } : true })` → `addTrack` to
        `localStreamRef.current` + all existing PCs → update stream state.
        `onnegotiationneeded` fires per-PC and handles the re-offer automatically.

### M3.4 — Connection-state badge per peer
- [x] `client/src/hooks/useWebRTC.js`:
      - In `getOrCreatePeer`: `pc.onconnectionstatechange = () =>` update a `peerConnectionStates`
        state map `{ [peerId]: pc.connectionState }`.
      - Export `peerConnectionStates` from the hook.
- [x] `client/src/components/VideoTile.jsx`:
      - Add `connectionState` prop. Show a small chip overlay when state is `'connecting'`,
        `'failed'`, or `'disconnected'` (no badge needed for `'connected'`).
- [x] `client/src/pages/RoomPage.jsx`: pass `peerConnectionStates[peerId]` to each remote tile.

### M3.5 — 1:1 layout + Leave button
- [x] `client/src/pages/RoomPage.jsx`:
      - 1:1 case (exactly 1 remote entry): remote tile fills the full video area; local tile is
        PiP overlay — position absolute, bottom-right, ~200 × 150 px, with a subtle border/shadow.
      - Multi-peer: keep current auto-fit grid.
      - Control bar: add red **"End call"** `IconButton` (`CallEnd` icon) that navigates to `/`;
        keep mic + cam toggles.

### M3.6 — Verify & close out
- [ ] Manual test: lobby loads → cam/mic preview → device selectors work → "Join now" →
      in-call controls work → connection badge shows while connecting → 1:1 layout → Leave → clean.
- [ ] Tick all M3 checkboxes; update status log entry.
- [ ] **/journal M3.**

> **Deferred polish note (from M3 testing):** In 1:1 mode the remote tile uses `objectFit: contain`
> which letterboxes when the container aspect ratio doesn't match the camera (typically 4:3 camera
> in a wider container). Google Meet uses `cover` on a 16:9-constrained tile — video fills edge to
> edge with minimal crop. Fix in M5/M6 polish pass: constrain `VideoTile` container to 16:9 via
> `aspect-ratio: 16/9` (or `paddingTop: 56.25%` trick), then switch remote tile back to `cover`.
> Local PiP self-view can stay `contain`.

---

## Milestone 4 — Group calls via mediasoup SFU  *(HARD — Opus; expanded to micro-steps 2026-05-30)*

**Outcome:** 3+ logged-in tabs in the same room all see and hear each other through the **server**
(mediasoup SFU) instead of the M2/M3 browser-to-browser mesh. Each browser uploads its camera **once**
and downloads everyone else's; chat (M1) and the lobby (M3) are unchanged.

**Why the mesh had to go (read first):** in a mesh, N participants means each browser holds **N−1**
peer connections and uploads its video **N−1 times** — upload bandwidth and CPU explode past ~4 people.
An **SFU (Selective Forwarding Unit)** flips this: each browser opens **one** connection to the server,
uploads its camera **once**, and the server *forwards* (selects, doesn't mix/transcode) each person's
media to everyone else. Per browser: 1 upload + (N−1) downloads, but only **2 transports total**.

**The 7 mediasoup primitives (the milestone's whole vocabulary):**
- **Worker** — a C++ subprocess doing the actual media work (DTLS/SRTP/RTP). ~1 per CPU core; we pool them.
- **Router** — lives in a Worker; **one Router per room**. Routes RTP between transports and owns the
  room's `mediaCodecs` (its `rtpCapabilities`).
- **WebRtcTransport** — the ICE+DTLS pipe between one browser and the Router. Each peer needs **two**:
  a **send** transport (browser → server, carries Producers) and a **recv** transport (server → browser,
  carries Consumers). Split by direction so the two flows never interfere.
- **Producer** — server-side handle for an **inbound** track (this peer's mic or cam). Created when the
  client calls `sendTransport.produce(track)`, which the server services via `transport.produce(...)`.
- **Consumer** — server-side handle for an **outbound** track (someone else's Producer, forwarded to
  *this* peer). Created via `transport.consume(...)` on the peer's recv transport.

**The signaling sequence (client drives; all request/response over Socket.io ack callbacks):**
1. `sfu-get-rtp-capabilities` → server lazily creates the room's Router, returns `router.rtpCapabilities`.
2. Client `device.load({ routerRtpCapabilities })` — teaches mediasoup-client what the Router supports.
3. `sfu-create-transport {direction}` ×2 → server makes a WebRtcTransport, returns
   `{id, iceParameters, iceCandidates, dtlsParameters}`; client builds send + recv transports.
4. Transport `'connect'` event (fires once, on first use) → `sfu-connect-transport {transportId,
   dtlsParameters}` → server `transport.connect(...)`. DTLS handshake completes.
5. Send transport `'produce'` event → `sfu-produce {transportId, kind, rtpParameters}` → server
   `transport.produce(...)` → returns `producerId`; server broadcasts `sfu-new-producer` to the room.
6. Client `sendTransport.produce({track})` for the mic and cam tracks it has.
7. `sfu-get-producers` → list of producers already in the room; for each, **consume** it.
8. Consume: `sfu-consume {producerId, rtpCapabilities}` → server checks `router.canConsume`,
   creates the Consumer **paused**, returns `{id, producerId, kind, rtpParameters}`; client
   `recvTransport.consume(...)` → real track → `sfu-resume-consumer {consumerId}` → server
   `consumer.resume()`. (Create-paused-then-resume avoids losing the first keyframe.)
9. Live updates: `sfu-new-producer` → consume it; `sfu-producer-closed` → close that Consumer;
   `sfu-peer-left` → tear down all of that peer's tiles. Mic/cam toggle = `producer.pause()/resume()`
   broadcast as `sfu-producer-paused/resumed` (no renegotiation — producing a new track Just Works).

**Coexistence with M2/M3:** the mesh files (`server/src/socket/webrtc.js`, `client/src/hooks/useWebRTC.js`,
`client/src/services/webrtc.js`) stay in the repo **for reference** but go dormant — RoomPage switches to
the new SFU hook. `useMediasoup` deliberately returns the **same shape** as `useWebRTC`
(`{ localStream, remoteStreams (socketId→MediaStream), peerStates, localVideoOn, … toggleVideo, toggleAudio }`)
so RoomPage is a near drop-in. (`peerConnectionStates` becomes a single recv-transport state, not per-peer.)

### M4.0 — Concept checkpoint (no code) ✅
- [x] Mental model written above (mesh→SFU, the 7 primitives, the 9-step signaling sequence). Confirmed
      current API: **mediasoup 3.20.0** (server, needs Node ≥22 — have v22.22.2) +
      **mediasoup-client 3.20.0** (client). Worker ships a prebuilt binary; gcc/make/python3 present as fallback.

### M4.1 — Install deps + env ✅
- [x] `npm i mediasoup` (server) — installed 3.20.0; worker binary present (9.1M) + smoke test passed
      (worker spawns, router created, opus/VP8/rtx codecs available) on Fedora.
- [x] `npm i mediasoup-client` (client) — 3.20.0.
- [x] `server/.env(.example)`: added `MEDIASOUP_ANNOUNCED_IP`, `MEDIASOUP_MIN_PORT`, `MEDIASOUP_MAX_PORT`,
      `MEDIASOUP_NUM_WORKERS`.
- [x] Extended `config/env.js` with a `mediasoup` block (announcedIp, minPort, maxPort, numWorkers).

### M4.2 — Server: codecs config + Worker pool ✅
- [x] `server/src/sfu/config.js` — `mediaCodecs` (opus + VP8), `workerSettings`, `webRtcTransportOptions`
      (`listenInfos` udp+tcp w/ `announcedAddress` from env, `enableUdp/Tcp`, `preferUdp`, init bitrate).
- [x] `server/src/sfu/workers.js` — `createWorkers()` (pool = CPU cores, exit on `'died'`), `getWorker()`
      round-robin. Wired `await createWorkers()` into `server.js` before `listen`. Verified: 12 workers boot.

### M4.3 — Server: per-room Router + Peer state ✅
- [x] `server/src/sfu/sfu-rooms.js` — `getOrCreateRoom` (lazy Router on round-robin worker),
      `addPeer/getPeer/removePeer` (transport-close cascade), `listOtherProducers`, `closeRoomIfEmpty`.
      Integration-tested: router caps, transport+ICE candidate, peer bookkeeping, empty-room teardown.

### M4.4 — Server: SFU signaling handlers ✅
- [x] `server/src/socket/sfu-handlers.js` — `registerSfuHandlers(io, socket)`, ack-based events
      `sfu-get-rtp-capabilities` (+`socket.join`), `-create-transport`, `-connect-transport`, `-produce`,
      `-consume` (paused), `-resume-consumer`, `-get-producers`, `-pause/resume-producer`. Broadcasts
      `sfu-new-producer`, `-consumer-closed`, `-producer-paused/resumed`, `-peer-left`. disconnect → cascade.
- [x] Registered `registerSfuHandlers` in `handlers.js` (mesh `webrtc.js` left dormant for reference).

### M4.5 — Client: mediasoup signaling helper ✅
- [x] `client/src/services/mediasoup-signal.js` — `request(event, data, timeoutMs=10000)` promisifies the
      Socket.io ack (rejects on `error` or timeout). Reused for every SFU round-trip.

### M4.6 — Client: useMediasoup hook (the orchestration) ✅
- [x] `client/src/hooks/useMediasoup.js` — same return shape as `useWebRTC`. One StrictMode-guarded effect:
      acquire mic+cam independently → `device.load()` → send + recv transports (`'connect'`/`'produce'`
      relays) → produce local tracks (pause whichever lobby started "off") → register
      `sfu-new-producer`/`-consumer-closed`/`-peer-left`/`-producer-paused`/`-resumed` → `sfu-get-producers`
      then consume each, piling tracks into one MediaStream per remote socketId. `toggleAudio`/`toggleVideo`
      pause/resume the Producer (or produce-on-demand if none). Cleanup closes transports + stops tracks.
      Lint + client build clean.

### M4.7 — RoomPage: switch to the SFU hook ✅
- [x] `client/src/pages/RoomPage.jsx` — swapped `useWebRTC` → `useMediasoup` (identical destructure, so grid +
      1:1 PiP layout + control bar + chat untouched). Per-peer badge now reflects recv-transport state.
      Mesh files kept dormant for reference. Server boots clean (DB + 12 workers verified).

### M4.8 — listenIps/announcedIp + deploy note ✅ (runtime confirm folded into M4.9)
- [x] Documented (env `.env.example` comments + M4 intro): `MEDIASOUP_ANNOUNCED_IP=127.0.0.1` = same-machine
      multi-tab only; **LAN testing** needs the host's LAN IP, **prod** needs the public IP; the UDP/TCP range
      `MEDIASOUP_MIN/MAX_PORT` (40000–40100) must be opened in the firewall. TURN relay still deferred to M6.

### M4.9 — Verify & close out  *(Anuraj — manual, needs camera/mic)*
- [x] 3-tab verify done (Anuraj, 2026-05-30): SFU works — all tiles render, audio+video both ways,
      cam-off shows placeholder, leave removes the tile, chat works.
- [ ] **/journal M4** after final sign-off.

**Fix applied during M4.9 testing (2026-05-30):** local self-tile showed a generic "You"/"Y" instead of the
user's Google avatar+name. Root cause was latent since M0 — `/auth/me` returns `{ user }` but `AuthContext`
did `setUser(data)` (wrapped), so every flat consumer (`user.name/avatar/id`) read `undefined`. Fixed at the
source: `setUser(data.user)`. This also corrects Landing/Lobby name+avatar and chat `isMe` (now keyed on the
same `payload.sub` as `socket.user.id`).

**Deferred UI polish (from M4.9 — Anuraj wants these in the later UI pass, target M6 step 3 / dedicated UI milestone):**
1. **Smooth tiling animation** — when a participant joins/leaves, animate the grid reflow (FLIP-style layout
   transition) instead of the current abrupt re-layout, à la Google Meet.
2. **Full-bleed participant-colored off-camera tiles** — when a peer's camera is off, fill the whole tile
   with a solid per-participant color (hash of name/email, or avatar's dominant color) like Google Meet,
   rather than the current dark `#202124` background + small centered avatar.
3. General `VideoTile` styling polish (also see the M3 `contain`→`cover` 16:9 deferred note above).

---

## Milestone 5 — Screen share + reactions + raise hand + chat toggle  *(expanded 2026-05-30)*

**Outcome:** Any participant can share their screen (pinned presentation layout while sharing,
grid resumes on stop). Emoji reactions float over the sender's tile. Raise hand shows a badge.
Chat panel is toggleable (was always-on in M4). Active-speaker detection is optional.

**In-call chat status:** M1's Socket.io chat is fully wired and working in RoomPage — it survived
the M4 SFU swap unchanged. M5 adds a toggle button (show/hide the panel); no new chat infrastructure.

### M5.0 — Design decisions (no code)
- [x] **Screen share** = second mediasoup `sendTransport.produce()` call with
      `appData: { source: 'screen' }`. Server must pass `appData` through `sfu-new-producer`
      broadcast and `listOtherProducers` (currently missing). Receivers classify on
      `appData.source` and route to a separate `remoteScreens` map (socketId → MediaStream).
- [x] **Presentation layout**: when `isScreenSharing` or `remoteScreens` has entries, pin the
      screen tile as the full-height center; camera tiles move to a right-rail strip (~180px).
      When no screen share: existing grid / 1:1 PiP layout resumes.
- [x] **Chat toggle**: `showChat` boolean state (default `true`). `Chat` icon button in
      control bar toggles it. Unread badge when panel is hidden and a new message arrives.
- [x] **Reactions** = ephemeral socket events only. Server relay (no persistence). Client
      displays a large floating emoji overlay on the sender's tile for 3 s then removes.
      Fixed set of 6 emojis in a `Popover`.
- [x] **Raise hand** = per-user boolean. `sfu-raise-hand { raised }` → server sets
      `peer.handRaised` and broadcasts `sfu-hand-raise-update { socketId, raised }` to room.
      ✋ badge overlay on the sender's `VideoTile`. Client hook exposes `handRaised, toggleHand`.
- [x] **Active speaker** (optional, M5.7): `AudioLevelObserver` per room; broadcasts
      `sfu-active-speaker { socketId }` every 500 ms. Green pulsing border on loudest tile.

### M5.1 — Server: propagate `appData` through SFU events
- [x] `server/src/socket/sfu-handlers.js` — `sfu-produce` handler already calls
      `transport.produce({ kind, rtpParameters, appData })`. Add `appData: producer.appData`
      to the `sfu-new-producer` broadcast (currently missing, line ~91).
- [x] `server/src/sfu/sfu-rooms.js` — `listOtherProducers`: add `appData: producer.appData`
      to each result entry (currently missing, line ~62).

### M5.2 — Server: raise-hand + reaction relay handlers
- [x] `server/src/sfu/sfu-rooms.js` — `addPeer`: add `handRaised: false` to the peer object.
- [x] `server/src/socket/sfu-handlers.js` — add two handlers inside `registerSfuHandlers`:
      - `sfu-raise-hand { raised }` → `peer.handRaised = raised`;
        broadcast `sfu-hand-raise-update { socketId: socket.id, raised }` to room.
      - `sfu-reaction { emoji }` → relay to room as `sfu-reaction { emoji, socketId: socket.id }`.
        No ack, no persistence.

### M5.3 — Client: useMediasoup — screen share + separate remote screen streams
- [x] `client/src/hooks/useMediasoup.js` — additions:
      **State / refs:**
      - `remoteScreens` state `{}` (socketId → MediaStream) + `screenStreamsRef` (Map).
      - `screenProducerRef = useRef(null)`, `localScreenStream` state, `isScreenSharing` state.
      - `handRaised` state (false).
      - Update `producerInfoRef` entries to store `source` (`'screen'` | `'camera'`).
      **Classification in `consumeProducer`:** accept `appData` in its argument; after consuming,
      check `appData?.source === 'screen'` → add track to `screenStreamsRef.get(socketId)`,
      update `remoteScreens`; otherwise existing camera path (`peerStreams`/`remoteStreams`).
      **`closeConsumerById` + `removePeer`:** also clean up `screenStreamsRef`/`remoteScreens`
      when the closed consumer's `source === 'screen'`.
      **`dropPeer`:** also delete from `remoteScreens`.
      **`shareScreen()`:**
        - Guard: if `screenProducerRef.current`, return.
        - `stream = await navigator.mediaDevices.getDisplayMedia({ video: { cursor: 'always' }, audio: false })`.
        - `track = stream.getVideoTracks()[0]`.
        - `producer = await sendTransportRef.current.produce({ track, appData: { source: 'screen' } })`.
        - `screenProducerRef.current = producer`. `setLocalScreenStream(stream)`. `setIsScreenSharing(true)`.
        - `track.addEventListener('ended', stopScreenShare)` (OS stop-sharing button).
        - `producer.on('transportclose', stopScreenShare)`.
      **`stopScreenShare()`:**
        - If no ref, return.
        - `screenProducerRef.current.close()`. `screenProducerRef.current = null`.
        - Stop all tracks in `localScreenStream`. `setLocalScreenStream(null)`. `setIsScreenSharing(false)`.
      **`toggleHand()`:**
        - Flip `handRaised` state; `socket.emit('sfu-raise-hand', { raised: !handRaised })`.
      **`sfu-hand-raise-update` listener:** update `peerStates[socketId].handRaised`.
      **Cleanup:** close `screenProducerRef.current`; clear `screenStreamsRef`; reset `remoteScreens`.
      **Return shape additions:** `remoteScreens, isScreenSharing, localScreenStream, shareScreen,
      stopScreenShare, handRaised, toggleHand`.

### M5.4 — RoomPage: screen-share presentation layout + control bar
- [x] `client/src/pages/RoomPage.jsx`:
      - Destructure `remoteScreens, isScreenSharing, localScreenStream, shareScreen,
        stopScreenShare, handRaised, toggleHand` from `useMediasoup`.
      - Derive `activeScreenEntry`: prefer remote (`Object.entries(remoteScreens)[0]`) over local.
        `hasScreen = isScreenSharing || !!activeScreenEntry`.
      - **Presentation layout** (new top branch when `hasScreen`):
        - Left/center area (`flex: 1`): big `VideoTile` for the screen stream, `objectFit: contain`,
          label "You are presenting" (local) or sharer name (remote).
        - Right rail (`width: 180px`): vertical `Stack` of small camera `VideoTile`s
          (local first, then `remoteStreams` entries). Height auto; scroll if overflow.
      - Keep existing 1:1 PiP + grid as the else branch.
      - **Control bar additions:**
        - `ScreenShare` / `StopScreenShare` `IconButton` (calls `shareScreen` / `stopScreenShare`);
          highlighted `bgcolor: 'primary.main'` when `isScreenSharing`.
        - `PanTool` `IconButton` for raise hand; `bgcolor: 'warning.main'` when `handRaised`.
        - `Chat` / `ChatBubble` `IconButton` to toggle `showChat`; `Badge` with unread count.
      - `showChat` state (default `true`); `unreadCount` state, reset to 0 on open.
        Increment `unreadCount` in `chat-message` handler when `!showChat`.
      - Chat panel: render only when `showChat`; same JSX as M4, no other changes.

### M5.5 — RoomPage: emoji reactions
- [x] `client/src/pages/RoomPage.jsx`:
      - `activeReactions` state: `{}` (socketId → emoji string).
      - In `useEffect` socket listeners, add `sfu-reaction { emoji, socketId }`:
        set `activeReactions[socketId] = emoji`, then `setTimeout(() => clear it, 3000)`.
      - `sendReaction(emoji)`:
        - `socket.emit('sfu-reaction', { emoji })`.
        - Also trigger locally (using `user?.id` as a key — but note: we need `socket.id`
          for the `activeReactions` map; emit a synthetic local entry with a placeholder or
          use our own socket id from the server event echo if the server sends back to all
          including sender, otherwise just skip local echo).
          **Simplest:** server uses `socket.to(roomId)` which excludes the sender — so add
          a local `activeReactions` update in `sendReaction` using a sentinel `'me'` key,
          or change server to `io.in(roomId)` to include sender. Use `io.in(roomId)` approach.
      - Emoji picker: `reactionAnchor` state. `EmojiEmotions` `IconButton` in control bar →
        `Popover` with 6 `IconButton`s: 👍 ❤️ 😂 😮 👏 🎉. Click → `sendReaction(e)` → close.
      - Pass `activeReaction={activeReactions[peerId]}` and `activeReaction={activeReactions['me']}`
        (local) to the respective `VideoTile`s.
- [ ] `client/src/components/VideoTile.jsx`: add `activeReaction` prop. When set, render a
      large emoji (`fontSize: 48px`) absolutely centered over the tile. No animation needed
      (the 3 s timeout handles the fade implicitly on removal).

### M5.6 — VideoTile: raise-hand badge + reaction overlay
- [x] `client/src/components/VideoTile.jsx`:
      - Add `handRaised` prop. When true, show a ✋ chip/badge in the top-left corner of the tile.
      - Add `activeReaction` prop. When set, show a centered large emoji overlay.
- [x] `client/src/pages/RoomPage.jsx`: pass `handRaised={peerStates[peerId]?.handRaised}` to
      each remote tile; pass `handRaised={false}` (or omit) for local tile.

### M5.7 — (Optional) Active-speaker detection
- [x] `server/src/sfu/sfu-rooms.js` — in `getOrCreateRoom`, after `createRouter`:
      create `router.createAudioLevelObserver({ maxEntries: 1, threshold: -80, interval: 500 })`.
      Store as `room.audioLevelObserver`. On `volumes` event: broadcast `sfu-active-speaker
      { socketId: volumes[0].producer.appData.socketId }` to the room via `io`. On `silence`:
      broadcast `sfu-active-speaker { socketId: null }`. (Requires `io` passed into `getOrCreateRoom`.)
- [ ] `server/src/socket/sfu-handlers.js` — in `sfu-produce` handler, when `kind === 'audio'`:
      call `room.audioLevelObserver?.addProducer(producer)`. Also pass `appData` enriched with
      `socketId: socket.id` when creating the audio producer so the observer callback can map it.
- [ ] `client/src/hooks/useMediasoup.js`: listen `sfu-active-speaker { socketId }` →
      set `activeSpeaker` state. Export `activeSpeaker`.
- [ ] `client/src/components/VideoTile.jsx`: `activeSpeaker` prop → `box-shadow:
      '0 0 0 3px #00c853'` pulsing border (CSS animation or just static green ring).
- [ ] `client/src/pages/RoomPage.jsx`: pass `activeSpeaker={activeSpeaker === peerId}` to tiles.

### M5.8 — Verify & close out  *(Anuraj — manual, needs 3 tabs + camera/mic)*
- [x] Screen share: tab A shares → tabs B+C see pinned screen tile + right-rail thumbnails;
      tab A shows "You are presenting"; tab A stops → layout reverts to grid.
- [x] Chat toggle: hide/show panel; unread badge increments while hidden; messages still send.
- [x] Reactions: click 👍 → emoji appears over sender's tile in all tabs, fades after 3 s.
- [x] Raise hand: ✋ badge on tile; toggle clears it; visible across tabs.
- [x] Tick all M5 checkboxes. **/journal M5.**

---

## Milestone 6 — Polish, TURN, security, deploy (+ CI/CD)  *(expand on arrival)*

1. `coturn` TURN server (Docker) for NAT traversal.
2. Reconnection handling (socket + transport recovery).
3. Adaptive layout, end/leave states, error boundaries.
4. `/security-review` then fix; `/code-review` pass.
5. Production builds; env hardening.
6. Deploy: client (static host) + server/mediasoup (VPS/container, UDP ports open).
7. CI/CD pipeline. → **/journal M6.**

---

## Verification — how to confirm M0 works end-to-end

1. `docker compose up -d` → open `http://localhost:8081`, log into mongo-express GUI.
2. `npm run dev` (root) → server on `:5000`, client on `:5173` with no console errors.
3. Open `http://localhost:5173` → click **Sign in with Google** → complete Google consent →
   redirected back **logged in** (avatar/name shows).
4. Click **New Meeting** → in mongo-express, the `rooms` collection has a new doc with your
   `googleId` as host; browser routes to `/room/:roomId` (placeholder page).
5. Reload the page → still logged in (httpOnly cookie persists). `POST /api/auth/logout` clears it.

---

## Open items Anuraj owns (parallelizable)

- Google Cloud OAuth Client (ID + secret) for M0.6.
- Pasting all secrets into `.env` files (Claude leaves them empty).

---

## Status log

- **M0** — complete (2026-05-30). M0.6 verified end-to-end; M0.7 skipped /init (CLAUDE.md already complete).
- **M1** — code complete (2026-05-30). Done: M1.0–M1.5. M1.6 manual two-tab verify is Anuraj's.
- **M2** — code complete (2026-05-30). Expanded to micro-steps; built M2.0–M2.4 (server signaling
  relay `webrtc.js`, client `services/webrtc.js` + `VideoTile.jsx` + `hooks/useWebRTC.js`, RoomPage
  video-grid + chat layout). Client lints clean + builds; server modules import clean.
- **M2 fixes (2026-05-30, post first test):** single-camera testing exposed that a busy camera made
  the 2nd tab's `getUserMedia` throw → it dropped out of signaling (perpetual "waiting", no audio).
  Fixed: acquire audio+video **independently** and never bail; added `webrtc-media-state` signal +
  placeholder-avatar tiles + mic/cam toggle buttons (M3.2 pulled forward) so audio is testable without
  echo on one machine. Next: M2.5 — Anuraj re-verifies across two tabs, then **/journal M2**.
- **M3** — code complete (2026-05-30). M3.0–M3.5 built: `useLobbyMedia` hook, `LobbyPage` (device
  enumeration + preview), routing Landing→Lobby→Room, device constraints in `useWebRTC`, mid-call
  renegotiation for cam-on (`onnegotiationneeded`), connection-state badge on `VideoTile`,
  1:1 PiP layout, red Leave button. Build clean. M3.6 manual verify is Anuraj's.
- **M5** — complete (2026-05-30). Expanded M5 to micro-steps (M5.0–M5.8). Built: server
  `appData` propagation fix (sfu-handlers + sfu-rooms), raise-hand (`sfu-raise-hand` / `sfu-hand-raise-update`),
  reaction relay (`sfu-reaction` via `io.in`), `AudioLevelObserver` per room (`sfu-active-speaker`
  every 500ms, lazily created on first peer join, audio producers registered per `sfu-produce`);
  client `useMediasoup` extended with screen share (`shareScreen`/`stopScreenShare`, `remoteScreens`
  map, screen-vs-camera classification by `appData.source`, `handRaised`/`toggleHand`, `activeSpeaker`);
  `VideoTile` gains `handRaised` badge, `activeReaction` emoji overlay, `activeSpeaker` green border;
  `RoomPage` gains presentation layout (screen pinned + right-rail thumbnails), chat toggle with
  unread badge, emoji reaction popover, raise-hand button. All client builds clean.
  **M5.8 verified by Anuraj 2026-05-30** — screen share, 3-tab call, all features confirmed.
- **M4** — code complete (2026-05-30). Mesh→SFU. Expanded M4 to micro-steps (M4.0–M4.9). Stack:
  **mediasoup 3.20.0** (server) + **mediasoup-client 3.20.0** (client), Node v22.22.2. Built:
  server `sfu/{config,workers,sfu-rooms}.js` + `socket/sfu-handlers.js` (ack-based signaling:
  rtp-capabilities → transports → produce → consume → resume; new-producer/producer-closed/peer-left
  broadcasts; pause/resume for mute/cam-off), wired `createWorkers()` into `server.js`; client
  `services/mediasoup-signal.js` + `hooks/useMediasoup.js` (drop-in for `useWebRTC`), RoomPage swapped.
  Verified: worker smoke test, SFU module integration test (router/transport/ICE/teardown), server boot
  (DB + 12 workers), client lint + build. Mesh files (`webrtc.js`, `useWebRTC.js`, `services/webrtc.js`)
  left dormant for reference. **M4.9 = Anuraj's manual 3-tab verify, then /journal M4.**
