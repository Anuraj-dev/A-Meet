# TypeScript migration & shared contracts

This repo is a JavaScript MERN monorepo migrating to TypeScript **leaf-up**, one
module at a time, without ever leaving `main` un-buildable. This document is the
map for that migration.

## Layout

The root `package.json` declares npm **workspaces**:

```
client/   — Vite + React app (JavaScript today, .ts/.tsx added incrementally)
server/   — Express + Socket.io + mediasoup (JavaScript today)
shared/   — @a-meet/contracts: Socket event + REST DTO types (TypeScript)
e2e/      — Playwright harness
```

A clean `npm install` at the repo root resolves and links every workspace,
including `@a-meet/contracts`.

## The shared contracts package

`shared/` publishes `@a-meet/contracts` — the single source of truth for shapes
that cross the client/server boundary:

- `HandRaisedPayload` + the `SocketEvent` name map — a representative Socket event.
- `RoomDto` — a representative REST response shape.

Both ends type-check against these exports today via the
`client/typecheck` and `server/typecheck` sample modules. The package is
TypeScript-source only for now (no build step); it is consumed purely for types
through the `paths` mapping in `tsconfig.base.json`. When the first runtime
JavaScript module needs to import it, add a `tsc` build that emits to `dist/`
and point `exports`/`main` at the compiled output.

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
gate stays green while the codebase is still mostly JavaScript. Only files listed
in each package's `tsconfig.json` `include` are checked — today that is just the
`typecheck/` sample module.

## How to migrate a module (leaf-up)

1. Pick a leaf module — one with few or no internal dependents.
2. Rename `.js` → `.ts` (or `.jsx` → `.tsx`), fix the strict-mode errors, and
   import shared shapes from `@a-meet/contracts` instead of redeclaring them.
3. Add the module's directory (e.g. `"src"`) to that package's `tsconfig.json`
   `include` so it is type-checked from now on.
4. Run `npm run typecheck` and the existing build/test commands — both must pass.

Work outward from the leaves so every step keeps `main` buildable and the
JavaScript that has not been converted yet keeps running untouched.
