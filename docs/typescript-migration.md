# TypeScript migration & shared contracts

This repo is a JavaScript MERN monorepo migrating to TypeScript **leaf-up**, one
module at a time, without ever leaving `main` un-buildable. This document is the
map for that migration.

## Layout

The root `package.json` declares npm **workspaces**:

```
client/   — Vite + React app (.ts/.tsx added incrementally)
server/   — Express + Socket.io + mediasoup (TypeScript)
shared/   — @a-meet/contracts: Socket event + REST DTO types (TypeScript)
e2e/      — Playwright harness
```

A clean `npm install` at the repo root resolves and links every workspace,
including `@a-meet/contracts`.

## The shared contracts package

`shared/` publishes `@a-meet/contracts` — the single source of truth for shapes
that cross the client/server boundary:

- `ClientToServerEvents` + `ServerToClientEvents` — typed Socket.io event maps.
- `SfuRequestMap` — payload and acknowledgement types for SFU request/response signaling.
- `RoomDto` — a representative REST response shape.

The server consumes the hand-raise payload contract, while the client socket and
SFU request wrapper consume the event maps directly. The package remains
TypeScript-source only because every current import is type-only and is erased by
the compiler/loader; runtime constants still require an emitted package build.

## Type-checking

`tsconfig.base.json` enables `strict` and `allowJs`, so JavaScript and
TypeScript coexist. Each workspace has its own `tsconfig.json` extending the base
and a `typecheck` script:

```bash
npm run typecheck            # all workspaces, from the repo root
npm run typecheck:shared
npm run typecheck:client
npm run typecheck:server
```

`checkJs` is **off**: existing `.js`/`.jsx` files are not type-checked yet, so the
gate stays green while client modules are still mostly JavaScript. The server
includes all of `server/src`; the client includes migrated files explicitly.

## Current status

- Server: all `server/src` modules are strict TypeScript and run through `tsx`.
- Client: every source module, including the final `RoomPage.tsx` composition
  layer, is strict TypeScript. Room presence, chat, transcription, and host
  moderation events now consume the shared Socket.io contract map.
- Shared: SFU request/ack contracts are consumed by real server and client modules.
- Remaining JavaScript is limited to legacy test/setup harness files; production
  client source is fully migrated.

## How to migrate a module (leaf-up)

1. Pick a leaf module — one with few or no internal dependents.
2. Rename `.js` → `.ts` (or `.jsx` → `.tsx`), fix the strict-mode errors, and
   import shared shapes from `@a-meet/contracts` instead of redeclaring them.
3. Add the module's directory (e.g. `"src"`) to that package's `tsconfig.json`
   `include` so it is type-checked from now on.
4. Run `npm run typecheck` and the existing build/test commands — both must pass.

Work outward from the leaves so every step keeps `main` buildable and the
JavaScript that has not been converted yet keeps running untouched.
