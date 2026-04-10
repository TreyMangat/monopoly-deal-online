# CLAUDE.md

## Project: Monopoly Deal Online

A real-time multiplayer Monopoly Deal card game. Server-authoritative architecture with WebSocket communication. Supports 2-6 players across different networks.

## Tech Stack

- **Runtime**: Node.js 18+
- **Language**: TypeScript (strict mode)
- **WebSocket**: `ws` library
- **Testing**: Vitest
- **Build**: `tsc` (TypeScript compiler)
- **Future**: iOS client in SwiftUI

## Architecture

```
src/shared/    → Types, constants, card data, protocol (shared between server & client)
src/engine/    → Pure game logic (no I/O, no side effects, fully testable)
src/server/    → WebSocket server, room management, state broadcasting
src/__tests__/ → Vitest unit tests
```

### Key Design Decisions

- **Server-authoritative**: Game engine runs ONLY on the server. Clients send actions, server validates.
- **Per-player filtering**: Each player receives only what they're allowed to see. Opponents' hands are never sent.
- **Pure engine**: `applyAction(state, action)` is a pure function. No side effects.
- **Room codes**: 6-char alphanumeric codes for joining games.

## Commands

- `npm run dev` — Start dev server with hot reload (tsx watch)
- `npm run build` — Compile TypeScript to dist/
- `npm start` — Run production build
- `npm test` — Run Vitest test suite
- `npm run test:watch` — Run tests in watch mode

## File Responsibilities

- `shared/types.ts` — ALL TypeScript interfaces and enums (Card, GameState, PlayerAction, etc.)
- `shared/constants.ts` — Numeric game rules (set sizes, rent tiers, hand limits)
- `shared/cardData.ts` — All 106 cards defined, deck builder function
- `shared/protocol.ts` — WebSocket message serialization helpers
- `engine/GameEngine.ts` — Core: initializeGame() + applyAction() handles every move
- `engine/helpers.ts` — Rent calculation, set checking, shuffle, card lookup utilities
- `server/GameRoom.ts` — Single game room (state, action processing, filtered broadcasts)
- `server/RoomManager.ts` — Room lifecycle (create, join, cleanup, room codes)
- `server/index.ts` — HTTP + WebSocket entry point

## Conventions

- All game logic goes through `applyAction()` — never mutate state directly
- Types are in `shared/types.ts` — don't define game types elsewhere
- Action validation happens inside the engine, not the server layer
- Tests use Vitest with `describe`/`it`/`expect`
- WebSocket messages are JSON: `{ type: string, payload: object }`
- Player hands are NEVER sent to other players — only hand counts

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

## Current Status

- [x] Card data manifest (all 106 cards)
- [x] Game engine with all actions
- [x] WebSocket server with room management
- [x] Unit tests (18 passing)
- [ ] Deploy to Railway/Render
- [ ] CLAUDE.md for iOS client
- [ ] iOS SwiftUI client
- [ ] Lobby UI (create/join room)
- [ ] Game board rendering
- [ ] Card animations
- [ ] Sound/haptics
