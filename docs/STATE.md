# A-Meet — State

> Google Meet clone (MERN + TypeScript strict + Material UI + Socket.io + mediasoup SFU), built in
> staged milestones as a learning/portfolio project. · Last checkpoint: 2026-07-23

## 🚧 In progress / next

- **Discord bot feature — ready to build.** Spec approved & written:
  `docs/specs/2026-07-23-discord-bot-design.md`. Two tickets on GitHub:
  **#185** (server: `/api/integrations/discord/*` endpoints, `DiscordLink` model, bot API key,
  client link page) then **#186** (new `bot/` workspace, discord.js, `/meet link` + `/meet create`;
  depends on #185). Next step: implement #185, strict TDD, usual coder/reviewer loop.
- Raja: one-click close epics #31/#33/#35/#37/#38 — every acceptance criterion is merged;
  agent closing was permission-blocked.
- Remaining manual (Raja): browser-level three-path TURN force-relay verification (README);
  M9.7 / M10.12 / M12.11 manual verifies; `/journal M12` after verify.

## Status

- **2026-07-23:** zero open issues before today; #185/#186 opened for the Discord bot.
  Backlog fully merged as of 2026-07-15 (see below). #180 (Telegram OK-recovery notifications
  + docs/ context system) merged to main.
- **2026-07-15 backlog cleanout — ALL PRs merged:** #156, #172, #86, #173,
  **#174** (E2E 3-shard matrix on SFU-off job, blob→HTML merge job),
  **#175** (deps majors: @deepgram/sdk 5 — new `DeepgramClient` + `listen.v1.connect` +
  `sendMedia`/`sendFinalize`/`sendCloseStream`; groq-sdk 1.x; jsdom 29; a real Deepgram
  start/stop socket-leak race found in review, fixed test-first),
  **#176** (Vitest 4 migration; coverage floors re-baselined — see decisions),
  **#178** (client minor/patch group ×15 with root-lockfile sync commit).
- **M0–M9, M11 done; M10/M12 code-complete pending manual verify.** History: `docs/old_plan.md`.
- **Platform/infra:** strict TS, CI/CD gates (incl. axe-core a11y + npm audit), prod deploy +
  observability (self-healing EC2, SSM, CloudWatch→SNS→Telegram, OK-recovery pings), TURN over TLS.

## Architecture map

- `client/src/` — React+Vite+MUI strict TS. Room UI `components/room/`; SFU hooks `hooks/`;
  ICE `services/ice-config.ts`.
- `server/src/` — Express + Socket.io + mediasoup. SFU handlers `socket/sfu-handlers.ts`;
  validation `validation/sfu.schema.ts`; transcription (Deepgram v5/Groq v1) `transcription/`;
  room creation + host/admin `controllers/room.controller.ts`; auth `middleware/auth.ts`.
- `shared/src/` — `@a-meet/contracts`.
- `e2e/` — Playwright: `tests/` (SFU-off, axe gate, sharded 3× in CI) + `tests-sfu/` (serial).
- `deploy/` — prod scripts; TURN TLS `setup-coturn-tls.sh` + renew hook.
- `docs/specs/` — approved feature specs (first: Discord bot).
- `docs/agents/coder-loop.md` — coder/reviewer loop convention.

## Stack & run

- MERN · strict TS (3 workspaces; `bot/` will be the 4th) · MUI only · Socket.io ·
  mediasoup SFU · Vitest 4.
- Ports: server 5000 · client 5173 · Mongo 27017 · mongo-express 8081.
- Dev `npm run dev` · unit `npm test` · types `npm run typecheck` · E2E in CI only.

## Key decisions (top 5)

- **Discord bot v1 (2026-07-23):** account linking (not one-time host tokens), slash commands
  only, create+link scope only, separate `bot/` workspace calling the server over HTTP with a
  bot API key. Full rationale in the spec + decisions.md.
- **Vitest-4 coverage floors are measurement-driven** (server branches 62, client 37) — do NOT
  "restore" the old numbers; the meter changed, not the tests.
- **Dependabot group PRs get a root-lockfile sync commit pushed onto their branch** (single-
  package majors get superseded by a manual migration branch instead).
- **SFU consumer cap is an absolute DoS backstop**, not an enforced room limit.
- **Host mute is consent-based** — server-side producer pause, no force-unmute.

## Gotchas (don't re-break these)

- **npm hoisting after lockfile merges:** merging main into a deps branch then `npm install`
  keeps the OLD tree shape (vitest nested under workspaces → jest-dom "Invalid Chai property").
  Fix = delete ROOT package-lock.json + all node_modules, one clean root `npm install`.
- **Per-workspace `package-lock.json` files are CI cache keys** — don't delete; CI installs
  from the ROOT lockfile.
- **mongodb-memory-server first run in a fresh worktree** hook-times-out (~10s limit) while
  downloading the mongo binary — rerun with `--hookTimeout=180000` once; not a real failure.
- **Codex sandbox can't write `.git` in worktrees** — driver does all git ops after a dispatch.
- **Audio routing:** nothing connects to `audioCtx.destination` (AnalyserNode-only metering).
- **Mic gain:** GainNode built eagerly in `setupSfu`; `setMicGain` touches `gain.value` only.
- **Instant-join marker:** `RoomGuard` checks navigation state, not identity — don't "fix" it.
- **`iam-telegram-lambda-policy.json` incomplete vs live role** — never blind-apply.
- **Playwright "Stop presenting" matches 3 elements** — scope via `shareControl` helper.
- Secrets: git-ignored `.env` locally; SSM SecureStrings in prod. Never commit values.
