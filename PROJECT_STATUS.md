# PROJECT STATUS — Monopoly Deal Online

> **Last updated:** Sprint 3 complete (2026-04-10)
> **Repo:** github.com/TreyMangat/monopoly-deal-online
> **Owner:** Trey

---

## Architecture Overview

- **Server:** Node.js + TypeScript + `ws` WebSocket library
- **Game Engine:** Pure TypeScript, server-authoritative, no I/O
- **Client (current):** Browser test client (vanilla HTML/CSS/JS)
- **Client (planned):** iOS SwiftUI app
- **Hosting target:** Render free tier (Docker)
- **Multiplayer:** WebSocket, 2-6 players across different networks
- **Room system:** 6-char alphanumeric codes, host starts game

## File Map

```
src/shared/types.ts        — All TypeScript interfaces and enums
src/shared/constants.ts    — Numeric game rules (set sizes, rent tiers)
src/shared/cardData.ts     — All 106 cards, deck builder
src/shared/protocol.ts     — WebSocket message helpers
src/engine/GameEngine.ts   — Core: initializeGame() + applyAction()
src/engine/helpers.ts      — Rent calc, set checking, shuffle, lookups
src/server/GameRoom.ts     — Single game room (state + broadcast)
src/server/RoomManager.ts  — Room lifecycle (create, join, cleanup)
src/server/index.ts        — HTTP + WebSocket entry point
src/__tests__/engine.test.ts — Vitest engine unit tests (32)
src/__tests__/server-hardening.test.ts — Timer + disconnect tests (11)
src/__tests__/full-game.test.ts — Full-game integration tests (8)
public/index.html          — Browser test client (Sprint 2)
scripts/test-connection.ts — E2E WebSocket test script
CLAUDE.md                  — Claude Code project context
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

### Sprint 3.5 (current) — Xcode Integration & Testing
- [ ] Create Xcode project and add all Swift files
- [ ] Connect to live Render server and test
- [ ] Fix any compilation issues
- [ ] Test full game flow on simulator
- [ ] Test on physical iPhone

### Sprint 4 (planned) — Polish
- [ ] Card artwork / programmatic rendering
- [ ] Animations (card flip, slide, deal)
- [ ] Sound effects
- [ ] Haptic feedback
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
