# CLAUDE.md — iOS Client

## Project: Monopoly Deal Online (iOS)

SwiftUI client for the Monopoly Deal Online multiplayer card game. Connects to the Node.js WebSocket server.

## Requirements

- iOS 17+ (uses @Observable, modern SwiftUI features)
- Xcode 15+
- Swift 5.9+

## Directory Structure

```
ios/MonopolyDeal/
  MonopolyDealApp.swift           → App entry point, WindowGroup → MainMenuView
  Models/
    SharedTypes.swift             → All Codable types mirroring server's shared/types.ts
  Network/
    WebSocketManager.swift        → URLSessionWebSocketTask wrapper, auto-reconnect, keepalive
    GameClient.swift              → High-level API: createRoom, joinRoom, sendAction, event parsing
  State/
    GameViewModel.swift           → @Observable class: central app state, wires GameClient → UI
  Views/
    MainMenuView.swift            → Main menu: Create Game, Join Game, How to Play
    CreateGameView.swift          → Name input, avatar picker, server URL, create button
    JoinGameView.swift            → Room code input, name, avatar, join button
    LobbyView.swift               → Player list, room code with copy, start game (host)
    Cards/
      CardView.swift              → Single card face: type badge, name, value, color dots, selected state
      CardBackView.swift          → Face-down card back: branded pattern, no card info
    GameBoard/
      HandView.swift              → Horizontal ScrollView of hand cards, tappable when your turn
      BankView.swift              → Bank total header + card chips, selectable in payment mode
      ActionLogView.swift         → Slide-up panel showing recent game actions, newest first
    Responses/
      PaymentDemandView.swift     → Full-screen modal for paying rent/debt/birthday (non-dismissible)
      JustSayNoChainView.swift    → Counter-chain UI for Just Say No interactions
      DiscardView.swift           → End-of-turn discard picker when hand exceeds 7 cards
    GameOverView.swift            → Winner celebration, winning sets, stats, play again / menu
  Utilities/
    CardDesignSystem.swift        → PropertyColor colors/names/setSizes, CardType display, CardStyleConfig, GameColors theme
```

## Key Architecture Decisions

- **No .xcodeproj checked in** — create the Xcode project locally and add these source files
- **@Observable (iOS 17)** — GameViewModel uses Observation framework, passed via `.environment()`
- **Native WebSocket** — URLSessionWebSocketTask, no third-party dependencies
- **Combine for events** — GameClient publishes ServerEvent via PassthroughSubject
- **Type parity** — SharedTypes.swift enum raw values match server's snake_case strings exactly
- **AnyCodable** — Lightweight type-erased wrapper for heterogeneous JSON payloads

## Server Protocol

- Connect to `wss://<host>/ws`
- Messages are JSON: `{ "type": "<snake_case>", "payload": { ... } }`
- Client message types: `create_room`, `join_room`, `start_game`, `player_action`, `pong`
- Server message types: `room_created`, `player_joined`, `game_state_update`, `timer_update`, `error`, etc.
- After room creation/joining, client receives `playerId` and `sessionToken` for reconnection

## Conventions

- All game types live in `SharedTypes.swift` — don't duplicate type definitions
- Game actions flow through `GameViewModel` methods → `GameClient.sendAction()` → WebSocket
- Server state updates arrive via `GameClient.events` → `GameViewModel.handleEvent()` → UI
- Views observe `GameViewModel` via `@Environment(GameViewModel.self)`
- PropertyColor display (Color, text color, display name) and card styling are in `CardDesignSystem.swift`

## What's Built

- [x] Codable types matching all server types
- [x] WebSocket layer with auto-reconnect + exponential backoff
- [x] Game client with room management + action sending
- [x] Observable view model wiring events to UI state
- [x] Main menu, create game, join game, lobby views
- [x] Property color → SwiftUI color mapping
- [x] Card view component (face + back, all card types, selected state)
- [x] Hand view (scrollable, tappable, dimmed when not your turn)
- [x] Bank view (total display, payment mode with selectable chips)

## What's Next

- [ ] Game board view (properties, opponents, turn controls)
- [ ] Action selection UI (play card, target player, pay debt)
- [ ] Timer countdown display
- [x] Pending action response UI (pay, Just Say No, accept)
- [x] Discard picker
- [x] Game over screen
- [x] Action log panel
- [ ] Haptics + sound effects
- [ ] Card animations (deal, play, steal)
