import SwiftUI

// MARK: - BankView

/// Displays the player's bank as a horizontal row of small card chips.
/// In payment mode, cards become selectable with checkmark overlays.
struct BankView: View {
    let bank: [Card]
    var isPaymentMode: Bool = false
    @Binding var selectedCardIds: Set<String>
    var onCardTapped: ((Card) -> Void)? = nil

    private var totalValue: Int {
        bank.reduce(0) { $0 + $1.bankValue }
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            // Header with total
            HStack {
                Image(systemName: "banknote")
                    .font(.system(size: 12))
                    .foregroundStyle(GameColors.success)
                Text("Bank: $\(totalValue)M")
                    .font(.system(size: 14, weight: .bold, design: .rounded))
                    .foregroundStyle(GameColors.success)

                if isPaymentMode {
                    Spacer()
                    let selectedTotal = bank
                        .filter { selectedCardIds.contains($0.id) }
                        .reduce(0) { $0 + $1.bankValue }
                    Text("Selected: $\(selectedTotal)M")
                        .font(.system(size: 12, weight: .semibold))
                        .foregroundStyle(Color.orange)
                }
            }

            if bank.isEmpty {
                Text("Empty")
                    .font(.system(size: 12))
                    .foregroundStyle(GameColors.textSecondary)
                    .padding(.vertical, 4)
            } else {
                // Card chips
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: 6) {
                        ForEach(bank) { card in
                            bankChip(for: card)
                        }
                    }
                }
            }
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 8)
    }

    @ViewBuilder
    private func bankChip(for card: Card) -> some View {
        let isSelected = selectedCardIds.contains(card.id)

        HStack(spacing: 4) {
            if isPaymentMode {
                Image(systemName: isSelected ? "checkmark.circle.fill" : "circle")
                    .font(.system(size: 12))
                    .foregroundStyle(isSelected ? Color.orange : GameColors.textSecondary)
            }
            Text("$\(card.bankValue)M")
                .font(.system(size: 12, weight: .bold, design: .rounded))
                .foregroundStyle(GameColors.success)
            Text(card.name)
                .font(.system(size: 10))
                .foregroundStyle(GameColors.textSecondary)
                .lineLimit(1)
        }
        .padding(.horizontal, 8)
        .padding(.vertical, 5)
        .background(
            RoundedRectangle(cornerRadius: 6)
                .fill(isSelected ? GameColors.surface.opacity(0.8) : GameColors.surface)
                .overlay(
                    RoundedRectangle(cornerRadius: 6)
                        .stroke(
                            isSelected ? Color.orange : Color.white.opacity(0.1),
                            lineWidth: isSelected ? 2 : 1
                        )
                )
        )
        .onTapGesture {
            guard isPaymentMode else { return }
            if selectedCardIds.contains(card.id) {
                selectedCardIds.remove(card.id)
            } else {
                selectedCardIds.insert(card.id)
            }
            onCardTapped?(card)
        }
    }
}

// MARK: - Previews

private let previewBank: [Card] = [
    Card(id: "b1", type: .money, name: "$1M", bankValue: 1),
    Card(id: "b2", type: .money, name: "$2M", bankValue: 2),
    Card(id: "b3", type: .money, name: "$5M", bankValue: 5),
    Card(id: "b4", type: .actionPassGo, name: "Pass Go", bankValue: 1),
    Card(id: "b5", type: .money, name: "$3M", bankValue: 3),
]

#Preview("Display Mode") {
    BankView(
        bank: previewBank,
        selectedCardIds: .constant([])
    )
    .background(GameColors.background)
}

#Preview("Payment Mode") {
    BankView(
        bank: previewBank,
        isPaymentMode: true,
        selectedCardIds: .constant(["b2", "b3"])
    )
    .background(GameColors.background)
}

#Preview("Empty Bank") {
    BankView(
        bank: [],
        selectedCardIds: .constant([])
    )
    .background(GameColors.background)
}
