import SwiftUI

/// Grid of opponent avatars for selecting a target player.
struct PlayerPickerView: View {
    let opponents: [OpponentView]
    let prompt: String
    let onSelect: (String) -> Void

    private let avatarEmojis = ["😎", "🤠", "👻", "🦊", "🐙", "🤖"]
    private let columns = [
        GridItem(.flexible(), spacing: 12),
        GridItem(.flexible(), spacing: 12),
        GridItem(.flexible(), spacing: 12),
    ]

    var body: some View {
        VStack(spacing: 16) {
            Text(prompt)
                .font(.headline)
                .foregroundStyle(GameColors.textPrimary)

            LazyVGrid(columns: columns, spacing: 12) {
                ForEach(opponents) { opponent in
                    Button {
                        onSelect(opponent.id)
                    } label: {
                        VStack(spacing: 6) {
                            Text(avatarEmoji(for: opponent.avatar))
                                .font(.system(size: 36))
                            Text(opponent.name)
                                .font(.caption)
                                .fontWeight(.medium)
                                .foregroundStyle(GameColors.textPrimary)
                                .lineLimit(1)
                            HStack(spacing: 4) {
                                Image(systemName: "hand.raised")
                                    .font(.system(size: 9))
                                Text("\(opponent.handCount)")
                                    .font(.caption2)
                            }
                            .foregroundStyle(GameColors.textSecondary)
                        }
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 12)
                        .background(
                            RoundedRectangle(cornerRadius: 12)
                                .fill(GameColors.surface)
                        )
                        .overlay(
                            RoundedRectangle(cornerRadius: 12)
                                .strokeBorder(GameColors.accent.opacity(0.3), lineWidth: 1)
                        )
                    }
                    .opacity(opponent.connected ? 1.0 : 0.5)
                }
            }
        }
        .padding(.horizontal, 16)
    }

    private func avatarEmoji(for index: Int) -> String {
        guard index >= 0, index < avatarEmojis.count else { return "😎" }
        return avatarEmojis[index]
    }
}
