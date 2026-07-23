# Decisions — A-Meet
> Append-only log of load-bearing choices and WHY. Newest at the bottom.
> Format: `## YYYY-MM-DD — <decision>` then a short **Why:** line.

## (inferred at adoption) — TypeScript strict across client/server/shared
**Why:** catch contract drift between client/server at build time instead of runtime; full
migration strategy and per-package status in `docs/typescript-migration.md`.

## (inferred at adoption) — mediasoup SFU instead of a WebRTC mesh
**Why:** a full mesh doesn't scale participant-to-participant bandwidth/CPU past a handful of
peers; the SFU centralizes media routing so each peer only uploads once.

## (inferred at adoption) — Auth via Passport `google-oauth20` (`session:false`) → JWT httpOnly cookie
**Why:** stateless auth that still keeps the token out of JS-accessible storage (XSS-resistant),
verified server-side on protected routes/sockets.

## (inferred at adoption) — Host mute is consent-based, no force-unmute
**Why:** muting keeps the track live server-side; a forced resume would resume audio without the
muted user's consent, so "unmute" is only ever a request prompt to the muted user.

## (inferred at adoption) — Prod EC2 announced IP auto-resolved via IMDSv2 (`resolveAnnouncedIp()`)
**Why:** root cause of a prod incident ("two peers on the same link both saw 'you're the only one
here'") — a private/loopback announced mediasoup IP meant remote browsers couldn't reach the media
ports, so `produce()` never completed and no peer became visible.

## 2026-06-22 — Locked AWS/logging/TS-migration/testing decisions (resilience initiative)
**Why:** grilling pass to settle the platform/infra track (CI/CD gates, prod deploy/observability,
TS migration, test strategy) so it could run in parallel with feature milestones without
re-litigating each piece. Full scope in the resilience-initiative memory; concrete outputs are the
CI workflows, `CONTRIBUTING.md` gates, and the Telegram alarm/recovery pipeline.

## 2026-07-0x — M10 design system: landing's ember/smoke `DK` tokens extended to the lobby
**Why:** the lobby wore an inconsistent cold-purple/coral/teal Three.js-orb skin against the
landing's warm ember/smoke cinematic hero; settled via a grilling pass with Anuraj to unify the
product on one design language before extending it to the room (M12).

## 2026-07-0x — M12: room re-skin targets Google Meet *behavior*, not necessarily its palette
**Why:** speaking-cue green (`#34d399`) was kept instead of switching to Meet's blue, because
green read as more legible on the new warm graphite background — flagged as revisitable if Anuraj
wants exact Meet-blue parity later.

## 2026-07-0x — M12: local Pin (client-only) kept separate from host Spotlight (server-relayed)
**Why:** lets any participant focus a tile for themselves without affecting others' view, while
still giving the host a way to force everyone's focus (spotlight wins when both are set).

## 2026-07-05 — Adopted docs/ context system (STATE.md + old_plan.md + this log)
**Why:** `plan.md` had grown to mix live status with fully-completed milestone history, forcing a
full read to find what's still open. Split into `docs/STATE.md` (live overview, read every
session) and `docs/old_plan.md` (completed-milestone archive, read only on demand) so a fresh
agent orients cheaply. `CLAUDE.md`/`AGENTS.md` now route here instead of `plan.md`.

## 2026-07-06 — Stay on custom mediasoup; do NOT migrate to LiveKit
**Why:** the 2026-07-05 prod incident proved the SFU server was healthy the whole time — every
failure since M6 has been in the hand-rolled client state machine (retry/ordering/error labeling),
which is fixable in days. For a learning/portfolio project the custom SFU is the asset; a LiveKit
rewrite (3–4 weeks, all client-side) would teach integration, not WebRTC. Rejected alternatives:
self-hosted LiveKit (right for a product, not this goal) and hybrid LiveKit-Cloud-for-prod (two
stacks, prod stops exercising the showcased code). Reference livekit-client's reconnection code
when fixing ours.

## 2026-07-06 — SFU media-setup recovery contract
**Why:** a failed *first* setup must never strand a user media-less (the incident's failure mode).
Contract: auto-retry setupSfu on every socket `connect` regardless of prior success, capped
exponential backoff while connected, visible "Connecting media…" state with a manual Retry as last
resort; setup awaits the socket's `connect` event (no emits on a connecting socket); signaling
errors propagate the real socket.io error + socket.connected + elapsed-ms (never blanket
"timed out" — that mislabel misdirected debugging at TURN for weeks).

## 2026-07-09 — Telegram flap suppression lives in the notifier, not in alarm thresholds
**Why:** `mongo-disconnect` logs one line per disconnect event, so requiring 2-of-2 datapoints
would never fire for a real sustained outage — sensitivity must stay 1-of-1 and the noise is
absorbed downstream: the Lambda persists the ALARM's StateChangeTime in SSM (best-effort — paging
must never depend on SSM being writable) and folds an OK arriving within 10 min into one compact
"recovered after Xm Ys" line. Rejected: DynamoDB state (new resource), parsing NewStateReason (brittle).

## 2026-07-09 — Socket rate-limit buckets are keyed per ACTOR with grace-period eviction
**Why:** per-socket buckets are bypassable by reconnecting/opening parallel sockets, and evicting
actor state on last disconnect reopens the same hole for serial reconnects. Buckets key on
authenticated user id (fallback: rightmost X-Forwarded-For hop, matching HTTP trust proxy 1) and
survive 10 min past the last disconnect. In-memory by design — single-node prod, no Redis.
Rejected: distributed store (out of scope until horizontal scaling).

## 2026-07-10 — Escape closes Chat/People panels, guarded while an action menu is open
**Why:** WCAG dialog semantics for the room side panels (#164/#170). Unguarded Escape broke the
host-moderation E2E flow (stale-menu Escape nuked the whole panel), so `usePanelDialog` takes a
`closeOnEscape` flag that PeoplePanel disables while its per-person menu is open; E2E flows that
press Escape with no menu open must reopen the panel. Rejected: swallowing Escape entirely
(non-standard, traps keyboard users).

## 2026-07-10 — E2E exits native fullscreen via document.exitFullscreen(), not Escape
**Why:** headless Chromium/CDP cannot synthesize the browser-chrome-level Escape that exits the
Fullscreen API, and the tile menu portals outside the fullscreen top layer, so neither user
affordance is drivable in CI. `page.evaluate(() => document.exitFullscreen())` still proves the
app's enter path and teardown. Rejected: app-level Escape handler just to make tests pass.

## 2026-07-10 — TURN TLS: certbot HTTP-01 via existing nginx; recovery is operator-rerun
**Why:** nginx already owns port 80 so webroot HTTP-01 needs no DNS credentials; the renew hook
is lineage-guarded so API-cert renewals can't install the wrong cert into coturn (review
blocker). Recovery stays manual (`setup-coturn-tls.sh` re-run) because the EBS-backed
self-healing flow has no user-data provisioning pattern to hook a retry unit into — README says
so honestly. Rejected: DNS-01 (needs creds), auto-retry systemd unit (no pattern to extend).

## 2026-07-10 — coturn cert copies owned by container runtime uid (65534), not root
**Why:** the coturn/coturn image drops to nobody:nogroup, so root-only 0600 copies made the TLS
listener silently fail ("certificate file is not set properly") — and the certbot renewal hook
re-installed the broken ownership every ~60 days. Rejected alternative: running coturn as root
(needless privilege). UID/GID overridable via COTURN_RUNTIME_UID/GID and persisted in
/etc/a-meet/coturn-tls.env so renewals reuse them (PR #171).

## 2026-07-13 — Terra effort split + SFU consumer-cap semantics
**Why:** Raja set codex GPT-5.6 Terra at HIGH effort for code review, MEDIUM for implementation,
~50/50 workload with Opus subagents (max 2 each concurrently) — review quality is worth the
quota, implementation isn't. Rejected: Sol-low reviews (previous default) for this session.
SFU per-peer consumer cap defined as an intentional absolute DoS backstop derived from a SOFT
50-peer sizing constant (room size deliberately unenforced); duplicate-consume guard skips
`closed` consumers so clients can legitimately re-subscribe. Rejected: enforcing a hard room
cap just to make the arithmetic a guarantee.

## 2026-07-15 — Vitest-4 branch-coverage floors are measurement-driven (server 62, client 37)
**Why:** @vitest/coverage-v8 4.x AST-analyzes untested included files and counts every real
branch as uncovered, where 3.x counted one placeholder branch per untested file — the totals
denominator ~doubled while covered branches rose with identical tests (per-file evidence in
both vitest.config.js comments and PR #176). Floors are set tight against measured values;
"restoring" the old numbers would just break the gate, not add coverage. Rejected alternative:
excluding untested files from coverage (hides real gaps).

## 2026-07-15 — Dependabot handling protocol
**Why:** dependabot never syncs the ROOT lockfile, so its PRs always fail `npm ci`. Grouped
minor/patch PRs: push a root-lockfile sync commit onto the dependabot branch, then merge.
Single-package majors: supersede with a manual migration branch (done for deepgram/groq/jsdom
in #175, vitest in #176). Also: after merging main into any deps branch, regenerate by deleting
the ROOT lockfile + all node_modules and running one clean root `npm install` — incremental
installs keep the old hoisting shape and break single-instance packages (vitest/jest-dom).

## 2026-07-23 — Discord bot v1: account linking, slash commands, separate bot/ workspace
**Why:** meeting host/admin must be the Discord requester, and A-Meet host rights live on real
accounts — a one-time `/meet link` flow (short-lived signed URL opened while logged in, upsert
on a `DiscordLink` collection) makes every later `/meet create` work with zero extra steps.
Rejected: per-meeting one-time host links (friction on every create, DM/ephemeral juggling) and
a bot-owned service account (requester gets no host powers). Slash commands only — native UX,
ephemeral replies for the private link URL, no privileged Message Content intent. Bot is a new
`bot/` monorepo workspace: a thin discord.js adapter calling new `/api/integrations/discord/*`
endpoints over HTTP with a bot API key (only those routes accept it), deployed as one more
container on the existing EC2 compose stack. Rejected: running the Discord client inside the
Express server (couples uptime/restarts) and a separate repo (loses shared contracts/CI).
Spec: `docs/specs/2026-07-23-discord-bot-design.md` · Tickets: #185, #186.

## 2026-07-23 — Discord bot prod compose service is profile-gated, not always-on
**Why:** the existing automated server deploy runs `docker compose -f docker-compose.prod.yml up -d`
on the whole file; an always-on bot service with `${VAR:?}` guards would break that deploy when bot
secrets aren't provisioned. Rejected: wiring the bot into deploy-backend.yml now (deferred follow-up).
The bot uses `:-` env defaults in compose and validates its own required env at startup (exit non-zero).

## 2026-07-23 — Integration endpoints validate with Joi, not zod
**Why:** the spec said "zod" but the repo's validation middleware and every existing schema are Joi;
"match existing validation conventions" was the stronger signal. Rejected: introducing a second
validation library for two routes.

## 2026-07-23 — Discord integration routes bypass the room rate-limiter
**Why:** all bot traffic egresses from one host IP; the per-IP room limiter would throttle legitimate
`/meet create` usage. The timing-safe bot API key gate is the abuse control. Reviewer-approved.
