// ============================================================
// MONOPOLY DEAL ONLINE — Create Game View
// ============================================================

import SwiftUI

struct CreateGameView: View {
    @Environment(GameViewModel.self) private var viewModel
    @State private var playerName = ""
    @State private var selectedAvatar = 0
    @State private var serverURL = "wss://monopoly-deal-online.up.railway.app/ws"
    @State private var navigateToLobby = false

    private let avatars = ["😎", "🤠", "👻", "🦊", "🐙", "🤖"]

    var body: some View {
        Form {
            Section("Your Name") {
                TextField("Enter your name", text: $playerName)
                    .textInputAutocapitalization(.words)
                    .autocorrectionDisabled()
            }

            Section("Choose Avatar") {
                LazyVGrid(columns: Array(repeating: GridItem(.flexible()), count: 6), spacing: 12) {
                    ForEach(0..<avatars.count, id: \.self) { index in
                        Text(avatars[index])
                            .font(.system(size: 36))
                            .padding(8)
                            .background(
                                RoundedRectangle(cornerRadius: 12)
                                    .fill(selectedAvatar == index ? Color.blue.opacity(0.2) : Color.clear)
                            )
                            .overlay(
                                RoundedRectangle(cornerRadius: 12)
                                    .stroke(selectedAvatar == index ? Color.blue : Color.clear, lineWidth: 2)
                            )
                            .onTapGesture {
                                selectedAvatar = index
                            }
                    }
                }
                .padding(.vertical, 4)
            }

            Section("Server") {
                TextField("Server URL", text: $serverURL)
                    .textInputAutocapitalization(.never)
                    .autocorrectionDisabled()
                    .font(.system(.body, design: .monospaced))
            }

            Section {
                Button {
                    createGame()
                } label: {
                    HStack {
                        Spacer()
                        Text("Create Game")
                            .fontWeight(.semibold)
                        Spacer()
                    }
                }
                .disabled(playerName.trimmingCharacters(in: .whitespaces).isEmpty)
            }
        }
        .navigationTitle("Create Game")
        .navigationDestination(isPresented: $navigateToLobby) {
            LobbyView()
        }
        .onChange(of: viewModel.roomInfo) {
            if viewModel.roomInfo != nil {
                navigateToLobby = true
            }
        }
    }

    private func createGame() {
        let name = playerName.trimmingCharacters(in: .whitespaces)
        guard !name.isEmpty else { return }

        viewModel.connect(url: serverURL)

        // Small delay to allow connection to establish
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.5) {
            viewModel.createRoom(name: name, avatar: selectedAvatar)
        }
    }
}
