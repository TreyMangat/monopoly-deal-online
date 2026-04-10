import SwiftUI

/// Lists property groups with individually tappable cards.
/// Complete sets can be grayed out and locked via `disableCompleteSets`.
struct PropertyPickerView: View {
    let properties: [PropertyGroup]
    let prompt: String
    let disableCompleteSets: Bool
    let onSelect: (String) -> Void

    var body: some View {
        VStack(spacing: 16) {
            Text(prompt)
                .font(.headline)
                .foregroundStyle(GameColors.textPrimary)

            if properties.isEmpty {
                Text("No properties")
                    .font(.subheadline)
                    .foregroundStyle(GameColors.textSecondary)
                    .padding(.vertical, 24)
            } else {
                ScrollView {
                    VStack(spacing: 12) {
                        ForEach(properties, id: \.color) { group in
                            propertyGroupRow(group)
                        }
                    }
                }
                .frame(maxHeight: 300)
            }
        }
        .padding(.horizontal, 16)
    }

    @ViewBuilder
    private func propertyGroupRow(_ group: PropertyGroup) -> some View {
        let isComplete = group.cards.count >= group.color.setSize
        let isLocked = disableCompleteSets && isComplete

        VStack(alignment: .leading, spacing: 8) {
            // Group header
            HStack(spacing: 6) {
                Circle()
                    .fill(group.color.uiColor)
                    .frame(width: 12, height: 12)
                Text(group.color.displayName)
                    .font(.caption)
                    .fontWeight(.semibold)
                    .foregroundStyle(GameColors.textPrimary)
                Text("\(group.cards.count)/\(group.color.setSize)")
                    .font(.caption2)
                    .foregroundStyle(GameColors.textSecondary)
                if isComplete {
                    Image(systemName: "checkmark.seal.fill")
                        .font(.system(size: 10))
                        .foregroundStyle(GameColors.success)
                }
                if isLocked {
                    Image(systemName: "lock.fill")
                        .font(.system(size: 10))
                        .foregroundStyle(GameColors.textSecondary)
                }
                Spacer()
                if group.hasHouse {
                    Image(systemName: "house.fill")
                        .font(.system(size: 10))
                        .foregroundStyle(.orange)
                }
                if group.hasHotel {
                    Image(systemName: "building.2.fill")
                        .font(.system(size: 10))
                        .foregroundStyle(.red)
                }
            }

            // Individual cards
            ForEach(group.cards) { card in
                Button {
                    if !isLocked {
                        onSelect(card.id)
                    }
                } label: {
                    HStack(spacing: 8) {
                        RoundedRectangle(cornerRadius: 4)
                            .fill(group.color.uiColor)
                            .frame(width: 6, height: 28)
                        VStack(alignment: .leading, spacing: 1) {
                            Text(card.name)
                                .font(.subheadline)
                                .foregroundStyle(isLocked ? GameColors.textSecondary : GameColors.textPrimary)
                            Text("$\(card.bankValue)M")
                                .font(.caption2)
                                .foregroundStyle(GameColors.textSecondary)
                        }
                        Spacer()
                        if card.type == .propertyWild || card.type == .propertyWildAll {
                            Text("WILD")
                                .font(.system(size: 9, weight: .bold))
                                .padding(.horizontal, 6)
                                .padding(.vertical, 2)
                                .background(Capsule().fill(GameColors.accent.opacity(0.3)))
                                .foregroundStyle(GameColors.accent)
                        }
                        Image(systemName: "chevron.right")
                            .font(.system(size: 11))
                            .foregroundStyle(isLocked ? GameColors.textSecondary.opacity(0.3) : GameColors.textSecondary)
                    }
                    .padding(.horizontal, 10)
                    .padding(.vertical, 8)
                    .background(
                        RoundedRectangle(cornerRadius: 8)
                            .fill(isLocked ? GameColors.surface.opacity(0.5) : GameColors.surface)
                    )
                }
                .disabled(isLocked)
            }
        }
        .padding(12)
        .background(
            RoundedRectangle(cornerRadius: 12)
                .fill(GameColors.background)
        )
        .overlay(
            RoundedRectangle(cornerRadius: 12)
                .strokeBorder(group.color.uiColor.opacity(0.3), lineWidth: 1)
        )
    }
}
