// ============================================================
// MONOPOLY DEAL ONLINE — Color Extensions
// ============================================================
// Maps PropertyColor enum values to SwiftUI Colors matching
// the Monopoly Deal board game color scheme.
// ============================================================

import SwiftUI

extension PropertyColor {
    /// The SwiftUI color for this property group.
    var uiColor: Color {
        switch self {
        case .brown:     Color(red: 0.55, green: 0.33, blue: 0.17)
        case .lightBlue: Color(red: 0.68, green: 0.85, blue: 0.96)
        case .pink:      Color(red: 0.85, green: 0.30, blue: 0.55)
        case .orange:    Color.orange
        case .red:       Color.red
        case .yellow:    Color.yellow
        case .green:     Color(red: 0.13, green: 0.65, blue: 0.31)
        case .darkBlue:  Color(red: 0.15, green: 0.20, blue: 0.60)
        case .railroad:  Color(red: 0.20, green: 0.20, blue: 0.20)
        case .utility:   Color(red: 0.75, green: 0.75, blue: 0.75)
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

    /// Human-readable display name for the property group.
    var displayName: String {
        switch self {
        case .brown:     "Brown"
        case .lightBlue: "Light Blue"
        case .pink:      "Pink"
        case .orange:    "Orange"
        case .red:       "Red"
        case .yellow:    "Yellow"
        case .green:     "Green"
        case .darkBlue:  "Dark Blue"
        case .railroad:  "Railroad"
        case .utility:   "Utility"
        }
    }

    /// How many cards are needed to complete a set of this color.
    var setSize: Int {
        switch self {
        case .brown, .darkBlue, .utility: 2
        case .railroad: 4
        default: 3
        }
    }
}
