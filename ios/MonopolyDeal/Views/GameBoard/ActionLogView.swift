// ============================================================
// MONOPOLY DEAL ONLINE — Action Log View
// ============================================================
// Slide-up panel overlaying the game board that shows a
// scrollable list of recent game actions, newest at top.
// ============================================================

import SwiftUI

struct ActionLogView: View {
    let entries: [String]
    @Binding var isPresented: Bool

    /// Entries in reverse chronological order, with a generated timestamp offset.
    private var reversedEntries: [(index: Int, text: String)] {
        entries.enumerated().reversed().map { ($0.offset, $0.element) }
    }

    var body: some View {
        VStack(spacing: 0) {
            Spacer()

            VStack(spacing: 0) {
                handle
                header
                logList
            }
            .frame(maxHeight: 360)
            .background(
                RoundedRectangle(cornerRadius: 20, style: .continuous)
                    .fill(GameColors.surface)
            )
            .clipShape(
                RoundedRectangle(cornerRadius: 20, style: .continuous)
            )
        }
        .ignoresSafeArea(edges: .bottom)
        .transition(.move(edge: .bottom))
    }

    // MARK: - Handle

    private var handle: some View {
        Capsule()
            .fill(Color.white.opacity(0.3))
            .frame(width: 36, height: 5)
            .padding(.top, 10)
            .padding(.bottom, 6)
    }

    // MARK: - Header

    private var header: some View {
        HStack {
            Image(systemName: "clock.arrow.circlepath")
                .foregroundStyle(GameColors.accent)

            Text("Action Log")
                .font(.headline)
                .foregroundStyle(GameColors.textPrimary)

            Spacer()

            Button {
                withAnimation(.easeInOut(duration: 0.25)) {
                    isPresented = false
                }
            } label: {
                Image(systemName: "xmark.circle.fill")
                    .font(.title3)
                    .foregroundStyle(GameColors.textSecondary)
            }
        }
        .padding(.horizontal, 16)
        .padding(.bottom, 8)
    }

    // MARK: - Log List

    private var logList: some View {
        Group {
            if entries.isEmpty {
                VStack(spacing: 8) {
                    Image(systemName: "tray")
                        .font(.title)
                        .foregroundStyle(GameColors.textSecondary)
                    Text("No actions yet")
                        .font(.subheadline)
                        .foregroundStyle(GameColors.textSecondary)
                }
                .frame(maxWidth: .infinity, maxHeight: .infinity)
                .padding(.vertical, 32)
            } else {
                ScrollView {
                    LazyVStack(alignment: .leading, spacing: 0) {
                        ForEach(reversedEntries, id: \.index) { entry in
                            logRow(index: entry.index, text: entry.text)
                        }
                    }
                    .padding(.bottom, 16)
                }
            }
        }
    }

    private func logRow(index: Int, text: String) -> some View {
        HStack(alignment: .top, spacing: 10) {
            Text("#\(index + 1)")
                .font(.system(.caption2, design: .monospaced))
                .foregroundStyle(GameColors.textSecondary)
                .frame(width: 32, alignment: .trailing)

            Text(text)
                .font(.subheadline)
                .foregroundStyle(GameColors.textPrimary)
                .frame(maxWidth: .infinity, alignment: .leading)
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 8)

        // Alternating row backgrounds for readability
    }
}
