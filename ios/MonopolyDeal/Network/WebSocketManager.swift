// ============================================================
// MONOPOLY DEAL ONLINE — WebSocket Manager (iOS)
// ============================================================
// Native URLSessionWebSocketTask wrapper with auto-reconnect,
// exponential backoff, and ping/pong keepalive.
// ============================================================

import Foundation
import Combine

// MARK: - Connection State

enum ConnectionState: String {
    case disconnected
    case connecting
    case connected
    case reconnecting
}

// MARK: - WebSocketManager

final class WebSocketManager: NSObject, @unchecked Sendable {
    private var session: URLSession!
    private var webSocketTask: URLSessionWebSocketTask?
    private var serverURL: URL?
    private var pingTimer: Timer?

    // Reconnection
    private var reconnectDelay: TimeInterval = 1.0
    private let maxReconnectDelay: TimeInterval = 30.0
    private var shouldReconnect = false
    private var reconnectWorkItem: DispatchWorkItem?

    // State
    private(set) var state: ConnectionState = .disconnected {
        didSet {
            if oldValue != state {
                onStateChange?(state)
            }
        }
    }

    // Callbacks
    var onReceive: ((String) -> Void)?
    var onStateChange: ((ConnectionState) -> Void)?

    override init() {
        super.init()
        session = URLSession(
            configuration: .default,
            delegate: self,
            delegateQueue: OperationQueue()
        )
    }

    // MARK: - Connect

    func connect(to url: URL) {
        disconnect()

        serverURL = url
        shouldReconnect = true
        state = .connecting

        let task = session.webSocketTask(with: url)
        webSocketTask = task
        task.resume()

        listenForMessages()
    }

    // MARK: - Disconnect

    func disconnect() {
        shouldReconnect = false
        reconnectWorkItem?.cancel()
        reconnectWorkItem = nil
        stopPingTimer()

        webSocketTask?.cancel(with: .goingAway, reason: nil)
        webSocketTask = nil
        state = .disconnected
    }

    // MARK: - Send

    func send(message: Codable) {
        guard state == .connected else { return }

        do {
            let encoder = JSONEncoder()
            let data = try encoder.encode(message)
            guard let string = String(data: data, encoding: .utf8) else { return }
            send(text: string)
        } catch {
            print("[WS] Encode error: \(error)")
        }
    }

    func send(text: String) {
        guard state == .connected else { return }

        webSocketTask?.send(.string(text)) { error in
            if let error {
                print("[WS] Send error: \(error.localizedDescription)")
            }
        }
    }

    // MARK: - Receive Loop

    private func listenForMessages() {
        webSocketTask?.receive { [weak self] result in
            guard let self else { return }

            switch result {
            case .success(let message):
                switch message {
                case .string(let text):
                    DispatchQueue.main.async {
                        self.onReceive?(text)
                    }
                case .data(let data):
                    if let text = String(data: data, encoding: .utf8) {
                        DispatchQueue.main.async {
                            self.onReceive?(text)
                        }
                    }
                @unknown default:
                    break
                }
                // Continue listening
                self.listenForMessages()

            case .failure(let error):
                print("[WS] Receive error: \(error.localizedDescription)")
                self.handleConnectionLost()
            }
        }
    }

    // MARK: - Ping / Pong Keepalive

    private func startPingTimer() {
        stopPingTimer()
        DispatchQueue.main.async { [weak self] in
            self?.pingTimer = Timer.scheduledTimer(
                withTimeInterval: 15.0,
                repeats: true
            ) { [weak self] _ in
                self?.webSocketTask?.sendPing { error in
                    if let error {
                        print("[WS] Ping failed: \(error.localizedDescription)")
                    }
                }
            }
        }
    }

    private func stopPingTimer() {
        pingTimer?.invalidate()
        pingTimer = nil
    }

    // MARK: - Reconnection

    private func handleConnectionLost() {
        stopPingTimer()
        webSocketTask = nil

        guard shouldReconnect, let url = serverURL else {
            state = .disconnected
            return
        }

        state = .reconnecting
        scheduleReconnect(to: url)
    }

    private func scheduleReconnect(to url: URL) {
        let delay = reconnectDelay
        reconnectDelay = min(reconnectDelay * 2, maxReconnectDelay)

        print("[WS] Reconnecting in \(delay)s...")

        let workItem = DispatchWorkItem { [weak self] in
            guard let self, self.shouldReconnect else { return }
            let task = self.session.webSocketTask(with: url)
            self.webSocketTask = task
            self.state = .connecting
            task.resume()
            self.listenForMessages()
        }
        reconnectWorkItem = workItem
        DispatchQueue.main.asyncAfter(deadline: .now() + delay, execute: workItem)
    }

    private func resetReconnectDelay() {
        reconnectDelay = 1.0
    }
}

// MARK: - URLSessionWebSocketDelegate

extension WebSocketManager: URLSessionWebSocketDelegate {
    func urlSession(
        _ session: URLSession,
        webSocketTask: URLSessionWebSocketTask,
        didOpenWithProtocol protocol: String?
    ) {
        DispatchQueue.main.async { [weak self] in
            self?.state = .connected
            self?.resetReconnectDelay()
            self?.startPingTimer()
        }
    }

    func urlSession(
        _ session: URLSession,
        webSocketTask: URLSessionWebSocketTask,
        didCloseWith closeCode: URLSessionWebSocketTask.CloseCode,
        reason: Data?
    ) {
        DispatchQueue.main.async { [weak self] in
            self?.handleConnectionLost()
        }
    }
}
