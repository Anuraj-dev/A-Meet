# A-Meet — State

> Google Meet clone (MERN + TypeScript strict + Material UI + Socket.io + mediasoup SFU), built in
> staged milestones as a learning/portfolio project. · Last checkpoint: 2026-07-30

## 🚧 In progress / next

- **Chat + transcription rework: COMPLETE.** All six tickets #192–#197 merged and closed
  (PRs #205, #198, #199, #200, #207, #208); prod backend deployed and healthy on the chat-
  contract build, client ships via Vercel. Benchmark artifact with per-model routing verdicts:
  `docs/model-benchmark-2026-07-30.md` (668c867). Nothing in flight.
- Pending decision (Raja): resize ameet EBS 8→16/20GB — box ~88% after bot image; AWS credits
  plan ($58.41 left, expires 2026-11-30) means resize just draws credits (~$0.70/mo equiv).
  Note: deploy-time image pruning (PR #206) relieved the immediate pressure but the box is small.
- Raja: one-click close epics #31/#33/#35/#37/#38 — all acceptance criteria merged; agent
  closing was permission-blocked.
- Remaining manual (Raja): browser-level three-path TURN force-relay verification (README);
  M9.7 / M10.12 / M12.11 manual verifies; `/journal M12` after verify.

## Status

- **2026-07-30 (evening): chat/transcription rework SHIPPED as the model-benchmark run.**
  #192 acked chat wire contract (16k reject, server-minted identity, size-weighted rate
  limit, 8s ack timeout composer) · #193 copy button · #194 background-only transcription
  (LiveCaptions deleted, `transcript-interim` removed end-to-end) · #195 icon/wording ·
  #196 pre-wrap + collapse with Show more · #197 tokenizer-based clickable links (http/https
  allowlist, token-level scheme guard). Two escalations to Opus 5 per the 3-try ladder
  (#192 test-design tail, #197 linkifier design); 15 Sol review rounds; every merge on
  READY TO MERGE + green CI. Driver infra en route: PR #203 react-router v8 migration
  (audit remediation — no clean 7.x existed), PR #206 deploy ENOSPC prune fix.
- **2026-07-23:** Discord bot v1 LIVE IN PROD, verified in Raja's guild (`/meet link` +
  `/meet create`, bot `ameet#2608`). Bot container on EC2 via `--profile bot`; secrets in
  SSM `/a-meet/prod/bot/*`. Shipped via #185/PR#187 and #186/PR#188.
- **M0–M9, M11 done; M10/M12 code-complete pending manual verify.** History: `docs/old_plan.md`.
- **Platform/infra:** strict TS, CI/CD gates (axe-core a11y + npm audit), prod deploy +
  observability (self-healing EC2, SSM, CloudWatch→SNS→Telegram), TURN over TLS.

## Architecture map

- `client/src/` — React+Vite+MUI strict TS. Chat (bubbles, copy, collapse, linkify)
  `components/ChatPanel.tsx`; composer/send state `pages/RoomPage.tsx`; transcript panel
  (finals-only) `components/TranscriptPanel.tsx`; room UI `components/room/`; SFU hooks `hooks/`.
- `server/src/` — Express + Socket.io + mediasoup. Chat + transcript socket handlers
  `socket/handlers.ts`; rate limiting `socket/rate-limit.ts`; transcript store
  `socket/transcript-manager.ts`; SFU `socket/sfu-handlers.ts`; transcription `transcription/`.
- `shared/src/` — `@a-meet/contracts` (chat ack union + transcript events in `events.ts`).
- `bot/src/` — discord.js bot workspace.
- `e2e/` — Playwright: `tests/` (SFU-off, sharded 3×; chat e2e in `chat-reactions.spec.js`)
  + `tests-sfu/` (serial).
- `deploy/` — prod scripts; TURN TLS setup + renew hook.
- `docs/specs/` — approved feature specs · `docs/agents/coder-loop.md` — review-loop convention
  · `docs/model-benchmark-2026-07-30.md` — model routing verdicts from the rework run.

## Stack & run

- MERN · strict TS (4 workspaces: server/client/shared/bot) · MUI only · Socket.io ·
  mediasoup SFU · Vitest 4 · client router: react-router v8 (`react-router` package, NOT
  react-router-dom — retired in v8).
- Ports: server 5000 · client 5173 · Mongo 27017 · mongo-express 8081.
- Dev `npm run dev` · unit `npm test` · types `npm run typecheck` · E2E in CI only.

## Key decisions (top 5)

- **Chat rework (2026-07-30): never truncate.** 16k-char cap enforced by REJECTION with a
  structured send-ack (draft kept, error shown), server-minted id/kind/sentAt, room derived
  from socket membership, size-weighted rate-limit tokens (whole serialized payload, cost
  clamped to bucket capacity — intentional), 64 KiB backstop + 128 KiB maxHttpBufferSize.
- **Linkification (#197): the whitespace-token is the unit of trust.** A token is swept for
  foreign schemes across all segments (segment boundaries = candidate terminators, by
  construction) before any candidate in it links; http/https + dotted hostname only.
- **Transcription is background-only (2026-07-30):** overlay deleted AND `transcript-interim`
  removed end-to-end; panel shows finals only.
- **Vitest-4 coverage floors are measurement-driven** (server branches 62, client 37) — do
  NOT "restore" old numbers; the meter changed, not the tests.
- **Host mute is consent-based** — server-side producer pause, no force-unmute.

## Gotchas (don't re-break these)

- **A PR with merge conflicts (CONFLICTING/DIRTY) triggers NO GitHub Actions at all** —
  `pull_request` workflows build the merge commit, which doesn't exist. Checks silently show
  only Vercel. Fix: merge main into the branch; close/reopen does nothing.
- **Deploy prune is `-af` BEFORE pull** (PR #206): releases are immutable tagged `:sha` images;
  dangling-only prune never removes them (caused the 2026-07-30 ENOSPC deploy failure). The
  running container pins the rollback target through the prune.
- **npm hoisting after lockfile merges:** merging main into a deps branch then `npm install`
  keeps the OLD tree shape. Fix = delete ROOT package-lock.json + all node_modules, one clean
  root `npm install`.
- **Per-workspace `package-lock.json` files are CI cache keys** — don't delete; CI installs
  from the ROOT lockfile.
- **mongodb-memory-server first run in a fresh worktree** hook-times-out downloading the
  binary — rerun with `--hookTimeout=180000` once; not a real failure.
- **Codex sandbox can't write `.git` in worktrees** — driver does all git ops after a dispatch.
  Also: build codex prompt files and dispatch in SEPARATE Bash calls (combined heredoc+exec
  leaves codex reading stdin, 10-min hang ×2 this run).
- **Grok one-shot (`-p`) has no reasoning-effort dial**; `-c` resume + `--prompt-file` silently
  no-oped once — prefer fresh one-shot dispatches with self-contained prompts.
- **Vitest (oxc transform) is transpile-only — it does NOT typecheck.** A green test run can
  hide TS errors; always run `npm run typecheck` too.
- **Toast chat preview 2-line clamp (CallNotifications) is INTENTIONAL** — don't "fix" it.
- **Audio routing:** nothing connects to `audioCtx.destination` (AnalyserNode-only metering).
- **Instant-join marker:** `RoomGuard` checks navigation state, not identity — don't "fix" it.
- **Discord integration routes intentionally skip the room rate-limiter** (bot-key gate is the
  protection). Empty `DISCORD_BOT_API_KEY` disables the integration (all 401).
- **`iam-telegram-lambda-policy.json` incomplete vs live role** — never blind-apply.
- **Playwright "Stop presenting" matches 3 elements** — scope via `shareControl` helper.
- Secrets: git-ignored `.env` locally; SSM SecureStrings in prod. Never commit values.
