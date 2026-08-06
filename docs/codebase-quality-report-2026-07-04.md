# A-Meet — Codebase Quality Report

**Date:** 2026-07-04
**Scope:** `client/`, `server/`, `shared/`, `e2e/`, `deploy/`, CI/CD, and project documentation.
**Method:** six independent deep-dive reviews (size/typesafety, backend, frontend, deployment/infra, testing, documentation), each reading source directly and cross-checking claims against code, git history, and live CI run status.

---

## 1. Overall rating

| Area | Rating | One-line verdict |
|---|---|---|
| Backend (`server/`) | **8/10** | Mature architecture, strong error handling & logging; real SFU socket-layer validation/resource-cap gap |
| Frontend (`client/`) | **8/10** | Clean hook-based mediasoup encapsulation, complete honest TS migration; one God-component and a duplicated palette |
| Deployment/Infra | **7.5/10** | OIDC CI/CD, immutable-SHA deploys, idempotent recovery scripts; no auto-rollback, no container healthcheck, coturn TLS unfinished |
| Typesafety | **9/10** | ~96–100% TS across all workspaces, `strict: true`, `any` isolated to test files & third-party SDK seams |
| Testing | **8/10** | Real TDD discipline (behavior-first, not smoke tests); `RoomPage.tsx` has zero unit tests, several M12 features have no automated coverage at any level |
| Documentation | **5.5/10** | README/CONTRIBUTING mostly accurate on stack facts, but the two docs CLAUDE.md tells every agent to trust first (`CLAUDE.md` itself, `plan.md`) are the most stale files in the repo |

**Overall codebase quality: 7.7/10** — meaningfully above typical solo/portfolio-project bar. The engineering (SFU orchestration, lifecycle management, CI/CD, test discipline) is consistently strong; the weak point is that the project's own source-of-truth documentation hasn't kept pace with ~7 milestones and a full TypeScript migration.

---

## 2. Large files (>1,500 LOC)

Only **one** file in the entire codebase crosses 1,500 lines:

| File | Lines | Verdict |
|---|---|---|
| `client/src/pages/RoomPage.tsx` | **1,558** | God-component: composition root for the in-call screen, owns ~25 `useState` hooks and wires together 6+ custom hooks (`useMediasoup`, `usePictureInPicture`, `usePcmCapture`, `useReactions`, `useHostModeration`, `useRoomLayout`, `useScreenShare`) plus chat/transcription/moderation/screenshot state. Its five inline `renderXLayout()` functions (lines 682–1149, ~470 lines) are pure JSX and should be extracted to `src/components/stage/*.tsx`. **It also has zero unit test coverage** (see §5) and contains the untested mute-all / ask-to-unmute wiring. This is the single highest-value refactor target in the codebase. |

Runners-up (all comfortably under 1,500, no action needed): `client/src/hooks/useMediasoup.ts` (894 — earns its size, one cohesive documented state machine), `client/src/pages/LandingPage.tsx` (570), `client/src/components/VideoTile.tsx` (539), `client/src/pages/LobbyPage.tsx` (513), `server/src/socket/sfu-handlers.ts` (440 — cleanly organized as 19 numbered handlers, not tangled).

No backend, shared, or deploy file approaches this threshold — the size problem is isolated to one frontend file.

---

## 3. Typesafety assessment

The codebase is **effectively fully migrated to TypeScript**, and the migration is honest (not a cosmetic rename):

| Workspace | TS files | Remaining JS | Notes |
|---|---|---|---|
| `client/src` | 66 | 10 | All 10 JS files are test/setup harness files (`*.test.js`, `src/test/setup.js`) — **zero production JS remains** |
| `server/src` | 33 | 0 | Fully migrated |
| `shared/src` | 5 | 0 | Fully migrated (types-only contracts package, `@a-meet/contracts`) |

- `strict: true` is on in the base tsconfig, inherited by all workspaces. No stricter opt-in flags (`noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`) are enabled, but this is a reasonable, common baseline.
- `checkJs: false` means the 10 leftover client test/setup `.js` files get **no type-checking at all** — a small, contained blind spot.
- `any` usage: 32 hits in client — **all confined to 3 test files** (zero in production client code). 22–25 hits in server, spread across genuine third-party-integration seams (mediasoup, Deepgram/transcription SDKs) and explicitly scoped as an allowed exception in `server/eslint.config.js`.
- `docs/typescript-migration.md`'s claims of "fully migrated server/shared, client production source complete" check out exactly against the file tree — this doc is accurate, unlike most others (see §6).

**Net assessment:** ~90%+ of the codebase is meaningfully type-checked under `strict` mode with minimal, well-contained `any` usage. This is a strong result, not a partial or superficial migration — **but `CLAUDE.md`'s stated convention "JavaScript (no TypeScript)" is now the exact opposite of reality** (see §6).

---

## 4. Package inventory

**Root** (`package.json`) — orchestration only: `concurrently`, `typescript` (devDeps).

**`client`** — deps: `@a-meet/contracts` (workspace), `@emotion/react`/`styled`, `@mui/material` + `@mui/icons-material` (v9), `axios`, `framer-motion`, `mediasoup-client` 3.20, `react`/`react-dom` 19.2, `react-router-dom` 7, `socket.io-client` 4.8, `three`. devDeps: Vitest 3.2 + coverage-v8, Testing Library, ESLint 10 + typescript-eslint, Vite 8, jsdom, TypeScript types.

**`server`** — deps: `@a-meet/contracts`, `@aws-sdk/client-ssm`, `@deepgram/sdk`, `express` 5, `express-rate-limit`, `helmet`, `joi`, `jsonwebtoken`, `mediasoup` 3.20, `mongoose` 9, `passport` + `passport-google-oauth20`, `pino`/`pino-http`, `socket.io` 4.8, `groq-sdk`, `tsx`. devDeps: Vitest, `mongodb-memory-server`, `supertest`, `nodemon`, ESLint 10.

**`shared`** (`@a-meet/contracts`) — no runtime deps; type-only package exported directly from `.ts` source (no build step). devDeps: ESLint, `mediasoup-client` (types only).

**`e2e`** — deps: `socket.io-client`. devDeps: `@playwright/test`, `jsonwebtoken`, `mongodb-memory-server`.

### Dependency / compatibility findings

- `npm ls --workspaces --depth=0` is **clean** — no unmet peer deps, no dedup conflicts.
- `socket.io` (server) 4.8.3 ↔ `socket.io-client` (client/e2e) 4.8.3 — exact match, no issue.
- `mediasoup` (server) 3.20.9 ↔ `mediasoup-client` (client) 3.21.0 — same v3 line, compatible, but not version-locked identically; worth pinning if strict protocol parity ever matters.
- `@mui/material` 9.1.2 vs `@mui/icons-material` 9.1.1 — one patch apart under the same `^9.0.1` range; cosmetic, worth aligning.
- **No `engines` field** anywhere (root or workspaces) despite depending on quite recent majors (`@types/node ^26`, `mongoose ^9`, `express ^5`) — a contributor on an older Node could install fine and hit runtime breakage.
- `npm outdated --workspaces` — real gaps requiring planned migration work, not blind bumps:
  - `@deepgram/sdk` **4.11.3 → 5.5.0** (major behind)
  - `groq-sdk` **0.37.0 → 1.3.0** (pre-1.0 → 1.0, likely breaking)
  - `vitest` / `@vitest/coverage-v8` **3.2.6 → 4.1.9** (major behind, both workspaces must move together)
  - `jsdom` **25.0.1 → 29.1.1** (several majors behind, client test-only)
  - Everything else is minor/patch drift (low risk).
- `npm audit --audit-level=high` — exactly **one** low-severity advisory in both client and server: `esbuild` dev-server arbitrary file read on Windows (GHSA-g7r4-m6w7-qqqr), fixable via `npm audit fix`, and not relevant to this project's Linux-only prod deployment.

---

## 5. Testing deep review

**Server unit tests: 9/10.** 33 source files, 28 test files (~0.85:1), 209 tests, run in 4.4s. Verified live: `npm run test:server` → 209/209 passing. Coverage floor (v8, `server/vitest.config.js`): lines 54% / functions 55% / branches 72% / statements 54%, enforced as a **non-decreasing ratchet** in CI, not a fixed bar. Tests are genuinely behavior-first — the "capture-and-invoke" pattern on fake sockets, real `mongodb-memory-server` + `supertest` integration tests for authorization-sensitive routes, a documented open-redirect test, and full auth rejection matrices. Only real gap: the SSE log-stream endpoint (`GET /api/logs/stream`) is untested.

**Client unit tests: 8/10.** 53 source files, 23 test files (~0.43:1), 139 tests, run in 13.75s (verified: 139/139 passing). Where tests exist they are deep and realistic (e.g. `useMediasoup.test.tsx` — 20 tests faking `mediasoup-client.Device`/transports, covering reconnect, listener-leak cleanup, permission-denied matrices). Coverage floor is low (18% lines/statements) and, more importantly, **`RoomPage.tsx` — the largest, most stateful file in the client — has zero test file**, and it's where the untested mute-all/ask-to-unmute-all wiring lives.

**E2E: 7/10.** Harness cleanly splits SFU-off (`e2e/tests/`) vs SFU-on (`e2e/tests-sfu/`) suites, both run in CI on every PR (verified live: latest run on `main` green for all jobs — CI, Typecheck, E2E smoke [both Playwright smoke and Playwright SFU host-moderation jobs], Server image smoke, Deploy backend). Existing specs are rigorous, including a genuine trust-boundary test that forges a raw socket event to prove server-side (not just UI-side) authorization. **Note:** project memory describing an "SFU-off moderation blocker... only mute-enforced & spotlight-visible still need an SFU-on job" is **stale** — that job already exists, is wired, and is green.

**Feature-coverage gaps (zero E2E coverage found for):** screen share, raise hand, mute-all, ask-to-unmute(-all), pin-effect-on-layout, fullscreen, layout chooser/pagination. Several of these (mute-all, ask-to-unmute) have **no automated coverage at any level** — unit or E2E — and currently rely entirely on the manual checklist in `TESTING-M12.md`, consistent with M12 still being in progress per `plan.md`.

**Overall testing: 8/10** — real TDD discipline, not just asserted in `CONTRIBUTING.md` but actually visible in the tests. Priority fixes: (1) add `RoomPage.test.tsx` covering mute-all/ask-to-unmute, (2) raise the client coverage floor as confidence grows, (3) automate the M12 manual-checklist flows into E2E once that milestone stabilizes.

---

## 6. Documentation vs. implementation audit

This is the weakest area, and notably, the staleness is concentrated in exactly the two documents `CLAUDE.md` instructs every agent to treat as ground truth.

### Stale
1. **`CLAUDE.md`'s "Current milestone" is ~7 milestones behind.** It says "M5, pending manual verify" — `plan.md` shows M0–M8 and M11 complete, M9 prod-verify-pending, M10 in progress, and **M12** as the real current milestone.
2. **`CLAUDE.md`'s "JavaScript (no TypeScript)" convention is now the opposite of reality** — server, shared, and client production code are all fully TypeScript (see §3). This is the single most misleading line in the repo's most-trusted doc.
3. **`project_files/*.md`** (architecture doc, landing-redesign notes) describe a pre-M6 state: Three.js landing hero (replaced by `EtherealShadow`/`framer-motion` per M10), Vercel+PM2+Nginx-on-EC2 deploy (replaced by the Docker/ECR/self-healing-EC2 pipeline), and a `Room.js`/`User.js` plain-JS model pair (now `.ts`). Should be archived or clearly headered as historical.
4. **`TESTING-M12.md`** documents a temporary port swap (5174) that contradicts the fixed 5173 convention everywhere else — fine as an ephemeral note, risky sitting at repo root next to `CONTRIBUTING.md`.
5. **`CONTRIBUTING.md`** cites `VideoTile.test.jsx` (renamed to `.tsx` during migration) and lists an out-of-sync trigger-path set for the server-image CI job (missing `shared/**`, `package.json`, `package-lock.json`).
6. `.github/workflows/typecheck.yml`'s header comment still says "mostly JavaScript."

### Incorrect
1. **`README.md` states the mediasoup UDP port range as 10000–59999**; the actual configured range (three independent sources agree: `.env.example`, `env.ts` defaults, e2e constants) is **40000–40100**. Following the README's security-group instructions literally opens the wrong 50,000-port range.
2. **`README.md`'s project-structure diagram names a `Meeting` model** that doesn't exist — the actual file is `Room.ts` (scheduling fields live directly on `Room`, by design).

### Missing
1. **`plan.md` — the self-declared single source of truth — has zero tracking for ~40 commits of real, shipped work**: the entire TypeScript migration, the CI/testing-gate build-out (lint, audit, coverage ratchet, Playwright SFU harness), and the production deployment/observability system (containerization, ECR pipeline, EC2 auto-recovery, Telegram/SNS alerting). None of this is visible to an agent that reads only `plan.md`, despite `CLAUDE.md` instructing exactly that.
2. **README's setup instructions omit `cp client/.env.example client/.env`.** Since `client/src/services/socket.ts` has no fallback for `VITE_SERVER_URL`, skipping this step (as the README currently directs) likely breaks Socket.io/SFU signaling on a fresh clone with no obvious error message.
3. `shared` workspace's own lint/typecheck commands aren't called out in README's command list (they run as part of the aggregate scripts, just not documented standalone).

### Verified accurate (no action needed)
Ports (5000/5173/27017/8081), the Passport google-oauth20 + JWT-httpOnly-cookie auth description, `CONTRIBUTING.md`'s CI-gate description, and `.env.example` completeness (two minor exceptions: `LOG_LEVEL`/`AWS_REGION` used in code but undocumented in `server/.env.example`).

---

## 7. Backend highlights (full detail in review transcript)

- **Strong:** clear routes→middleware→controllers→models layering, no circular deps, mediasoup SFU logic well decomposed (`sfu/workers.ts`, `sfu/sfu-rooms.ts`, `sfu/config.ts` with IMDSv2-based announced-IP auto-detection), consistent try/catch→central-error-handler pattern, process-level `uncaughtException`/`unhandledRejection` handlers with an orderly SIGTERM drain, correct JWT/cookie config (httpOnly + prod/dev-branched secure/sameSite), a guarded open-redirect check, no hardcoded secrets, no NoSQL injection surface found, structured `pino` logging with field redaction.
- **Real gap — SFU socket layer bypasses validation the REST layer enforces:** `sfu-get-rtp-capabilities`/`join-room` accept any non-empty string as `roomId` with no format check or DB-existence check, and mediasoup will lazily mint a real Router for it. Combined with no per-peer transport/producer cap and only a 100-port RTC range by default, **an authenticated user can exhaust mediasoup worker resources** — a legitimate DoS surface worth a rate limiter and an "room must exist and be active" guard.
- Joi validation covers 100% of HTTP routes but **0% of socket events** — ad hoc inline checks of varying rigor instead, despite sockets carrying equivalent authority (they mutate DB state, control media).
- Minor: scattered `console.*` calls in 2-3 files instead of the shared `pino` logger; one dead event listener (`producer.on('close', ...)`, which is not a real mediasoup event) left in on purpose during migration but never cleaned up.

## 8. Frontend highlights (full detail in review transcript)

- **Strong:** `useMediasoup.ts` cleanly encapsulates the entire mediasoup-client transport/producer/consumer lifecycle behind one hook with thorough teardown (closes transports, clears all maps, stops all tracks, disconnects the WebAudio graph); `RoomPage.tsx` was recently decomposed into `useReactions`/`useHostModeration`/`useRoomLayout`/`useScreenShare`, each independently tested; socket events are typed end-to-end via a shared `@a-meet/contracts` package (a typo'd event name is a compile error, not a silent no-op); zero `any` in production client code.
- **Dead code:** `src/hooks/useWebRTC.ts` + `src/services/webrtc.ts` (351 + 9 lines) — the pre-mediasoup P2P mesh implementation, confirmed to have zero importers anywhere, yet still type-checked and bundled.
- **Duplicated palette:** an identical `const DK = {...}` hardcoded color object is copy-pasted across 4 files (`LandingPage.tsx`, `LobbyPage.tsx`, `ScheduleMeetingDialog.tsx`, `UpcomingMeetings.tsx`) instead of living once in `theme.ts`, despite `theme.ts` explicitly commenting that unification was the goal.
- Minor: index-as-key in `ChatPanel.tsx`'s message list; several `IconButton`s rely on `Tooltip` alone (not a reliable accessible name) instead of an explicit `aria-label`; `cameraTiles()` and the `devices` object are recomputed unmemoized multiple times per render (harmless at this scale, but worth cleaning up).

## 9. Deployment highlights (full detail in review transcript)

- **Strong:** multi-stage `server/Dockerfile` with a real smoke-test stage that boots an actual mediasoup worker, non-root user, no baked secrets; CI/CD uses OIDC (no static AWS keys), deploys by immutable SHA tag with exact-commit checkout on the box, and has a post-deploy health-check with retries; `aws-recovery.sh`/`aws-observability.sh` are idempotent and well-guarded (`set -euo pipefail`, required-var checks); IAM policies are tightly scoped (the prior SSM path-permission bug is confirmed fixed); no hardcoded secrets anywhere; the recent Telegram OK/recovery-notification commit is confirmed correctly implemented.
- **Real gaps:** the deploy workflow has **no automated rollback** on a failed post-deploy health check (a human must intervene); `docker-compose.prod.yml` has no `healthcheck:` block or resource limits on the server container; the deploy workflow's SSH key to production is a static long-lived secret, inconsistent with the otherwise OIDC-first story; the EC2 instance role's ECR-pull permission isn't captured in any committed IAM policy file (an IaC completeness gap); **coturn's TLS listener (port 5349) is referenced by client code but the committed config has no cert/key configured**, so the `turns:` relay path likely doesn't actually work as configured (UDP/TCP fallback would still work); nginx is missing standard security headers (HSTS, X-Content-Type-Options) and explicit WebSocket timeout tuning.

---

## 10. Prioritized recommendations

**High priority (correctness/security-relevant):**
1. Add server-side validation (format + DB-existence check) before minting an SFU Router for a `roomId`, plus a per-peer transport/producer cap — closes the resource-exhaustion DoS surface.
2. Add automated rollback to `deploy-backend.yml` on failed post-deploy health check.
3. Fix the coturn TLS listener (add `cert-file`/`pkey-file`) or remove the `turns:` ICE candidate from the client until it's actually provisioned.
4. Update `CLAUDE.md`'s "Current milestone" and "no TypeScript" lines — these actively mislead every future agent session that reads it first, per the file's own stated purpose.
5. Fix `README.md`'s mediasoup UDP port range (10000–59999 → 40000–40100) before anyone provisions a security group from it.
6. Add `cp client/.env.example client/.env` to the README setup steps — its omission likely breaks a fresh clone's realtime signaling.

**Medium priority (quality/coverage):**
7. Add `RoomPage.test.tsx` covering the untested mute-all/ask-to-unmute-all wiring.
8. Split `RoomPage.tsx`'s five `renderXLayout()` functions into `src/components/stage/*.tsx` to shrink the one file over 1,500 lines.
9. Bring `plan.md` up to date with the TS migration, CI/testing build-out, and deployment/observability work — currently invisible to the doc that's supposed to be authoritative.
10. Extend Joi (or a lightweight schema layer) to socket event payloads, matching the rigor already applied to HTTP routes.
11. Delete `useWebRTC.ts`/`webrtc.ts` (dead code) and consolidate the four duplicated `DK` palette objects into `theme.ts`.
12. Add a `healthcheck:` block and resource limits to `docker-compose.prod.yml`'s server service.

**Lower priority (polish):**
13. Plan the `@deepgram/sdk` (v4→v5) and `groq-sdk` (v0→v1) major upgrades; coordinate the `vitest`/`@vitest/coverage-v8` v3→v4 bump.
14. Add an `engines` field to all `package.json` files given the recent-major dependency floor.
15. Add HSTS and other standard security headers to `deploy/nginx.conf`; set an explicit WebSocket `proxy_read_timeout`.
16. Archive or clearly header `project_files/*.md` and `TESTING-M12.md` as historical/ephemeral rather than living docs.
17. Sync `CONTRIBUTING.md`'s file references (`VideoTile.test.jsx` → `.tsx`) and server-image CI trigger-path list with actual workflow YAML.
18. Add `aria-label`s to the remaining icon-only buttons relying solely on `Tooltip`; fix `ChatPanel`'s index-as-key.

---

## 11. Bottom line

A-Meet is a well-engineered project for its stated scope (solo learning/portfolio build): the mediasoup SFU integration, TypeScript migration, test discipline, and CI/CD/observability build-out are all genuinely above what's typical at this stage. The gap between the code's actual maturity and what its own steering documents (`CLAUDE.md`, `plan.md`) claim is the most important finding here — not because the code is behind, but because the docs are, and those specific two files are the ones every future agent session is told to trust unconditionally. Closing that gap (items 4 and 9 above) is low-effort and high-leverage relative to everything else in this report.
