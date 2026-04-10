import SwiftUI

/// Grid of colored circles for selecting a property color.
struct ColorPickerView: View {
    let colors: [PropertyColor]
    let prompt: String
    let onSelect: (PropertyColor) -> Void

    private let columns = [
        GridItem(.flexible(), spacing: 10),
        GridItem(.flexible(), spacing: 10),
        GridItem(.flexible(), spacing: 10),
        GridItem(.flexible(), spacing: 10),
        GridItem(.flexible(), spacing: 10),
    ]

    var body: some View {
        VStack(spacing: 16) {
            Text(prompt)
                .font(.headline)
                .foregroundStyle(GameColors.textPrimary)

            LazyVGrid(columns: columns, spacing: 10) {
                ForEach(colors, id: \.self) { color in
                    Button {
                        onSelect(color)
                    } label: {
                        VStack(spacing: 4) {
                            Circle()
                                .fill(color.uiColor)
                                .frame(width: 40, height: 40)
                                .overlay(
                                    Circle()
                                        .strokeBorder(Color.white.opacity(0.4), lineWidth: 2)
                                )
                            Text(color.displayName)
                                .font(.system(size: 10, weight: .medium))
                                .foregroundStyle(GameColors.textPrimary)
                                .lineLimit(1)
                                .minimumScaleFactor(0.8)
                        }
                    }
                }
            }
        }
        .padding(.horizontal, 16)
    }
}
