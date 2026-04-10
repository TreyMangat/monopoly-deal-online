// ============================================================
// MONOPOLY DEAL ONLINE — Game Over View
// ============================================================
// Celebration screen shown when a player wins by collecting
// 3 complete property sets of different colors.
// ============================================================

import SwiftUI

struct GameOverView: View {
    let winnerId: String
    let winnerName: String
    let state: ClientGameState
    let onPlayAgain: () -> Void
    let onMenu: () -> Void

    private let avatars = ["😎", "🤠", "👻", "🦊", "🐙", "🤖"]

    private var isWinner: Bool {
        winnerId == state.you.id
    }

    /// The winner's complete property sets (3+ cards matching set size).
    private var winningSets: [PropertyGroup] {
        let properties: [PropertyGroup]
        if winnerId == state.you.id {
            properties = state.you.properties
        } else if let opponent = state.opponents.first(where: { $0.id == winnerId }) {
            properties = opponent.properties
        } else {
            properties = []
        }
        return properties.filter { $0.cards.count >= $0.color.setSize }
    }

    private var winnerAvatar: String {
        let avatarIndex: Int
        if winnerId == state.you.id {
            avatarIndex = state.you.avatar
        } else if let opponent = state.opponents.first(where: { $0.id == winnerId }) {
            avatarIndex = opponent.avatar
        } else {
            avatarIndex = 0
        }
        guard avatarIndex >= 0 && avatarIndex < avatars.count else { return "😎" }
        return avatars[avatarIndex]
    }

    var body: some View {
        ZStack {
            GameColors.background.ignoresSafeArea()

            ScrollView {
                VStack(spacing: 32) {
                    Spacer(minLength: 40)

                    celebrationHeader
                    winningSetsSection
                    gameStats
                    actionButtons

                    Spacer(minLength: 24)
                }
                .padding(.horizontal, 24)
            }
        }
    }

    // MARK: - Celebration Header

    private var celebrationHeader: some View {
        VStack(spacing: 16) {
            // Avatar
            Text(winnerAvatar)
                .font(.system(size: 72))

            // Winner name
            Text(isWinner ? "You Win!" : "\(winnerName) Wins!")
                .font(.system(size: 36, weight: .black, design: .rounded))
                .foregroundStyle(GameColors.accent)

            // Subtitle
            Text(isWinner ? "Congratulations!" : "Better luck next time")
                .font(.title3)
                .foregroundStyle(GameColors.textSecondary)

            // Win badge
            Text("3 COMPLETE SETS")
                .font(.caption)
                .fontWeight(.black)
                .padding(.horizontal, 16)
                .padding(.vertical, 6)
                .background(GameColors.success)
                .foregroundStyle(.white)
                .clipShape(Capsule())
        }
    }

    // MARK: - Winning Sets

    private var winningSetsSection: some View {
        VStack(alignment: .leading, spacing: 16) {
            Text("WINNING SETS")
                .font(.caption)
                .fontWeight(.bold)
                .foregroundStyle(GameColors.textSecondary)

            ForEach(winningSets.prefix(3), id: \.color) { group in
                winningSetRow(group: group)
            }
        }
        .padding(16)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(
            RoundedRectangle(cornerRadius: 16)
                .fill(.ultraThinMaterial)
        )
    }

    private func winningSetRow(group: PropertyGroup) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            // Color header
            HStack(spacing: 8) {
                RoundedRectangle(cornerRadius: 4)
                    .fill(group.color.uiColor)
                    .frame(width: 24, height: 16)

                Text(group.color.displayName)
                    .font(.subheadline)
                    .fontWeight(.bold)
                    .foregroundStyle(GameColors.textPrimary)

                Text("\(group.cards.count)/\(group.color.setSize)")
                    .font(.caption)
                    .foregroundStyle(GameColors.textSecondary)

                if group.hasHouse {
                    Text("🏠")
                        .font(.caption)
                }
                if group.hasHotel {
                    Text("🏨")
                        .font(.caption)
                }
            }

            // Cards in set
            FlowLayout(spacing: 6) {
                ForEach(group.cards) { card in
                    Text(card.name)
                        .font(.caption)
                        .fontWeight(.medium)
                        .padding(.horizontal, 8)
                        .padding(.vertical, 4)
                        .background(
                            RoundedRectangle(cornerRadius: 6)
                                .fill(group.color.uiColor.opacity(0.2))
                        )
                        .foregroundStyle(GameColors.textPrimary)
                }
            }
        }
        .padding(12)
        .background(
            RoundedRectangle(cornerRadius: 12)
                .fill(GameColors.surface)
        )
    }

    // MARK: - Game Stats

    private var gameStats: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("GAME STATS")
                .font(.caption)
                .fontWeight(.bold)
                .foregroundStyle(GameColors.textSecondary)

            HStack(spacing: 0) {
                statItem(
                    icon: "arrow.triangle.2.circlepath",
                    label: "Turns",
                    value: "\(state.turnNumber)"
                )

                Divider()
                    .frame(height: 40)

                statItem(
                    icon: "person.2.fill",
                    label: "Players",
                    value: "\(state.opponents.count + 1)"
                )

                Divider()
                    .frame(height: 40)

                statItem(
                    icon: "rectangle.stack.fill",
                    label: "Cards Left",
                    value: "\(state.drawPileCount)"
                )
            }
        }
        .padding(16)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(
            RoundedRectangle(cornerRadius: 16)
                .fill(.ultraThinMaterial)
        )
    }

    private func statItem(icon: String, label: String, value: String) -> some View {
        VStack(spacing: 4) {
            Image(systemName: icon)
                .font(.title3)
                .foregroundStyle(GameColors.accent)

            Text(value)
                .font(.system(.title2, design: .monospaced))
                .fontWeight(.bold)
                .foregroundStyle(GameColors.textPrimary)

            Text(label)
                .font(.caption2)
                .foregroundStyle(GameColors.textSecondary)
        }
        .frame(maxWidth: .infinity)
    }

    // MARK: - Action Buttons

    private var actionButtons: some View {
        VStack(spacing: 12) {
            Button(action: onPlayAgain) {
                HStack {
                    Spacer()
                    Image(systemName: "arrow.counterclockwise")
                    Text("Play Again")
                        .fontWeight(.semibold)
                    Spacer()
                }
                .padding()
                .background(GameColors.accent)
                .foregroundStyle(.black)
                .clipShape(RoundedRectangle(cornerRadius: 14))
            }

            Button(action: onMenu) {
                HStack {
                    Spacer()
                    Image(systemName: "house.fill")
                    Text("Back to Menu")
                        .fontWeight(.semibold)
                    Spacer()
                }
                .padding()
                .background(GameColors.surface)
                .foregroundStyle(GameColors.textPrimary)
                .clipShape(RoundedRectangle(cornerRadius: 14))
            }
        }
    }
}
