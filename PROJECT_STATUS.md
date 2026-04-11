# PROJECT STATUS — Monopoly Deal Online

> **Last updated:** 2026-04-10
> **Repo:** github.com/TreyMangat/monopoly-deal-online
> **Live:** https://monopoly-deal-online.onrender.com
> **Owner:** Trey
> **Branding:** Keeping "Monopoly Deal" name — private family/friends use only, not published.

---

## Architecture Overview

- **Server:** Node.js 18+ / TypeScript (strict) / `ws` WebSocket library
- **Game Engine:** Pure TypeScript, server-authoritative, no I/O
- **Web Client:** Single-file browser client (`public/index.html`) — vanilla HTML/CSS/JS, PWA-enabled
- **iOS Client:** SwiftUI app (31 Swift files) — connects to same server
- **Hosting:** Render free tier, Docker, auto-deploy on push to main
- **Cold starts:** Free tier spins down after ~15min idle; first request ~30s to wake
- **Multiplayer:** WebSocket (wss://), 2-6 players across networks, room codes

---

## Codebase Stats

| Metric | Count |
|---|---|
| TypeScript (src/) | 9,871 LOC (16 files) |
| Web client (HTML/CSS/JS) | 3,973 LOC (1 file) |
| Swift (iOS client) | 5,939 LOC (31 files) |
| **Total code** | **~19,800 LOC** |
| Tests passing | 150 (5 test files) |
| Test breakdown | 44 bot + 33 engine + 30 full-game + 23 server + 20 vote |

---

## File Map

```
src/shared/
  types.ts              291 — All interfaces and enums (Card, GameState, PlayerAction, etc.)
  constants.ts           80 — Numeric game rules (set sizes, rent tiers, hand limits)
  cardData.ts           457 — All 106 cards defined, deck builder function
  protocol.ts           106 — WebSocket message serialization helpers

src/engine/
  GameEngine.ts        1093 — Core: initializeGame() + applyAction() handles every move
  helpers.ts            288 — Rent calculation, set checking, shuffle, card lookup utilities
  BotPlayer.ts         2108 — Bot AI: phase-aware meta strategy (easy/medium/hard)
  BotManager.ts          99 — Bot lifecycle, naming, difficulty tracking

src/server/
  GameRoom.ts          1341 — Single game room (state, actions, bots, chat, timers, broadcasting)
  RoomManager.ts        210 — Room lifecycle (create, join, cleanup, room codes)
  index.ts              573 — HTTP + WebSocket entry point, message routing

src/__tests__/
  engine.test.ts        931 — Engine unit tests (33)
  bot.test.ts          1090 — Bot AI tests (37)
  full-game.test.ts     428 — Full-game integration tests (8)
  server-hardening.test.ts 389 — Timer, disconnect, auto-replace tests (11)
  vote.test.ts          387 — Post-game vote system tests (20)

public/
  index.html           3973 — Complete web client (CSS + HTML + JS in single file)
  manifest.json          22 — PWA manifest
  service-worker.js     103 — Offline support + cache strategy
  icons/                    — PWA icons (192px, 512px)
  images/                   — Logo image

ios/
  CLAUDE.md                 — iOS client context for Claude
  MonopolyDeal/             — Xcode project (31 Swift files)

Config:
  CLAUDE.md              96 — Claude Code project context
  PROJECT_STATUS.md         — This file
  HANDOFF.md                — Agent onboarding document
  Dockerfile             16 — Docker build config
  render.yaml            10 — Render deployment config
  package.json           34 — Dependencies + scripts
  tsconfig.json          26 — TypeScript config
```

---

## Completed Work

### Sprint 1: Engine + Server ✅
- [x] Card data manifest — all 106 cards with values, rent tiers, set sizes
- [x] Game engine — all player actions via pure `applyAction()` function
- [x] Just Say No with counter-chain
- [x] WebSocket server with room codes, join/create/reconnect
- [x] Per-player state filtering (opponents' hands hidden)
- [x] Deploy configs: Dockerfile, render.yaml

### Sprint 2: Server Hardening ✅
- [x] Turn timers (60s turn, 30s response, 10s disconnected response)
- [x] Disconnect handling with reconnect grace period (120s)
- [x] Engine edge cases — reshuffle on empty deck, payment wilds, house/hotel teardown
- [x] Deploy to Render — live at https://monopoly-deal-online.onrender.com

### Sprint 3: iOS Client ✅
- [x] SwiftUI app with WebSocket client layer
- [x] All game screens: menu, create, join, game board, game over
- [x] Card interaction, payment modal, JSN chain UI, opponent inspection, discard

### Sprint 4: PWA + Visual Polish ✅
- [x] PWA manifest + service worker (offline support, app install)
- [x] Navy-teal theme with modern cartoony board-game aesthetic
- [x] Unique action card colors (Pass Go white, Debt Collector blue, Birthday pink, etc.)
- [x] Wild card gradients (2-color split, rainbow for wild-all)
- [x] Card layout: bank value badge, centered name, type label, rent tiers
- [x] Hover effects, your-turn pulsing border, action toast notifications
- [x] Logo image on landing and lobby screens
- [x] Mobile responsive card sizing

### Sprint 5: Bot System ✅
- [x] Three difficulty levels: Easy (random), Medium (fair), Hard (meta strategy)
- [x] Hard bot: phase-aware strategy (early banking, mid-game strategy, late-game disruption)
- [x] Threat scoring, opponent modeling, payment optimization
- [x] Bot pacing: slower delays (2-4.5s) with "thinking" indicator for readability
- [x] Bot turn banner with animated dots
- [x] Difficulty labels in lobby and in-game (color-coded)
- [x] Auto-replace disconnected players with medium bot after grace period
- [x] Bot inherits disconnected player's name + "(Bot)" suffix

### Sprint 6: Vote System + Host Controls ✅
- [x] Post-game vote: "Play Again" vs "Leave" with 30s countdown
- [x] Host can force-end active games
- [x] Early quit for players who haven't played any cards
- [x] Replace-with-bot button for disconnected players

### Sprint 7: Chat + Bug Fixes ✅
- [x] In-game chat system (slide-up panel, rate-limited, sanitized, unread dot)
- [x] Randomized starting player (not always host)
- [x] Fixed Just Say No button (z-index was behind payment modal)
- [x] Prevent double Debt Collector targeting same player per turn
- [x] Unified discard pile colors with hand card CSS
- [x] Rent tier display on property cards
- [x] Bank log privacy (opponents see "added 1 card" not dollar values)
- [x] FIFO bank display (show card count, not lowest value)
- [x] Stacked discard pile (top 2 cards visible)
- [x] Fixed opponent property color label clipping
- [x] Dramatic steal modal with screen effects
- [x] Payment received confirmation modal

### Sprint 8: UX Polish ✅
- [x] Opponent bank shows front card value ($XM) visible to all players
- [x] Chat toast notification (teal popup with sender + preview, 4s dismiss, click to open)
- [x] Discard pile colors unified with hand cards (rent cards show 2-color split, not purple)
- [x] Opponent turn countdown timer (seconds display next to name, pulse under 10s, red under 5s)
- [x] Board preview in steal/JSN modal (your sets + attacker sets + JSN count)
- [x] Stronger your-turn indicator (teal glow on deck, floating arrow, thicker border pulse)
- [x] Compact opponent bar for 4+ players on mobile (collapsed property pills, truncated names)

### Sprint 9: Critical Bug Fixes ✅
**Room-vanish investigation** — Both players saw "No room found" mid-game near a win.
- [x] Root cause: uncaught exception in `applyAction()` could crash the entire Node process, killing all in-memory rooms. Secondary: cleanup race condition deleted rooms during reconnect grace period.
- [x] Wrapped `applyAction()` and `broadcastGameState()` in try/catch — errors logged + sent to client, room survives
- [x] Added `isProtectedFromCleanup()` — rooms with active grace timers or in Voting/Playing state immune to cleanup
- [x] Fixed `isEmpty()` to exclude bot players (bots have `ws=null` but are active)
- [x] Added ISO-timestamped diagnostic logging (`[ROOM:code]`, `[SERVER]` prefixes) on all lifecycle events
- [x] 6 server-hardening regression tests (simultaneous disconnect, vote state, engine error resilience)

**Engine win-path audit** — 6 bugs in win-detection logic that could prevent wins or cause state corruption.
- [x] `checkAutoEndTurn` GameOver guard — prevents clobbering a won game with Discard phase
- [x] `playPropertyCard` — win check moved before auto-end-turn; return early on win
- [x] `moveWildCard` — added missing win check (moving wild to complete 3rd set)
- [x] `endTurn` — win check before hand-limit enforcement (winning player shouldn't discard)
- [x] `handlePayment` — added win check when receiving property as payment completes 3rd set
- [x] `handleAcceptAction` — moved `checkAutoEndTurn` into else branch of win check
- [x] Replaced unsafe `!` non-null assertions with explicit null checks in payment/accept paths
- [x] 11 win-path regression tests (wild cards, Deal Breaker, payment win, action 3/3, hand > 7, house/hotel, moveWild)
- Full investigation details: `INVESTIGATION_ROOM_VANISH.md`

### Sprint 10: Bot Intelligence + UX ✅
- [x] Funny bot names with rotation pool (Bluebert, Garebear, Chingo, Osama, Mergatroid, Snorbax, Klaus, Pibbles, Tronk, Wuzzle)
- [x] Color-coded property picker rows for Sly Deal, Forced Deal, Deal Breaker, House/Hotel modals
- [x] Medium bot intelligence: never banks Deal Breaker, Sly Deal, Forced Deal, or JSN
- [x] Bot payment optimization: minimum-overpayment algorithm (subset-sum for ≤15 cards, greedy with post-pruning for larger)
- [x] Updated discard priority: Deal Breaker highest keep-score (45), Sly Deal (30), Forced Deal (28)
- [x] 7 new bot tests (payment optimization, medium banking behavior)

---

### Bug Fix: Multi-Group Property Overflow ✅
- [x] Properties played on a completed set now start a new incomplete set instead of merging (e.g. 3/3 Green + 1 card → 3/3 + 1/3, not 4/3)
- [x] Rent calculation uses best group of a color (complete set with house/hotel bonuses)
- [x] House/Hotel placement targets complete sets only
- [x] Deal Breaker steals complete set specifically, leaves incomplete
- [x] Sly Deal can target cards in incomplete sets even when complete set of same color exists
- [x] Win condition unchanged: 3 complete sets of DIFFERENT colors (deduplicates by color)
- [x] Bot AI updated: all `.find()` property lookups now multi-group aware
- [x] Client updated: color lists deduplicated, rent display uses best group, Deal Breaker modal targets complete sets
- [x] 11 regression tests covering overflow, rent, house, Deal Breaker, Sly Deal, wild cards, win condition, payment, multi-size sets

### Sprint 11: Connection Resilience ✅
- [x] Server heartbeat changed from 15s/1-miss to 25s/2-miss (50s tolerance) — keeps Render proxy alive
- [x] Client reconnect hardened: exponential backoff (500ms→30s), up to 5 minutes total, with countdown display
- [x] Session persistence to sessionStorage — survives page refresh and PWA restart
- [x] Auto-reconnect on page load if session exists
- [x] Online/offline event listeners — pauses retries when offline, resumes immediately on network return
- [x] Specific server error codes: ROOM_EXPIRED, PLAYER_NOT_IN_ROOM, INVALID_SESSION — client stops retrying on unrecoverable errors
- [x] Disconnect broadcast includes grace period duration for client countdown
- [x] Turn timer confirmed paused during disconnected player's grace period
- [x] 6 reconnect regression tests (turn pause, valid rejoin, invalid session, nonexistent room, rapid cycles, grace period)
- Full analysis: `INVESTIGATION_RECONNECT.md`

## Current Sprint: Polish & Bug Fixes

### Outstanding Items
- [ ] Card animations (flip, slide, deal)
- [ ] Sound effects system (currently basic)
- [ ] Haptic feedback (iOS)
- [ ] iOS Xcode integration testing on simulator + physical device
- [ ] App Store prep
- [ ] Host "clear chat" button (server handler exists, UI button not wired)

### Known Issues
- 1 flaky test: "should not allow early quit after cards have been played" — depends on random card deal; passes in isolation
- Free tier cold starts (~30s first load)
- No reconnect for chat history (new connection starts with empty chat)

---

## Game Rules — Quick Reference

- 106 cards/deck (212 for 6 players)
- Draw 2/turn (5 if hand empty at start of turn)
- Play up to 3 cards/turn
- 7-card hand limit (discard excess at end of turn, non-property first)
- Win: 3 complete property sets of DIFFERENT colors
- Just Say No chains (counter with another JSN)
- No change on payment (overpayment is lost)
- House/Hotel only on complete sets (not railroad/utility); Hotel requires House
- Can't steal from complete sets (Sly Deal, Forced Deal)
- CAN steal complete sets (Deal Breaker)
- Can't target the same player with Debt Collector twice in one turn
- Wild cards: swap between valid colors costs 1 action; rainbow wild ($0) can't be used as payment
- Property cards can't be discarded if you have enough non-property cards to discard

---

## Agent Workflow

- **Claude Code (terminal):** Primary implementation tool — parallel work, auto-commit
- **ChatGPT:** Design, documentation, iOS-specific guidance
- **Rule:** Always update this file when a sprint completes
