// ============================================================
// MONOPOLY DEAL ONLINE — Lobby View
// ============================================================

import SwiftUI

struct LobbyView: View {
    @Environment(GameViewModel.self) private var viewModel

    private let avatars = ["😎", "🤠", "👻", "🦊", "🐙", "🤖"]

    var body: some View {
        VStack(spacing: 24) {
            // Room code header
            if let roomInfo = viewModel.roomInfo {
                VStack(spacing: 8) {
                    Text("Room Code")
                        .font(.caption)
                        .foregroundStyle(.secondary)

                    HStack(spacing: 12) {
                        Text(roomInfo.code)
                            .font(.system(size: 36, weight: .bold, design: .monospaced))
                            .tracking(4)

                        Button {
                            UIPasteboard.general.string = roomInfo.code
                        } label: {
                            Image(systemName: "doc.on.doc")
                                .font(.title3)
                        }
                    }
                }
                .padding()
                .background(
                    RoundedRectangle(cornerRadius: 16)
                        .fill(.ultraThinMaterial)
                )
            }

            // Player list
            if let roomInfo = viewModel.roomInfo {
                VStack(alignment: .leading, spacing: 0) {
                    ForEach(roomInfo.players) { player in
                        HStack(spacing: 12) {
                            Text(avatarEmoji(for: player.avatar))
                                .font(.title2)

                            Text(player.name)
                                .fontWeight(.medium)

                            Spacer()

                            if player.id == roomInfo.hostId {
                                Text("HOST")
                                    .font(.caption2)
                                    .fontWeight(.bold)
                                    .padding(.horizontal, 8)
                                    .padding(.vertical, 3)
                                    .background(.orange)
                                    .foregroundStyle(.white)
                                    .clipShape(Capsule())
                            }

                            if player.id == viewModel.playerId {
                                Text("YOU")
                                    .font(.caption2)
                                    .fontWeight(.bold)
                                    .padding(.horizontal, 8)
                                    .padding(.vertical, 3)
                                    .background(.blue)
                                    .foregroundStyle(.white)
                                    .clipShape(Capsule())
                            }
                        }
                        .padding(.horizontal, 16)
                        .padding(.vertical, 12)

                        if player.id != roomInfo.players.last?.id {
                            Divider().padding(.leading, 56)
                        }
                    }
                }
                .background(
                    RoundedRectangle(cornerRadius: 16)
                        .fill(.ultraThinMaterial)
                )

                // Player count
                Text("\(roomInfo.players.count) / \(roomInfo.maxPlayers) players")
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
            }

            Spacer()

            // Error display
            if let error = viewModel.errorMessage {
                Text(error)
                    .font(.subheadline)
                    .foregroundStyle(.red)
                    .padding()
                    .background(
                        RoundedRectangle(cornerRadius: 10)
                            .fill(.red.opacity(0.1))
                    )
            }

            // Start game button (host only)
            if viewModel.isHost {
                let playerCount = viewModel.roomInfo?.players.count ?? 0
                Button {
                    viewModel.startGame()
                } label: {
                    HStack {
                        Spacer()
                        Text("Start Game")
                            .fontWeight(.semibold)
                        Spacer()
                    }
                    .padding()
                    .background(playerCount >= 2 ? .blue : .gray)
                    .foregroundStyle(.white)
                    .clipShape(RoundedRectangle(cornerRadius: 14))
                }
                .disabled(playerCount < 2)
                .padding(.horizontal, 32)
            } else {
                Text("Waiting for host to start...")
                    .foregroundStyle(.secondary)
            }
        }
        .padding()
        .navigationTitle("Lobby")
        .navigationBarTitleDisplayMode(.inline)
        .onChange(of: viewModel.currentState?.phase) { oldPhase, newPhase in
            if (oldPhase == nil || oldPhase == .waitingToStart),
               let phase = newPhase,
               phase != .waitingToStart {
                viewModel.navigationPath.append(.gameBoard)
            }
        }
    }

    private func avatarEmoji(for index: Int) -> String {
        guard index >= 0 && index < avatars.count else { return "😎" }
        return avatars[index]
    }
}
