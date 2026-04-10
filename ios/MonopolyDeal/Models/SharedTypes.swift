// ============================================================
// MONOPOLY DEAL ONLINE — Shared Types (iOS)
// ============================================================
// Swift mirrors of every TypeScript type in shared/types.ts.
// All enum raw values match the server's snake_case strings exactly.
// All struct properties match the server's camelCase JSON keys.
// ============================================================

import Foundation

// MARK: - Property Colors

enum PropertyColor: String, Codable, CaseIterable {
    case brown
    case lightBlue = "light_blue"
    case pink
    case orange
    case red
    case yellow
    case green
    case darkBlue = "dark_blue"
    case railroad
    case utility
}

// MARK: - Card Types

enum CardType: String, Codable {
    case property
    case propertyWild = "property_wild"
    case propertyWildAll = "property_wild_all"
    case money
    case actionPassGo = "action_pass_go"
    case actionDebtCollector = "action_debt_collector"
    case actionItsMyBirthday = "action_its_my_birthday"
    case actionForcedDeal = "action_forced_deal"
    case actionSlyDeal = "action_sly_deal"
    case actionDealBreaker = "action_deal_breaker"
    case actionJustSayNo = "action_just_say_no"
    case actionDoubleRent = "action_double_rent"
    case actionHouse = "action_house"
    case actionHotel = "action_hotel"
    case rentWild = "rent_wild"
    case rentTwoColor = "rent_two_color"
}

// MARK: - Card

struct Card: Codable, Identifiable, Equatable {
    let id: String
    let type: CardType
    let name: String
    let bankValue: Int

    // Property-specific
    var color: PropertyColor?
    var altColor: PropertyColor?
    var rentTier: [Int]?

    // Rent card specific
    var rentColors: [PropertyColor]?

    // Action specific
    var actionValue: Int?
}

// MARK: - Property Group

struct PropertyGroup: Codable, Equatable {
    let color: PropertyColor
    var cards: [Card]
    var hasHouse: Bool
    var hasHotel: Bool
}

// MARK: - Player State

struct PlayerState: Codable, Identifiable, Equatable {
    let id: String
    let name: String
    let avatar: Int
    var hand: [Card]
    var bank: [Card]
    var properties: [PropertyGroup]
    var connected: Bool
}

// MARK: - Turn Phase

enum TurnPhase: String, Codable {
    case waitingToStart = "waiting_to_start"
    case draw
    case play
    case awaitingResponse = "awaiting_response"
    case discard
    case gameOver = "game_over"
}

// MARK: - Pending Action Types

enum PendingActionType: String, Codable {
    case payRent = "pay_rent"
    case payDebtCollector = "pay_debt_collector"
    case payBirthday = "pay_birthday"
    case respondToSlyDeal = "respond_to_sly_deal"
    case respondToForcedDeal = "respond_to_forced_deal"
    case respondToDealBreaker = "respond_to_deal_breaker"
    case counterJustSayNo = "counter_just_say_no"
}

// MARK: - Just Say No Chain

enum JustSayNoAction: String, Codable {
    case justSayNo = "just_say_no"
    case accept
}

struct JustSayNoLink: Codable, Equatable {
    let playerId: String
    let action: JustSayNoAction
}

// MARK: - Pending Action

struct PendingAction: Codable, Equatable {
    let type: PendingActionType
    let fromPlayerId: String
    let targetPlayerIds: [String]
    let respondedPlayerIds: [String]
    var amount: Int?
    var cardId: String?
    var targetCardId: String?
    var offeredCardId: String?
    var requestedCardId: String?
    var isDoubled: Bool?
    var justSayNoChain: [JustSayNoLink]?
}

// MARK: - Opponent View (hands hidden)

struct OpponentView: Codable, Identifiable, Equatable {
    let id: String
    let name: String
    let avatar: Int
    let handCount: Int
    let bank: [Card]
    let properties: [PropertyGroup]
    let connected: Bool
}

// MARK: - Client Game State (filtered per-player)

struct ClientGameState: Codable, Equatable {
    let roomCode: String
    let phase: TurnPhase
    let currentPlayerIndex: Int
    let actionsRemaining: Int
    let turnNumber: Int
    let drawPileCount: Int
    let discardPileTop: Card?
    let you: PlayerState
    let opponents: [OpponentView]
    let pendingAction: PendingAction?
    let winnerId: String?
}

// MARK: - Action Type (client → server)

enum ActionType: String, Codable {
    // Turn actions (cost 1 of 3 plays)
    case playPropertyCard = "play_property_card"
    case playMoneyToBank = "play_money_to_bank"
    case playActionToBank = "play_action_to_bank"
    case playPassGo = "play_pass_go"
    case playRentCard = "play_rent_card"
    case playDebtCollector = "play_debt_collector"
    case playBirthday = "play_birthday"
    case playSlyDeal = "play_sly_deal"
    case playForcedDeal = "play_forced_deal"
    case playDealBreaker = "play_deal_breaker"
    case playHouse = "play_house"
    case playHotel = "play_hotel"
    case playDoubleRent = "play_double_rent"

    // Response actions
    case payWithCards = "pay_with_cards"
    case playJustSayNo = "play_just_say_no"
    case acceptAction = "accept_action"

    // Turn management
    case endTurn = "end_turn"
    case discardCards = "discard_cards"

    // Wild card management
    case moveWildCard = "move_wild_card"
}

// MARK: - Player Action

struct PlayerAction: Codable {
    let type: ActionType
    let playerId: String

    var cardId: String?
    var cardIds: [String]?
    var targetPlayerId: String?
    var targetCardId: String?
    var targetColor: PropertyColor?
    var destinationColor: PropertyColor?
    var offeredCardId: String?
    var requestedCardId: String?
}

// MARK: - Server → Client Message Types

enum ServerMessageType: String, Codable {
    case roomCreated = "room_created"
    case playerJoined = "player_joined"
    case playerLeft = "player_left"
    case playerReconnected = "player_reconnected"
    case gameStarted = "game_started"
    case gameStateUpdate = "game_state_update"
    case actionRejected = "action_rejected"
    case actionResolved = "action_resolved"
    case gameOver = "game_over"
    case timerUpdate = "timer_update"
    case error
    case ping
}

// MARK: - Client → Server Message Types

enum ClientMessageType: String, Codable {
    case createRoom = "create_room"
    case joinRoom = "join_room"
    case startGame = "start_game"
    case playerAction = "player_action"
    case pong
}

// MARK: - Room Status

enum RoomStatus: String, Codable {
    case waiting
    case playing
    case finished
}

// MARK: - Room Info

struct RoomPlayerInfo: Codable, Identifiable, Equatable {
    let id: String
    let name: String
    let avatar: Int
}

struct RoomInfo: Codable, Equatable {
    let code: String
    let status: RoomStatus
    let players: [RoomPlayerInfo]
    let hostId: String
    let maxPlayers: Int
    let createdAt: Double
}

// MARK: - Server Message (raw envelope)

struct ServerMessage: Codable {
    let type: ServerMessageType
    let payload: AnyCodable
}

// MARK: - Client Message (raw envelope)

struct ClientMessage: Codable {
    let type: ClientMessageType
    let payload: AnyCodable
}

// MARK: - Timer Update Payload

struct TimerUpdatePayload: Codable {
    let playerId: String
    let secondsRemaining: Int
    let timerType: String // "turn" or "response"
}

// MARK: - Payloads for room creation / joining

struct RoomCreatedPayload: Codable {
    let room: RoomInfo
    let playerId: String
    let sessionToken: String
}

struct PlayerJoinedPayload: Codable {
    let room: RoomInfo
    var playerId: String?
    var sessionToken: String?
}

struct GameStateUpdatePayload: Codable {
    let state: ClientGameState
    var lastAction: LastActionInfo?
}

struct LastActionInfo: Codable {
    let description: String
}

struct ActionRejectedPayload: Codable {
    let reason: String
}

struct GameOverPayload: Codable {
    let winnerId: String
    let winnerName: String
}

struct ErrorPayload: Codable {
    let code: String
    let message: String
}

struct PlayerLeftPayload: Codable {
    let playerId: String
    let playerName: String
    var temporary: Bool?
}

struct PlayerReconnectedPayload: Codable {
    let playerId: String
    let playerName: String
}

// MARK: - AnyCodable (lightweight JSON container)

/// A type-erased Codable wrapper for heterogeneous JSON payloads.
struct AnyCodable: Codable, Equatable {
    let value: Any

    init(_ value: Any) {
        self.value = value
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.singleValueContainer()
        if container.decodeNil() {
            value = NSNull()
        } else if let bool = try? container.decode(Bool.self) {
            value = bool
        } else if let int = try? container.decode(Int.self) {
            value = int
        } else if let double = try? container.decode(Double.self) {
            value = double
        } else if let string = try? container.decode(String.self) {
            value = string
        } else if let array = try? container.decode([AnyCodable].self) {
            value = array.map(\.value)
        } else if let dict = try? container.decode([String: AnyCodable].self) {
            value = dict.mapValues(\.value)
        } else {
            throw DecodingError.typeMismatch(
                AnyCodable.self,
                .init(codingPath: decoder.codingPath, debugDescription: "Unsupported type")
            )
        }
    }

    func encode(to encoder: Encoder) throws {
        var container = encoder.singleValueContainer()
        switch value {
        case is NSNull:
            try container.encodeNil()
        case let bool as Bool:
            try container.encode(bool)
        case let int as Int:
            try container.encode(int)
        case let double as Double:
            try container.encode(double)
        case let string as String:
            try container.encode(string)
        case let array as [Any]:
            try container.encode(array.map { AnyCodable($0) })
        case let dict as [String: Any]:
            try container.encode(dict.mapValues { AnyCodable($0) })
        default:
            throw EncodingError.invalidValue(
                value,
                .init(codingPath: encoder.codingPath, debugDescription: "Unsupported type")
            )
        }
    }

    static func == (lhs: AnyCodable, rhs: AnyCodable) -> Bool {
        // Best-effort equality for JSON-compatible types
        switch (lhs.value, rhs.value) {
        case (is NSNull, is NSNull): return true
        case let (l as Bool, r as Bool): return l == r
        case let (l as Int, r as Int): return l == r
        case let (l as Double, r as Double): return l == r
        case let (l as String, r as String): return l == r
        default: return false
        }
    }
}
