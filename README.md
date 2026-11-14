<p align="center">
  <img src="client/public/favicon.svg" alt="A-Meet logo" width="88" height="88" />
</p>

<h1 align="center">A-Meet</h1>

<p align="center">
  Video calls in the style of Google Meet, running on a server you control.<br />
  Sign in with Google, share a meeting link, and the media runs through a mediasoup SFU you host.
</p>

<p align="center">
  <a href="https://ameet.raja-dev.me/">Live demo</a>
  ·
  <a href="#running-it-locally">Run it locally</a>
  ·
  <a href="#configuration">Configuration</a>
  ·
  <a href="#deployment">Deployment</a>
</p>

A-Meet is a video call app. You sign in with Google, click "New meeting", and send the link. Everyone who opens the link signs in, waits in the lobby, and joins the room. The room has camera and microphone controls, screen share with optional tab audio, chat, emoji reactions, raise hand, a Picture-in-Picture mini player, and a shared transcript.

The API server is Express and Socket.io. It starts mediasoup worker subprocesses for the media, so audio and video pass through the machine you run it on. You need MongoDB, a Google OAuth client, and a JWT secret. Transcription also needs Deepgram and Groq API keys. Without a Deepgram key, the server logs a warning and transcription stays unavailable.

## What you get

- **Calls run through a mediasoup SFU.** Each browser uploads its camera at three resolutions, a quarter, half and full size, capped at 200, 500 and 1500 kbps. The SFU forwards to each viewer the layer that fits their connection, without decoding or re-encoding. Audio consumers get priority 255, so voice keeps its share of bandwidth when video layers drop.
- **A shared transcript from each speaker's own microphone.** The meeting admin starts the transcript, and each participant's browser sends its microphone as 16 kHz PCM. Deepgram Nova-3 streams English text while people talk. When a turn ends, Groq Whisper transcribes it again, and a second Groq model merges the two results when they differ. The panel shows finals only. Anyone in the room can download the transcript as a `.txt` file. The server keeps it in memory and drops it six hours after the last participant leaves. Nothing goes to MongoDB.
- **Google sign-in with an httpOnly cookie.** Passport's Google OAuth strategy creates or updates the user, and the server sets a JWT in the `ameet_token` cookie for 7 days. Page scripts cannot read the cookie. Socket connections check the same cookie during the handshake.
- **Scheduled meetings with calendar links.** You schedule a meeting with a title and a time. It appears in the upcoming list on the landing page, and the lobby shows the scheduled time. Each meeting also gets an "Add to Google Calendar" link.
- **Admin controls.** The meeting admin can mute one participant or everyone, remove a participant, spotlight a speaker, and end the meeting. Muting pauses the participant's producer on the server. Nobody is switched back on. A muted participant can only ask to unmute.
- **In-call audio and video tools.** Each participant has a volume slider, and the call has a master output volume. Mic gain runs through a GainNode, and a speaking ring follows an AnalyserNode. The chat panel has an unread badge, reactions float over the call, and the layout chooser switches between auto, tiled, spotlight and sidebar.
- **Picture-in-Picture and structured logs.** Auto Picture-in-Picture opens a mini player when the tab is hidden and closes it when you come back. The app draws all camera tiles onto a canvas and sends that canvas to a hidden video element, so it works only in Chromium-based browsers. The server writes Pino JSON logs with fields such as `roomId` and `socketId`. `/api/health` reports liveness, and `/api/health/ready` returns 503 when MongoDB is down or a mediasoup worker has died.

## Running it locally

You need Node.js 22.13 or newer, Docker with Compose, and a Google OAuth client. In the Google Cloud console, add `http://localhost:5000/api/auth/google/callback` as an authorized redirect URI.

### Clone and install

```sh
git clone https://github.com/Anuraj-dev/A-Meet.git
cd A-Meet
npm install
```

The root `package.json` declares the client, server, shared, bot and e2e packages as npm workspaces, so one install covers all of them.

### Create the environment files

```sh
cp .env.example .env                 # Docker Compose: local MongoDB credentials
cp server/.env.example server/.env   # API server
cp client/.env.example client/.env   # Vite client
```

Set these values in `server/.env`:

```env
MONGO_URI=mongodb://admin:change-me@localhost:27017/ameet?authSource=admin
JWT_SECRET=a-long-random-string
GOOGLE_CLIENT_ID=your-google-client-id
GOOGLE_CLIENT_SECRET=your-google-client-secret
```

The credentials in `MONGO_URI` must match `MONGO_ROOT_USERNAME` and `MONGO_ROOT_PASSWORD` in the root `.env`. Both default to `admin` and `change-me`. Change them before you use the stack for anything real.

In `client/.env`, set `VITE_SERVER_URL=http://localhost:5000`. Without it, the client has no signaling server to reach, and calls never connect.

To enable transcription, add `DEEPGRAM_API_KEY` and `GROQ_API_KEY` to `server/.env`.

### Start the stack

```sh
npm run docker:up
npm run dev
```

`docker:up` starts MongoDB on 27017, mongo-express on 8081, Loki on 3100, and Grafana on 3000. `dev` starts the API on port 5000 and the Vite client on port 5173.

Open http://localhost:5173, sign in with Google, and click "New meeting". To test with a second participant, open the same link in another browser window. The default announced IP, `127.0.0.1`, works when every tab runs on the same machine.

## Configuration

The server reads `server/.env`, and the client reads `client/.env`. The server exits at startup if `MONGO_URI` or `JWT_SECRET` is missing.

### Server

| Variable | Default | What it does |
| --- | --- | --- |
| `MONGO_URI` | none, required | MongoDB connection string. |
| `JWT_SECRET` | none, required | Signs the session JWT. |
| `JWT_EXPIRES_IN` | `7d` | JWT lifetime. |
| `GOOGLE_CLIENT_ID` | empty | Google OAuth client. Without it, login stays disabled. |
| `GOOGLE_CLIENT_SECRET` | empty | Google OAuth client secret. |
| `CLIENT_URL` | `http://localhost:5173` | Where the server sends the browser after login. Also the CORS origin. |
| `SERVER_URL` | `http://localhost:5000` | Base URL for the OAuth callback. |
| `PORT` | `5000` | HTTP and Socket.io port. |
| `MEDIASOUP_ANNOUNCED_IP` | `127.0.0.1` | Address advertised to browsers for media. See [How the SFU works](#how-the-sfu-works). |
| `MEDIASOUP_MIN_PORT` | `40000` | Start of the RTC port range. Open it in the firewall. |
| `MEDIASOUP_MAX_PORT` | `40100` | End of the RTC port range. |
| `MEDIASOUP_NUM_WORKERS` | CPU core count | Number of mediasoup worker subprocesses. |
| `DEEPGRAM_API_KEY` | empty | Enables live transcription. |
| `GROQ_API_KEY` | empty | Enables the Groq re-transcription and merge step. |
| `DEEPGRAM_TRANSCRIPTION_MODEL` | `nova-3` | Deepgram model. |
| `GROQ_TRANSCRIPTION_MODEL` | `whisper-large-v3` | Groq Whisper model. |
| `GROQ_TRANSCRIPT_MERGE_MODEL` | `qwen/qwen3.6-27b` | Groq model that merges the two transcripts. |
| `DISCORD_BOT_API_KEY` | empty | Shared key the Discord bot sends. Empty disables the integration. |
| `DISCORD_LINK_TOKEN_TTL` | `10m` | Lifetime of the Discord account link token. |
| `LOG_LEVEL` | `debug` in development, `info` in production | Pino log level. |

Rate limits have generous defaults in `server/src/config/env.ts`. The `RATE_LIMIT_*` variables in `server/.env.example` override them.

### Client

| Variable | Default | What it does |
| --- | --- | --- |
| `VITE_SERVER_URL` | none, required | Origin of the API and Socket.io server. |
| `VITE_TURN_DOMAIN` | empty | TURN hostname. Adds relay servers to the ICE configuration. |
| `VITE_TURN_USERNAME` | `ameet` | TURN username. |
| `VITE_TURN_SECRET` | empty | TURN credential. |
| `VITE_TURN_TRANSPORT` | empty | Set to `udp`, `tcp` or `tls` to advertise only that relay path. Leave empty to advertise all three. |
| `VITE_FORCE_RELAY` | empty | Set to `1` to send all media through TURN. Has no effect unless TURN is configured. |

## How the SFU works

Each room gets its own mediasoup router. The server spreads routers across the worker pool in round-robin order. Every browser opens one send transport and one receive transport. It produces its camera, microphone and screen tracks on the send transport, and it consumes everyone else's tracks on the receive transport. The router forwards RTP packets without mixing or re-encoding them.

Camera video uses simulcast with three spatial layers. Audio consumers get priority 255, so the SFU reserves voice bitrate before it drops video layers.

The announced IP is the setting most likely to break a cloud deployment. mediasoup binds `0.0.0.0`, but it advertises `MEDIASOUP_ANNOUNCED_IP` to browsers, and browsers send media to that address. On EC2, the network interface only holds the private address. A loopback or private announced IP leaves remote peers unable to connect media. At startup, the server replaces such a value with the instance's public IPv4, read from IMDSv2. If that lookup fails, it logs an error in production. Set `MEDIASOUP_ANNOUNCED_IP` explicitly to avoid the lookup.

## Repository layout

```
client/   React, Vite and Material UI frontend
server/   Express, Socket.io and mediasoup API server
shared/   @a-meet/contracts, the socket event and REST types shared by client and server
bot/      Discord bot, a thin discord.js client for the API
e2e/      Playwright end-to-end tests
deploy/   EC2, TURN and observability scripts
```

## Tests and checks

```sh
npm test                    # server, client and bot unit tests (Vitest)
npm run typecheck           # shared, server, client and bot
npm run lint                # ESLint across all four packages
npm run test:e2e:install    # once: install the Playwright Chromium build
npm run test:e2e            # Playwright end-to-end tests
npm run verify              # lint, audit, typecheck, coverage, client build and E2E in one run
```

Vitest transpiles without type checking, so run `npm run typecheck` as well. A green test run does not prove the types are correct.

## Deployment

Production runs the API as a Docker image on one EC2 instance. MongoDB Atlas stores the data, and SSM Parameter Store holds the secrets. The client is a Vite build deployed to Vercel. `client/vercel.json` rewrites every path to the root page, so client-side routes load.

### Deploy the server image

`.github/workflows/deploy-backend.yml` runs on pushes to `main` that touch `server/**`, `shared/**`, the root package files, `.dockerignore`, `docker-compose.prod.yml`, or the workflow itself. It builds the `runtime` target of `server/Dockerfile` and pushes two tags to ECR, `latest` and an immutable `<git-sha>`. Then it connects to the instance over SSH, pulls the SHA tag, and restarts the container. The deploy fails if the readiness check at `/api/health/ready` fails. The jobs skip until the `ECR_REPOSITORY` variable is set.

| Name | Kind | Purpose |
| --- | --- | --- |
| `AWS_REGION` | variable | ECR and deploy region. |
| `ECR_REPOSITORY` | variable | ECR repository name. The repository must already exist. |
| `HEALTH_URL` | variable | Optional. Defaults to the production readiness URL. |
| `AWS_DEPLOY_ROLE_ARN` | secret | IAM role for GitHub OIDC, with ECR push access. |
| `EC2_HOST` | secret | Public host or IP of the instance. |
| `EC2_SSH_KEY` | secret | SSH key for the `ubuntu` user. |

To deploy by hand on the instance:

```sh
export SERVER_IMAGE=<account>.dkr.ecr.<region>.amazonaws.com/a-meet-server:<git-sha>
aws ecr get-login-password --region <region> | docker login --username AWS --password-stdin <account>.dkr.ecr.<region>.amazonaws.com
docker compose -f docker-compose.prod.yml pull
docker compose -f docker-compose.prod.yml up -d
```

The container runs with host networking. Open TCP 5000 for the API, which `deploy/nginx.conf` proxies behind HTTPS. Open UDP and TCP 40000 to 40100 for mediasoup media.

### Secrets and database

The container entrypoint, `server/src/ssm-entrypoint.ts`, reads every parameter under `SSM_PARAMETER_PREFIX`, which production sets to `/a-meet/prod/server`. It decrypts them into the environment before the server starts. A value already set in the environment wins.

Store each value as a SecureString:

```sh
aws ssm put-parameter --region "$AWS_REGION" --type SecureString --overwrite \
  --name /a-meet/prod/server/MONGO_URI --value '<Atlas SRV URI>'
```

Repeat for `JWT_SECRET`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `CLIENT_URL`, `SERVER_URL`, and `MEDIASOUP_ANNOUNCED_IP`. Add `DEEPGRAM_API_KEY` and `GROQ_API_KEY` if you use transcription.

Use a MongoDB Atlas SRV string for `MONGO_URI`, and add the instance's public IPv4 to the Atlas Network Access list. Production runs no MongoDB container. `MONGO_ROOT_USERNAME` and `MONGO_ROOT_PASSWORD` apply only to the local Docker stack.

### Elastic IP and automatic recovery

Use one Elastic IP for the API DNS record, `MEDIASOUP_ANNOUNCED_IP`, and the Atlas allowlist entry. Then none of them change when EC2 recovers the instance.

```sh
export AWS_REGION=ap-south-1
export INSTANCE_ID=i-0abc123...
export EIP_ALLOCATION_ID=eipalloc-0abc123...

deploy/aws-recovery.sh setup     # attach the EIP and create the recovery alarm
deploy/aws-recovery.sh verify    # exits non-zero if the EIP, alarm or root device is wrong
```

The alarm watches `StatusCheckFailed_System` and triggers EC2 recovery. Recovery covers EBS-backed instances only. After a recovery event, run `verify`, then check `https://api.<domain>/api/health/ready`.

### Logs and alarms

`deploy/aws-observability.sh` creates the `/a-meet/prod/server` log group with 14-day retention, log metric filters, a Route53 health check on `/api/health/ready`, CloudWatch alarms, and an SNS topic. A Lambda forwards each alarm to Telegram. Route53 health metrics only exist in us-east-1, so the script takes `ROUTE53_ALARM_REGION` as a separate setting. Store the Telegram token and chat ID as SecureStrings under `/a-meet/prod/telegram/`.

```sh
export AWS_REGION=ap-south-1
export ROUTE53_ALARM_REGION=us-east-1
export ENVIRONMENT=prod
export INSTANCE_ID=i-0abc123...
export READINESS_HOST=api.example.com
export LAMBDA_ROLE_ARN=arn:aws:iam::<account>:role/a-meet-telegram-lambda
deploy/aws-observability.sh
```

Query production logs in CloudWatch Logs Insights:

```text
fields @timestamp, level, msg, roomId, socketId, reqId
| filter ispresent(roomId) or ispresent(socketId) or ispresent(reqId)
| sort @timestamp desc
| limit 100
```

### TURN over TLS

Some networks block direct media. A TURN relay gives those clients a path through TCP or TLS. `deploy/setup-coturn-tls.sh` obtains a certificate for the TURN hostname with HTTP-01 through the existing Nginx setup, copies it into `coturn/certs/`, and starts coturn. Copy `coturn/turnserver.conf.example` to `coturn/turnserver.conf` and fill in the placeholders first. The TURN secret must match `TURN_SECRET` in `server/.env`.

```sh
sudo env TURN_DOMAIN=turn.example.com TURN_EMAIL=ops@example.com \
  A_MEET_DIR="$HOME/ameet" ./deploy/setup-coturn-tls.sh setup
```

Open TCP 80, UDP and TCP 3478, TCP 5349, and UDP 49160 to 49200. The TLS relay uses TCP 5349, not 443.

To test one relay path, build the client with `VITE_TURN_DOMAIN`, `VITE_TURN_USERNAME`, `VITE_TURN_SECRET`, `VITE_FORCE_RELAY=1`, and `VITE_TURN_TRANSPORT` set to `udp`, `tcp` or `tls`. Join the same meeting from two separate networks. In `chrome://webrtc-internals`, the selected candidate pair should use a `relay` candidate. Clear the variables and rebuild before you return to normal operation.

## Discord bot

`bot/` is a discord.js process that calls the API with a shared key. It holds no meeting logic. It registers two slash commands. `/meet link` ties a Discord account to an A-Meet account through a confirmation link that expires after `DISCORD_LINK_TOKEN_TTL`. `/meet create` makes an instant meeting and posts the join link in the channel.

```sh
cp bot/.env.example bot/.env          # fill in the Discord and A-Meet values
npm --prefix bot run register         # publish the /meet commands
npm --prefix bot start                # run the bot
```

Set `DISCORD_BOT_API_KEY` to the same value in `server/.env`. Invite the bot with the `bot` and `applications.commands` scopes.

## Documentation

- [Conventions](docs/conventions.md): stack, ports, and run and test commands.
- [Decisions](docs/decisions.md): why the project chose the SFU, the auth model and other core designs.
- [Current status](docs/STATE.md): what is done, what is in progress, and known gotchas.
- [Chat and transcription spec](docs/specs/2026-07-30-chat-and-transcription-rework.md)
- [Discord bot design](docs/specs/2026-07-23-discord-bot-design.md)
- [Bot setup](bot/README.md)
- [Docs index](docs/INDEX.md)

## Contributing

Read [CONTRIBUTING.md](CONTRIBUTING.md) before you open a PR. The project uses strict TDD. Each change starts with a failing test, and each bug fix starts with a test that reproduces the bug. Tests check what a user or another participant observes, not internal state.

## License

MIT. See [LICENSE](LICENSE).
