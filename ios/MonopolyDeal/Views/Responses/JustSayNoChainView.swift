// ============================================================
// MONOPOLY DEAL ONLINE — Just Say No Chain View
// ============================================================
// Shown when a Just Say No counter-chain is in progress.
// Displays the chain history and lets the player counter or accept.
// ============================================================

import SwiftUI

struct JustSayNoChainView: View {
    let pendingAction: PendingAction
    let canCounter: Bool
    let originalDescription: String
    let onCounter: (String) -> Void
    let onAccept: () -> Void
    let timerSeconds: Int?

    /// The player's hand, needed to find a JSN card to counter with.
    var hand: [Card] = []

    private let avatars = ["😎", "🤠", "👻", "🦊", "🐙", "🤖"]

    var body: some View {
        ZStack {
            GameColors.background.ignoresSafeArea()

            VStack(spacing: 24) {
                Spacer()

                // Title
                VStack(spacing: 8) {
                    Image(systemName: "hand.raised.fill")
                        .font(.system(size: 40))
                        .foregroundStyle(GameColors.danger)

                    Text("Just Say No!")
                        .font(.system(size: 28, weight: .bold, design: .rounded))
                        .foregroundStyle(GameColors.textPrimary)
                }

                // Timer
                if let seconds = timerSeconds {
                    timerBadge(seconds: seconds)
                }

                // Original action
                VStack(spacing: 8) {
                    Text("ORIGINAL ACTION")
                        .font(.caption2)
                        .fontWeight(.bold)
                        .foregroundStyle(GameColors.textSecondary)

                    Text(originalDescription)
                        .font(.subheadline)
                        .fontWeight(.medium)
                        .foregroundStyle(GameColors.textPrimary)
                        .multilineTextAlignment(.center)
                        .padding(.horizontal, 24)
                }
                .padding(16)
                .frame(maxWidth: .infinity)
                .background(
                    RoundedRectangle(cornerRadius: 16)
                        .fill(.ultraThinMaterial)
                )
                .padding(.horizontal, 16)

                // Chain steps
                if let chain = pendingAction.justSayNoChain, !chain.isEmpty {
                    VStack(alignment: .leading, spacing: 0) {
                        ForEach(Array(chain.enumerated()), id: \.offset) { index, link in
                            chainStepRow(index: index + 1, link: link, isLast: index == chain.count - 1)
                        }
                    }
                    .padding(16)
                    .background(
                        RoundedRectangle(cornerRadius: 16)
                            .fill(.ultraThinMaterial)
                    )
                    .padding(.horizontal, 16)
                }

                Spacer()

                // Action buttons
                VStack(spacing: 12) {
                    if canCounter {
                        Button {
                            if let jsnCard = hand.first(where: { $0.type == .actionJustSayNo }) {
                                onCounter(jsnCard.id)
                            }
                        } label: {
                            HStack {
                                Spacer()
                                Image(systemName: "hand.raised.fill")
                                Text("Just Say No AGAIN")
                                    .fontWeight(.semibold)
                                Spacer()
                            }
                            .padding()
                            .background(GameColors.danger)
                            .foregroundStyle(.white)
                            .clipShape(RoundedRectangle(cornerRadius: 14))
                        }
                    }

                    Button(action: onAccept) {
                        HStack {
                            Spacer()
                            Text("Accept")
                                .fontWeight(.semibold)
                            Spacer()
                        }
                        .padding()
                        .background(canCounter ? GameColors.surface : GameColors.accent)
                        .foregroundStyle(canCounter ? GameColors.textPrimary : .black)
                        .clipShape(RoundedRectangle(cornerRadius: 14))
                    }
                }
                .padding(.horizontal, 32)
                .padding(.bottom, 16)
            }
        }
        .interactiveDismissDisabled()
    }

    // MARK: - Chain Step Row

    private func chainStepRow(index: Int, link: JustSayNoLink, isLast: Bool) -> some View {
        VStack(spacing: 0) {
            HStack(spacing: 12) {
                // Step number
                Text("\(index)")
                    .font(.caption2)
                    .fontWeight(.bold)
                    .foregroundStyle(.white)
                    .frame(width: 24, height: 24)
                    .background(
                        Circle().fill(stepColor(for: link.action))
                    )

                // Description
                VStack(alignment: .leading, spacing: 2) {
                    Text(stepDescription(for: link))
                        .font(.subheadline)
                        .fontWeight(.medium)
                        .foregroundStyle(GameColors.textPrimary)
                }

                Spacer()

                // Status icon
                Image(systemName: link.action == .justSayNo ? "xmark.circle.fill" : "checkmark.circle.fill")
                    .foregroundStyle(stepColor(for: link.action))
            }
            .padding(.vertical, 10)

            if !isLast {
                Rectangle()
                    .fill(GameColors.textSecondary.opacity(0.3))
                    .frame(width: 2, height: 16)
                    .padding(.leading, 11)
                    .frame(maxWidth: .infinity, alignment: .leading)
            }
        }
    }

    private func stepDescription(for link: JustSayNoLink) -> String {
        let action = link.action == .justSayNo ? "played Just Say No" : "accepted"
        return "Player \(action)"
    }

    private func stepColor(for action: JustSayNoAction) -> Color {
        action == .justSayNo ? GameColors.danger : GameColors.success
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
}
