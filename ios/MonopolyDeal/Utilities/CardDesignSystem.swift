import SwiftUI

/// Presentation helpers for Monopoly Deal card colors, card categories, and game-wide theme values.
extension PropertyColor {
    /// SwiftUI color used to render this property color group.
    var uiColor: Color {
        switch rawValue {
        case "brown":
            return Color(red: 0.55, green: 0.35, blue: 0.17)
        case "light_blue":
            return Color(red: 0.68, green: 0.85, blue: 0.95)
        case "pink":
            return Color(red: 0.85, green: 0.28, blue: 0.58)
        case "orange":
            return Color(red: 0.95, green: 0.55, blue: 0.15)
        case "red":
            return Color(red: 0.85, green: 0.15, blue: 0.15)
        case "yellow":
            return Color(red: 0.95, green: 0.85, blue: 0.15)
        case "green":
            return Color(red: 0.18, green: 0.65, blue: 0.25)
        case "dark_blue":
            return Color(red: 0.15, green: 0.18, blue: 0.65)
        case "railroad":
            return Color(red: 0.15, green: 0.15, blue: 0.15)
        case "utility":
            return Color(red: 0.75, green: 0.75, blue: 0.75)
        default:
            return Color.gray
        }
    }

    /// A readable text color for overlaying on this property's background.
    var textColor: Color {
        switch self {
        case .lightBlue, .yellow, .utility:
            .black
        default:
            .white
        }
    }

    /// Human-readable name for display in labels and badges.
    var displayName: String {
        switch rawValue {
        case "brown":
            return "Brown"
        case "light_blue":
            return "Light Blue"
        case "pink":
            return "Pink"
        case "orange":
            return "Orange"
        case "red":
            return "Red"
        case "yellow":
            return "Yellow"
        case "green":
            return "Green"
        case "dark_blue":
            return "Dark Blue"
        case "railroad":
            return "Railroad"
        case "utility":
            return "Utility"
        default:
            return rawValue
                .split(separator: "_")
                .map { $0.capitalized }
                .joined(separator: " ")
        }
    }

    /// Number of cards required to complete a full set for this color group.
    var setSize: Int {
        switch rawValue {
        case "brown", "dark_blue", "utility":
            return 2
        case "railroad":
            return 4
        default:
            return 3
        }
    }
}

extension CardType {
    /// High-level category label used in the card UI.
    var displayCategory: String {
        switch rawValue {
        case "property", "property_wild", "property_wild_all":
            return "Property"
        case "money":
            return "Money"
        case "rent_wild", "rent_two_color":
            return "Rent"
        default:
            return "Action"
        }
    }

    /// SF Symbol name used for category-level card icons.
    var iconName: String {
        switch displayCategory {
        case "Property":
            return "building.2"
        case "Money":
            return "banknote"
        case "Rent":
            return "dollarsign.circle"
        default:
            return "bolt.fill"
        }
    }
}

/// Shared layout and styling values for card rendering.
struct CardStyleConfig {
    private static let horizontalPadding: CGFloat = 16
    private static let interCardSpacing: CGFloat = 8
    private static let cardAspectRatio: CGFloat = 1.4

    /// Card size tuned to fit five cards across the screen with consistent spacing.
    static func cardSize(for screenWidth: CGFloat) -> CGSize {
        let totalSpacing = interCardSpacing * 4
        let availableWidth = max(0, screenWidth - (horizontalPadding * 2) - totalSpacing)
        let width = floor(availableWidth / 5)
        let height = floor(width * cardAspectRatio)
        return CGSize(width: width, height: height)
    }

    /// Standard corner radius for all cards.
    static let cardCornerRadius: CGFloat = 8

    /// Standard border width for all cards.
    static let cardBorderWidth: CGFloat = 2

    /// Base fill color for a card based on its card type and property color.
    static func backgroundColor(for card: Card) -> Color {
        switch card.type.rawValue {
        case "property", "property_wild", "property_wild_all":
            return card.color?.uiColor
                ?? card.altColor?.uiColor
                ?? GameColors.accent.opacity(0.85)
        case "money":
            return Color(red: 0.15, green: 0.42, blue: 0.22)
        case "rent_wild", "rent_two_color":
            return Color(red: 0.45, green: 0.28, blue: 0.62)
        default:
            return Color(red: 0.82, green: 0.46, blue: 0.18)
        }
    }
}

/// Global color palette for the overall game interface.
struct GameColors {
    static let background = Color(red: 0.08, green: 0.09, blue: 0.14)
    static let surface = Color(red: 0.12, green: 0.13, blue: 0.19)
    static let accent = Color(red: 0.18, green: 0.82, blue: 0.75)
    static let danger = Color(red: 0.85, green: 0.15, blue: 0.15)
    static let success = Color(red: 0.18, green: 0.65, blue: 0.25)
    static let textPrimary = Color.white
    static let textSecondary = Color.gray
}
