# PROJECT STATUS — Monopoly Deal Online

> **Last updated:** Sprint 4 in progress (2026-04-10)
> **Repo:** github.com/TreyMangat/monopoly-deal-online
> **Owner:** Trey

---

## Architecture Overview

- **Server:** Node.js + TypeScript + `ws` WebSocket library
- **Game Engine:** Pure TypeScript, server-authoritative, no I/O
- **Web Client:** Browser client (vanilla HTML/CSS/JS) — PWA-enabled
- **iOS Client:** SwiftUI app (28 Swift files)
- **Hosting:** Render free tier (Docker) — https://monopoly-deal-online.onrender.com
- **Multiplayer:** WebSocket, 2-6 players across different networks
- **Room system:** 6-char alphanumeric codes, host starts game

## Codebase Stats

| Metric | Count |
|---|---|
| TypeScript (server) | 3,440 LOC (12 files) |
| TypeScript (tests) | 1,703 LOC (3 files) |
| **TypeScript total** | **5,143 LOC** |
| Swift (iOS client) | 5,455 LOC (28 files) |
| Web client (HTML/CSS/JS) | 1,498 LOC (1 file) |
| Tests passing | 51 (32 engine + 11 server + 8 integration) |

## File Map

```
src/shared/types.ts          273 — All TypeScript interfaces and enums
src/shared/constants.ts       80 — Numeric game rules (set sizes, rent tiers)
src/shared/cardData.ts       444 — All 106 cards, deck builder
src/shared/protocol.ts       106 — WebSocket message helpers
src/engine/GameEngine.ts    1040 — Core: initializeGame() + applyAction()
src/engine/helpers.ts        283 — Rent calc, set checking, shuffle, lookups
src/server/GameRoom.ts       648 — Single game room (state + broadcast)
src/server/RoomManager.ts    210 — Room lifecycle (create, join, cleanup)
src/server/index.ts          356 — HTTP + WebSocket entry point
src/__tests__/engine.test.ts           898 — Vitest engine unit tests (32)
src/__tests__/server-hardening.test.ts 384 — Timer + disconnect tests (11)
src/__tests__/full-game.test.ts        421 — Full-game integration tests (8)
public/index.html           1498 — Web client (PWA, card rendering)
public/manifest.json          24 — PWA manifest
public/service-worker.js     101 — Offline support + cache strategy
public/icons/                    — PWA icons (192px, 512px)
scripts/test-connection.ts   227 — E2E WebSocket test script
ios/                             — SwiftUI iOS client (28 files, see ios/CLAUDE.md)
CLAUDE.md                     96 — Claude Code project context
```

## Completed Work

### Sprint 1 ✅
- [x] Card data manifest — all 106 cards with values, rent tiers, set sizes
- [x] Game engine — all player actions: property, money, bank, rent, all action cards
- [x] Just Say No with counter-chain
- [x] WebSocket server with room codes, join/create/reconnect
- [x] Per-player state filtering (opponents' hands hidden)
- [x] 51 tests passing (32 engine + 11 server hardening + 8 integration)
- [x] Fixed Double Rent — proper typed state field instead of `any` hack
- [x] Deploy configs: Dockerfile, railway.json, Procfile, render.yaml
- [x] E2E test script (scripts/test-connection.ts)
- [x] CLAUDE.md for Claude Code context

### Sprint 2 ✅
- [x] Browser test client (public/index.html) — full playable game in browser
- [x] Server hardening — turn timers, disconnect handling, rate limiting
- [x] Engine edge cases — reshuffle, payment wilds, house/hotel teardown
- [x] Deploy to Render — https://monopoly-deal-online.onrender.com

### Sprint 3 ✅ — iOS Client
- [x] Xcode project setup (SwiftUI)
- [x] WebSocket client layer
- [x] Main menu / create / join screens
- [x] Game board screen
- [x] Card interaction (tap → action sheet)
- [x] Payment demand modal
- [x] Just Say No chain UI
- [x] Opponent inspection view
- [x] Discard selection
- [x] Action history log
- [x] Game over screen

### Sprint 4 (in progress) — PWA + Polish
- [x] PWA manifest + service worker (offline support)
- [x] PWA icons (192px, 512px)
- [x] Card rendering — color-coded backgrounds by type (property/money/action/rent)
- [x] Wild card gradients (2-color split, rainbow for wild-all)
- [x] Card layout: bank value badge, centered name, type label
- [x] Hover effects (scale + shadow)
- [x] Your-turn pulsing teal border indicator
- [x] Action toast notifications (3s centered popup on each play)
- [x] Room code: monospace font + copy-to-clipboard button
- [x] Mobile responsive card sizing (viewport < 400px)
- [ ] Card animations (flip, slide, deal)
- [ ] Sound effects
- [ ] Haptic feedback (iOS)
- [ ] Xcode integration testing on simulator + physical device
- [ ] App Store prep

## Game Rules — Quick Reference

- 106 cards/deck (212 for 6 players)
- Draw 2/turn (5 if hand empty)
- Play up to 3 cards/turn
- 7-card hand limit
- Win: 3 complete sets of DIFFERENT colors
- Just Say No chains (counter with another JSN)
- No change on payment
- House/Hotel only on complete sets (not railroad/utility)
- Hotel requires House first
- Can't steal from complete sets (Sly Deal, Forced Deal)
- CAN steal complete sets (Deal Breaker)

## Agent Workflow

- **Claude Chat (claude.ai):** Project manager — architecture, planning, prompts
- **Claude Code (terminal):** Implementation — parallel terminals, non-overlapping tasks
- **ChatGPT:** Design, documentation, research, iOS-specific guidance
- **Rule:** Always update this file when a sprint completes
