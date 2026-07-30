# A-Meet — State

> Google Meet clone (MERN + TypeScript strict + Material UI + Socket.io + mediasoup SFU), built in
> staged milestones as a learning/portfolio project. · Last checkpoint: 2026-07-30

## 🚧 In progress / next

- **Chat + transcription rework READY TO EXECUTE as a model-benchmark experiment.** Spec
  `docs/specs/2026-07-30-chat-and-transcription-rework.md` (a51e9b7) + 6 ready-for-agent
  tickets published: frontier #192 (wire contract, Terra high), #193 (copy button, Grok 4.5),
  #194 (background-only transcription, Terra high), #195 (icon/wording, Luna probe);
  #196 (pre-wrap+collapse) blocked by #192; #197 (links) blocked by #196. Raja holds the
  driver prompt (Fable 5 high orchestrator): workhorses Terra/Grok4.5/Luna, Sol reviews
  (low; #192 high), merge on READY TO MERGE + green CI, 3 tries → Opus 5 escalation,
  benchmark logged to `docs/model-benchmark-2026-07-30.md` with per-model routing verdicts.
- Pending decision (Raja): resize ameet EBS 8→16/20GB — box ~88% after bot image; AWS credits
  plan ($58.41 left, expires 2026-11-30) means resize just draws credits (~$0.70/mo equiv).
- Raja: one-click close epics #31/#33/#35/#37/#38 — all acceptance criteria merged; agent
  closing was permission-blocked.
- Remaining manual (Raja): browser-level three-path TURN force-relay verification (README);
  M9.7 / M10.12 / M12.11 manual verifies; `/journal M12` after verify.

## Status

- **2026-07-30:** chat/transcription rework designed end-to-end (research agents + Sol consult
  + grill). Root cause of "long messages cut": server silently does `slice(0, 1000)` on every
  chat message (handlers.ts), compounded by no `pre-wrap` (newlines collapse). Decisions locked
  in spec; 6 tickets #192–#197 published with blockers wired. Wayfinder map skipped by Raja's
  call (no fog left after grill).
- **2026-07-23:** Discord bot v1 LIVE IN PROD, verified in Raja's guild (`/meet link` +
  `/meet create`, bot `ameet#2608`). PR #189 fixed ephemeral-embed bug (channel.send +
  guild-only). Bot container on EC2 via `--profile bot`; secrets in SSM `/a-meet/prod/bot/*`.
  Shipped via #185/PR#187 (server integration endpoints + linking, key-leak caught in review)
  and #186/PR#188 (bot workspace). Prod deploy needed disk prune (8GB box was 92%).
- **2026-07-15 backlog cleanout — ALL merged:** #156, #172, #86, #173, #174 (E2E 3-shard),
  #175 (deps majors incl. Deepgram SDK 5), #176 (Vitest 4 + re-baselined coverage floors),
  #178 (client minors ×15).
- **M0–M9, M11 done; M10/M12 code-complete pending manual verify.** History: `docs/old_plan.md`.
- **Platform/infra:** strict TS, CI/CD gates (axe-core a11y + npm audit), prod deploy +
  observability (self-healing EC2, SSM, CloudWatch→SNS→Telegram), TURN over TLS.

## Architecture map

- `client/src/` — React+Vite+MUI strict TS. Chat `components/ChatPanel.tsx`; captions overlay
  `components/LiveCaptions.tsx` (slated for deletion, #194); transcript panel
  `components/TranscriptPanel.tsx`; room UI `components/room/`; SFU hooks `hooks/`.
- `server/src/` — Express + Socket.io + mediasoup. Chat + transcript socket handlers
  `socket/handlers.ts`; transcript store `socket/transcript-manager.ts`; SFU
  `socket/sfu-handlers.ts`; transcription (Deepgram v5/Groq) `transcription/`.
- `shared/src/` — `@a-meet/contracts` (chat + transcript events in `events.ts`).
- `bot/src/` — discord.js bot workspace.
- `e2e/` — Playwright: `tests/` (SFU-off, sharded 3×) + `tests-sfu/` (serial).
- `deploy/` — prod scripts; TURN TLS setup + renew hook.
- `docs/specs/` — approved feature specs · `docs/agents/coder-loop.md` — review-loop convention.

## Stack & run

- MERN · strict TS (4 workspaces: server/client/shared/bot) · MUI only · Socket.io ·
  mediasoup SFU · Vitest 4.
- Ports: server 5000 · client 5173 · Mongo 27017 · mongo-express 8081.
- Dev `npm run dev` · unit `npm test` · types `npm run typecheck` · E2E in CI only.

## Key decisions (top 5)

- **Chat rework (2026-07-30): never truncate.** 16k-char cap enforced by REJECTION with a
  structured send-ack (draft kept, error shown), server-minted id/kind/sentAt, room derived
  from socket membership, size-weighted rate-limit tokens. Collapse+Show more instead of
  message.txt conversion. Web-URL-only linkification, no previews. Attachments out of scope.
- **Transcription is background-only (2026-07-30):** overlay deleted AND `transcript-interim`
  broadcast removed end-to-end; panel shows finals only. Deepgram cost unchanged; the win is
  socket fan-out + render churn.
- **Discord bot v1:** account linking, slash-only, separate `bot/` workspace over HTTP with
  bot API key; prod compose profile-gated (`--profile bot`).
- **Vitest-4 coverage floors are measurement-driven** (server branches 62, client 37) — do
  NOT "restore" old numbers; the meter changed, not the tests.
- **Host mute is consent-based** — server-side producer pause, no force-unmute.

## Gotchas (don't re-break these)

- **npm hoisting after lockfile merges:** merging main into a deps branch then `npm install`
  keeps the OLD tree shape. Fix = delete ROOT package-lock.json + all node_modules, one clean
  root `npm install`.
- **Per-workspace `package-lock.json` files are CI cache keys** — don't delete; CI installs
  from the ROOT lockfile.
- **mongodb-memory-server first run in a fresh worktree** hook-times-out downloading the
  binary — rerun with `--hookTimeout=180000` once; not a real failure.
- **Codex sandbox can't write `.git` in worktrees** — driver does all git ops after a dispatch.
- **Grok one-shot (`-p`) has no reasoning-effort dial** — "Grok high" isn't a real knob.
- **Toast chat preview 2-line clamp (CallNotifications) is INTENTIONAL** — don't "fix" it
  while doing #196; only the panel bubbles change.
- **Audio routing:** nothing connects to `audioCtx.destination` (AnalyserNode-only metering).
- **Instant-join marker:** `RoomGuard` checks navigation state, not identity — don't "fix" it.
- **Discord integration routes intentionally skip the room rate-limiter** (bot-key gate is the
  protection). Empty `DISCORD_BOT_API_KEY` disables the integration (all 401).
- **`iam-telegram-lambda-policy.json` incomplete vs live role** — never blind-apply.
- **Playwright "Stop presenting" matches 3 elements** — scope via `shareControl` helper.
- Secrets: git-ignored `.env` locally; SSM SecureStrings in prod. Never commit values.
