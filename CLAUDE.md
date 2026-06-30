# A-Meet — Agent Guide

> **ALWAYS read `plan.md` first.** It is the single source of truth: milestones, conventions, and
> live status (checkboxes). Update its checkboxes as you work.

## Project
A-Meet — a Google Meet clone built from scratch (MERN + Material UI + Socket.io + mediasoup SFU).
Learning + portfolio project, built in staged milestones (see `plan.md`).

## Current milestone
**M5 — Screen share + reactions + raise hand + chat toggle.** M0–M4 complete; M5 code-complete
(screen share via SFU, presentation layout, emoji reactions, raise-hand, chat toggle with unread
badge), pending Anuraj's manual verify (M5.8) + /journal M5. See `plan.md` for live status.

## Operating ritual (every step)
1. **Read** relevant context (`plan.md` + the files you'll touch + any unsure library doc) before coding.
2. **Do** the step. 
3. **Tick** the checkbox in `plan.md`.
4. **/journal** at the END of each milestone (not every step), plus on any major breakthrough.

## ⛔ Attribution policy (STRICT — non-negotiable)
NEVER add any Claude / Anthropic / AI attribution anywhere:
- NO `Co-Authored-By: Claude` (or any AI) trailer in commits.
- NO "Generated with Claude Code", "written by Claude", or any tool/company/AI mention
  in commit messages, PR titles/bodies, code comments, or docs.
- All commits and PRs are authored as **Anuraj alone**.

## Conventions
- **Stack:** MERN · **JavaScript** (no TypeScript) · **Material UI only** (no Bootstrap) · Google Fonts.
- **Auth:** Passport `google-oauth20` (`session:false`) → JWT in **httpOnly cookie**; protected
  routes/sockets verify the cookie.
- **Validation:** Joi (API request layer) + Mongoose (DB schema layer).
- **Ports:** server `5000` · client (Vite) `5173` · MongoDB `27017` · mongo-express `8081`.
- **Layout:** monorepo — `client/` + `server/` + root `docker-compose.yml` + root `package.json`.
- **Secrets:** `.env` (git-ignored) holds real values pasted by Anuraj; `.env.example` documents keys.
  Claude never fills real secrets.
- **Naming:** files `kebab-case`, React components `PascalCase.jsx`, Mongoose models `PascalCase` singular.
- **Commits:** only when Anuraj explicitly asks.

## Testing & TDD
Strict TDD (red → green → refactor) for all new code and bug fixes, and tests assert
**behavior, not implementation**. Full rules + how to run the gates locally
(`npm run verify`) are in [`CONTRIBUTING.md`](CONTRIBUTING.md).

## Models
Opus for architecture / new concepts (M2 WebRTC, M4 mediasoup) / hard bugs / security review.
Sonnet for routine coding. Haiku for trivial edits.
