import SwiftUI

/// Shows property sets filtered by criteria (complete sets for Deal Breaker, or sets
/// matching House/Hotel placement rules). Tapping selects the entire set's color.
struct SetPickerView: View {
    let properties: [PropertyGroup]
    let prompt: String
    let onlyComplete: Bool
    let onSelect: (PropertyColor) -> Void

    /// Additional filter: only show sets that pass this predicate.
    /// Used by House (complete, no house, non-railroad/utility) and Hotel (has house, no hotel).
    var filter: ((PropertyGroup) -> Bool)?

    private var filteredSets: [PropertyGroup] {
        properties.filter { group in
            let isComplete = group.cards.count >= group.color.setSize
            if onlyComplete && !isComplete { return false }
            if let filter { return filter(group) }
            return true
        }
    }

    var body: some View {
        VStack(spacing: 16) {
            Text(prompt)
                .font(.headline)
                .foregroundStyle(GameColors.textPrimary)

            if filteredSets.isEmpty {
                Text("No eligible sets")
                    .font(.subheadline)
                    .foregroundStyle(GameColors.textSecondary)
                    .padding(.vertical, 24)
            } else {
                VStack(spacing: 10) {
                    ForEach(filteredSets, id: \.color) { group in
                        Button {
                            onSelect(group.color)
                        } label: {
                            setRow(group)
                        }
                    }
                }
            }
        }
        .padding(.horizontal, 16)
    }

    @ViewBuilder
    private func setRow(_ group: PropertyGroup) -> some View {
        HStack(spacing: 12) {
            // Color swatch
            RoundedRectangle(cornerRadius: 6)
                .fill(group.color.uiColor)
                .frame(width: 36, height: 36)
                .overlay(
                    Text("\(group.cards.count)")
                        .font(.system(size: 14, weight: .bold))
                        .foregroundStyle(group.color.textColor)
                )

            VStack(alignment: .leading, spacing: 2) {
                Text(group.color.displayName)
                    .font(.subheadline)
                    .fontWeight(.semibold)
                    .foregroundStyle(GameColors.textPrimary)

                HStack(spacing: 4) {
                    Text("\(group.cards.count)/\(group.color.setSize)")
                        .font(.caption2)
                    if group.cards.count >= group.color.setSize {
                        Image(systemName: "checkmark.seal.fill")
                            .font(.system(size: 9))
                            .foregroundStyle(GameColors.success)
                    }
                    if group.hasHouse {
                        Image(systemName: "house.fill")
                            .font(.system(size: 9))
                            .foregroundStyle(.orange)
                    }
                    if group.hasHotel {
                        Image(systemName: "building.2.fill")
                            .font(.system(size: 9))
                            .foregroundStyle(.red)
                    }
                }
                .foregroundStyle(GameColors.textSecondary)
            }

            Spacer()

            // Card names preview
            VStack(alignment: .trailing, spacing: 1) {
                ForEach(group.cards.prefix(3)) { card in
                    Text(card.name)
                        .font(.system(size: 9))
                        .foregroundStyle(GameColors.textSecondary)
                        .lineLimit(1)
                }
            }

            Image(systemName: "chevron.right")
                .font(.system(size: 12))
                .foregroundStyle(GameColors.textSecondary)
        }
        .padding(12)
        .background(
            RoundedRectangle(cornerRadius: 12)
                .fill(GameColors.surface)
        )
        .overlay(
            RoundedRectangle(cornerRadius: 12)
                .strokeBorder(group.color.uiColor.opacity(0.3), lineWidth: 1)
        )
    }
}
