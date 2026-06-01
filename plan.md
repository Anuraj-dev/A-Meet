# A-Meet — Project Plan

## Vision
Google Meet clone, built from scratch as a learning and portfolio project.
Stack: MERN · JavaScript · Material UI · Socket.io · mediasoup SFU.

---

## Milestone Overview

| # | Focus | Status |
|---|-------|--------|
| M0 | Repo scaffold, Docker, DB connection | ✅ Done |
| M1 | Auth (Google OAuth → JWT cookie) | ✅ Done |
| M2 | Socket rooms + basic WebRTC mesh | ✅ Done |
| M3 | Auth hardening + meeting CRUD | ✅ Done |
| M4 | mediasoup SFU migration | ✅ Done |
| M5 | Screen share + reactions + raise hand + chat toggle | ✅ Done |
| M6 | Huddle UI overhaul | 🔄 In Progress |

---

## M6 — Aperture UI Overhaul

> Deep-space / cosmic aesthetic: dark-void canvas, Three.js constellation,
> glassmorphism panels, Outfit + DM Sans typography, gradient accents.
> Branch: `feat/aperture-ui`

### M6 tasks
- [x] M6.1 Install `three` in `client/`; add Outfit + DM Sans + JetBrains Mono to `index.html`
- [x] M6.2 Update `theme.js` with Aperture design tokens (palette, typography, component overrides)
- [x] M6.3 Create `SpaceCanvas.jsx` — Three.js constellation (nodes, links, polyhedra, parallax)
- [x] M6.4 Update `LandingPage.jsx` — Aperture landing (hero, feature cards, glass header)
- [x] M6.5 Update `LobbyPage.jsx` — Aperture lobby (glass camera preview, join panel)
- [x] M6.6 Update `BrandMark.jsx` — Aperture brand mark style
- [x] M6.7 `npm run build` passes — zero errors ✅
- [ ] M6.8 Manual verify (Anuraj) — visuals match Aperture spec, constellation runs, all flows work
- [ ] M6.9 /journal M6

### Design tokens (Aperture)
- Background void: `#060810`
- Text: `#f2f4f9`, Muted: `#94a3b8`, Faint: `#475569`
- Blue: `#5b8bff`, Blue-deep: `#1a73e8`, Violet: `#9334e6`, Violet-soft: `#a855f7`
- Teal: `#00f5d4`, Green: `#34d399`, Amber: `#f5b542`
- Fonts: Outfit (display), DM Sans (body), JetBrains Mono (mono)

### Notes
- Three.js constellation: 70 nodes + links (dist < 6.2) + 6 polyhedra + wireframe torus ring
- Mouse parallax on camera with easing 0.04
- Shimmer animation on Join button via `::before` pseudo-element
- `body.frozen` guard not needed in React — animation state managed by CSS keyframes in theme

---

## Conventions (quick ref)
- Files: `kebab-case`; Components: `PascalCase.jsx`; Models: `PascalCase` singular
- Ports: server `5000` · client `5173` · MongoDB `27017` · mongo-express `8081`
- Commits only when Anuraj asks
