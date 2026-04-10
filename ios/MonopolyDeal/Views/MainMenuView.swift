// ============================================================
// MONOPOLY DEAL ONLINE — Main Menu
// ============================================================

import SwiftUI

struct MainMenuView: View {
    @Environment(GameViewModel.self) private var viewModel
    @State private var showCreateGame = false
    @State private var showJoinGame = false
    @State private var showHowToPlay = false

    var body: some View {
        NavigationStack {
            VStack(spacing: 32) {
                Spacer()

                // Title
                VStack(spacing: 8) {
                    Text("MONOPOLY")
                        .font(.system(size: 42, weight: .black, design: .rounded))
                        .foregroundStyle(.blue)
                    Text("DEAL ONLINE")
                        .font(.system(size: 28, weight: .bold, design: .rounded))
                        .foregroundStyle(.secondary)
                }

                Spacer()

                // Buttons
                VStack(spacing: 16) {
                    NavigationLink(destination: CreateGameView()) {
                        Label("Create Game", systemImage: "plus.circle.fill")
                            .frame(maxWidth: .infinity)
                            .padding()
                            .background(.blue)
                            .foregroundStyle(.white)
                            .clipShape(RoundedRectangle(cornerRadius: 14))
                    }

                    NavigationLink(destination: JoinGameView()) {
                        Label("Join Game", systemImage: "person.2.fill")
                            .frame(maxWidth: .infinity)
                            .padding()
                            .background(.green)
                            .foregroundStyle(.white)
                            .clipShape(RoundedRectangle(cornerRadius: 14))
                    }

                    Button {
                        showHowToPlay = true
                    } label: {
                        Label("How to Play", systemImage: "questionmark.circle.fill")
                            .frame(maxWidth: .infinity)
                            .padding()
                            .background(.orange)
                            .foregroundStyle(.white)
                            .clipShape(RoundedRectangle(cornerRadius: 14))
                    }
                }
                .font(.headline)
                .padding(.horizontal, 32)

                Spacer()

                // Connection status
                HStack(spacing: 6) {
                    Circle()
                        .fill(statusColor)
                        .frame(width: 8, height: 8)
                    Text(viewModel.connectionStatus.rawValue.capitalized)
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
                .padding(.bottom, 16)
            }
            .sheet(isPresented: $showHowToPlay) {
                HowToPlaySheet()
            }
        }
    }

    private var statusColor: Color {
        switch viewModel.connectionStatus {
        case .connected: .green
        case .connecting, .reconnecting: .orange
        case .disconnected: .red
        }
    }
}

// MARK: - How to Play Sheet

private struct HowToPlaySheet: View {
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 16) {
                    rule("Draw 2 cards at the start of your turn (5 if your hand was empty)")
                    rule("Play up to 3 cards per turn")
                    rule("Collect 3 complete property sets of different colors to win")
                    rule("Use action cards to charge rent, steal properties, or block opponents")
                    rule("Just Say No can counter any action card — and can be countered back!")
                    rule("No change given when paying debts — overpayment is lost")
                    rule("Hand limit is 7 cards — discard extras at end of turn")
                    rule("Houses and Hotels can only be placed on complete sets")
                }
                .padding()
            }
            .navigationTitle("How to Play")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button("Done") { dismiss() }
                }
            }
        }
    }

    private func rule(_ text: String) -> some View {
        HStack(alignment: .top, spacing: 10) {
            Image(systemName: "circle.fill")
                .font(.system(size: 6))
                .padding(.top, 6)
                .foregroundStyle(.blue)
            Text(text)
        }
    }
}
