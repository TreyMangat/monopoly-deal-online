// ============================================================
// MONOPOLY DEAL ONLINE — Opponent Row
// ============================================================
// Compact horizontal strip showing an opponent's summary:
// avatar, name, hand count, mini property dots, bank total.
// ============================================================

import SwiftUI

struct OpponentRow: View {
    let opponent: OpponentView
    let onTap: () -> Void

    private let avatars = ["😎", "🤠", "👻", "🦊", "🐙", "🤖"]

    var body: some View {
        Button(action: onTap) {
            HStack(spacing: 8) {
                // Avatar + name
                HStack(spacing: 5) {
                    Text(avatarEmoji)
                        .font(.system(size: 20))

                    VStack(alignment: .leading, spacing: 1) {
                        Text(opponent.name)
                            .font(.caption)
                            .fontWeight(.semibold)
                            .foregroundStyle(
                                opponent.connected
                                    ? GameColors.textPrimary
                                    : GameColors.textSecondary
                            )
                            .lineLimit(1)

                        if !opponent.connected {
                            Text("Reconnecting...")
                                .font(.system(size: 8))
                                .foregroundStyle(GameColors.danger.opacity(0.8))
                        }
                    }
                }

                Spacer(minLength: 4)

                // Hand count badge
                handBadge

                // Mini property indicators
                propertyDots

                // Bank total
                bankBadge
            }
            .padding(.horizontal, 10)
            .padding(.vertical, 8)
            .background(
                RoundedRectangle(cornerRadius: 10)
                    .fill(GameColors.surface)
            )
            .opacity(opponent.connected ? 1.0 : 0.55)
        }
        .buttonStyle(.plain)
    }

    // MARK: - Subviews

    private var handBadge: some View {
        HStack(spacing: 3) {
            Image(systemName: "hand.raised")
                .font(.system(size: 9))
            Text("\(opponent.handCount)")
                .font(.system(size: 11, weight: .medium, design: .monospaced))
        }
        .foregroundStyle(GameColors.textSecondary)
        .padding(.horizontal, 6)
        .padding(.vertical, 3)
        .background(
            Capsule().fill(GameColors.background)
        )
    }

    private var propertyDots: some View {
        HStack(spacing: 3) {
            ForEach(opponent.properties, id: \.color) { group in
                let isComplete = group.cards.count >= group.color.setSize

                ZStack {
                    Circle()
                        .fill(group.color.uiColor)
                        .frame(width: 14, height: 14)

                    if isComplete {
                        Image(systemName: "checkmark")
                            .font(.system(size: 6, weight: .black))
                            .foregroundStyle(group.color.textColor)
                    } else {
                        Text("\(group.cards.count)")
                            .font(.system(size: 7, weight: .bold, design: .monospaced))
                            .foregroundStyle(group.color.textColor)
                    }
                }
            }
        }
    }

    private var bankBadge: some View {
        let total = opponent.bank.reduce(0) { $0 + $1.bankValue }
        return HStack(spacing: 2) {
            Image(systemName: "banknote")
                .font(.system(size: 9))
            Text("\(total)M")
                .font(.system(size: 11, weight: .semibold, design: .monospaced))
        }
        .foregroundStyle(GameColors.success)
        .padding(.horizontal, 6)
        .padding(.vertical, 3)
        .background(
            Capsule().fill(GameColors.background)
        )
    }

    private var avatarEmoji: String {
        guard opponent.avatar >= 0, opponent.avatar < avatars.count else { return "😎" }
        return avatars[opponent.avatar]
    }
}
