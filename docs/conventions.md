# Conventions

Project conventions and operational defaults. Add sections here as cross-cutting
concerns land.

## Rate limiting

The server rate-limits both HTTP routes and high-frequency socket events to bound
the abuse/DoS surface on the single-node deployment. Limits are deliberately
**generous** — a legitimate meeting participant never hits them; they only bite
scripted flooding. Everything is env-configurable; the defaults below are baked
in (`server/src/config/env.ts`).

### Topology / client IP

Prod topology: the React frontend is served by Vercel; the EC2 node runs **only**
the API + Socket.io behind an **nginx** reverse proxy on the same host
(`deploy/nginx.conf`), which proxies `/api/*` and `/socket.io/*` to
`localhost:5000` and sets `X-Forwarded-For` / `X-Real-IP`. There is **no ALB or
CloudFront** in front. That is exactly **one** proxy hop, so the app sets
`trust proxy: 1` — `express-rate-limit` then keys on the real client IP from
`X-Forwarded-For` rather than the nginx loopback address.

### HTTP limits (per IP, in-memory fixed window)

Applied as `express-rate-limit` middleware on the auth and room route groups.
Over-limit → **HTTP 429** with a `Retry-After` header (seconds) and body
`{ error, retryAfterMs }` (shape consistent with the socket ack error). Hits are
logged at `warn` (`event: "ratelimit.http"`, route + IP).

| Route group      | Default window | Default max | Window env               | Max env             |
|------------------|----------------|-------------|--------------------------|---------------------|
| `/api/auth/*`    | 60 s           | 60 req      | `RATE_LIMIT_AUTH_WINDOW_MS` | `RATE_LIMIT_AUTH_MAX` |
| `/api/rooms/*`   | 60 s           | 100 req     | `RATE_LIMIT_ROOM_WINDOW_MS` | `RATE_LIMIT_ROOM_MAX` |

### Socket limits (per actor, token bucket)

A lightweight token bucket (`server/src/socket/rate-limit.ts`) wraps the guarded
event handlers. Buckets are keyed by a stable **actor** identity — the
authenticated user id (fallback: handshake client IP, honoring the same one-hop
X-Forwarded-For trust as HTTP) — so parallel sockets or reconnects share one
bucket instead of minting fresh ones. Actor entries are refcounted by live
sockets and evicted only after a **grace period** (default 10 min) past the last
socket's disconnect, so a serial disconnect→reconnect resumes its drained bucket
rather than minting a fresh one. `capacity` = largest instantaneous burst,
`refillPerSec` = sustained allowed rate. Over-limit → the event is **dropped**
(handler never runs); if the event carried an ack callback it gets a structured
`{ error, retryAfterMs }`, otherwise it is silently dropped. Only **sustained
egregious flooding** (consecutive denials past the flood threshold on one socket)
triggers a disconnect. Hits are logged at `warn` (`event: "ratelimit.socket"`).

| Bucket      | Events                                                                 | Capacity | Refill/s | Capacity env                            | Refill env                            |
|-------------|------------------------------------------------------------------------|----------|----------|-----------------------------------------|---------------------------------------|
| `signaling` | `join-room`, all `sfu-*` handshake events (rtp-caps, transport create/connect, produce, consume, resume, get-producers, pause/resume/close-producer) | 300      | 100      | `RATE_LIMIT_SOCKET_SIGNALING_CAPACITY`  | `RATE_LIMIT_SOCKET_SIGNALING_REFILL`  |
| `chat`      | `chat-message`, `sfu-reaction`, `sfu-raise-hand`                        | 20       | 5        | `RATE_LIMIT_SOCKET_CHAT_CAPACITY`       | `RATE_LIMIT_SOCKET_CHAT_REFILL`       |

Flood disconnect threshold (consecutive denials by one actor before the offending socket is force-disconnected): **100** — `RATE_LIMIT_SOCKET_FLOOD_DISCONNECT`.

Host-moderation and teardown socket events are intentionally **not** rate-limited
(already host-gated and low-frequency).

> Out of scope (per PRD #161): CAPTCHA, report/block moderation, and distributed
> (Redis) limiting. In-memory is correct while the deployment is a single node;
> revisit on horizontal scale-out.

## Accessibility (room surface)

Baseline landed with #164; the conventions below apply to any new room UI.

- **Labels**: every icon-only control gets its accessible name from its MUI
  Tooltip `title` (or an explicit `aria-label`). The label describes the
  **action** ("Turn off microphone"), not the state.
- **Toggle state**: toggle controls expose `aria-pressed` = *is the feature
  currently engaged* (mic live, camera live, presenting, hand raised, panel
  open). This is the project's chosen convention — don't switch a control to
  the label-includes-state style.
- **Menu/popover triggers**: expose `aria-haspopup` (`menu`/`dialog`) and
  `aria-expanded`.
- **Announcements**: one polite live region per concern — CallNotifications
  (join/leave/moderation toasts, `role="status"`), the ControlBar's hidden
  `role="status"` region (local mic/camera/hand/share state flips), and the
  chat history (`role="log"`). Prefer reusing these over adding new regions.
- **Panels**: the in-flow side panels (People/Chat) are labeled
  `role="dialog"`s wired through `client/src/hooks/usePanelDialog.ts` — focus
  moves to the panel heading on open, Escape closes, and focus returns to the
  invoking control on close. Real modals keep using MUI `Dialog`.
- **Focus ring**: the global `:focus-visible` ember outline lives in the theme
  (`MuiCssBaseline`). Never remove an outline without a replacement.
- **Tests**: component tests locate controls by role + accessible name
  (Testing Library `getByRole`) so the a11y contract is asserted alongside
  behavior; `e2e/tests/a11y.spec.js` keeps an axe-core scan (zero
  serious/critical) and a keyboard-only control-bar pass as the CI gate.
