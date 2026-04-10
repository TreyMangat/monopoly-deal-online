// ============================================================
// MONOPOLY DEAL ONLINE — Discard View
// ============================================================
// Shown at end of turn when the player exceeds the 7-card
// hand limit. Requires selecting exactly the right number of
// cards to discard before ending the turn.
// ============================================================

import SwiftUI

struct DiscardView: View {
    let hand: [Card]
    let excessCount: Int
    let onDiscard: ([String]) -> Void

    @State private var selectedIds: Set<String> = []

    private var isReady: Bool {
        selectedIds.count == excessCount
    }

    var body: some View {
        ZStack {
            GameColors.background.ignoresSafeArea()

            VStack(spacing: 0) {
                header
                cardGrid
                bottomBar
            }
        }
        .interactiveDismissDisabled()
    }

    // MARK: - Header

    private var header: some View {
        VStack(spacing: 8) {
            Image(systemName: "hand.raised.slash.fill")
                .font(.system(size: 32))
                .foregroundStyle(.orange)

            Text("Hand Limit Exceeded")
                .font(.system(size: 22, weight: .bold, design: .rounded))
                .foregroundStyle(GameColors.textPrimary)

            Text("Hand limit: 7 cards. You have \(hand.count) — discard \(excessCount)")
                .font(.subheadline)
                .foregroundStyle(GameColors.textSecondary)
                .multilineTextAlignment(.center)
        }
        .padding(.vertical, 20)
        .padding(.horizontal, 16)
        .frame(maxWidth: .infinity)
        .background(GameColors.surface)
    }

    // MARK: - Card Grid

    private var cardGrid: some View {
        ScrollView {
            LazyVGrid(
                columns: Array(repeating: GridItem(.flexible(), spacing: 8), count: 3),
                spacing: 10
            ) {
                ForEach(hand) { card in
                    discardCard(card: card)
                }
            }
            .padding(16)
        }
    }

    private func discardCard(card: Card) -> some View {
        let isSelected = selectedIds.contains(card.id)

        return Button {
            toggle(card.id)
        } label: {
            VStack(spacing: 6) {
                // Card type icon
                Image(systemName: card.type.iconName)
                    .font(.title3)
                    .foregroundStyle(isSelected ? .white : cardForeground(for: card))

                // Card name
                Text(card.name)
                    .font(.caption)
                    .fontWeight(.medium)
                    .lineLimit(2)
                    .multilineTextAlignment(.center)
                    .foregroundStyle(isSelected ? .white : GameColors.textPrimary)

                // Value
                Text("$\(card.bankValue)m")
                    .font(.caption2)
                    .fontWeight(.bold)
                    .foregroundStyle(isSelected ? .white.opacity(0.8) : GameColors.textSecondary)
            }
            .frame(maxWidth: .infinity)
            .padding(.vertical, 12)
            .padding(.horizontal, 8)
            .background(
                RoundedRectangle(cornerRadius: 12)
                    .fill(isSelected ? GameColors.danger : GameColors.surface)
            )
            .overlay(
                RoundedRectangle(cornerRadius: 12)
                    .strokeBorder(
                        isSelected ? GameColors.danger : Color.white.opacity(0.1),
                        lineWidth: isSelected ? 2 : 1
                    )
            )
            .overlay(alignment: .topTrailing) {
                if isSelected {
                    Image(systemName: "xmark.circle.fill")
                        .font(.caption)
                        .foregroundStyle(.white)
                        .padding(4)
                }
            }
        }
    }

    private func cardForeground(for card: Card) -> Color {
        CardStyleConfig.backgroundColor(for: card)
    }

    // MARK: - Bottom Bar

    private var bottomBar: some View {
        VStack(spacing: 12) {
            // Counter
            HStack {
                Text("Selected: \(selectedIds.count) / \(excessCount)")
                    .font(.subheadline)
                    .fontWeight(.medium)
                    .foregroundStyle(GameColors.textPrimary)
                Spacer()
                if selectedIds.count > excessCount {
                    Text("Too many selected")
                        .font(.caption)
                        .foregroundStyle(.orange)
                }
            }

            // Discard button
            Button {
                onDiscard(Array(selectedIds))
            } label: {
                HStack {
                    Spacer()
                    Image(systemName: "trash")
                    Text("Discard & End Turn")
                        .fontWeight(.semibold)
                    Spacer()
                }
                .padding()
                .background(isReady ? GameColors.danger : .gray)
                .foregroundStyle(.white)
                .clipShape(RoundedRectangle(cornerRadius: 14))
            }
            .disabled(!isReady)
        }
        .padding(16)
        .background(
            Rectangle()
                .fill(.ultraThinMaterial)
                .ignoresSafeArea(edges: .bottom)
        )
    }

    // MARK: - Actions

    private func toggle(_ id: String) {
        if selectedIds.contains(id) {
            selectedIds.remove(id)
        } else if selectedIds.count < excessCount {
            selectedIds.insert(id)
        }
    }
}
