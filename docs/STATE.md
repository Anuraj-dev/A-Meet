# A-Meet — State

> Google Meet clone (MERN + TypeScript strict + Material UI + Socket.io + mediasoup SFU), built in
> staged milestones as a learning/portfolio project. · Last checkpoint: 2026-07-15

## 🚧 In progress / next

- **Raja: one-click close epics #31/#33/#35/#37/#38** — every acceptance criterion is merged
  (see Status). Agent closing was permission-blocked; nothing else is pending on them.
- **Merge-conflict warning (still open):** this branch (`feat/alarm-ok-actions`, docs/ context
  system) has its own `docs/conventions.md`; main got one via #161 AND #170 appends an
  accessibility section. Reconcile when merging this docs branch.
- Remaining manual (Raja): browser-level three-path TURN force-relay verification (README);
  M9.7 / M10.12 / M12.11 manual verifies; `/journal M12` after verify.

## Status

- **2026-07-15 backlog cleanout — ALL PRs merged, zero open PRs:**
  - #156 (SFU socket validation), #172 (useAudioLevel tests, last #35 criterion), #86 (server
    minor/patch group), #173 (PRD leftovers: `restart: always`, pm2 retired, ESLint base).
  - **#174** — E2E CI sharding: 3-shard matrix on the SFU-off Playwright job (`--shard=i/3`),
    blob reports merged into one HTML artifact by a new `e2e-merge-reports` job; serial SFU job
    intentionally unsharded. Closed the last #37 criterion.
  - **#175** — deps majors: @deepgram/sdk 4→5 (new `DeepgramClient` + `listen.v1.connect`,
    `message`-event dispatch, `sendMedia`/`sendFinalize`/`sendCloseStream`), groq-sdk 0.37→1.x,
    jsdom 25→29, root lockfile sync. Review caught a real start/stop race leaking a Deepgram
    socket — fixed test-first. Superseded dependabot #87/#88/#91 (closed).
  - **#176** — unified Vitest 3→4 migration (superseded #89/#92/#93, closed). Branch coverage
    thresholds lowered (server 72→62, client 64→37): vitest-4's v8 provider AST-analyzes
    UNTESTED files and counts all their real branches (3.x counted 1 placeholder) — denominator
    change, covered branches actually rose; per-file evidence in vitest.config.js comments + PR.
  - **#178** — client minor/patch group (15 updates) merged after pushing a root-lockfile sync
    commit onto the dependabot branch. #143/#177/#179 were interim versions, closed.
- **Reviews:** codex GPT-5.6 Sol reviewed #174/#175/#176 to READY TO MERGE (2 real finding
  rounds). Deepgram/groq migration should get a staging sanity check (no real creds in tests).
- **M0–M9, M11 done; M10/M12 code-complete pending manual verify.** History: `docs/old_plan.md`.
- **Platform/infra:** strict TS, CI/CD gates (incl. axe-core a11y + npm audit), prod deploy +
  observability (self-healing EC2, SSM, CloudWatch→SNS→Telegram), TURN over TLS.

## Architecture map

- `client/src/` — React+Vite+MUI strict TS. Room UI `components/room/`; SFU hooks `hooks/`;
  ICE `services/ice-config.ts`.
- `server/src/` — Express + Socket.io + mediasoup. SFU handlers `socket/sfu-handlers.ts`;
  validation `validation/sfu.schema.ts`; transcription (Deepgram v5/Groq v1) `transcription/`.
- `shared/src/` — `@a-meet/contracts`.
- `e2e/` — Playwright: `tests/` (SFU-off, axe gate, sharded 3× in CI) + `tests-sfu/` (serial).
- `deploy/` — prod scripts; TURN TLS `setup-coturn-tls.sh` + renew hook.
- `docs/agents/coder-loop.md` — coder/reviewer loop convention.

## Stack & run

- MERN · strict TS (3 workspaces) · MUI only · Socket.io · mediasoup SFU · Vitest 4.
- Ports: server 5000 · client 5173 · Mongo 27017 · mongo-express 8081.
- Dev `npm run dev` · unit `npm test` · types `npm run typecheck` · E2E in CI only.

## Key decisions (top 5)

- **Vitest-4 coverage floors are measurement-driven** (server branches 62, client 37, set tight
  against measured values) — do NOT "restore" the old numbers; the meter changed, not the tests.
- **Dependabot group PRs get a root-lockfile sync commit pushed onto their branch** (single-
  package majors get superseded by a manual migration branch instead).
- **SFU consumer cap is an absolute DoS backstop**, not an enforced room limit.
- **Host mute is consent-based** — server-side producer pause, no force-unmute.
- **TURN TLS = certbot HTTP-01 via existing nginx**; recovery is operator-rerun. Full log
  `docs/decisions.md`.

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
