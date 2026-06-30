# Contributing to A-Meet

A-Meet is built test-first. This document codifies the two non-negotiable testing
rules — **strict TDD** and **behavior, not implementation** — plus how to run the
gates locally before you push.

## Testing workflow

### Strict TDD (red → green → refactor)

All new code follows red → green → refactor, including UI components and hooks:

1. **Red** — write a failing test that describes the behavior you want.
2. **Green** — write the minimum code to make it pass.
3. **Refactor** — clean up with the test as your safety net.

For **every bug fix**, a failing test that reproduces the bug lands *first*. The test
should fail on the unfixed code and pass once the fix is in — that's how we know the
test actually pins the bug and the fix actually addresses it.

### Behavior, not implementation

Tests assert **what a user (or the other peer, or a caller) observes** — never internal
wiring:

- ✅ what renders, what an interaction produces, what the other peer sees, a handler's
  external effect (an emitted event, a DB write, a returned value).
- ❌ internal state-variable names, effect call-counts, or broad full-component-tree
  snapshots.

A test written this way survives refactors (the layout hook extractions, the TS
migration) because it only breaks when *behavior* breaks.

**Prior art — match this style:**

- `client/src/components/VideoTile.test.jsx` — opens the volume menu and asserts on the
  rendered result without reaching into or mutating call state.
- `server/test/sfu-handlers-authz.test.js` — the capture-and-invoke pattern: register the
  handlers, capture the socket callbacks, invoke them, and assert the *effect* (host action
  applied vs non-host no-op) rather than internals.

## Running the gates locally

The root scripts mirror what CI gates, so green locally closely predicts green in CI.

```bash
npm test           # server + client unit tests
npm run coverage   # unit tests with the non-decreasing coverage ratchet
npm run typecheck  # shared + server + client typecheck
npm run test:e2e   # Playwright two-context E2E
```

### Full pre-merge suite

One command runs the every-PR CI gates, failing fast on the first failing phase:

```bash
# One-time: download Playwright browsers (not part of `npm ci`)
npm run test:e2e:install

# lint (server + client) → npm audit (high) → typecheck → unit/coverage → client build → E2E smoke
npm run verify
```

`verify` mirrors the CI jobs that run on every PR (`Server lint`, `Client lint`,
`npm audit (high)`, `Workspaces typecheck`, `Client tests + build`, `Server tests`
coverage ratchet, and the `Playwright smoke`). A green `verify` means those gates are satisfied. It does **not** run
the path-scoped `Server image smoke` job (a ~15-min Docker build of the production image
that spawns a real mediasoup worker) — CI only runs that when server-image files change
(`server/src/**`, `server/Dockerfile`, `server/.dockerignore`, `server/package*.json`,
`docker-compose.prod.yml`).
The `test:e2e:install` step is a one-time prerequisite — it is *not* part of `npm ci`.
