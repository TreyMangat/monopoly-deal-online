// ============================================================
// MONOPOLY DEAL ONLINE — Game View Model (iOS)
// ============================================================
// Central @Observable state for the entire app.
// Wires GameClient events to published state properties.
// ============================================================

import Foundation
import Combine
import Observation

// MARK: - Navigation Routes

enum AppRoute: Hashable {
    case createGame
    case joinGame
    case lobby
    case gameBoard
}

@Observable
final class GameViewModel {
    // MARK: - Published State

    var currentState: ClientGameState?
    var connectionStatus: ConnectionState = .disconnected
    var roomInfo: RoomInfo?
    var actionLog: [String] = []
    var timerSeconds: Int = 0
    var timerType: String = "turn"
    var timerPlayerId: String = ""
    var errorMessage: String?
    var gameOverWinner: String?

    // MARK: - Navigation

    var navigationPath: [AppRoute] = []

    // MARK: - Session Info (read-only from outside)

    var playerId: String? { client.playerId }
    var sessionToken: String? { client.sessionToken }
    var roomCode: String? { client.roomCode }

    var isHost: Bool {
        guard let roomInfo, let playerId else { return false }
        return roomInfo.hostId == playerId
    }

    var isMyTurn: Bool {
        guard let state = currentState else { return false }
        return state.currentPlayerIndex == state.yourPlayerIndex
    }

    var isPaymentPending: Bool {
        guard let state = currentState,
              state.phase == .awaitingResponse,
              let pending = state.pendingAction,
              pending.targetPlayerIds.contains(state.you.id),
              !pending.respondedPlayerIds.contains(state.you.id)
        else { return false }
        switch pending.type {
        case .payRent, .payDebtCollector, .payBirthday:
            return true
        default:
            return false
        }
    }

    var isStealPending: Bool {
        guard let state = currentState,
              state.phase == .awaitingResponse,
              let pending = state.pendingAction,
              pending.targetPlayerIds.contains(state.you.id),
              !pending.respondedPlayerIds.contains(state.you.id)
        else { return false }
        switch pending.type {
        case .respondToSlyDeal, .respondToForcedDeal, .respondToDealBreaker, .counterJustSayNo:
            return true
        default:
            return false
        }
    }

    var shouldShowDiscard: Bool {
        currentState?.phase == .discard
    }

    var shouldShowGameOver: Bool {
        currentState?.phase == .gameOver
    }

    var currentPlayerName: String {
        guard let state = currentState else { return "" }
        let allPlayers = [state.you.name] + state.opponents.map(\.name)
        guard state.currentPlayerIndex >= 0,
              state.currentPlayerIndex < allPlayers.count
        else { return "" }
        return allPlayers[state.currentPlayerIndex]
    }

    var justSayNoCardId: String? {
        currentState?.you.hand.first(where: { $0.type == .actionJustSayNo })?.id
    }

    // MARK: - Private

    private let client = GameClient()
    private var cancellables = Set<AnyCancellable>()
    private let maxLogEntries = 20

    init() {
        client.events
            .receive(on: DispatchQueue.main)
            .sink { [weak self] event in
                self?.handleEvent(event)
            }
            .store(in: &cancellables)

        client.connectionState
            .receive(on: DispatchQueue.main)
            .sink { [weak self] state in
                self?.connectionStatus = state
            }
            .store(in: &cancellables)
    }

    // MARK: - Connection

    func connect(url: String) {
        guard let serverURL = URL(string: url) else {
            errorMessage = "Invalid server URL"
            return
        }
        client.connect(to: serverURL)
    }

    func disconnect() {
        client.disconnect()
        currentState = nil
        roomInfo = nil
        actionLog = []
        gameOverWinner = nil
    }

    // MARK: - Room Actions

    func createRoom(name: String, avatar: Int) {
        client.createRoom(name: name, avatar: avatar)
    }

    func joinRoom(code: String, name: String, avatar: Int) {
        client.joinRoom(code: code, name: name, avatar: avatar)
    }

    func startGame() {
        client.startGame()
    }

    // MARK: - Game Actions

    func playCard(cardId: String, destinationColor: PropertyColor? = nil) {
        guard let playerId, let state = currentState else { return }
        guard let card = state.you.hand.first(where: { $0.id == cardId }) else { return }

        let actionType: ActionType = switch card.type {
        case .property, .propertyWild, .propertyWildAll:
            .playPropertyCard
        case .money:
            .playMoneyToBank
        case .actionPassGo:
            .playPassGo
        case .actionDebtCollector:
            .playDebtCollector
        case .actionItsMyBirthday:
            .playBirthday
        case .actionSlyDeal:
            .playSlyDeal
        case .actionForcedDeal:
            .playForcedDeal
        case .actionDealBreaker:
            .playDealBreaker
        case .actionJustSayNo:
            .playJustSayNo
        case .actionDoubleRent:
            .playDoubleRent
        case .actionHouse:
            .playHouse
        case .actionHotel:
            .playHotel
        case .rentWild, .rentTwoColor:
            .playRentCard
        }

        var action = PlayerAction(type: actionType, playerId: playerId, cardId: cardId)
        action.destinationColor = destinationColor
        client.sendAction(action)
    }

    func playCardToBank(cardId: String) {
        guard let playerId else { return }
        let action = PlayerAction(type: .playActionToBank, playerId: playerId, cardId: cardId)
        client.sendAction(action)
    }

    func endTurn() {
        guard let playerId else { return }
        let action = PlayerAction(type: .endTurn, playerId: playerId)
        client.sendAction(action)
    }

    func payDebt(cardIds: [String]) {
        guard let playerId else { return }
        var action = PlayerAction(type: .payWithCards, playerId: playerId)
        action.cardIds = cardIds
        client.sendAction(action)
    }

    func justSayNo(cardId: String) {
        guard let playerId else { return }
        let action = PlayerAction(type: .playJustSayNo, playerId: playerId, cardId: cardId)
        client.sendAction(action)
    }

    func acceptAction() {
        guard let playerId else { return }
        let action = PlayerAction(type: .acceptAction, playerId: playerId)
        client.sendAction(action)
    }

    func discard(cardIds: [String]) {
        guard let playerId else { return }
        var action = PlayerAction(type: .discardCards, playerId: playerId)
        action.cardIds = cardIds
        client.sendAction(action)
    }

    func playDebtCollector(cardId: String, targetPlayerId: String) {
        guard let playerId else { return }
        var action = PlayerAction(type: .playDebtCollector, playerId: playerId, cardId: cardId)
        action.targetPlayerId = targetPlayerId
        client.sendAction(action)
    }

    func playRent(cardId: String, targetColor: PropertyColor, targetPlayerId: String? = nil) {
        guard let playerId else { return }
        var action = PlayerAction(type: .playRentCard, playerId: playerId, cardId: cardId)
        action.targetColor = targetColor
        action.targetPlayerId = targetPlayerId
        client.sendAction(action)
    }

    func playSlyDeal(cardId: String, targetPlayerId: String, targetCardId: String) {
        guard let playerId else { return }
        var action = PlayerAction(type: .playSlyDeal, playerId: playerId, cardId: cardId)
        action.targetPlayerId = targetPlayerId
        action.targetCardId = targetCardId
        client.sendAction(action)
    }

    func playForcedDeal(cardId: String, targetPlayerId: String, offeredCardId: String, requestedCardId: String) {
        guard let playerId else { return }
        var action = PlayerAction(type: .playForcedDeal, playerId: playerId, cardId: cardId)
        action.targetPlayerId = targetPlayerId
        action.offeredCardId = offeredCardId
        action.requestedCardId = requestedCardId
        client.sendAction(action)
    }

    func playDealBreaker(cardId: String, targetPlayerId: String, targetColor: PropertyColor) {
        guard let playerId else { return }
        var action = PlayerAction(type: .playDealBreaker, playerId: playerId, cardId: cardId)
        action.targetPlayerId = targetPlayerId
        action.targetColor = targetColor
        client.sendAction(action)
    }

    // MARK: - Send Raw Action

    func sendAction(_ action: PlayerAction) {
        client.sendAction(action)
    }

    // MARK: - Event Handling

    private func handleEvent(_ event: ServerEvent) {
        errorMessage = nil

        switch event {
        case .roomCreated(let payload):
            roomInfo = payload.room
            appendLog("Room \(payload.room.code) created")

        case .playerJoined(let payload):
            roomInfo = payload.room
            let count = payload.room.players.count
            appendLog("\(count) player\(count == 1 ? "" : "s") in room")

        case .playerLeft(let payload):
            appendLog("\(payload.playerName) left\(payload.temporary == true ? " (may reconnect)" : "")")

        case .playerReconnected(let payload):
            appendLog("\(payload.playerName) reconnected")

        case .gameStateUpdate(let payload):
            currentState = payload.state
            if let lastAction = payload.lastAction {
                appendLog(lastAction.description)
            }

        case .actionRejected(let payload):
            errorMessage = payload.reason
            appendLog("Rejected: \(payload.reason)")

        case .gameOver(let payload):
            gameOverWinner = payload.winnerName
            appendLog("\(payload.winnerName) wins!")

        case .timerUpdate(let payload):
            timerSeconds = payload.secondsRemaining
            timerType = payload.timerType
            timerPlayerId = payload.playerId

        case .error(let payload):
            errorMessage = payload.message
            appendLog("Error: \(payload.message)")

        case .ping:
            break

        case .unknown(let type):
            print("[ViewModel] Unknown server message: \(type)")
        }
    }

    private func appendLog(_ message: String) {
        actionLog.append(message)
        if actionLog.count > maxLogEntries {
            actionLog.removeFirst(actionLog.count - maxLogEntries)
        }
    }
}
