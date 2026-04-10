import SwiftUI

// MARK: - CardBackView

/// The face-down side of a Monopoly Deal card.
/// Shows a branded pattern without revealing any card information.
struct CardBackView: View {
    var size: CGSize = CGSize(width: 80, height: 112)

    var body: some View {
        ZStack {
            RoundedRectangle(cornerRadius: CardStyleConfig.cardCornerRadius)
                .fill(
                    LinearGradient(
                        colors: [
                            Color(red: 0.12, green: 0.25, blue: 0.55),
                            Color(red: 0.08, green: 0.15, blue: 0.40),
                        ],
                        startPoint: .topLeading,
                        endPoint: .bottomTrailing
                    )
                )

            // Diamond pattern
            VStack(spacing: 6) {
                ForEach(0..<3, id: \.self) { row in
                    HStack(spacing: 6) {
                        ForEach(0..<(row % 2 == 0 ? 3 : 2), id: \.self) { _ in
                            Image(systemName: "diamond.fill")
                                .font(.system(size: 8))
                                .foregroundStyle(Color.white.opacity(0.08))
                        }
                    }
                }
            }

            // Center logo
            VStack(spacing: 2) {
                Image(systemName: "creditcard.fill")
                    .font(.system(size: 16, weight: .bold))
                Text("MD")
                    .font(.system(size: 10, weight: .heavy, design: .rounded))
            }
            .foregroundStyle(Color.white.opacity(0.25))

            RoundedRectangle(cornerRadius: CardStyleConfig.cardCornerRadius)
                .stroke(Color.white.opacity(0.15), lineWidth: CardStyleConfig.cardBorderWidth)
        }
        .frame(width: size.width, height: size.height)
        .shadow(color: .black.opacity(0.3), radius: 3, y: 2)
    }
}

// MARK: - Previews

#Preview("Card Back") {
    CardBackView()
        .padding()
        .background(GameColors.background)
}

#Preview("Card Back Large") {
    CardBackView(size: CGSize(width: 120, height: 168))
        .padding()
        .background(GameColors.background)
}

#Preview("Card Backs Row") {
    HStack(spacing: 8) {
        ForEach(0..<5, id: \.self) { _ in
            CardBackView()
        }
    }
    .padding()
    .background(GameColors.surface)
}
