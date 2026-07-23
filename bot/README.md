# A-Meet Discord bot

A small [discord.js](https://discord.js.org) process that lets Discord users create
A-Meet meetings from a channel. It is a **thin adapter** — it holds no meeting logic
and talks to the A-Meet server only through the `/api/integrations/discord` API
(authenticated with a shared bot API key). The bot and the API server are separate
processes: a Discord outage never affects the API and vice-versa.

## Commands (slash-only, no Message Content intent)

- **`/meet link`** — one-time Discord ↔ A-Meet account linking. Replies **ephemerally**
  (only the invoker sees it) with a short-lived confirmation URL to open in the browser
  while signed in to A-Meet.
- **`/meet create`** — creates an instant meeting hosted by the linked user and posts a
  **public embed** with the join link (`<CLIENT_URL>/lobby/<roomId>`) and "Started by @user".
  If the account isn't linked yet, replies ephemerally prompting `/meet link`.

## Configuration

Copy `.env.example` to `.env` and fill it in. Variables:

| Var | Required | Purpose |
|---|---|---|
| `DISCORD_TOKEN` | yes | Bot token (secret) used to log the gateway client in. |
| `DISCORD_CLIENT_ID` | yes | Application id, needed to register slash commands. |
| `DISCORD_GUILD_ID` | no | If set, registers commands to that guild (instant, dev-friendly); else global. |
| `SERVER_URL` | yes | Base URL of the A-Meet API server. |
| `CLIENT_URL` | yes | Base URL of the web client, used to build meeting links. |
| `DISCORD_BOT_API_KEY` | yes | Shared secret (`X-Bot-Api-Key`); must match the server's value. Secret. |

Secrets are never committed. In production they come from SSM SecureStrings via the
container environment.

## Scripts

```bash
npm --prefix bot run register     # register/update the /meet slash command with Discord
npm --prefix bot run dev          # run with reload (tsx watch)
npm --prefix bot start            # run once
npm --prefix bot test             # unit tests (no real Discord)
npm --prefix bot run typecheck
npm --prefix bot run lint
```

## First-time setup

1. Create an application + bot in the [Discord Developer Portal](https://discord.com/developers/applications);
   copy the **bot token** and **application id** into `.env`.
2. Invite the bot to a server with the `applications.commands` (and `bot`) scopes.
3. `npm --prefix bot run register` to publish the `/meet` command.
4. Set `DISCORD_BOT_API_KEY` to the same value configured on the server.
5. `npm --prefix bot start`.
