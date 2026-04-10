// ============================================================
// MONOPOLY DEAL ONLINE — Game Client (iOS)
// ============================================================
// High-level game API built on WebSocketManager.
// Sends typed client messages, receives and parses server messages.
// ============================================================

import Foundation
import Combine

// MARK: - Parsed Server Events

enum ServerEvent {
    case roomCreated(RoomCreatedPayload)
    case playerJoined(PlayerJoinedPayload)
    case playerLeft(PlayerLeftPayload)
    case playerReconnected(PlayerReconnectedPayload)
    case gameStateUpdate(GameStateUpdatePayload)
    case actionRejected(ActionRejectedPayload)
    case gameOver(GameOverPayload)
    case timerUpdate(TimerUpdatePayload)
    case error(ErrorPayload)
    case ping
    case unknown(type: String)
}

// MARK: - GameClient

final class GameClient {
    private let ws = WebSocketManager()
    private let decoder = JSONDecoder()

    // Session state
    private(set) var playerId: String?
    private(set) var sessionToken: String?
    private(set) var roomCode: String?

    // Publishers
    let events = PassthroughSubject<ServerEvent, Never>()
    let connectionState = CurrentValueSubject<ConnectionState, Never>(.disconnected)

    init() {
        ws.onReceive = { [weak self] text in
            self?.handleRawMessage(text)
        }
        ws.onStateChange = { [weak self] state in
            self?.connectionState.send(state)
        }
    }

    // MARK: - Connection

    func connect(to url: URL) {
        ws.connect(to: url)
    }

    func disconnect() {
        ws.disconnect()
        playerId = nil
        sessionToken = nil
        roomCode = nil
    }

    // MARK: - Room Actions

    func createRoom(name: String, avatar: Int) {
        let payload: [String: Any] = [
            "playerName": name,
            "avatar": avatar,
        ]
        sendClientMessage(type: .createRoom, payload: payload)
    }

    func joinRoom(code: String, name: String, avatar: Int) {
        let payload: [String: Any] = [
            "roomCode": code.uppercased(),
            "playerName": name,
            "avatar": avatar,
        ]
        sendClientMessage(type: .joinRoom, payload: payload)
    }

    func startGame() {
        guard let roomCode else { return }
        let payload: [String: Any] = [
            "roomCode": roomCode,
        ]
        sendClientMessage(type: .startGame, payload: payload)
    }

    // MARK: - Game Actions

    func sendAction(_ action: PlayerAction) {
        guard let roomCode else { return }

        // Encode the action and merge roomCode into the payload
        do {
            let data = try JSONEncoder().encode(action)
            if var dict = try JSONSerialization.jsonObject(with: data) as? [String: Any] {
                dict["roomCode"] = roomCode
                sendClientMessage(type: .playerAction, payload: dict)
            }
        } catch {
            print("[GameClient] Failed to encode action: \(error)")
        }
    }

    // MARK: - Raw Message Sending

    private func sendClientMessage(type: ClientMessageType, payload: [String: Any]) {
        let message: [String: Any] = [
            "type": type.rawValue,
            "payload": payload,
        ]
        do {
            let data = try JSONSerialization.data(withJSONObject: message)
            if let text = String(data: data, encoding: .utf8) {
                ws.send(text: text)
            }
        } catch {
            print("[GameClient] JSON serialization error: \(error)")
        }
    }

    // MARK: - Message Parsing

    private func handleRawMessage(_ text: String) {
        guard let data = text.data(using: .utf8) else { return }

        // Decode the envelope to get the type
        guard let envelope = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
              let typeString = envelope["type"] as? String,
              let type = ServerMessageType(rawValue: typeString)
        else {
            events.send(.unknown(type: "unparseable"))
            return
        }

        guard let payloadObj = envelope["payload"] else {
            events.send(.unknown(type: typeString))
            return
        }

        let payloadData: Data
        do {
            payloadData = try JSONSerialization.data(withJSONObject: payloadObj)
        } catch {
            events.send(.unknown(type: typeString))
            return
        }

        switch type {
        case .roomCreated:
            if let payload = try? decoder.decode(RoomCreatedPayload.self, from: payloadData) {
                playerId = payload.playerId
                sessionToken = payload.sessionToken
                roomCode = payload.room.code
                events.send(.roomCreated(payload))
            }

        case .playerJoined:
            if let payload = try? decoder.decode(PlayerJoinedPayload.self, from: payloadData) {
                // When joining (not creating), we receive our IDs here
                if let pid = payload.playerId {
                    playerId = pid
                }
                if let token = payload.sessionToken {
                    sessionToken = token
                }
                if roomCode == nil {
                    roomCode = payload.room.code
                }
                events.send(.playerJoined(payload))
            }

        case .playerLeft:
            if let payload = try? decoder.decode(PlayerLeftPayload.self, from: payloadData) {
                events.send(.playerLeft(payload))
            }

        case .playerReconnected:
            if let payload = try? decoder.decode(PlayerReconnectedPayload.self, from: payloadData) {
                events.send(.playerReconnected(payload))
            }

        case .gameStarted, .gameStateUpdate:
            if let payload = try? decoder.decode(GameStateUpdatePayload.self, from: payloadData) {
                events.send(.gameStateUpdate(payload))
            }

        case .actionRejected:
            if let payload = try? decoder.decode(ActionRejectedPayload.self, from: payloadData) {
                events.send(.actionRejected(payload))
            }

        case .actionResolved:
            // Treated as a game state update if payload matches
            if let payload = try? decoder.decode(GameStateUpdatePayload.self, from: payloadData) {
                events.send(.gameStateUpdate(payload))
            }

        case .gameOver:
            if let payload = try? decoder.decode(GameOverPayload.self, from: payloadData) {
                events.send(.gameOver(payload))
            }

        case .timerUpdate:
            if let payload = try? decoder.decode(TimerUpdatePayload.self, from: payloadData) {
                events.send(.timerUpdate(payload))
            }

        case .error:
            if let payload = try? decoder.decode(ErrorPayload.self, from: payloadData) {
                events.send(.error(payload))
            }

        case .ping:
            events.send(.ping)
            // Auto-respond with pong
            sendClientMessage(type: .pong, payload: [:])
        }
    }
}
