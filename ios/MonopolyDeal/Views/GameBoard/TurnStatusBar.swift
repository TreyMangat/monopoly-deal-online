// ============================================================
// MONOPOLY DEAL ONLINE — Turn Status Bar
// ============================================================
// Top-of-screen status bar showing turn owner, avatar,
// actions remaining, and timer countdown.
// ============================================================

import SwiftUI

struct TurnStatusBar: View {
    @Environment(GameViewModel.self) private var viewModel

    private let avatars = ["😎", "🤠", "👻", "🦊", "🐙", "🤖"]

    private var state: ClientGameState? {
        viewModel.currentState
    }

    private var currentTurnPlayer: (name: String, avatar: Int)? {
        guard let state else { return nil }
        let players = [(state.you.name, state.you.avatar)]
            + state.opponents.map { ($0.name, $0.avatar) }
        guard players.indices.contains(state.currentPlayerIndex) else { return nil }
        return players[state.currentPlayerIndex]
    }

    private var isYourTurn: Bool {
        viewModel.isMyTurn
    }

    var body: some View {
        HStack(spacing: 14) {
            avatarBadge

            VStack(alignment: .leading, spacing: 4) {
                Text(titleText)
                    .font(.system(size: 18, weight: .bold, design: .rounded))
                    .foregroundStyle(GameColors.textPrimary)

                HStack(spacing: 8) {
                    actionsIndicator

                    if viewModel.timerSeconds > 0 {
                        timerBadge(seconds: viewModel.timerSeconds)
                    }
                }
            }

            Spacer()
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 14)
        .background(
            RoundedRectangle(cornerRadius: 0)
                .fill(GameColors.surface.opacity(0.98))
        )
        .overlay(alignment: .bottom) {
            Rectangle()
                .fill(.white.opacity(0.06))
                .frame(height: 1)
        }
    }

    private var avatarBadge: some View {
        ZStack {
            Circle()
                .fill(isYourTurn ? GameColors.accent : .white.opacity(0.10))
                .frame(width: 42, height: 42)

            Text(avatarEmoji(for: currentTurnPlayer?.avatar ?? 0))
                .font(.system(size: 20))
        }
    }

    private var actionsIndicator: some View {
        HStack(spacing: 5) {
            ForEach(0..<3, id: \.self) { index in
                Circle()
                    .fill(index < (state?.actionsRemaining ?? 0) ? GameColors.accent : .white.opacity(0.18))
                    .frame(width: 8, height: 8)
            }

            Text(actionsText)
                .font(.system(size: 12, weight: .semibold, design: .rounded))
                .foregroundStyle(GameColors.textSecondary)
        }
    }

    private func timerBadge(seconds: Int) -> some View {
        HStack(spacing: 6) {
            Image(systemName: "timer")
                .font(.system(size: 11, weight: .semibold))
            Text("\(seconds)s")
                .font(.system(size: 12, weight: .bold, design: .rounded))
        }
        .foregroundStyle(seconds <= 10 ? GameColors.danger : GameColors.textSecondary)
        .padding(.horizontal, 8)
        .padding(.vertical, 4)
        .background(
            Capsule()
                .fill(.white.opacity(0.06))
        )
    }

    private var titleText: String {
        guard let currentTurnPlayer else { return "Waiting for players" }
        return isYourTurn ? "Your Turn!" : "\(currentTurnPlayer.name)'s Turn"
    }

    private var actionsText: String {
        let remaining = state?.actionsRemaining ?? 0
        return "\(remaining) action\(remaining == 1 ? "" : "s") left"
    }

    private func avatarEmoji(for index: Int) -> String {
        guard index >= 0, index < avatars.count else { return "😎" }
        return avatars[index]
    }
}
