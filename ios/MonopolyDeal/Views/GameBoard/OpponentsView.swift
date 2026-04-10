// ============================================================
// MONOPOLY DEAL ONLINE — Opponents View
// ============================================================
// Scrollable area showing all opponents as compact rows.
// 2–3 opponents: single row. 4–5 opponents: two stacked rows.
// ============================================================

import SwiftUI

struct OpponentsView: View {
    let opponents: [OpponentView]
    let onOpponentTapped: (OpponentView) -> Void

    var body: some View {
        if opponents.count <= 3 {
            singleRow(opponents)
        } else {
            VStack(spacing: 6) {
                let midpoint = (opponents.count + 1) / 2
                singleRow(Array(opponents.prefix(midpoint)))
                singleRow(Array(opponents.suffix(from: midpoint)))
            }
        }
    }

    private func singleRow(_ items: [OpponentView]) -> some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 8) {
                ForEach(items) { opponent in
                    OpponentRow(opponent: opponent) {
                        onOpponentTapped(opponent)
                    }
                    .frame(minWidth: 200)
                }
            }
            .padding(.horizontal, 12)
        }
    }
}
