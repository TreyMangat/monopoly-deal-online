import SwiftUI

// MARK: - HandView

/// Displays the player's hand as a horizontally scrollable row of tappable cards.
/// Cards are interactive only when it's the player's turn and actions remain.
struct HandView: View {
    let hand: [Card]
    let actionsRemaining: Int
    let isMyTurn: Bool
    let onCardTapped: (Card) -> Void

    @State private var selectedCardId: String? = nil

    private var isInteractive: Bool {
        isMyTurn && actionsRemaining > 0
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            // Header
            HStack {
                Text("Your Hand (\(hand.count))")
                    .font(.system(size: 12, weight: .semibold))
                    .foregroundStyle(GameColors.textSecondary)

                Spacer()

                if isMyTurn {
                    Text("\(actionsRemaining) action\(actionsRemaining == 1 ? "" : "s") left")
                        .font(.system(size: 12, weight: .semibold))
                        .foregroundStyle(Color.orange)
                }
            }
            .padding(.horizontal, 12)

            // Cards
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 8) {
                    ForEach(hand) { card in
                        CardView(
                            card: card,
                            isSelected: selectedCardId == card.id
                        )
                        .onTapGesture {
                            guard isInteractive else { return }
                            if selectedCardId == card.id {
                                selectedCardId = nil
                            } else {
                                selectedCardId = card.id
                            }
                            onCardTapped(card)
                        }
                    }
                }
                .padding(.horizontal, 12)
                .padding(.vertical, 4)
            }
        }
        .padding(.vertical, 8)
        .background(GameColors.surface)
        .opacity(isInteractive ? 1.0 : 0.5)
        .animation(.easeInOut(duration: 0.2), value: isMyTurn)
        .onChange(of: hand.count) {
            // Clear selection when hand changes (card was played)
            if let id = selectedCardId, !hand.contains(where: { $0.id == id }) {
                selectedCardId = nil
            }
        }
    }
}

// MARK: - Previews

private let previewHand: [Card] = [
    Card(id: "h1", type: .money, name: "$3M", bankValue: 3),
    Card(id: "h2", type: .property, name: "Baltic Avenue", bankValue: 1, color: .brown),
    Card(id: "h3", type: .actionPassGo, name: "Pass Go", bankValue: 1),
    Card(id: "h4", type: .rentTwoColor, name: "Rent", bankValue: 1, rentColors: [.red, .yellow]),
    Card(id: "h5", type: .propertyWild, name: "Wild", bankValue: 2, color: .pink, altColor: .orange),
    Card(id: "h6", type: .actionDoubleRent, name: "Double the Rent", bankValue: 1),
    Card(id: "h7", type: .money, name: "$5M", bankValue: 5),
]

#Preview("My Turn") {
    HandView(
        hand: previewHand,
        actionsRemaining: 2,
        isMyTurn: true,
        onCardTapped: { card in print("Tapped: \(card.name)") }
    )
    .background(GameColors.background)
}

#Preview("Not My Turn") {
    HandView(
        hand: previewHand,
        actionsRemaining: 0,
        isMyTurn: false,
        onCardTapped: { _ in }
    )
    .background(GameColors.background)
}

#Preview("Empty Hand") {
    HandView(
        hand: [],
        actionsRemaining: 3,
        isMyTurn: true,
        onCardTapped: { _ in }
    )
    .background(GameColors.background)
}
