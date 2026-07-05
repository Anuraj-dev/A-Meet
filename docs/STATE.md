# A-Meet — State
> Google Meet clone (MERN + TypeScript strict + Material UI + Socket.io + mediasoup SFU), built in
> staged milestones as a learning/portfolio project. · Last checkpoint: 2026-07-05

## 🚧 In progress / next
- **M8.5** — manual verify + `/journal` for per-participant output volume (code done).
- **M9.7** — prod verify pending for connection-stability fixes (code done).
- **M10.12** — `npm run build` + lint check + Anuraj manual verify for landing/lobby ember redesign.
- **M12.11** — client+server tests green, zero new lint errors, Anuraj manual verify (needs 2
  peers) + `/journal M12` for the meeting-room re-skin + Meet feature parity. **Current milestone.**
- Test-coverage gap (from 2026-07-04 quality report): mute-all, ask-to-unmute(-all), and pin's
  layout effect have no automated test at any level; screen share/raise-hand/fullscreen/layout
  chooser have no E2E coverage. Worth closing before `/journal M12` and moving to M13+.
- Known prod follow-ups: no automated rollback on failed post-deploy health check; coturn's TLS
  listener (5349) has no cert yet; EC2 instance role's ECR-pull permission isn't captured in the
  repo's IAM policy files.

## Status
- **M0–M9, M11: done.** M10 (landing/lobby ember redesign) and M12 (room re-skin + people panel +
  pin/spotlight + layout chooser + host moderation): code-complete, pending manual verify above.
  Full milestone-by-milestone history + the *why* behind each: `docs/old_plan.md`.
- **Platform/infra (parallel track, all done):** TypeScript migration (client/server/shared all
  strict TS — `docs/typescript-migration.md`), CI/CD + test gates (ESLint, `npm audit`, Vitest
  coverage ratchet, Playwright E2E split SFU-off/SFU-on — `CONTRIBUTING.md`, `.github/workflows/`),
  production deployment + observability (Docker → ECR → self-healing EC2, SSM secrets, CloudWatch
  → SNS → Telegram alarm/recovery — `README.md` Deployment section, `deploy/`).

## Architecture map
- `client/src/` — React + Vite + MUI, strict TS. Room UI: `components/room/`; SFU client logic:
  `hooks/` (mediasoup-client wiring); layout/pin/spotlight: `utils/room-entry.ts` + room hooks.
- `server/src/` — Express + Socket.io + mediasoup SFU. Room/moderation socket events:
  `sfu-handlers.ts`.
- `shared/src/` — `@a-meet/contracts` workspace: types shared between client and server.
- `e2e/` — Playwright, split `tests/` (SFU-off) and `tests-sfu/` (SFU-on).
- `deploy/` — production deploy scripts/config (Docker/ECR/EC2/CloudWatch/Telegram).
- `docs/agents/coder-loop.md` — the Claude-codes/Codex-reviews background loop convention.

## Stack & run
- Stack: MERN · TypeScript strict (all 3 workspaces) · Material UI only (no Bootstrap) · Google
  Fonts · Socket.io · mediasoup SFU.
- Ports: server `5000` · client (Vite) `5173` · MongoDB `27017` · mongo-express `8081`.
- Run dev: `npm run dev` (root, runs server+client concurrently) · Docker infra: `npm run docker:up`.
- Test: `npm test` (unit) · `npm run coverage` · `npm run typecheck` · `npm run test:e2e`
  (Playwright, run `npm run test:e2e:install` once first). Full rules: `CONTRIBUTING.md`.

## Key decisions (top 5)
- **M12 skin/behavior north star:** room adopts the landing's ember/sage/graphite `DK` tokens;
  target Google Meet *behavior*, not necessarily its color scheme. Speaking cue deliberately
  stays **green** (`#34d399`) for legibility on warm graphite, not Meet's blue.
- **Pin vs Spotlight:** local pin (any user, client-only state) is independent from host spotlight
  (server relay → everyone); spotlight wins when both are set.
- **Host mute is consent-based:** enforced server-side producer pause with **no force-unmute** —
  only a request-to-unmute prompt, so audio is never resumed without the muted user's consent.
- **Auth:** Passport `google-oauth20` (`session:false`) → JWT in httpOnly cookie; protected
  routes/sockets verify the cookie server-side.
- **Prod IP resolution:** `resolveAnnouncedIp()` auto-detects the EC2 public IPv4 via IMDSv2 at
  startup — root-caused a bug where a private/loopback announced IP silently broke peer
  visibility for everyone on the same network.
- Full log, including infra/CI decisions: `docs/decisions.md`.

## Gotchas (don't re-break these)
- **Audio routing:** never connect anything to `audioCtx.destination` — metering uses an
  AnalyserNode-only AudioContext; mic gain routes through a separate `MediaStreamAudioDestinationNode`
  sink. Connecting to `destination` crackles the live call on Linux/PipeWire.
- **Mic gain:** GainNode is built eagerly in `setupSfu` before `produce()`; `setMicGain` only
  touches `gain.value` synchronously — no `replaceTrack`, no async, no race.
- **Instant-join is a navigation marker, not an identity check:** `RoomGuard` checks for
  `state:{fromCreate:true}`/`state:{fromLobby:true}`, not host identity — do NOT reintroduce an
  identity-based redirect, it broke the same account joining from two browsers. Logic:
  `utils/room-entry.ts` (`shouldRedirectToLobby`).
- **Camera simulcast:** 3-spatial-layer simulcast lets the SFU shed video layers under bad
  downlink instead of saturating the transport (which used to break audio too);
  `consumer.setPriority(255)` on audio reserves voice bitrate.
- Secrets: local dev uses git-ignored `.env`; prod resolves SecureStrings from SSM via the
  instance role before boot. Never commit or bake secret values.
