// ============================================================
// MONOPOLY DEAL ONLINE — Property Area View
// ============================================================
// Displays a player's property groups organized by color.
// Supports a payment mode where cards in incomplete sets
// become selectable for paying debts.
// ============================================================

import SwiftUI

struct PropertyAreaView: View {
    let properties: [PropertyGroup]
    let isPaymentMode: Bool
    @Binding var selectedCardIds: Set<String>

    var body: some View {
        if properties.isEmpty {
            emptyState
        } else {
            VStack(spacing: 8) {
                ForEach(sortedGroups, id: \.color) { group in
                    PropertyGroupRow(
                        group: group,
                        isPaymentMode: isPaymentMode,
                        selectedCardIds: $selectedCardIds
                    )
                }
            }
        }
    }

    // Sort: complete sets first, then by color order
    private var sortedGroups: [PropertyGroup] {
        properties.sorted { a, b in
            let aComplete = a.cards.count >= a.color.setSize
            let bComplete = b.cards.count >= b.color.setSize
            if aComplete != bComplete { return aComplete }
            return PropertyColor.allCases.firstIndex(of: a.color)!
                < PropertyColor.allCases.firstIndex(of: b.color)!
        }
    }

    private var emptyState: some View {
        HStack {
            Spacer()
            VStack(spacing: 4) {
                Image(systemName: "building.2")
                    .font(.title3)
                    .foregroundStyle(GameColors.textSecondary)
                Text("No properties yet")
                    .font(.caption)
                    .foregroundStyle(GameColors.textSecondary)
            }
            .padding(.vertical, 12)
            Spacer()
        }
    }
}

// MARK: - Single Property Group Row

private struct PropertyGroupRow: View {
    let group: PropertyGroup
    let isPaymentMode: Bool
    @Binding var selectedCardIds: Set<String>

    private var isComplete: Bool {
        group.cards.count >= group.color.setSize
    }

    var body: some View {
        HStack(spacing: 8) {
            // Color indicator + progress
            groupHeader
                .frame(width: 90, alignment: .leading)

            // Card chips
            cardChips
                .frame(maxWidth: .infinity, alignment: .leading)

            // Upgrades
            upgradeIcons
        }
        .padding(.horizontal, 10)
        .padding(.vertical, 6)
        .background(
            RoundedRectangle(cornerRadius: 10)
                .fill(GameColors.surface)
                .overlay(
                    RoundedRectangle(cornerRadius: 10)
                        .stroke(
                            isComplete ? GameColors.success.opacity(0.6) : Color.clear,
                            lineWidth: 1.5
                        )
                )
        )
        .shadow(
            color: isComplete ? GameColors.success.opacity(0.2) : .clear,
            radius: 4, y: 1
        )
    }

    // MARK: - Group Header

    private var groupHeader: some View {
        HStack(spacing: 6) {
            Circle()
                .fill(group.color.uiColor)
                .frame(width: 12, height: 12)

            VStack(alignment: .leading, spacing: 1) {
                Text(group.color.displayName)
                    .font(.caption2)
                    .fontWeight(.semibold)
                    .foregroundStyle(GameColors.textPrimary)
                    .lineLimit(1)

                HStack(spacing: 3) {
                    Text("\(group.cards.count)/\(group.color.setSize)")
                        .font(.system(size: 10, weight: .medium, design: .monospaced))
                        .foregroundStyle(GameColors.textSecondary)

                    if isComplete {
                        Image(systemName: "checkmark.circle.fill")
                            .font(.system(size: 9))
                            .foregroundStyle(GameColors.success)
                    }
                }
            }
        }
    }

    // MARK: - Card Chips (overlapping)

    private var cardChips: some View {
        HStack(spacing: -6) {
            ForEach(Array(group.cards.enumerated()), id: \.element.id) { index, card in
                let isSelected = selectedCardIds.contains(card.id)
                let isSelectable = isPaymentMode && !isComplete

                CardChip(
                    card: card,
                    groupColor: group.color,
                    isSelected: isSelected,
                    isSelectable: isSelectable,
                    isLocked: isPaymentMode && isComplete
                )
                .zIndex(Double(index))
                .onTapGesture {
                    guard isSelectable else { return }
                    if isSelected {
                        selectedCardIds.remove(card.id)
                    } else {
                        selectedCardIds.insert(card.id)
                    }
                }
            }
        }
    }

    // MARK: - Upgrade Icons

    @ViewBuilder
    private var upgradeIcons: some View {
        HStack(spacing: 2) {
            if group.hasHouse {
                Text("🏠")
                    .font(.system(size: 14))
            }
            if group.hasHotel {
                Text("🏨")
                    .font(.system(size: 14))
            }
        }
    }
}

// MARK: - Individual Card Chip

private struct CardChip: View {
    let card: Card
    let groupColor: PropertyColor
    let isSelected: Bool
    let isSelectable: Bool
    let isLocked: Bool

    var body: some View {
        ZStack {
            RoundedRectangle(cornerRadius: 6)
                .fill(groupColor.uiColor)
                .frame(width: 36, height: 28)

            RoundedRectangle(cornerRadius: 6)
                .stroke(borderColor, lineWidth: isSelected ? 2 : 0.5)
                .frame(width: 36, height: 28)

            // Value badge
            Text("\(card.bankValue)M")
                .font(.system(size: 9, weight: .bold, design: .monospaced))
                .foregroundStyle(groupColor.textColor)

            // Lock icon for complete sets in payment mode
            if isLocked {
                ZStack {
                    Circle()
                        .fill(.black.opacity(0.5))
                        .frame(width: 14, height: 14)
                    Image(systemName: "lock.fill")
                        .font(.system(size: 7))
                        .foregroundStyle(.white)
                }
                .offset(x: 12, y: -10)
            }

            // Selection checkmark
            if isSelected {
                ZStack {
                    Circle()
                        .fill(GameColors.accent)
                        .frame(width: 14, height: 14)
                    Image(systemName: "checkmark")
                        .font(.system(size: 7, weight: .bold))
                        .foregroundStyle(.black)
                }
                .offset(x: 12, y: -10)
            }
        }
        .opacity(isSelectable || !isLocked ? 1.0 : 0.7)
        .animation(.easeInOut(duration: 0.15), value: isSelected)
    }

    private var borderColor: Color {
        if isSelected { return GameColors.accent }
        return groupColor.textColor.opacity(0.3)
    }
}
