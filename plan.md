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

## Milestone 3 — Pre-call screen + controls polish  *(expand on arrival)*

1. Device enumeration/selection (`enumerateDevices`), preview, name/avatar entry.
2. Mic toggle + cam toggle (`track.enabled`). **[partially pulled forward in M2]** — in-call mic/cam
   toggle buttons + placeholder-avatar tiles + a `webrtc-media-state` signal already shipped (needed to
   verify M2 audio without echo on a single machine). M3 still owns: device selection, pre-call preview,
   and acquiring the camera *on* after it was unavailable/off (needs renegotiation).
3. Lobby page before joining; clean join/leave flow.
4. Connection-state UI (connecting / connected / failed).
5. Responsive 1:1 layout, MUI polish. Verify. → **/journal M3.**

---

## Milestone 4 — Group calls via mediasoup SFU  *(HARD — expand to micro-steps on arrival w/ current API; use Opus)*

1. Concept checkpoint: Worker, Router, send/recv Transports, Producer, Consumer.
2. Install `mediasoup` (server) + `mediasoup-client` (client).
3. Server: create Worker(s); per-room Router with media codecs.
4. SFU signaling: `getRouterRtpCapabilities`, `createWebRtcTransport`, `connectTransport`,
   `produce`, `consume`, `resume`.
5. Client: load Device with rtpCapabilities; create send/recv transports; produce local tracks;
   consume remote producers.
6. `new-producer` → consume; `producer-closed` → cleanup.
7. Dynamic multi-participant video grid (MUI).
8. Configure `listenIps` / `announcedIp` for local (and note deploy implications).
9. Verify with 3+ participants. → **/journal M4.**

---

## Milestone 5 — Screen share + in-call chat + reactions  *(expand on arrival)*

1. `getDisplayMedia` → separate screen-share Producer.
2. Presentation layout (pinned big tile).
3. In-call chat (reuse M1 socket or a WebRTC data channel).
4. Emoji reactions + raise hand (socket events).
5. (Optional) active-speaker detection via audio levels. Verify. → **/journal M5.**

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
