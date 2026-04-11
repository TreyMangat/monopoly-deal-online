# CLAUDE.md

## Project: Monopoly Deal Online

A real-time multiplayer Monopoly Deal card game. Server-authoritative architecture with WebSocket communication. Supports 2-6 players across different networks. Includes AI bots (easy/medium/hard) and in-game chat.

## Tech Stack

- **Runtime**: Node.js 18+
- **Language**: TypeScript (strict mode)
- **WebSocket**: `ws` library
- **Testing**: Vitest (109 tests across 5 files)
- **Build**: `tsc` (TypeScript compiler)
- **iOS Client**: SwiftUI (31 files, connects to same server)

## Architecture

```
src/shared/    → Types, constants, card data, protocol (shared between server & client)
src/engine/    → Pure game logic + bot AI (no I/O, no side effects, fully testable)
src/server/    → WebSocket server, room management, state broadcasting, chat
src/__tests__/ → Vitest unit tests
public/        → Single-file web client (HTML/CSS/JS), PWA assets
ios/           → SwiftUI iOS client
```

### Key Design Decisions

- **Server-authoritative**: Game engine runs ONLY on the server. Clients send actions, server validates.
- **Per-player filtering**: Each player receives only what they're allowed to see. Opponents' hands are never sent.
- **Pure engine**: `applyAction(state, action)` is a pure function. No side effects.
- **Room codes**: 6-char alphanumeric codes for joining games.
- **Bot AI**: Phase-aware strategy (early/mid/late game) with threat scoring and opponent modeling.

## Commands

- `npm run dev` — Start dev server with hot reload (tsx watch)
- `npm run build` — Compile TypeScript to dist/
- `npm start` — Run production build
- `npm test` — Run Vitest test suite (109 tests)
- `npm run test:watch` — Run tests in watch mode

## File Responsibilities

- `shared/types.ts` — ALL TypeScript interfaces and enums (Card, GameState, PlayerAction, etc.)
- `shared/constants.ts` — Numeric game rules (set sizes, rent tiers, hand limits)
- `shared/cardData.ts` — All 106 cards defined, deck builder function
- `shared/protocol.ts` — WebSocket message serialization helpers
- `engine/GameEngine.ts` — Core: initializeGame() + applyAction() handles every move
- `engine/helpers.ts` — Rent calculation, set checking, shuffle, card lookup utilities
- `engine/BotPlayer.ts` — Bot AI: chooseBotAction() with easy/medium/hard strategies
- `engine/BotManager.ts` — Bot lifecycle, naming, difficulty tracking
- `server/GameRoom.ts` — Single game room (state, action processing, bots, chat, filtered broadcasts)
- `server/RoomManager.ts` — Room lifecycle (create, join, cleanup, room codes)
- `server/index.ts` — HTTP + WebSocket entry point, message routing

## Conventions

- All game logic goes through `applyAction()` — never mutate state directly
- Types are in `shared/types.ts` — don't define game types elsewhere
- Action validation happens inside the engine, not the server layer
- Tests use Vitest with `describe`/`it`/`expect`
- WebSocket messages are JSON: `{ type: string, payload: object }`
- Player hands are NEVER sent to other players — only hand counts
- Bank card values are hidden from opponents in action log descriptions

## What's Built

### Core Gameplay
- Full 106-card deck with all Monopoly Deal cards
- All actions: play property, bank money, rent, Debt Collector, Birthday, Sly Deal, Forced Deal, Deal Breaker, House, Hotel, Double Rent, Pass Go, Just Say No (with counter-chain)
- 7-card hand limit with discard phase
- Win condition: 3 complete property sets of different colors
- Wild card management (swap between colors, costs 1 action)

### Multiplayer
- WebSocket rooms with 6-char codes
- 2-6 players across networks
- Reconnect with session tokens
- Turn timers (60s turn, 30s response)
- Per-player state filtering

### Bot System
- 3 difficulty levels: Easy (random), Medium (banking-first), Hard (meta strategy)
- Hard bot: phase-aware (early banking → mid-game disruption → late-game win-or-deny)
- Threat scoring, opponent modeling, payment optimization
- Slower pacing with "thinking" indicators for readability
- Auto-replace disconnected players with medium bot

### Social
- In-game chat (rate-limited, sanitized, unread indicator)
- Post-game vote system (Play Again / Leave)
- Host controls (end game, replace disconnected players)

### UI/UX
- Navy-teal themed PWA with modern cartoony aesthetic
- Color-coded action cards, wild card gradients, rent tier display
- Stacked discard pile, opponent property labels
- Dramatic steal modals with screen effects
- Bot turn banner with thinking dots
- Mobile responsive

## Game Rules Reference

- 106 cards per deck (double deck of 212 for 6 players)
- Draw 2 per turn (5 if hand was empty)
- Play up to 3 cards per turn
- 7-card hand limit (discard excess at end of turn)
- Win: First to collect 3 complete property sets of DIFFERENT colors
- Just Say No can be countered by another Just Say No (chain)
- No change given when paying (overpayment is lost)
- Houses/Hotels only on complete sets (not railroad/utility)
- Hotel requires a House first
- Can't steal from complete sets (Sly Deal, Forced Deal)
- CAN steal complete sets with Deal Breaker

### Rules Discovered Through Playtesting

- **Wild card swap costs 1 action** — moving a wild between your own property groups uses a play
- **Rainbow wild ($0) can't be used as payment** — PropertyWildAll has $0 bankValue, excluded from payment
- **Discard priority**: non-property cards must be discarded first if enough exist; property cards only when forced
- **Double Debt Collector blocked**: can't target the same player with Debt Collector twice per turn (tracked via `chargedThisTurn`)
- **2-color wild placement**: can only go on its two printed colors, not any color
- **Randomized starting player**: game randomly picks who goes first (not always the host)

## Deployment

- **Platform**: Render free tier (Docker)
- **Live URL**: https://monopoly-deal-online.onrender.com
- **WebSocket**: wss://monopoly-deal-online.onrender.com/ws
- **Auto-deploy**: Push to main triggers rebuild
- **Cold starts**: Free tier spins down after ~15min idle; first request takes ~30s to wake
- **Config**: `render.yaml` + `Dockerfile`
- **PORT**: Render injects `process.env.PORT` automatically; server reads it in `server/index.ts`
- **Static files**: `public/index.html` served at `/` via `fs.readFileSync`

## Current Focus

Active work is on polish and bug fixes:
- Card animations (flip, slide, deal)
- Sound effects
- iOS App Store prep
- Host "clear chat" button (server handler exists)
