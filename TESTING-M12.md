# M12 Testing — Meeting-room redesign (ember re-skin + Meet feature parity)

## Setup
- **Open the app at → http://localhost:5174** (NOT 5173 — that's your other app).
- Backend `:5000`, MongoDB `:27017` (fresh empty DB), client `:5174` are all running.
- **For a 2nd participant:** open an **incognito window** (or a 2nd browser) → paste the
  meeting's **joining link** → land on the lobby → Join. Same Google account is fine —
  host moderation is keyed by socket, not user, so two tabs of you still works.
  - Camera may be "busy" in the 2nd tab — just join with camera **off** there if so.
- **Host = whoever created the meeting** ("New meeting"). Moderation controls only show
  for the host.
- ⚠️ `MEDIASOUP_ANNOUNCED_IP` is loopback → media only flows **same-machine** (multi-tab).
  A second physical device over the network will connect but won't see/hear video.

---

## 1. Re-skin (visual) — do this first, solo
- [ ] Whole room is **warm graphite + ember**, not the old cold blue/purple.
- [ ] Control-bar active states, focus rings, primary buttons = **ember** (#e8623d).
- [ ] **Speaking indicator stays GREEN** — talk with mic on: green ring/edge glow on your tile.
- [ ] Fonts: headings Bricolage Grotesque, body Plus Jakarta Sans (matches landing/lobby).
- [ ] Mute icon red, raise-hand amber. No leftover blue/purple anywhere.

## 2. People panel + single right rail
- [ ] Control bar has a **People** button (with a count badge when >1 person).
- [ ] Click **People** → panel opens on the right; click **Chat** → People closes, Chat opens
      (and vice-versa) — only ONE panel at a time.
- [ ] People list shows each person: avatar, name, mic/cam status, raise-hand, "(You)".
- [ ] Search box filters the list by name.
- [ ] Unread chat badge still appears on the Chat button when chat is closed.

## 3. Pin (local) + per-tile menu + fullscreen — needs 2 tabs
- [ ] Hover a tile → bottom-right **⋮** button. Open it: **Pin for me / Spotlight / Fullscreen**
      (+ volume slider on remote tiles).
- [ ] **Pin for me** → that person goes to a big stage + others in a side rail. A **pin badge**
      shows on their tile. Unpin returns to grid. (Pin is LOCAL — the other tab is unaffected.)
- [ ] Pin from the **People panel** ⋮ menu too — same result.
- [ ] **Fullscreen** → tile fills the screen; Esc exits.

## 4. Host spotlight — needs 2 tabs (act as host)
- [ ] As host, open a person's ⋮ (tile or People panel) → **Spotlight for everyone**.
- [ ] BOTH tabs jump to that person on the big stage (spotlight applies to everyone).
- [ ] **Remove spotlight** clears it for everyone.
- [ ] Spotlight overrides a local pin while active.

## 5. Layout chooser + pagination
- [ ] Control bar **layout** button (desktop) → menu: Auto / Tiled / Spotlight / Sidebar, with a
      check on the active one.
- [ ] **Tiled** = grid always. **Spotlight** = one big, no rail. **Sidebar** = one big + rail.
      **Auto** = smart (alone/solo/grid).
- [ ] Pagination: with many tiles (open several tabs, or just trust the cap) the grid shows
      **9 max on desktop / 6 on mobile** with left/right arrows + an "n / m" page indicator;
      arrows page through the rest instead of shrinking tiles.

## 6. Host moderation — needs 2 tabs (host acts on the other person)
- [ ] **Mute** (host → person's ⋮ → Mute): the other tab's mic goes muted, its tile shows muted,
      and that tab gets a "**You were muted by the host**" note. Confirm it's enforced (the muted
      tab can't just keep talking).
- [ ] The muted tab **can un-mute itself** again (host can't force mics back on).
- [ ] **Mute all** (People panel, host) → everyone else muted; you (host) stay unmuted.
- [ ] **Ask to unmute** (host → muted person's ⋮) → that tab gets an **"X asked you to unmute"**
      snackbar with a one-tap **Unmute** button. Nothing happens to their mic until they tap it.
- [ ] **Ask all to unmute** (People panel) → all muted tabs get the prompt.
- [ ] **Remove from call** (host → person's ⋮ → Remove) → that tab leaves the meeting.

## 7. Regression — make sure nothing M12 broke the old stuff
- [ ] Chat send/receive + unread badge.
- [ ] Reactions (emoji) — per-tile popup + bottom-left floating stream.
- [ ] Raise hand — tile badge + sorts to top of grid/People.
- [ ] Screen share (desktop) — present a tab/window; presentation layout; stop presenting.
- [ ] Per-peer volume slider (remote tile ⋮) still works.
- [ ] Leave call (host gets End-for-everyone vs Leave dialog).

---

## Known/expected
- 2nd device over LAN won't get media (loopback announced IP) — same-machine tabs are the way.
- DB is empty/fresh this session.
- `CLIENT_URL` is temporarily `5174` in `server/.env` — revert to `5173` when that port frees.

## Report back
For anything that fails: which checkbox, what you saw vs expected, and any red errors in the
browser devtools console (F12) or the server log.
