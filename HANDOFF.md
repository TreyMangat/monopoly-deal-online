# HANDOFF — Monopoly Deal Online

This document gets any new AI agent up to speed on the project in one read.

## What Is This?

A real-time multiplayer Monopoly Deal card game built with TypeScript, WebSockets, and a single-file web client. Server-authoritative architecture — the game engine is pure logic with no I/O, clients send actions over WebSocket, the server validates everything and broadcasts filtered state (opponents' hands are never sent). Supports 2-6 players across networks with room codes, AI bots at three difficulty levels, in-game chat, and a post-game vote system. Live at https://monopoly-deal-online.onrender.com. Private family project — not a commercial product.

## Stack

| Layer | Tech |
|---|---|
| Runtime | Node.js 18+ |
| Language | TypeScript (strict mode) |
| WebSocket | `ws` library |
| Testing | Vitest (109 tests) |
| Web Client | Vanilla HTML/CSS/JS in single file (`public/index.html`, ~4K LOC) |
| iOS Client | SwiftUI (31 files, ~6K LOC, connects to same server) |
| Hosting | Render free tier, Docker, auto-deploy on push to main |

## Repo Structure

```
src/
  shared/         Types, constants, card data, protocol (shared between server & client)
    types.ts      All interfaces and enums
    constants.ts  Numeric game rules
    cardData.ts   106-card deck definition
    protocol.ts   WebSocket message helpers
  engine/         Pure game logic (no I/O)
    GameEngine.ts initializeGame() + applyAction() — the core
    helpers.ts    Rent calc, set checking, shuffle
    BotPlayer.ts  Bot AI with phase-aware meta strategy
    BotManager.ts Bot lifecycle and naming
  server/         WebSocket server
    GameRoom.ts   Room state, action processing, bots, chat, timers
    RoomManager.ts Room create/join/cleanup
    index.ts      HTTP + WS entry point
  __tests__/      5 test files, 109 tests total
public/
  index.html      Complete web client (CSS + HTML + JS)
  manifest.json   PWA manifest
  service-worker.js
ios/              SwiftUI iOS client
```

## How to Run Locally

```bash
npm install
npm run dev      # starts server with hot reload on http://localhost:3000
```

Open `http://localhost:3000` in two browser tabs to test multiplayer.

## How to Deploy

Push to `main`. Render auto-deploys from the Docker config.

```bash
git push origin main
# Render rebuilds in ~2 minutes
# Live at https://monopoly-deal-online.onrender.com
```

## Key Commands

```bash
npm test          # run all 109 tests
npm run build     # compile TypeScript to dist/
npm start         # run production build
```

## Current Priorities

1. **Card animations** — flip, slide, deal effects
2. **Sound effects** — system exists but is basic
3. **iOS App Store prep** — testing on simulator + physical device
4. **Wire host "clear chat" button** — server handler exists, needs UI button

## How Trey Works

- Prefers concise responses, no fluff
- Gives multi-item task lists in a single message — implement all of them, then test and commit
- Expects `npm test` to pass before committing
- Always commit and push at the end of a task
- Commit messages should be descriptive (what + why)

## Important Patterns

- **All game logic** goes through `applyAction(state, action)` in `GameEngine.ts` — never mutate state directly
- **Types** live in `shared/types.ts` — don't define game types elsewhere
- **Bot AI** is pure functions in `BotPlayer.ts` — no I/O, takes state + returns action
- **State filtering** happens in `GameRoom.filterStateForPlayer()` — opponents' hands replaced with counts
- **Bank values** are hidden from opponents in log messages ("added 1 card to bank")
- **Starting player** is randomized; pass explicit index for deterministic tests

## Detailed Status

See [PROJECT_STATUS.md](./PROJECT_STATUS.md) for sprint-by-sprint history, line counts, file map, known issues, and game rules.
