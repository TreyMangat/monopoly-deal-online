import SwiftUI

/// Bottom sheet showing legal actions for a tapped card.
///
/// Multi-step actions use a state machine:
/// step1 (choose action) -> step2 (choose target/color) -> step3 (choose card) -> confirm
struct CardActionSheet: View {
    let card: Card
    let player: PlayerState
    let opponents: [OpponentView]
    let actionsRemaining: Int
    let onAction: (PlayerAction) -> Void
    let onDismiss: () -> Void

    @State private var step: ActionStep = .chooseAction
    @State private var selectedTargetId: String?
    @State private var selectedColor: PropertyColor?
    @State private var selectedCardId: String?
    @State private var offeredCardId: String?

    var body: some View {
        VStack(spacing: 0) {
            // Drag handle
            Capsule()
                .fill(Color.white.opacity(0.3))
                .frame(width: 36, height: 4)
                .padding(.top, 10)

            // Card header
            cardHeader
                .padding(.horizontal, 16)
                .padding(.top, 12)
                .padding(.bottom, 8)

            Divider()
                .overlay(GameColors.textSecondary.opacity(0.2))

            // Step content
            ScrollView {
                stepContent
                    .padding(.vertical, 16)
            }
            .frame(maxHeight: 400)

            Divider()
                .overlay(GameColors.textSecondary.opacity(0.2))

            // Bank as money (always available) + dismiss
            bottomBar
                .padding(16)
        }
        .background(GameColors.background)
        .clipShape(RoundedRectangle(cornerRadius: 20))
    }

    // MARK: - Card Header

    private var cardHeader: some View {
        HStack(spacing: 12) {
            RoundedRectangle(cornerRadius: CardStyleConfig.cardCornerRadius)
                .fill(CardStyleConfig.backgroundColor(for: card))
                .frame(width: 44, height: 62)
                .overlay(
                    VStack(spacing: 2) {
                        Image(systemName: card.type.iconName)
                            .font(.system(size: 14))
                        Text("$\(card.bankValue)M")
                            .font(.system(size: 9, weight: .bold))
                    }
                    .foregroundStyle(card.color?.textColor ?? .white)
                )

            VStack(alignment: .leading, spacing: 3) {
                Text(card.name)
                    .font(.subheadline)
                    .fontWeight(.semibold)
                    .foregroundStyle(GameColors.textPrimary)
                Text(card.type.displayCategory)
                    .font(.caption)
                    .foregroundStyle(GameColors.textSecondary)
            }

            Spacer()

            if step != .chooseAction {
                Button {
                    goBack()
                } label: {
                    HStack(spacing: 4) {
                        Image(systemName: "chevron.left")
                            .font(.system(size: 11))
                        Text("Back")
                            .font(.caption)
                    }
                    .foregroundStyle(GameColors.accent)
                }
            }
        }
    }

    // MARK: - Step Content

    @ViewBuilder
    private var stepContent: some View {
        switch step {
        case .chooseAction:
            actionButtons

        case .chooseTarget:
            PlayerPickerView(
                opponents: opponents,
                prompt: targetPrompt
            ) { targetId in
                selectedTargetId = targetId
                advanceFromTargetPick()
            }

        case .chooseColor:
            ColorPickerView(
                colors: availableColors,
                prompt: "Choose a color"
            ) { color in
                selectedColor = color
                advanceFromColorPick()
            }

        case .chooseTargetCard:
            if let targetId = selectedTargetId,
               let target = opponents.first(where: { $0.id == targetId }) {
                PropertyPickerView(
                    properties: target.properties,
                    prompt: "Choose a card from \(target.name)",
                    disableCompleteSets: card.type == .actionSlyDeal || card.type == .actionForcedDeal
                ) { cardId in
                    selectedCardId = cardId
                    advanceFromTargetCardPick()
                }
            }

        case .chooseOwnCard:
            PropertyPickerView(
                properties: player.properties,
                prompt: "Choose your card to offer",
                disableCompleteSets: true
            ) { cardId in
                offeredCardId = cardId
                // Next: pick target player for forced deal
                step = .chooseTarget
            }

        case .chooseSet:
            setPickerForCurrentCard

        case .confirm:
            confirmView
        }
    }

    // MARK: - Action Buttons (Step 1)

    private var actionButtons: some View {
        VStack(spacing: 8) {
            ForEach(primaryActions, id: \.label) { action in
                Button {
                    action.onTap()
                } label: {
                    HStack(spacing: 10) {
                        Image(systemName: action.icon)
                            .font(.system(size: 14))
                            .frame(width: 20)
                        Text(action.label)
                            .font(.subheadline)
                            .fontWeight(.medium)
                        Spacer()
                        Image(systemName: "chevron.right")
                            .font(.system(size: 11))
                    }
                    .foregroundStyle(action.enabled ? GameColors.textPrimary : GameColors.textSecondary)
                    .padding(.horizontal, 16)
                    .padding(.vertical, 12)
                    .background(
                        RoundedRectangle(cornerRadius: 10)
                            .fill(action.enabled ? GameColors.surface : GameColors.surface.opacity(0.5))
                    )
                }
                .disabled(!action.enabled)
            }
        }
        .padding(.horizontal, 16)
    }

    // MARK: - Primary Actions

    private struct ActionOption {
        let icon: String
        let label: String
        let enabled: Bool
        let onTap: () -> Void
    }

    private var primaryActions: [ActionOption] {
        switch card.type {
        case .money:
            return [ActionOption(
                icon: "banknote",
                label: "Bank $\(card.bankValue)M",
                enabled: true
            ) {
                emit(.playMoneyToBank)
            }]

        case .property:
            return [ActionOption(
                icon: "building.2",
                label: "Play to \(card.color?.displayName ?? "property")",
                enabled: true
            ) {
                emit(.playPropertyCard, destinationColor: card.color)
            }]

        case .propertyWild:
            var options: [ActionOption] = []
            if let c = card.color {
                options.append(ActionOption(icon: "building.2", label: "Play to \(c.displayName)", enabled: true) {
                    emit(.playPropertyCard, destinationColor: c)
                })
            }
            if let ac = card.altColor {
                options.append(ActionOption(icon: "building.2", label: "Play to \(ac.displayName)", enabled: true) {
                    emit(.playPropertyCard, destinationColor: ac)
                })
            }
            return options

        case .propertyWildAll:
            return [ActionOption(icon: "paintpalette", label: "Choose a color to play to", enabled: true) {
                step = .chooseColor
            }]

        case .actionPassGo:
            return [ActionOption(icon: "arrow.right.circle", label: "Play (draw 2 cards)", enabled: true) {
                emit(.playPassGo)
            }]

        case .actionDebtCollector:
            return [ActionOption(icon: "dollarsign.arrow.circlepath", label: "Charge a player $5M", enabled: true) {
                step = .chooseTarget
            }]

        case .actionItsMyBirthday:
            return [ActionOption(icon: "gift", label: "Play (all pay $2M)", enabled: true) {
                emit(.playBirthday)
            }]

        case .actionSlyDeal:
            return [ActionOption(icon: "hand.raised", label: "Steal a property", enabled: true) {
                step = .chooseTarget
            }]

        case .actionForcedDeal:
            let hasOfferableCards = player.properties.contains { group in
                let isComplete = group.cards.count >= group.color.setSize
                return !isComplete && !group.cards.isEmpty
            }
            return [ActionOption(
                icon: "arrow.triangle.2.circlepath",
                label: "Swap a property",
                enabled: hasOfferableCards
            ) {
                step = .chooseOwnCard
            }]

        case .actionDealBreaker:
            return [ActionOption(icon: "bolt.shield", label: "Steal a complete set", enabled: true) {
                step = .chooseTarget
            }]

        case .actionHouse:
            return [ActionOption(icon: "house", label: "Place on a complete set", enabled: true) {
                step = .chooseSet
            }]

        case .actionHotel:
            return [ActionOption(icon: "building.2", label: "Place on a set with house", enabled: true) {
                step = .chooseSet
            }]

        case .actionDoubleRent:
            let canPlay = actionsRemaining >= 2
            return [ActionOption(
                icon: "arrow.up.arrow.down",
                label: canPlay ? "Play (doubles next rent)" : "Need 2+ actions remaining",
                enabled: canPlay
            ) {
                emit(.playDoubleRent)
            }]

        case .actionJustSayNo:
            // Can't play proactively — only bank it
            return []

        case .rentTwoColor:
            let ownedColors = (card.rentColors ?? []).filter { color in
                player.properties.contains { $0.color == color && !$0.cards.isEmpty }
            }
            return ownedColors.map { color in
                ActionOption(icon: "dollarsign.circle", label: "Charge rent for \(color.displayName)", enabled: true) {
                    selectedColor = color
                    // 2-color rent targets all players, no target pick needed
                    emit(.playRentCard, targetColor: color)
                }
            }

        case .rentWild:
            let ownedColors = player.properties
                .filter { !$0.cards.isEmpty }
                .map(\.color)
            if ownedColors.isEmpty {
                return [ActionOption(icon: "dollarsign.circle", label: "No properties to charge rent for", enabled: false) {}]
            }
            return [ActionOption(icon: "dollarsign.circle", label: "Choose color & target", enabled: true) {
                step = .chooseColor
            }]
        }
    }

    // MARK: - Set Picker

    @ViewBuilder
    private var setPickerForCurrentCard: some View {
        if card.type == .actionDealBreaker {
            if let targetId = selectedTargetId,
               let target = opponents.first(where: { $0.id == targetId }) {
                SetPickerView(
                    properties: target.properties,
                    prompt: "Steal which complete set from \(target.name)?",
                    onlyComplete: true,
                    onSelect: { color in
                        selectedColor = color
                        emitDealBreaker(targetId: targetId, color: color)
                    }
                )
            }
        } else if card.type == .actionHouse {
            SetPickerView(
                properties: player.properties,
                prompt: "Place House on which set?",
                onlyComplete: true,
                onSelect: { color in
                    emit(.playHouse, targetColor: color)
                },
                filter: { group in
                    group.color != .railroad &&
                    group.color != .utility &&
                    !group.hasHouse
                }
            )
        } else if card.type == .actionHotel {
            SetPickerView(
                properties: player.properties,
                prompt: "Place Hotel on which set?",
                onlyComplete: true,
                onSelect: { color in
                    emit(.playHotel, targetColor: color)
                },
                filter: { group in
                    group.color != .railroad &&
                    group.color != .utility &&
                    group.hasHouse && !group.hasHotel
                }
            )
        }
    }

    // MARK: - Confirm View

    private var confirmView: some View {
        VStack(spacing: 16) {
            Image(systemName: "checkmark.circle")
                .font(.system(size: 32))
                .foregroundStyle(GameColors.success)

            Text(confirmSummary)
                .font(.subheadline)
                .foregroundStyle(GameColors.textPrimary)
                .multilineTextAlignment(.center)

            Button {
                executeConfirmedAction()
            } label: {
                Text("Confirm")
                    .font(.subheadline)
                    .fontWeight(.semibold)
                    .foregroundStyle(.white)
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 12)
                    .background(
                        RoundedRectangle(cornerRadius: 10)
                            .fill(GameColors.accent)
                    )
            }
            .padding(.horizontal, 16)
        }
    }

    // MARK: - Bottom Bar

    private var bottomBar: some View {
        HStack(spacing: 12) {
            // Bank as money (always available for action/rent cards)
            if card.type != .money && card.type != .property {
                Button {
                    emitBankAsAction()
                } label: {
                    HStack(spacing: 6) {
                        Image(systemName: "banknote")
                            .font(.system(size: 12))
                        Text("Bank as $\(card.bankValue)M")
                            .font(.caption)
                            .fontWeight(.medium)
                    }
                    .foregroundStyle(GameColors.textSecondary)
                    .padding(.horizontal, 14)
                    .padding(.vertical, 8)
                    .background(
                        Capsule()
                            .fill(GameColors.surface)
                    )
                }
            }

            Spacer()

            Button {
                onDismiss()
            } label: {
                Text("Cancel")
                    .font(.caption)
                    .fontWeight(.medium)
                    .foregroundStyle(GameColors.textSecondary)
                    .padding(.horizontal, 14)
                    .padding(.vertical, 8)
                    .background(
                        Capsule()
                            .strokeBorder(GameColors.textSecondary.opacity(0.3), lineWidth: 1)
                    )
            }
        }
    }

    // MARK: - State Machine Navigation

    private var targetPrompt: String {
        switch card.type {
        case .actionDebtCollector: "Choose a player to charge $5M"
        case .actionSlyDeal: "Steal from which player?"
        case .actionDealBreaker: "Steal a complete set from whom?"
        case .actionForcedDeal: "Swap with which player?"
        case .rentWild: "Charge rent to which player?"
        default: "Choose a player"
        }
    }

    private var availableColors: [PropertyColor] {
        switch card.type {
        case .propertyWildAll:
            return PropertyColor.allCases
        case .rentTwoColor:
            return (card.rentColors ?? []).filter { color in
                player.properties.contains { $0.color == color && !$0.cards.isEmpty }
            }
        case .rentWild:
            return player.properties
                .filter { !$0.cards.isEmpty }
                .map(\.color)
        default:
            return []
        }
    }

    private var confirmSummary: String {
        let targetName = selectedTargetId.flatMap { id in
            opponents.first { $0.id == id }?.name
        } ?? "opponent"

        switch card.type {
        case .actionForcedDeal:
            return "Swap your card for \(targetName)'s card?"
        case .actionSlyDeal:
            return "Steal card from \(targetName)?"
        case .actionDealBreaker:
            return "Steal \(selectedColor?.displayName ?? "")'s complete set from \(targetName)?"
        default:
            return "Confirm action?"
        }
    }

    private func goBack() {
        switch step {
        case .chooseAction:
            break
        case .chooseTarget:
            // If forced deal, go back to own card pick
            if card.type == .actionForcedDeal && offeredCardId != nil {
                offeredCardId = nil
                step = .chooseOwnCard
            } else {
                step = .chooseAction
            }
            selectedTargetId = nil
        case .chooseColor:
            step = .chooseAction
            selectedColor = nil
        case .chooseTargetCard:
            step = .chooseTarget
            selectedCardId = nil
        case .chooseOwnCard:
            step = .chooseAction
            offeredCardId = nil
        case .chooseSet:
            if card.type == .actionDealBreaker {
                // Deal Breaker: set → target → action
                selectedTargetId = nil
                step = .chooseTarget
            } else {
                step = .chooseAction
            }
        case .confirm:
            // Go back to the previous meaningful step
            if selectedCardId != nil {
                selectedCardId = nil
                step = .chooseTargetCard
            } else if selectedTargetId != nil {
                selectedTargetId = nil
                step = .chooseTarget
            } else {
                step = .chooseAction
            }
        }
    }

    private func advanceFromTargetPick() {
        switch card.type {
        case .actionDebtCollector:
            guard let targetId = selectedTargetId else { return }
            emitDebtCollector(targetId: targetId)

        case .actionSlyDeal:
            step = .chooseTargetCard

        case .actionDealBreaker:
            // Show complete sets of the target
            step = .chooseSet

        case .actionForcedDeal:
            step = .chooseTargetCard

        case .rentWild:
            guard let targetId = selectedTargetId, let color = selectedColor else { return }
            emitRent(color: color, targetId: targetId)

        default:
            break
        }
    }

    private func advanceFromColorPick() {
        switch card.type {
        case .propertyWildAll:
            guard let color = selectedColor else { return }
            emit(.playPropertyCard, destinationColor: color)

        case .rentWild:
            // After choosing color, need to pick target player
            step = .chooseTarget

        default:
            break
        }
    }

    private func advanceFromTargetCardPick() {
        switch card.type {
        case .actionSlyDeal:
            guard let targetId = selectedTargetId, let targetCardId = selectedCardId else { return }
            emitSlyDeal(targetId: targetId, targetCardId: targetCardId)

        case .actionForcedDeal:
            guard let targetId = selectedTargetId,
                  let offered = offeredCardId,
                  let requested = selectedCardId else { return }
            emitForcedDeal(targetId: targetId, offeredId: offered, requestedId: requested)

        default:
            break
        }
    }

    private func executeConfirmedAction() {
        // Currently all multi-step actions emit immediately at the final step,
        // so this is a fallback for any future confirm-gated flows.
        onDismiss()
    }

    // MARK: - Action Emission

    private func emit(_ actionType: ActionType, destinationColor: PropertyColor? = nil, targetColor: PropertyColor? = nil) {
        var action = PlayerAction(type: actionType, playerId: player.id, cardId: card.id)
        action.destinationColor = destinationColor
        action.targetColor = targetColor
        onAction(action)
    }

    private func emitBankAsAction() {
        let action = PlayerAction(type: .playActionToBank, playerId: player.id, cardId: card.id)
        onAction(action)
    }

    private func emitDebtCollector(targetId: String) {
        var action = PlayerAction(type: .playDebtCollector, playerId: player.id, cardId: card.id)
        action.targetPlayerId = targetId
        onAction(action)
    }

    private func emitRent(color: PropertyColor, targetId: String? = nil) {
        var action = PlayerAction(type: .playRentCard, playerId: player.id, cardId: card.id)
        action.targetColor = color
        action.targetPlayerId = targetId
        onAction(action)
    }

    private func emitSlyDeal(targetId: String, targetCardId: String) {
        var action = PlayerAction(type: .playSlyDeal, playerId: player.id, cardId: card.id)
        action.targetPlayerId = targetId
        action.targetCardId = targetCardId
        onAction(action)
    }

    private func emitForcedDeal(targetId: String, offeredId: String, requestedId: String) {
        var action = PlayerAction(type: .playForcedDeal, playerId: player.id, cardId: card.id)
        action.targetPlayerId = targetId
        action.offeredCardId = offeredId
        action.requestedCardId = requestedId
        onAction(action)
    }

    private func emitDealBreaker(targetId: String, color: PropertyColor) {
        var action = PlayerAction(type: .playDealBreaker, playerId: player.id, cardId: card.id)
        action.targetPlayerId = targetId
        action.targetColor = color
        onAction(action)
    }
}

// MARK: - Action Step

private enum ActionStep {
    case chooseAction
    case chooseTarget
    case chooseColor
    case chooseTargetCard
    case chooseOwnCard
    case chooseSet
    case confirm
}
