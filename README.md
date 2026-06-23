# A-Meet

> A full-stack video conferencing platform built from scratch — not a tutorial, not a template.

A-Meet is a production-grade Google Meet alternative engineered with a real SFU (Selective Forwarding Unit), end-to-end auth, scheduled meetings, and a handcrafted UI. Built as a deep-dive learning project to understand exactly how platforms like Google Meet, Whereby, and Daily.co work under the hood — and then build one.

---

## Why A-Meet instead of just... using Google Meet?

Google Meet is a product. A-Meet is an understanding.

Most "video calling" tutorials stop at a 2-person WebRTC peer connection. A-Meet goes further:

| What Google Meet hides | What A-Meet exposes |
|---|---|
| The SFU routing every stream | mediasoup running in your own process — you can read every line |
| Simulcast + layer switching | Three spatial layers × L3 temporal per camera, SFU sheds layers per-viewer's downlink |
| Audio priority over video | `consumer.setPriority(255)` on every audio consumer — voice survives bandwidth drops |
| Presence & reconnect handling | `join-room` re-emitted on every socket reconnect; grace-window debounce kills churn noise |
| Per-person volume | Discord-style per-tile volume slider — independent of master volume |
| Mic gain | GainNode always in the signal chain (Google Meet / Discord model) — fully synchronous, no `replaceTrack` races |
| Auto Picture-in-Picture | Canvas composites all tiles; `requestPictureInPicture` on tab hide, auto-close on return |
| Observability | Grafana + Loki + Promtail wired to structured server logs — watch SFU events in real time |

You can self-host it, read every line, break it, and understand why it broke. That's the point.

---

## Feature Set

### Core call
- **Google OAuth → JWT** auth (httpOnly cookie, zero client-side token storage)
- **mediasoup SFU** — scales beyond 2 peers; the same architecture used by production conferencing platforms
- **Simulcast** (3 spatial layers × L1T3 temporal) — video degrades gracefully on bad connections; audio stays
- **Screen sharing** with multi-share support, name attribution, and presentation layout
- **Auto Picture-in-Picture** — tab switch opens a mini player; returning closes it

### Audio / Video controls
- Master output volume (all remote peers)
- Per-participant output volume (Discord-style hover slider)
- Mic input gain via GainNode (no `replaceTrack`, no races)
- Camera + mic device switching mid-call
- Speaking indicator — level-reactive pulsing ring via `AnalyserNode` (no audio feedback)

### In-call UX
- Emoji reactions — per-tile popup + Google Meet-style floating emoji stream
- Raise hand with visual indicator across all layouts
- Chat panel with unread badge
- Screenshot to clipboard (canvas composite of all visible tiles, with download fallback)
- "Stop presenting" header chip (matches Google Meet top-bar behaviour)
- Auto-hide control bar during screen share; hover to reveal; pin/unpin toggle
- RTC stats overlay for debugging
- Shared English transcript — each browser streams only its own microphone as 16 kHz PCM;
  Deepgram Nova-3 supplies live captions and Groq Whisper refines completed turns
- Live captions + reconnect-safe transcript panel; every participant can download the same
  canonical `.txt` transcript (ephemeral in v1, not saved to MongoDB)

### Meetings
- Schedule future meetings with title, date/time, and shareable invite link
- Upcoming meetings list on landing page
- Lobby shows meeting title and scheduled time when joining a scheduled meeting
- Post-login redirect — invited users land back on the meeting after signing in

### Infrastructure
- **Docker Compose** — MongoDB, Promtail, Loki, Grafana all in one command
- **TURN server** support (coturn config included)
- **EC2-aware announced IP** — auto-detects public IPv4 via IMDSv2 on deploy; actionable error off-EC2
- **Structured logging** — Winston JSON logs → Promtail → Loki → Grafana dashboard

---

## Stack

| Layer | Technology |
|---|---|
| Frontend | React (Vite) + Material UI + Socket.io-client |
| Backend | Node.js + Express + Socket.io |
| Database | MongoDB + Mongoose |
| Media | mediasoup (SFU) |
| Auth | Passport `google-oauth20` → JWT (httpOnly cookie) |
| Validation | Joi (API) + Mongoose (schema) |
| Observability | Grafana + Loki + Promtail |
| Infra | Docker Compose + coturn |

---

## Getting Started

### Prerequisites
- Node.js 20+
- Docker + Docker Compose
- A Google OAuth app (Client ID + Secret)

### 1. Clone and install
```bash
git clone https://github.com/Anuraj-dev/A-Meet.git
cd A-Meet
npm install
npm --prefix client install
npm --prefix server install
```

### 2. Configure environment

Two env files, with distinct jobs:

```bash
cp .env.example .env               # repo root — local Docker Mongo credentials (read by Compose)
cp server/.env.example server/.env # server app config (read by the Node server)
```

`docker compose` reads the **repo-root `.env`** for the Mongo container credentials, so those
live there — not in `server/.env`. Keep the two in sync: the username/password in the root
`.env` must match the ones embedded in the server's `MONGO_URI` (both default to
`admin` / `change-me`).

Repo-root `.env` (local Docker Mongo only — unused in production):

```env
MONGO_ROOT_USERNAME=admin
MONGO_ROOT_PASSWORD=change-me
```

Open `server/.env` and fill in:

```env
# MongoDB — local dev points at the Docker Mongo container; credentials must match
# the repo-root .env above. In production, set MONGO_URI to your Atlas SRV string
# instead (see Deployment).
MONGO_URI=mongodb://admin:change-me@localhost:27017/ameet?authSource=admin

# Auth
GOOGLE_CLIENT_ID=your_google_client_id
GOOGLE_CLIENT_SECRET=your_google_client_secret
JWT_SECRET=a_long_random_string
CLIENT_URL=http://localhost:5173
SERVER_URL=http://localhost:5000

# mediasoup
MEDIASOUP_ANNOUNCED_IP=   # leave blank on localhost; set to EC2 public IP on deploy

# Session
SESSION_SECRET=another_long_random_string
```

To get a Google OAuth client:
1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a project → APIs & Services → Credentials → Create OAuth 2.0 Client ID
3. Authorized redirect URI: `http://localhost:5000/auth/google/callback`

### 3. Start infrastructure (local dev)
```bash
npm run docker:up
```

This starts the **local development** stack from `docker-compose.yml`: MongoDB (27017),
mongo-express (8081), Loki (3100), Promtail, and Grafana (3000). This is the one documented
way to run MongoDB locally for offline/full-stack work.

> **Dev vs production database:** the local Mongo container above is for development only.
> In production the database is **MongoDB Atlas** (set `MONGO_URI` to the Atlas connection
> string) and no Mongo container runs on the server — see [Deployment](#deployment-ec2-containerized).

### 4. Run the app
```bash
npm run dev
```

- **Client:** http://localhost:5173
- **Server:** http://localhost:5000
- **Grafana (logs):** http://localhost:3000
- **mongo-express:** http://localhost:8081

### 5. Create a meeting
1. Sign in with Google
2. Click **New meeting** on the landing page
3. Share the link with anyone — they sign in and land directly in the meeting

---

## Linting & tests

Each package has its own ESLint flat config (ESLint 10) and test suite. The same
commands run locally and in CI:

```bash
# Server (Express + Socket.io + mediasoup)
npm --prefix server run lint    # ESLint over src/, test/, and config files
npm --prefix server test        # Vitest

# Client (React + Vite)
npm --prefix client run lint
npm --prefix client test
```

The server lint config (`server/eslint.config.js`) uses Node globals for source and
Vitest globals for `test/**`, and ignores generated/dependency dirs
(`node_modules`, `logs`, `coverage`, `dist`). `npm --prefix server run lint` exits zero
on a clean checkout and runs as a CI gate.

---

## Project Structure

```
A-Meet/
├── client/                  # React (Vite) frontend
│   └── src/
│       ├── pages/           # LandingPage, LobbyPage, RoomPage
│       ├── components/      # VideoTile, ControlBar, ChatPanel, …
│       ├── hooks/           # useMediasoup, usePictureInPicture, useAudioLevel, …
│       ├── context/         # AuthContext, RoomMetaContext
│       └── utils/           # video-composite, logger
├── server/                  # Express + Socket.io + mediasoup
│   └── src/
│       ├── routes/          # auth, meetings, rooms
│       ├── socket/          # room events, SFU signalling
│       ├── models/          # User, Meeting
│       └── middleware/      # JWT cookie auth
├── docker-compose.yml       # LOCAL DEV: MongoDB + observability stack
├── docker-compose.prod.yml  # PRODUCTION: server only (DB is Atlas via MONGO_URI)
├── docker-compose.coturn.yml
└── plan.md                  # milestone roadmap (source of truth)
```

---

## Architecture — How the SFU works

```
Browser A                mediasoup Router              Browser B
    │                          │                           │
    │── produce (camera) ──▶   │                           │
    │                          │◀── consume (B's recv) ──  │
    │                          │── stream A's layers ──▶   │
    │                          │   (layer switch per B's   │
    │                          │    available bandwidth)   │
```

Every participant **produces** one video track (simulcast: 3 quality layers) and one audio track. Every other participant **consumes** those tracks via the router. The SFU forwards only the right layer — no mixing, no re-encoding, low latency. Audio consumers get `priority(255)` so the SFU always reserves voice bitrate before dropping video layers.

---

## Observability

Logs flow: **Winston (server)** → JSON files → **Promtail** → **Loki** → **Grafana**.

Open Grafana at `http://localhost:3000`, go to Explore → Loki, and query:
```
{job="a-meet-server"}
```

You can watch SFU `produce` / `consume` / `close-producer` events in real time while a call is live.

---

## Deployment (EC2, containerized)

Production runs the backend as an **immutable Docker image** built from `server/Dockerfile`,
supervised by Docker (not pm2). The container uses **host networking** so mediasoup's RTP
port range is reachable, and the server's SIGTERM graceful-drain handles clean restarts.

Releases are **image-based**: CI builds the server image, publishes an immutable tag to
**Amazon ECR**, and the EC2 node **pulls that tag** and restarts the container — it never
rebuilds mediasoup on the box. Docker's `restart: unless-stopped` is the supervisor and
`./server/logs` is mounted in, so the existing Promtail tail keeps working.

```bash
# On the EC2 node (Docker + Docker Compose plugin + AWS CLI installed)
git clone ... && cd A-Meet   # the node keeps a checkout for config (compose file + env)

# server/.env carries the runtime contract (same keys as everywhere else). In prod:
#   MEDIASOUP_ANNOUNCED_IP = the box's public IPv4
#   MONGO_URI              = Atlas connection string
# Open UDP ports 10000–59999 in the security group (mediasoup RTP range), plus 5000 (API).

# Pull the published image tag and start (this is what CI automates on each deploy):
export SERVER_IMAGE=<account>.dkr.ecr.<region>.amazonaws.com/a-meet-server:<git-sha>
aws ecr get-login-password --region <region> | docker login --username AWS --password-stdin <account>.dkr.ecr.<region>.amazonaws.com
docker compose -f docker-compose.prod.yml pull
docker compose -f docker-compose.prod.yml up -d

docker compose -f docker-compose.prod.yml logs -f      # tail logs
docker compose -f docker-compose.prod.yml down         # SIGTERM → graceful drain, then stop
```

> For a local/manual build instead of pulling, leave `SERVER_IMAGE` unset and run
> `docker compose -f docker-compose.prod.yml up -d --build`.

### CI/CD: build → ECR → deploy by tag

The **Deploy backend** workflow (`.github/workflows/deploy-backend.yml`) runs on merges to
`main` that touch `server/**`, the prod compose, or the workflow itself. It builds the
Dockerfile's `runtime` target, pushes it to ECR, and SSHes to EC2 to pull and restart. The
deploy **fails fast** if the image pull, container start, or the post-deploy health check fails.

It activates only once the registry is configured — until `ECR_REPOSITORY` is set the jobs skip
cleanly, so merges to `main` stay green. To enable it:

**Repository variables** (Settings → Secrets and variables → Actions → Variables):

| Variable | Purpose |
|---|---|
| `AWS_REGION` | ECR / deploy region, e.g. `ap-south-1` |
| `ECR_REPOSITORY` | ECR repo name, e.g. `a-meet-server` (must exist) |
| `HEALTH_URL` | optional; defaults to `https://api.ameet.raja-dev.me/api/health` |

**Repository secrets:**

| Secret | Purpose |
|---|---|
| `AWS_DEPLOY_ROLE_ARN` | IAM role assumed via GitHub OIDC; needs `ecr:GetAuthorizationToken` + push to the repo |
| `EC2_HOST` | public host/IP of the production node |
| `EC2_SSH_KEY` | SSH private key for the `ubuntu` user |

**On the EC2 node:** Docker + Compose plugin + AWS CLI, and an **IAM instance role with ECR
pull** permissions (so `aws ecr get-login-password` works without static keys).

**Image-tag contract:** every build is pushed as both `:latest` and an **immutable `:<git-sha>`**
tag; deploys pull the specific `:<git-sha>` so a release maps to exact bytes and can be rolled
back by redeploying an older SHA.

### Database: MongoDB Atlas (production)

Production persistence is **MongoDB Atlas**, decoupled from the application box — the server
node runs **no Mongo container** (`docker-compose.prod.yml` has no `mongo`/`mongo-express`
services). The local `docker-compose.yml` Mongo stack is for development only.

1. Create an Atlas cluster and a database user.
2. **Network allowlist:** in Atlas → *Network Access*, add the production node's **public IPv4**
   (the same value you set for `MEDIASOUP_ANNOUNCED_IP`) so the EC2 box can reach the cluster.
   On a fixed-IP node prefer that exact `/32`; if the IP can change, an Elastic IP keeps the
   allowlist stable. (`0.0.0.0/0` works but is not recommended.)
3. Set `MONGO_URI` in `server/.env` on the node to the Atlas SRV connection string, e.g.
   `mongodb+srv://<user>:<pass>@<cluster>.mongodb.net/ameet?retryWrites=true&w=majority`.

`MONGO_ROOT_USERNAME` / `MONGO_ROOT_PASSWORD` are local-Docker-Mongo credentials only and are
not used in production.

For HTTPS (required for camera/mic on non-localhost), put Nginx in front with a Let's Encrypt cert and proxy to `localhost:5000`.

---


## Milestones

| # | Focus | Status |
|---|-------|--------|
| M0 | Repo scaffold, Docker, DB | ✅ |
| M1 | Google OAuth → JWT cookie | ✅ |
| M2 | Socket rooms + WebRTC mesh | ✅ |
| M3 | Auth hardening + meeting CRUD | ✅ |
| M4 | mediasoup SFU migration | ✅ |
| M5 | Screen share + reactions + raise hand + chat | ✅ |
| M6 | Landing page + lobby UI overhaul | ✅ |
| M7 | In-call UX (PiP, simulcast, gain, screenshot…) | ✅ |
| M8 | Per-participant volume control | ✅ |
| M9 | Connection stability + announced IP + UX fixes | ✅ |

---

## License

MIT
