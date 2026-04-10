import SwiftUI

// MARK: - CardView

/// Renders a single Monopoly Deal card with type-appropriate layout.
/// Handles property, money, action, and rent card types using the shared design system.
struct CardView: View {
    let card: Card
    var isSelected: Bool = false
    var isFaceDown: Bool = false
    var size: CGSize? = nil

    private var cardSize: CGSize {
        size ?? CGSize(width: 80, height: 112)
    }

    var body: some View {
        if isFaceDown {
            CardBackView(size: cardSize)
        } else {
            cardFace
        }
    }

    private var cardFace: some View {
        VStack(alignment: .leading, spacing: 3) {
            // Category badge
            HStack(spacing: 4) {
                Image(systemName: card.type.iconName)
                    .font(.system(size: 8, weight: .bold))
                Text(categoryLabel)
                    .font(.system(size: 8, weight: .semibold))
                    .textCase(.uppercase)
            }
            .foregroundStyle(textColor.opacity(0.7))

            Spacer(minLength: 0)

            // Color indicators for wild / rent cards
            if let dots = colorDots, !dots.isEmpty {
                HStack(spacing: 3) {
                    ForEach(dots, id: \.self) { propColor in
                        Circle()
                            .fill(propColor.uiColor)
                            .frame(width: 10, height: 10)
                            .overlay(
                                Circle()
                                    .stroke(Color.white.opacity(0.5), lineWidth: 0.5)
                            )
                    }
                }
            }

            // Card name
            Text(card.name)
                .font(.system(size: 11, weight: .bold))
                .foregroundStyle(textColor)
                .lineLimit(2)
                .minimumScaleFactor(0.7)

            // Bank value
            Text("$\(card.bankValue)M")
                .font(.system(size: 10, weight: .semibold, design: .rounded))
                .foregroundStyle(textColor.opacity(0.8))
        }
        .padding(6)
        .frame(width: cardSize.width, height: cardSize.height, alignment: .leading)
        .background(CardStyleConfig.backgroundColor(for: card))
        .clipShape(RoundedRectangle(cornerRadius: CardStyleConfig.cardCornerRadius))
        .overlay(
            RoundedRectangle(cornerRadius: CardStyleConfig.cardCornerRadius)
                .stroke(
                    isSelected ? Color.yellow : Color.white.opacity(0.15),
                    lineWidth: isSelected ? 3 : CardStyleConfig.cardBorderWidth
                )
        )
        .shadow(color: isSelected ? Color.yellow.opacity(0.4) : Color.black.opacity(0.3),
                radius: isSelected ? 8 : 3,
                y: isSelected ? 0 : 2)
        .scaleEffect(isSelected ? 1.08 : 1.0)
        .animation(.easeInOut(duration: 0.15), value: isSelected)
    }

    // MARK: - Derived display properties

    private var textColor: Color {
        if let color = card.color {
            return color.textColor
        }
        // Money and action cards use white text
        return .white
    }

    private var categoryLabel: String {
        switch card.type {
        case .property:
            return card.color?.displayName ?? "Property"
        case .propertyWild:
            return "Wild"
        case .propertyWildAll:
            return "Wild All"
        case .money:
            return "Money"
        case .rentWild:
            return "Rent (Any)"
        case .rentTwoColor:
            return "Rent"
        case .actionPassGo:
            return "Pass Go"
        case .actionDebtCollector:
            return "Debt Collector"
        case .actionItsMyBirthday:
            return "Birthday"
        case .actionSlyDeal:
            return "Sly Deal"
        case .actionForcedDeal:
            return "Forced Deal"
        case .actionDealBreaker:
            return "Deal Breaker"
        case .actionJustSayNo:
            return "Just Say No"
        case .actionDoubleRent:
            return "Double Rent"
        case .actionHouse:
            return "House"
        case .actionHotel:
            return "Hotel"
        }
    }

    /// Color dots to show for multi-color cards.
    private var colorDots: [PropertyColor]? {
        switch card.type {
        case .propertyWild:
            return [card.color, card.altColor].compactMap { $0 }
        case .propertyWildAll:
            return PropertyColor.allCases
        case .rentTwoColor:
            return card.rentColors
        case .rentWild:
            return [PropertyColor]() // rainbow rent has no fixed dots
        default:
            return nil
        }
    }
}

// MARK: - Previews

#Preview("Money Card") {
    CardView(card: Card(
        id: "prev_money",
        type: .money,
        name: "$5M",
        bankValue: 5
    ))
    .padding()
    .background(GameColors.background)
}

#Preview("Property Card") {
    CardView(card: Card(
        id: "prev_prop",
        type: .property,
        name: "Park Place",
        bankValue: 4,
        color: .darkBlue
    ))
    .padding()
    .background(GameColors.background)
}

#Preview("Wild Property") {
    CardView(card: Card(
        id: "prev_wild",
        type: .propertyWild,
        name: "Wild",
        bankValue: 4,
        color: .darkBlue,
        altColor: .green
    ))
    .padding()
    .background(GameColors.background)
}

#Preview("Action Card") {
    CardView(card: Card(
        id: "prev_action",
        type: .actionDealBreaker,
        name: "Deal Breaker",
        bankValue: 5
    ))
    .padding()
    .background(GameColors.background)
}

#Preview("Rent Card") {
    CardView(card: Card(
        id: "prev_rent",
        type: .rentTwoColor,
        name: "Rent",
        bankValue: 1,
        rentColors: [.darkBlue, .green]
    ))
    .padding()
    .background(GameColors.background)
}

#Preview("Selected") {
    CardView(card: Card(
        id: "prev_sel",
        type: .actionPassGo,
        name: "Pass Go",
        bankValue: 1
    ), isSelected: true)
    .padding()
    .background(GameColors.background)
}

#Preview("Card Back") {
    CardView(card: Card(
        id: "prev_back",
        type: .money,
        name: "$1M",
        bankValue: 1
    ), isFaceDown: true)
    .padding()
    .background(GameColors.background)
}

#Preview("Hand Row") {
    let sampleCards: [Card] = [
        Card(id: "h1", type: .money, name: "$3M", bankValue: 3),
        Card(id: "h2", type: .property, name: "Baltic Avenue", bankValue: 1, color: .brown),
        Card(id: "h3", type: .actionPassGo, name: "Pass Go", bankValue: 1),
        Card(id: "h4", type: .rentTwoColor, name: "Rent", bankValue: 1, rentColors: [.red, .yellow]),
        Card(id: "h5", type: .propertyWild, name: "Wild", bankValue: 2, color: .pink, altColor: .orange),
    ]
    ScrollView(.horizontal, showsIndicators: false) {
        HStack(spacing: 8) {
            ForEach(sampleCards) { card in
                CardView(card: card, isSelected: card.id == "h3")
            }
        }
        .padding(.horizontal)
    }
    .padding(.vertical)
    .background(GameColors.surface)
}
