# 🎴 Monopoly Deal Online

A real-time multiplayer Monopoly Deal card game server supporting 2–6 players across networks.

## Live Demo

**Play now:** https://monopoly-deal-online.onrender.com

> Hosted on Render free tier. The server sleeps after ~15 minutes of inactivity — first load may take ~30 seconds to wake up.

## Architecture

```
monopoly-deal-online/
├── src/
│   ├── shared/           # Shared types, constants, card data, protocol
│   │   ├── types.ts      # Every type in the game (cards, state, actions, messages)
│   │   ├── constants.ts  # Set sizes, rent tiers, game rules as numbers
│   │   ├── cardData.ts   # All 106 cards (210 for 6-player double deck)
│   │   └── protocol.ts   # WebSocket message serialization/parsing
│   ├── engine/           # Pure game logic (zero I/O, fully testable)
│   │   ├── GameEngine.ts # initializeGame() + applyAction() — the core
│   │   └── helpers.ts    # Rent calc, set checking, shuffling, card lookups
│   ├── server/           # Node.js WebSocket server
│   │   ├── index.ts      # HTTP + WS entry point
│   │   ├── GameRoom.ts   # Single game session (state, broadcast, filtering)
│   │   └── RoomManager.ts# Room lifecycle (create, join, cleanup)
│   └── __tests__/        # Vitest test suite
│       └── engine.test.ts
```

### Key Design Decisions

- **Server-authoritative**: The game engine runs ONLY on the server. Clients send actions, server validates and broadcasts. No cheating possible.
- **Per-player state filtering**: Each player receives only what they're allowed to see. Opponents' hand contents are never sent — only card counts.
- **Pure engine**: `applyAction(state, action)` is a pure function with no side effects. Makes testing trivial and logic portable.
- **Room codes**: 6-character alphanumeric codes (no I/O/0/1 to avoid confusion). Players share codes to join.

## Quick Start

```bash
# Install dependencies
npm install

# Run in development (hot-reload)
npm run dev

# Run tests
npm test

# Build for production
npm run build
npm start
```

The server will start on `http://localhost:3000` with WebSocket at `ws://localhost:3000/ws`.

## WebSocket Protocol

### Client → Server

| Message Type    | Payload                                       |
|-----------------|-----------------------------------------------|
| `create_room`   | `{ playerName, avatar }`                     |
| `join_room`     | `{ roomCode, playerName, avatar }`           |
| `start_game`    | `{ roomCode }`                               |
| `player_action` | `{ roomCode, type, playerId, cardId, ... }`  |

### Server → Client

| Message Type          | Description                                |
|-----------------------|--------------------------------------------|
| `room_created`        | Room info + your playerId + session token  |
| `player_joined`       | Updated room info                          |
| `game_state_update`   | Filtered game state for your eyes only     |
| `action_rejected`     | Why your action was illegal                |
| `game_over`           | Winner announcement                        |
| `error`               | Error code + message                       |

### Example: Creating and Joining a Game

```javascript
// Player 1: Create a room
ws.send(JSON.stringify({
  type: "create_room",
  payload: { playerName: "Alice", avatar: 0 }
}));
// → Receives: { type: "room_created", payload: { room: { code: "XKR42M" }, playerId: "...", sessionToken: "..." } }

// Player 2: Join with the code
ws.send(JSON.stringify({
  type: "join_room",
  payload: { roomCode: "XKR42M", playerName: "Bob", avatar: 1 }
}));

// Player 1: Start the game
ws.send(JSON.stringify({
  type: "start_game",
  payload: { roomCode: "XKR42M" }
}));

// Playing a card
ws.send(JSON.stringify({
  type: "player_action",
  payload: {
    roomCode: "XKR42M",
    type: "play_money_to_bank",
    playerId: "your-uuid",
    cardId: "money_1m_3"
  }
}));
```

## Deployment

### Option A: Railway (Recommended — Free Tier)

Railway's free tier supports persistent WebSocket connections.

1. Push this repo to GitHub
2. Go to [railway.app](https://railway.app), connect your GitHub repo
3. Railway auto-detects Node.js, runs `npm run build && npm start`
4. Get your free `*.railway.app` URL
5. Point your iOS client to `wss://your-app.railway.app/ws`

### Option B: Render (Free Tier)

1. Push to GitHub
2. Create a new **Web Service** on [render.com](https://render.com)
3. Set build command: `npm install && npm run build`
4. Set start command: `npm start`
5. Free tier spins down after inactivity (30s cold start)

### Option C: Fly.io (Free Tier)

```bash
fly launch
fly deploy
```

### Option D: Oracle Cloud (Always Free — Best Performance)

See the deployment guide in the project wiki for Oracle Cloud setup.
This gives you a full VM with 4 cores, 24GB RAM — forever free.

### Option E: Any VPS

```bash
ssh your-server
git clone <your-repo>
cd monopoly-deal-online
npm install && npm run build
PORT=3000 NODE_ENV=production node dist/server/index.js
```

Use `systemd`, `pm2`, or `docker` to keep it running.

## Game Rules Implemented

- ✅ 106-card deck (20 money, 28 property, 11 wild, 34 action, 13 rent)
- ✅ Double deck for 6 players (212 cards)
- ✅ Draw 2 per turn (5 if hand empty)
- ✅ Play up to 3 cards per turn
- ✅ 7-card hand limit with forced discard
- ✅ Win condition: 3 complete property sets of different colors
- ✅ All action cards: Pass Go, Debt Collector, Birthday, Sly Deal, Forced Deal, Deal Breaker
- ✅ Just Say No with counter-chain
- ✅ Double the Rent
- ✅ House & Hotel on complete sets
- ✅ Property wild cards (2-color and rainbow)
- ✅ Wild card color switching
- ✅ Rent calculation with house/hotel bonuses
- ✅ No change rule (overpayment is lost)
- ✅ Pay with bank or properties (player's choice)
- ✅ Reconnection support (2-minute grace period)

## Next Steps (iOS Client)

The iOS client needs to:

1. Connect to `wss://your-server/ws`
2. Send/receive JSON messages per the protocol above
3. Render the `ClientGameState` it receives
4. Send `PlayerAction` messages when the user taps cards

The `shared/types.ts` file is the contract — mirror these types in Swift.

## Development

```bash
# Run tests in watch mode
npm run test:watch

# Lint
npm run lint
```

## License

MIT
