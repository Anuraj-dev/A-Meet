# Discord Bot — design spec (v1)

Status: approved 2026-07-23 · Tickets: see "Delivery split" at the bottom.

## Goal

A Discord bot for A-Meet. In any server it's invited to, `/meet create` creates a real A-Meet
meeting whose **host/admin is the Discord user who ran the command**, and posts the join link
publicly in the channel so everyone can click through and join. Host rights work because users
link their Discord account to their A-Meet account once via `/meet link`.

## v1 scope

- `/meet link` — one-time Discord ↔ A-Meet account linking.
- `/meet create` — instant meeting, link posted to the channel, requester is host.
- Out of scope for v1: scheduled meetings, list-my-meetings, explicit unlink (re-linking
  overwrites), @mention text commands, any in-Discord meeting controls.

## Architecture

- New **`bot/` workspace** alongside `server/` / `client/` / `shared/` — strict TS, Vitest,
  same lint/CI conventions as the rest of the monorepo.
- Small Node process using **discord.js** with slash commands only (no privileged
  Message Content intent needed).
- The bot holds **no meeting logic**: it is a thin adapter that calls new A-Meet server
  endpoints over HTTP, authenticated with a **bot API key** (new server env secret; SSM
  SecureString in prod, `.env` locally — never committed).
- Prod: one more container in the existing EC2 docker-compose stack (`restart: always`,
  covered by the existing self-healing/observability setup).

## Account linking (`/meet link`)

- New Mongo collection **`DiscordLink { discordId (unique), userId, createdAt }`**.
- Flow:
  1. User runs `/meet link`. Bot calls `POST /api/integrations/discord/link-token`
     (bot API key auth, body: `{ discordId }`).
  2. Server mints a short-lived (~10 min) single-purpose JWT containing the Discord ID.
  3. Bot replies **ephemerally** (visible only to the requester) with
     `https://<client>/link/discord?token=…`.
  4. User opens the URL in a browser while logged into A-Meet (or logs in first via the
     normal auth flow). A small client page calls
     `POST /api/integrations/discord/link` with the token; the server verifies the token
     **and** the normal auth cookie, then upserts the `DiscordLink` mapping.
  5. Page confirms "Discord linked".
- Re-running `/meet link` overwrites the previous mapping (upsert on `discordId`). That is
  the whole unlink/relink story for v1.

## Creating a meeting (`/meet create`)

- Bot calls `POST /api/integrations/discord/rooms` (bot API key auth, body: `{ discordId }`).
- Server looks up `DiscordLink`:
  - **Not linked** → 404-style error; bot replies ephemerally:
    "Link your account first with `/meet link`."
  - **Linked** → create the room exactly as `createRoom` does today
    (`createUniqueRoom({ host, admin })` with the linked user's id), return `{ roomId }`.
- Bot posts a **public embed in the channel**: the meeting URL and "Started by @user".
  Everyone can see it and join through the normal A-Meet browser flow.

## Security

- Bot API key checked by a dedicated middleware; **only** the `/api/integrations/discord/*`
  endpoints accept it — normal user routes are untouched.
- Link tokens are short-lived, single-purpose (distinct JWT claim/type from auth tokens),
  and bound to one Discord ID. Replay after a successful link is a harmless re-upsert of
  the same mapping.
- The room-creating endpoint trusts the bot to report the caller's Discord ID; the API key
  is therefore host-grade secret material — SSM in prod, never logged.

## Error handling

- Bot and API server are separate processes: Discord outages/restarts never affect the API.
- Every bot failure answers in-channel (ephemeral where private) with a friendly error —
  never silence.
- Server endpoints validate bodies (zod, matching existing validation conventions).

## Testing (strict TDD, per CONTRIBUTING.md)

- Server: unit tests for the two integration endpoints, the bot-API-key middleware, and
  link-token mint/verify (expiry, wrong-type token, unknown discordId, upsert behavior).
- Bot: command handlers tested with mocked Discord interactions + mocked HTTP client
  (linked / not-linked / server-error paths; ephemeral vs public reply routing).
- No real Discord in CI; E2E out of scope for v1.

## Delivery split (2 tickets)

1. **Server: Discord integration endpoints + linking** — `DiscordLink` model, bot-API-key
   middleware, `POST /api/integrations/discord/link-token`, `POST /api/integrations/discord/link`,
   `POST /api/integrations/discord/rooms`, client `/link/discord` confirmation page.
2. **Bot: `bot/` workspace + Discord commands** — discord.js process, slash-command
   registration, `/meet link` and `/meet create` handlers, HTTP client for the integration
   API, compose/deploy wiring. Depends on ticket 1's API contract.
