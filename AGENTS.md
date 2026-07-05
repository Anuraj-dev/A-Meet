# Agent entry — A-Meet

BEFORE doing anything in this repo:
1. **Read `docs/STATE.md`** — current state of the project (what's done, what's in progress, gotchas).
2. **Skim `docs/INDEX.md`** — the map of every doc and what it's for.

Then read ONLY the further docs your task needs (e.g. `docs/old_plan.md` for milestone history,
`docs/typescript-migration.md` before touching TS config). Do not scan the repo blindly — the docs
exist so you don't have to.

At the end of a milestone (not every step), run `/journal`. When `docs/STATE.md` needs updating —
new milestone landed, a decision got made, a gotcha discovered — update it directly (or run
`/checkpoint` if available) so the next session starts cheap.

- Conventions, stack, run/test commands, model-choice guide: `docs/conventions.md`
- Full decision log (why we chose things): `docs/decisions.md`
- Complex features are planned in `docs/specs/` (see `/spec`)

## ⛔ Attribution policy (STRICT — non-negotiable)
NEVER add any Claude / Anthropic / AI attribution anywhere:
- NO `Co-Authored-By: Claude` (or any AI) trailer in commits.
- NO "Generated with Claude Code", "written by Claude", or any tool/company/AI mention in commit
  messages, PR titles/bodies, code comments, or docs.
- All commits and PRs are authored as **Anuraj alone**.

## Testing
Strict TDD (red → green → refactor) for all new code and bug fixes; tests assert behavior, not
implementation. Full rules + how to run the gates locally: `CONTRIBUTING.md`.
