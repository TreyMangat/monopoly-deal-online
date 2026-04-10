// ============================================================
// MONOPOLY DEAL ONLINE — Payment Demand View
// ============================================================
// Full-screen modal for when you are targeted by a payment
// action (rent, debt collector, birthday). Cannot be dismissed.
// ============================================================

import SwiftUI

struct PaymentDemandView: View {
    let pendingAction: PendingAction
    let playerState: PlayerState
    let onPay: ([String]) -> Void
    let onJustSayNo: ((String) -> Void)?
    let timerSeconds: Int?

    @State private var selectedBankIds: Set<String> = []
    @State private var selectedPropertyIds: Set<String> = []

    private let avatars = ["😎", "🤠", "👻", "🦊", "🐙", "🤖"]

    private var amountOwed: Int {
        pendingAction.amount ?? 0
    }

    private var selectedTotal: Int {
        let bankTotal = playerState.bank
            .filter { selectedBankIds.contains($0.id) }
            .reduce(0) { $0 + $1.bankValue }
        let propTotal = playerState.properties
            .flatMap(\.cards)
            .filter { selectedPropertyIds.contains($0.id) }
            .reduce(0) { $0 + $1.bankValue }
        return bankTotal + propTotal
    }

    private var totalAssets: Int {
        let bankTotal = playerState.bank.reduce(0) { $0 + $1.bankValue }
        let propTotal = playerState.properties
            .flatMap(\.cards)
            .reduce(0) { $0 + $1.bankValue }
        return bankTotal + propTotal
    }

    private var canPay: Bool {
        selectedTotal >= amountOwed || (totalAssets > 0 && selectedTotal >= totalAssets)
            || totalAssets == 0
    }

    private var overpayAmount: Int {
        max(0, selectedTotal - amountOwed)
    }

    private var allSelectedIds: [String] {
        Array(selectedBankIds) + Array(selectedPropertyIds)
    }

    private var reasonText: String {
        switch pendingAction.type {
        case .payRent:
            return "Rent"
        case .payDebtCollector:
            return "Debt Collector"
        case .payBirthday:
            return "Birthday"
        default:
            return "Payment"
        }
    }

    var body: some View {
        ZStack {
            GameColors.background.ignoresSafeArea()

            VStack(spacing: 0) {
                header
                ScrollView {
                    VStack(spacing: 24) {
                        bankSection
                        propertiesSection
                    }
                    .padding(.horizontal, 16)
                    .padding(.top, 16)
                    .padding(.bottom, 120)
                }
                bottomBar
            }

            // Timer overlay
            if let seconds = timerSeconds {
                VStack {
                    HStack {
                        Spacer()
                        timerBadge(seconds: seconds)
                            .padding(.trailing, 16)
                            .padding(.top, 8)
                    }
                    Spacer()
                }
            }
        }
        .interactiveDismissDisabled()
    }

    // MARK: - Header

    private var header: some View {
        VStack(spacing: 8) {
            HStack(spacing: 8) {
                Text(reasonText)
                    .font(.caption)
                    .fontWeight(.semibold)
                    .padding(.horizontal, 10)
                    .padding(.vertical, 4)
                    .background(GameColors.danger)
                    .foregroundStyle(.white)
                    .clipShape(Capsule())

                if pendingAction.isDoubled == true {
                    Text("DOUBLED!")
                        .font(.caption)
                        .fontWeight(.black)
                        .padding(.horizontal, 10)
                        .padding(.vertical, 4)
                        .background(.orange)
                        .foregroundStyle(.white)
                        .clipShape(Capsule())
                }
            }

            Text("You owe $\(amountOwed)m")
                .font(.system(size: 28, weight: .bold, design: .rounded))
                .foregroundStyle(GameColors.textPrimary)

            Text(reasonText)
                .font(.subheadline)
                .foregroundStyle(GameColors.textSecondary)
        }
        .padding(.vertical, 16)
        .frame(maxWidth: .infinity)
        .background(GameColors.surface)
    }

    // MARK: - Bank Section

    private var bankSection: some View {
        VStack(alignment: .leading, spacing: 12) {
            sectionHeader(title: "YOUR BANK", icon: "banknote", count: playerState.bank.count)

            if playerState.bank.isEmpty {
                emptyLabel("No money in bank")
            } else {
                FlowLayout(spacing: 8) {
                    ForEach(playerState.bank) { card in
                        selectableChip(
                            card: card,
                            isSelected: selectedBankIds.contains(card.id),
                            isLocked: false
                        ) {
                            toggleBank(card.id)
                        }
                    }
                }
            }
        }
        .padding(16)
        .background(
            RoundedRectangle(cornerRadius: 16)
                .fill(.ultraThinMaterial)
        )
    }

    // MARK: - Properties Section

    private var propertiesSection: some View {
        VStack(alignment: .leading, spacing: 12) {
            sectionHeader(title: "YOUR PROPERTIES", icon: "building.2", count: playerState.properties.flatMap(\.cards).count)

            if playerState.properties.isEmpty {
                emptyLabel("No properties")
            } else {
                ForEach(playerState.properties, id: \.color) { group in
                    propertyGroupRow(group: group)
                }
            }
        }
        .padding(16)
        .background(
            RoundedRectangle(cornerRadius: 16)
                .fill(.ultraThinMaterial)
        )
    }

    private func propertyGroupRow(group: PropertyGroup) -> some View {
        let isComplete = group.cards.count >= group.color.setSize

        return VStack(alignment: .leading, spacing: 8) {
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
                    Text("COMPLETE")
                        .font(.system(size: 9, weight: .bold))
                        .padding(.horizontal, 6)
                        .padding(.vertical, 2)
                        .background(GameColors.success)
                        .foregroundStyle(.white)
                        .clipShape(Capsule())
                }
            }

            FlowLayout(spacing: 8) {
                ForEach(group.cards) { card in
                    selectableChip(
                        card: card,
                        isSelected: selectedPropertyIds.contains(card.id),
                        isLocked: isComplete
                    ) {
                        if !isComplete {
                            toggleProperty(card.id)
                        }
                    }
                }
            }
        }
    }

    // MARK: - Bottom Bar

    private var bottomBar: some View {
        VStack(spacing: 12) {
            // Progress bar
            VStack(spacing: 6) {
                HStack {
                    Text("Selected: $\(selectedTotal)m / $\(amountOwed)m owed")
                        .font(.subheadline)
                        .fontWeight(.medium)
                        .foregroundStyle(GameColors.textPrimary)
                    Spacer()
                }

                GeometryReader { geometry in
                    ZStack(alignment: .leading) {
                        RoundedRectangle(cornerRadius: 4)
                            .fill(GameColors.surface)
                            .frame(height: 8)

                        RoundedRectangle(cornerRadius: 4)
                            .fill(progressColor)
                            .frame(
                                width: min(
                                    geometry.size.width,
                                    amountOwed > 0
                                        ? geometry.size.width * CGFloat(selectedTotal) / CGFloat(amountOwed)
                                        : geometry.size.width
                                ),
                                height: 8
                            )
                    }
                }
                .frame(height: 8)
            }

            // Overpayment warning
            if overpayAmount > 0 {
                HStack(spacing: 6) {
                    Image(systemName: "exclamationmark.triangle.fill")
                        .foregroundStyle(.orange)
                    Text("No change given! You'll lose $\(overpayAmount)m extra")
                        .font(.caption)
                        .foregroundStyle(.orange)
                }
                .padding(10)
                .frame(maxWidth: .infinity)
                .background(
                    RoundedRectangle(cornerRadius: 8)
                        .fill(.orange.opacity(0.1))
                )
            }

            // Buttons
            HStack(spacing: 12) {
                if let onJustSayNo {
                    Button {
                        // Find the first JSN card in hand
                        if let jsnCard = playerState.hand.first(where: { $0.type == .actionJustSayNo }) {
                            onJustSayNo(jsnCard.id)
                        }
                    } label: {
                        HStack {
                            Spacer()
                            Image(systemName: "hand.raised.fill")
                            Text("Just Say No")
                                .fontWeight(.semibold)
                            Spacer()
                        }
                        .padding()
                        .background(GameColors.danger)
                        .foregroundStyle(.white)
                        .clipShape(RoundedRectangle(cornerRadius: 14))
                    }
                }

                Button {
                    if totalAssets == 0 {
                        onPay([])
                    } else {
                        onPay(allSelectedIds)
                    }
                } label: {
                    HStack {
                        Spacer()
                        Text(totalAssets == 0 ? "Nothing to Pay" : "Pay $\(selectedTotal)m")
                            .fontWeight(.semibold)
                        Spacer()
                    }
                    .padding()
                    .background(canPay ? GameColors.accent : .gray)
                    .foregroundStyle(canPay ? .black : .white)
                    .clipShape(RoundedRectangle(cornerRadius: 14))
                }
                .disabled(!canPay)
            }
        }
        .padding(16)
        .background(
            Rectangle()
                .fill(.ultraThinMaterial)
                .ignoresSafeArea(edges: .bottom)
        )
    }

    // MARK: - Components

    private func sectionHeader(title: String, icon: String, count: Int) -> some View {
        HStack(spacing: 6) {
            Image(systemName: icon)
                .font(.caption)
                .foregroundStyle(GameColors.accent)
            Text(title)
                .font(.caption)
                .fontWeight(.bold)
                .foregroundStyle(GameColors.textSecondary)
            Spacer()
            Text("\(count) cards")
                .font(.caption2)
                .foregroundStyle(GameColors.textSecondary)
        }
    }

    private func selectableChip(card: Card, isSelected: Bool, isLocked: Bool, onTap: @escaping () -> Void) -> some View {
        Button(action: onTap) {
            HStack(spacing: 6) {
                if isLocked {
                    Text("🔒")
                        .font(.caption2)
                } else {
                    Image(systemName: isSelected ? "checkmark.circle.fill" : "circle")
                        .font(.caption)
                        .foregroundStyle(isSelected ? GameColors.accent : GameColors.textSecondary)
                }

                Text(card.name)
                    .font(.caption)
                    .fontWeight(.medium)
                    .lineLimit(1)

                Text("$\(card.bankValue)m")
                    .font(.caption2)
                    .fontWeight(.bold)
            }
            .padding(.horizontal, 10)
            .padding(.vertical, 6)
            .background(
                RoundedRectangle(cornerRadius: 8)
                    .fill(isSelected ? GameColors.accent.opacity(0.2) : GameColors.surface)
            )
            .overlay(
                RoundedRectangle(cornerRadius: 8)
                    .strokeBorder(
                        isSelected ? GameColors.accent : Color.clear,
                        lineWidth: 1.5
                    )
            )
            .foregroundStyle(isLocked ? GameColors.textSecondary : GameColors.textPrimary)
        }
        .disabled(isLocked)
    }

    private func emptyLabel(_ text: String) -> some View {
        Text(text)
            .font(.caption)
            .foregroundStyle(GameColors.textSecondary)
            .padding(.vertical, 8)
    }

    private func timerBadge(seconds: Int) -> some View {
        HStack(spacing: 4) {
            Image(systemName: "clock.fill")
                .font(.caption2)
            Text("\(seconds)s")
                .font(.system(.caption, design: .monospaced))
                .fontWeight(.bold)
        }
        .padding(.horizontal, 10)
        .padding(.vertical, 6)
        .background(seconds <= 10 ? GameColors.danger : GameColors.surface)
        .foregroundStyle(.white)
        .clipShape(Capsule())
    }

    private var progressColor: Color {
        if selectedTotal >= amountOwed {
            return GameColors.success
        } else if selectedTotal > 0 {
            return GameColors.accent
        }
        return GameColors.surface
    }

    // MARK: - Actions

    private func toggleBank(_ id: String) {
        if selectedBankIds.contains(id) {
            selectedBankIds.remove(id)
        } else {
            selectedBankIds.insert(id)
        }
    }

    private func toggleProperty(_ id: String) {
        if selectedPropertyIds.contains(id) {
            selectedPropertyIds.remove(id)
        } else {
            selectedPropertyIds.insert(id)
        }
    }
}

// MARK: - Flow Layout

/// A simple wrapping horizontal layout for chip-style elements.
struct FlowLayout: Layout {
    var spacing: CGFloat = 8

    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
        let result = layout(in: proposal.width ?? 0, subviews: subviews)
        return result.size
    }

    func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
        let result = layout(in: bounds.width, subviews: subviews)
        for (index, position) in result.positions.enumerated() {
            subviews[index].place(
                at: CGPoint(x: bounds.minX + position.x, y: bounds.minY + position.y),
                proposal: ProposedViewSize(subviews[index].sizeThatFits(.unspecified))
            )
        }
    }

    private func layout(in maxWidth: CGFloat, subviews: Subviews) -> (size: CGSize, positions: [CGPoint]) {
        var positions: [CGPoint] = []
        var x: CGFloat = 0
        var y: CGFloat = 0
        var rowHeight: CGFloat = 0
        var maxX: CGFloat = 0

        for subview in subviews {
            let size = subview.sizeThatFits(.unspecified)
            if x + size.width > maxWidth && x > 0 {
                x = 0
                y += rowHeight + spacing
                rowHeight = 0
            }
            positions.append(CGPoint(x: x, y: y))
            rowHeight = max(rowHeight, size.height)
            x += size.width + spacing
            maxX = max(maxX, x - spacing)
        }

        return (CGSize(width: maxX, height: y + rowHeight), positions)
    }
}
