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
- **Structured logging** — Pino JSON; local → Promtail/Loki/Grafana, production → CloudWatch

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
| Observability | Local: Grafana + Loki + Promtail · Production: CloudWatch + SNS/Telegram |
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

### Full pre-merge suite

Run the CI gates that fire on every PR in one command:

```bash
# One-time: download Playwright browsers (not part of npm ci)
npm run test:e2e:install

# lint (server + client) → npm audit (server + client) → typecheck → unit/coverage → client build → E2E smoke
npm run verify
```

`verify` fails fast — the first failing phase stops the run. It mirrors the CI jobs that
run on every PR: `Server lint`, `Client lint`, `npm audit (high)`, `Workspaces typecheck`,
`Client tests + build`, `Server tests` (coverage ratchet), and the `Playwright smoke`. It does **not** run
the path-scoped `Server image smoke` (a ~15-min Docker build that spawns a real mediasoup
worker), which CI runs only when server-image files change. A green `verify` locally means
those every-PR gates are satisfied.

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

Local logs flow: **Pino (server)** → JSON files → **Promtail** → **Loki** → **Grafana**.

Open Grafana at `http://localhost:3000`, go to Explore → Loki, and query:
```
{job="a-meet-server"}
```

You can watch SFU `produce` / `consume` / `close-producer` events in real time while a call is live.

Production does not depend on this local stack. The container's structured JSON stdout uses
Docker's `awslogs` driver and is sent to `/a-meet/prod/server` with 14-day retention. See
[Production logs, alerts, and secrets](#production-logs-alerts-and-secrets).

---

## Deployment (EC2, containerized)

Production runs the backend as an **immutable Docker image** built from `server/Dockerfile`,
supervised by Docker (not pm2). The container uses **host networking** so mediasoup's RTP
port range is reachable, and the server's SIGTERM graceful-drain handles clean restarts.

Releases are **image-based**: CI builds the server image, publishes an immutable tag to
**Amazon ECR**, and the EC2 node **pulls that tag** and restarts the container — it never
rebuilds mediasoup on the box. Docker's `restart: unless-stopped` is the supervisor. In
production the server logs **structured JSON to stdout only** and Docker's `awslogs` driver
forwards it to CloudWatch rather than a bind-mounted file. (The local `docker-compose.yml`
dev stack still uses the Loki/Promtail/Grafana file tail.)

```bash
# On the EC2 node (Docker + Docker Compose plugin + AWS CLI installed)
git clone ... && cd A-Meet   # the node keeps a checkout for config (compose file + env)

# Runtime secrets are loaded from SSM by the container entrypoint. No production
# server/.env is required or copied into the image.
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
pull**, SSM read, and CloudWatch Logs write permissions. `deploy/iam-instance-policy.json`
contains the application-specific SSM/log permissions; no static AWS keys are used.

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
3. Store `MONGO_URI` at `/a-meet/prod/server/MONGO_URI` in SSM as the Atlas SRV
   connection string, e.g.
   `mongodb+srv://<user>:<pass>@<cluster>.mongodb.net/ameet?retryWrites=true&w=majority`.

`MONGO_ROOT_USERNAME` / `MONGO_ROOT_PASSWORD` are local-Docker-Mongo credentials only and are
not used in production.

### Production logs, alerts, and secrets

Provision the production observability path once:

```bash
export AWS_REGION=ap-south-1
export ROUTE53_ALARM_REGION=us-east-1
export ENVIRONMENT=prod
export INSTANCE_ID=i-0abc123...
export READINESS_HOST=api.example.com
export LAMBDA_ROLE_ARN=arn:aws:iam::<account>:role/a-meet-telegram-lambda
deploy/aws-observability.sh
```

The script idempotently creates `/a-meet/prod/server` with 14-day retention, an SNS topic,
the Telegram Lambda, log metric filters, a Route53 health check against
`https://$READINESS_HOST/api/health/ready`, and alarms for process-down readiness,
instance health, fatal logs, sustained Mongo disconnects, and a five-minute error count.
Route53 health-check metrics are emitted in US East (N. Virginia), so the process-down
alarm path defaults to `ROUTE53_ALARM_REGION=us-east-1` with its own SNS topic and
Telegram Lambda there; that Lambda reads Telegram SSM parameters from the primary
`AWS_REGION`.
CloudWatch sends SNS only when alarm state changes, so an alarm produces one Telegram
notification on `OK → ALARM` and does not repeat until it returns to `OK` and alarms again.
The Lambda message contains the alarm name, environment, state, and reason.

Attach `deploy/iam-instance-policy.json` to the EC2 instance role. Attach
`deploy/iam-telegram-lambda-policy.json` to the Lambda role. Replace wildcard account/region
segments with narrower values if your IAM deployment requires them.

Store application configuration as SecureStrings. Only parameter names are committed:

```bash
aws ssm put-parameter --region "$AWS_REGION" --type SecureString --overwrite \
  --name /a-meet/prod/server/MONGO_URI --value '<Atlas URI>'
aws ssm put-parameter --region "$AWS_REGION" --type SecureString --overwrite \
  --name /a-meet/prod/server/JWT_SECRET --value '<secret>'
# Repeat for GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, CLIENT_URL, SERVER_URL,
# MEDIASOUP_ANNOUNCED_IP, DEEPGRAM_API_KEY, and GROQ_API_KEY as applicable.

aws ssm put-parameter --region "$AWS_REGION" --type SecureString --overwrite \
  --name /a-meet/prod/telegram/token --value '<bot token>'
aws ssm put-parameter --region "$AWS_REGION" --type SecureString --overwrite \
  --name /a-meet/prod/telegram/chat-id --value '<chat id>'
```

`SSM_PARAMETER_PREFIX` defaults to `/a-meet/prod/server`. The entrypoint decrypts that
one-level path before importing `config/env.ts`; an explicit Compose environment value wins
for emergency overrides. Local development still uses `server/.env` because the prefix is
unset outside `docker-compose.prod.yml`.

Query production logs with CloudWatch Logs Insights:

```text
fields @timestamp, level, msg, roomId, socketId, reqId
| filter ispresent(roomId) or ispresent(socketId) or ispresent(reqId)
| sort @timestamp desc
| limit 100
```

Staging smoke:

1. Run `deploy/aws-observability.sh`, deploy the container, and confirm `/api/health/ready` is healthy.
2. Emit one structured `logger.info({ roomId, socketId, reqId }, ...)` and one
   `logger.error({ roomId, socketId, reqId }, ...)` event through the staging application.
3. Confirm both appear in `/a-meet/staging/server` and the fields are queryable.
4. Set a test alarm to `ALARM` with `aws cloudwatch set-alarm-state`; confirm one Telegram
   message. Set `ALARM` again and confirm no second state-transition notification; set `OK`,
   then `ALARM`, and confirm a new notification.
5. Confirm local `docker-compose.yml` still runs Loki/Grafana/Promtail without AWS settings.

### TURN over TLS (5349)

coturn exposes UDP and TCP on `3478` plus TURN-over-TLS on `5349`. The TLS
certificate is for the public TURN hostname (for example, `turn.example.com`), which must
have an A record pointing to the node's Elastic IP before issuance. The certificate is
obtained with **HTTP-01**, not DNS-01: the existing Nginx configuration already owns port
80, so `deploy/nginx.conf` serves only `/.well-known/acme-challenge/` from
`/var/www/certbot` and redirects every other HTTP request to HTTPS. This avoids DNS
provider credentials while retaining the current API redirect.

Before provisioning, ensure the EC2 security group allows TCP `80` (ACME), UDP and TCP
`3478`, TCP `5349`, and UDP `49160-49200` (the configured relay range). Copy the coturn
template into the ignored host-local config and replace its placeholders, including the
public/private `external-ip` mapping and TURN secret:

```bash
cd ~/ameet
cp coturn/turnserver.conf.example coturn/turnserver.conf
# edit coturn/turnserver.conf: YOUR_DOMAIN, YOUR_PUBLIC_IP, TURN_SECRET_PLACEHOLDER

# Apply deploy/nginx.conf with API_DOMAIN replaced, then make its ACME webroot available.
sudo install -d -m 0755 /var/www/certbot
sudo nginx -t && sudo systemctl reload nginx

# Installs certbot if needed, obtains/reuses the certificate, copies the certificate and
# private key to coturn/certs/, starts coturn, and enables the standard certbot.timer.
sudo env TURN_DOMAIN=turn.example.com TURN_EMAIL=ops@example.com \
  A_MEET_DIR="$HOME/ameet" ./deploy/setup-coturn-tls.sh setup
```

`setup-coturn-tls.sh` is idempotent and safe after a recovery or rebuild: Certbot retains a
valid certificate, then the script copies it into the bind-mounted `coturn/certs/` directory
and recreates only the coturn container. It also installs a Certbot deploy hook at
`/etc/letsencrypt/renewal-hooks/deploy/a-meet-coturn`; the normal `certbot.timer` invokes
that hook only after a successful renewal, so coturn restarts with the new keypair. The
certificate files and the generated coturn config remain host-local and are gitignored.

Verify the listener certificate itself before testing media:

```bash
openssl s_client -connect turn.example.com:5349 -servername turn.example.com </dev/null
sudo systemctl status certbot.timer
docker compose -f docker-compose.coturn.yml logs --tail=100 coturn
```

#### Force-relay verification: UDP, TCP, and TLS

Build a test client with the real `VITE_TURN_DOMAIN`, `VITE_TURN_USERNAME`, and
`VITE_TURN_SECRET`, then set `VITE_FORCE_RELAY=1`. For each row below, rebuild/redeploy the
client with the listed `VITE_TURN_TRANSPORT`, join the same meeting from two independent
networks, and confirm two-way audio and video. `VITE_FORCE_RELAY=1` makes the call fail
instead of silently falling back to direct SFU media; `VITE_TURN_TRANSPORT` narrows the
candidate list to prove the named path. Omit `VITE_TURN_TRANSPORT` in normal production
builds so browsers receive all three fallback URIs.

| Path | Build-time environment | Expected URI |
|---|---|---|
| UDP | `VITE_FORCE_RELAY=1 VITE_TURN_TRANSPORT=udp` | `turn:turn.example.com:3478?transport=udp` |
| TCP | `VITE_FORCE_RELAY=1 VITE_TURN_TRANSPORT=tcp` | `turn:turn.example.com:3478?transport=tcp` |
| TLS | `VITE_FORCE_RELAY=1 VITE_TURN_TRANSPORT=tls` | `turns:turn.example.com:5349?transport=tcp` |

For each successful call, browser `chrome://webrtc-internals` should show the selected ICE
candidate pair using a `relay` candidate; coturn logs should show an allocation for that test.
Clear both verification variables and rebuild before returning the client to normal operation.

### Host identity & automatic recovery

The production node has a **stable identity** so it survives host failure without manual
re-wiring. One **Elastic IP (EIP)** is the single fixed address used everywhere downstream, and
a **CloudWatch auto-recovery alarm** rebuilds the instance onto healthy hardware while keeping
that address.

- **The EIP is the canonical address** for all three of:
  - the `api.<domain>` **DNS A record**,
  - **`MEDIASOUP_ANNOUNCED_IP`** in `/a-meet/prod/server/MEDIASOUP_ANNOUNCED_IP`
    (the IP browsers send media to), and
  - the **MongoDB Atlas Network Access** allowlist entry.

  Because the EIP is reassociated on recovery, none of these need to change after a recovery event.
- A CloudWatch alarm on **`StatusCheckFailed_System`** (2× 60s) triggers the EC2 **recover**
  action, which restarts the *same* instance (same EIP, same EBS root volume) on new hardware.
  This only covers EBS-backed instances.

Provision and verify both with the helper script (AWS CLI v2 + EC2/CloudWatch permissions):

```bash
export AWS_REGION=ap-south-1
export INSTANCE_ID=i-0abc123...
export EIP_ALLOCATION_ID=eipalloc-0abc123...

deploy/aws-recovery.sh setup     # associate EIP + create the recovery alarm (idempotent)
deploy/aws-recovery.sh verify    # print evidence: EIP association, alarm state + recover action, EBS root
```

`verify` prints the AWS-CLI evidence (EIP `InstanceId`/`AssociationId`, the alarm's `StateValue` +
`AlarmActions`, and `RootDeviceType`) **and enforces** the contract — it **exits non-zero** if the
EIP isn't associated to `INSTANCE_ID`, the alarm is missing or lacks the `ec2:recover` action, or
the instance isn't `ebs`-backed. That makes it safe to use as an automated post-recovery gate.

**Operator validation after a recovery event:**
1. `deploy/aws-recovery.sh verify` — EIP still associated to the instance; alarm back to `OK`; root device `ebs`.
2. **API health:** `curl -fsS https://api.<domain>/api/health` returns `{"ok":true}` (the deploy health check uses the same endpoint).
3. **Container up:** on the box, `docker compose -f docker-compose.prod.yml ps` shows the server running, and `logs -f` shows mediasoup workers started.
4. **Media connectivity:** join a meeting from two devices and confirm audio/video flows — i.e. `MEDIASOUP_ANNOUNCED_IP` still equals the EIP and the security-group UDP RTC range (10000–59999) is open.

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
