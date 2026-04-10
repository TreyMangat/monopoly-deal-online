// ============================================================
// MONOPOLY DEAL ONLINE — Opponent Inspection View
// ============================================================
// Full modal showing an opponent's public game state:
// properties by color, bank cards, totals, set progress.
// ============================================================

import SwiftUI

struct OpponentInspectionView: View {
    let opponent: OpponentView
    @Environment(\.dismiss) private var dismiss

    private let avatars = ["😎", "🤠", "👻", "🦊", "🐙", "🤖"]

    // Rent values matching server constants
    private static let rentValues: [PropertyColor: [Int]] = [
        .brown: [1, 2],
        .lightBlue: [1, 2, 3],
        .pink: [1, 2, 4],
        .orange: [1, 3, 5],
        .red: [2, 3, 6],
        .yellow: [2, 4, 6],
        .green: [2, 4, 7],
        .darkBlue: [3, 8],
        .railroad: [1, 2, 3, 4],
        .utility: [1, 2],
    ]

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 20) {
                    header
                    statsRow
                    propertiesSection
                    bankSection
                }
                .padding()
            }
            .background(GameColors.background)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button {
                        dismiss()
                    } label: {
                        Image(systemName: "xmark.circle.fill")
                            .font(.title3)
                            .foregroundStyle(GameColors.textSecondary)
                    }
                }
            }
        }
    }

    // MARK: - Header

    private var header: some View {
        VStack(spacing: 8) {
            Text(avatarEmoji)
                .font(.system(size: 48))

            Text(opponent.name)
                .font(.title2)
                .fontWeight(.bold)
                .foregroundStyle(GameColors.textPrimary)

            if !opponent.connected {
                Label("Disconnected", systemImage: "wifi.slash")
                    .font(.caption)
                    .foregroundStyle(GameColors.danger)
            }
        }
    }

    // MARK: - Quick Stats

    private var statsRow: some View {
        HStack(spacing: 16) {
            statBox(
                icon: "hand.raised",
                value: "\(opponent.handCount)",
                label: "Cards"
            )
            statBox(
                icon: "banknote",
                value: "\(totalBankValue)M",
                label: "Bank"
            )
            statBox(
                icon: "building.2",
                value: "\(completeSetsCount)",
                label: "Sets"
            )
            statBox(
                icon: "square.stack",
                value: "\(opponent.properties.count)",
                label: "Groups"
            )
        }
    }

    private func statBox(icon: String, value: String, label: String) -> some View {
        VStack(spacing: 4) {
            Image(systemName: icon)
                .font(.system(size: 14))
                .foregroundStyle(GameColors.accent)
            Text(value)
                .font(.system(size: 16, weight: .bold, design: .monospaced))
                .foregroundStyle(GameColors.textPrimary)
            Text(label)
                .font(.system(size: 10))
                .foregroundStyle(GameColors.textSecondary)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 10)
        .background(
            RoundedRectangle(cornerRadius: 10)
                .fill(GameColors.surface)
        )
    }

    // MARK: - Properties Section

    private var propertiesSection: some View {
        VStack(alignment: .leading, spacing: 10) {
            sectionHeader("Properties")

            if opponent.properties.isEmpty {
                Text("No properties")
                    .font(.caption)
                    .foregroundStyle(GameColors.textSecondary)
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 12)
            } else {
                ForEach(sortedProperties, id: \.color) { group in
                    propertyGroupCard(group)
                }
            }
        }
    }

    private func propertyGroupCard(_ group: PropertyGroup) -> some View {
        let isComplete = group.cards.count >= group.color.setSize
        let currentRent = rentForGroup(group)

        return VStack(alignment: .leading, spacing: 8) {
            // Group header
            HStack {
                Circle()
                    .fill(group.color.uiColor)
                    .frame(width: 14, height: 14)

                Text(group.color.displayName)
                    .font(.subheadline)
                    .fontWeight(.semibold)
                    .foregroundStyle(GameColors.textPrimary)

                Text("\(group.cards.count)/\(group.color.setSize)")
                    .font(.caption)
                    .foregroundStyle(GameColors.textSecondary)

                if isComplete {
                    Image(systemName: "checkmark.circle.fill")
                        .font(.caption)
                        .foregroundStyle(GameColors.success)
                }

                Spacer()

                // Upgrades
                if group.hasHouse { Text("🏠").font(.caption) }
                if group.hasHotel { Text("🏨").font(.caption) }

                // Rent if charged
                Text("Rent: \(currentRent)M")
                    .font(.system(size: 10, weight: .medium, design: .monospaced))
                    .foregroundStyle(GameColors.accent)
                    .padding(.horizontal, 6)
                    .padding(.vertical, 2)
                    .background(
                        Capsule().fill(GameColors.accent.opacity(0.15))
                    )
            }

            // Card list
            ForEach(group.cards) { card in
                HStack(spacing: 8) {
                    RoundedRectangle(cornerRadius: 3)
                        .fill(group.color.uiColor)
                        .frame(width: 4, height: 16)

                    Text(card.name)
                        .font(.caption)
                        .foregroundStyle(GameColors.textPrimary)

                    Spacer()

                    Text("\(card.bankValue)M")
                        .font(.system(size: 11, design: .monospaced))
                        .foregroundStyle(GameColors.textSecondary)

                    if card.type == .propertyWild || card.type == .propertyWildAll {
                        Text("WILD")
                            .font(.system(size: 8, weight: .bold))
                            .foregroundStyle(.orange)
                            .padding(.horizontal, 4)
                            .padding(.vertical, 1)
                            .background(
                                Capsule().fill(.orange.opacity(0.2))
                            )
                    }
                }
                .padding(.leading, 20)
            }
        }
        .padding(12)
        .background(
            RoundedRectangle(cornerRadius: 12)
                .fill(GameColors.surface)
                .overlay(
                    RoundedRectangle(cornerRadius: 12)
                        .stroke(
                            isComplete ? GameColors.success.opacity(0.4) : Color.clear,
                            lineWidth: 1
                        )
                )
        )
    }

    // MARK: - Bank Section

    private var bankSection: some View {
        VStack(alignment: .leading, spacing: 10) {
            sectionHeader("Bank")

            if opponent.bank.isEmpty {
                Text("No money in bank")
                    .font(.caption)
                    .foregroundStyle(GameColors.textSecondary)
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 12)
            } else {
                VStack(spacing: 0) {
                    ForEach(Array(opponent.bank.enumerated()), id: \.element.id) { index, card in
                        HStack {
                            Image(systemName: "banknote")
                                .font(.caption)
                                .foregroundStyle(GameColors.success)

                            Text(card.name)
                                .font(.caption)
                                .foregroundStyle(GameColors.textPrimary)

                            Spacer()

                            Text("\(card.bankValue)M")
                                .font(.system(size: 12, weight: .semibold, design: .monospaced))
                                .foregroundStyle(GameColors.textPrimary)
                        }
                        .padding(.horizontal, 12)
                        .padding(.vertical, 8)

                        if index < opponent.bank.count - 1 {
                            Divider()
                                .background(GameColors.textSecondary.opacity(0.2))
                                .padding(.leading, 36)
                        }
                    }

                    // Total
                    Divider()
                        .background(GameColors.textSecondary.opacity(0.3))

                    HStack {
                        Text("Total")
                            .font(.caption)
                            .fontWeight(.semibold)
                            .foregroundStyle(GameColors.textSecondary)

                        Spacer()

                        Text("\(totalBankValue)M")
                            .font(.system(size: 14, weight: .bold, design: .monospaced))
                            .foregroundStyle(GameColors.accent)
                    }
                    .padding(.horizontal, 12)
                    .padding(.vertical, 10)
                }
                .background(
                    RoundedRectangle(cornerRadius: 12)
                        .fill(GameColors.surface)
                )
            }
        }
    }

    // MARK: - Helpers

    private func sectionHeader(_ title: String) -> some View {
        Text(title)
            .font(.headline)
            .foregroundStyle(GameColors.textPrimary)
    }

    private var totalBankValue: Int {
        opponent.bank.reduce(0) { $0 + $1.bankValue }
    }

    private var completeSetsCount: Int {
        opponent.properties.filter { $0.cards.count >= $0.color.setSize }.count
    }

    private var sortedProperties: [PropertyGroup] {
        opponent.properties.sorted { a, b in
            let aComplete = a.cards.count >= a.color.setSize
            let bComplete = b.cards.count >= b.color.setSize
            if aComplete != bComplete { return aComplete }
            return PropertyColor.allCases.firstIndex(of: a.color)!
                < PropertyColor.allCases.firstIndex(of: b.color)!
        }
    }

    private func rentForGroup(_ group: PropertyGroup) -> Int {
        guard !group.cards.isEmpty else { return 0 }
        let tiers = Self.rentValues[group.color] ?? []
        let tierIndex = min(group.cards.count - 1, tiers.count - 1)
        guard tierIndex >= 0 else { return 0 }
        var rent = tiers[tierIndex]
        let isComplete = group.cards.count >= group.color.setSize
        if isComplete
            && group.color != .railroad
            && group.color != .utility
        {
            if group.hasHouse { rent += 3 }
            if group.hasHotel { rent += 4 }
        }
        return rent
    }

    private var avatarEmoji: String {
        guard opponent.avatar >= 0, opponent.avatar < avatars.count else { return "😎" }
        return avatars[opponent.avatar]
    }
}
