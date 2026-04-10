// ============================================================
// MONOPOLY DEAL ONLINE — Table Center View
// ============================================================
// Center table area showing the draw pile and top discard card.
// ============================================================

import SwiftUI

struct TableCenterView: View {
    @Environment(GameViewModel.self) private var viewModel

    private var state: ClientGameState? {
        viewModel.currentState
    }

    private var cardSize: CGSize {
        let width = min(max(UIScreen.main.bounds.width * 0.23, 78), 108)
        return CGSize(width: width, height: width * 1.4)
    }

    var body: some View {
        HStack(spacing: 26) {
            drawPileSection

            discardSection
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 10)
        .padding(.horizontal, 12)
        .background(
            RoundedRectangle(cornerRadius: 18)
                .fill(GameColors.surface.opacity(0.72))
        )
        .overlay(
            RoundedRectangle(cornerRadius: 18)
                .stroke(.white.opacity(0.06), lineWidth: 1)
        )
    }

    private var drawPileSection: some View {
        VStack(spacing: 10) {
            ZStack(alignment: .topTrailing) {
                CardBackView(size: cardSize)

                Text("\(state?.drawPileCount ?? 0)")
                    .font(.system(size: 12, weight: .bold, design: .rounded))
                    .foregroundStyle(GameColors.background)
                    .padding(.horizontal, 8)
                    .padding(.vertical, 5)
                    .background(
                        Capsule()
                            .fill(GameColors.accent)
                    )
                    .offset(x: 8, y: -8)
            }

            Text("Draw Pile")
                .font(.system(size: 13, weight: .semibold, design: .rounded))
                .foregroundStyle(GameColors.textSecondary)
        }
    }

    private var discardSection: some View {
        VStack(spacing: 10) {
            Group {
                if let topCard = state?.discardPileTop {
                    CardView(card: topCard, size: cardSize)
                } else {
                    RoundedRectangle(cornerRadius: CardStyleConfig.cardCornerRadius)
                        .fill(.white.opacity(0.04))
                        .frame(width: cardSize.width, height: cardSize.height)
                        .overlay(
                            VStack(spacing: 8) {
                                Image(systemName: "tray")
                                    .font(.system(size: 24, weight: .semibold))
                                    .foregroundStyle(GameColors.textSecondary)
                                Text("Empty")
                                    .font(.system(size: 12, weight: .semibold, design: .rounded))
                                    .foregroundStyle(GameColors.textSecondary)
                            }
                        )
                        .overlay(
                            RoundedRectangle(cornerRadius: CardStyleConfig.cardCornerRadius)
                                .stroke(.white.opacity(0.08), lineWidth: 1)
                        )
                }
            }

            Text("Discard")
                .font(.system(size: 13, weight: .semibold, design: .rounded))
                .foregroundStyle(GameColors.textSecondary)
        }
    }
}
