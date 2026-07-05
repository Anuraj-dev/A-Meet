# Conventions — A-Meet

## Stack
MERN · TypeScript (strict; client/server/shared all fully migrated — see
`docs/typescript-migration.md`) · Material UI only (no Bootstrap) · Google Fonts · Socket.io ·
mediasoup SFU.

## Auth
Passport `google-oauth20` (`session:false`) → JWT in httpOnly cookie; protected routes/sockets
verify the cookie server-side.

## Validation
Joi (API request layer) + Mongoose (DB schema layer).

## Ports
Server `5000` · client (Vite) `5173` · MongoDB `27017` · mongo-express `8081`.

## Layout
Monorepo — `client/` + `server/` + `shared/` (`@a-meet/contracts`) + root `docker-compose.yml` +
root `package.json`.

## Secrets
Local dev uses git-ignored `.env` (`.env.example` documents keys). Production resolves
SecureStrings from SSM through the instance role before the server boots. Never commit or bake
secret values.

## Naming
Files `kebab-case`; React components `PascalCase.tsx`; Mongoose models `PascalCase` singular.

## Commits
Only when Anuraj explicitly asks.

## Run / test commands
```bash
npm run dev              # server + client concurrently
npm run docker:up         # local infra (Mongo, mongo-express)

npm test                  # server + client unit tests
npm run coverage          # unit tests, non-decreasing coverage ratchet
npm run typecheck         # shared + server + client
npm run test:e2e          # Playwright two-context E2E (run test:e2e:install once first)
```
Full pre-merge gate sequence (mirrors CI) and TDD rules: `CONTRIBUTING.md`.

## Testing & TDD
Strict TDD (red → green → refactor) for all new code and bug fixes; tests assert **behavior, not
implementation**. Full rules: `CONTRIBUTING.md`.

## Models (which Claude model for what)
Opus for architecture / new concepts (e.g. WebRTC, mediasoup) / hard bugs / security review.
Sonnet for routine coding. Haiku for trivial edits.

## Attribution policy (STRICT — non-negotiable)
NEVER add any Claude / Anthropic / AI attribution anywhere:
- NO `Co-Authored-By: Claude` (or any AI) trailer in commits.
- NO "Generated with Claude Code", "written by Claude", or any tool/company/AI mention in commit
  messages, PR titles/bodies, code comments, or docs.
- All commits and PRs are authored as **Anuraj alone**.
