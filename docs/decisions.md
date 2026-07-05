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
