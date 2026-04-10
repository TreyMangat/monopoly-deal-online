// ============================================================
// MONOPOLY DEAL ONLINE — Join Game View
// ============================================================

import SwiftUI

struct JoinGameView: View {
    @Environment(GameViewModel.self) private var viewModel
    @State private var playerName = ""
    @State private var roomCode = ""
    @State private var selectedAvatar = 0
    @State private var serverURL = "wss://monopoly-deal-online.onrender.com/ws"

    private let avatars = ["😎", "🤠", "👻", "🦊", "🐙", "🤖"]

    var body: some View {
        Form {
            Section("Room Code") {
                TextField("6-character code", text: $roomCode)
                    .textInputAutocapitalization(.characters)
                    .autocorrectionDisabled()
                    .font(.system(.title2, design: .monospaced))
                    .multilineTextAlignment(.center)
                    .onChange(of: roomCode) {
                        roomCode = String(roomCode.prefix(6)).uppercased()
                    }
            }

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
                    joinGame()
                } label: {
                    HStack {
                        Spacer()
                        Text("Join Game")
                            .fontWeight(.semibold)
                        Spacer()
                    }
                }
                .disabled(
                    roomCode.count != 6
                    || playerName.trimmingCharacters(in: .whitespaces).isEmpty
                )
            }
        }
        .navigationTitle("Join Game")
        .onChange(of: viewModel.roomInfo) {
            if viewModel.roomInfo != nil {
                viewModel.navigationPath.append(.lobby)
            }
        }
    }

    private func joinGame() {
        let name = playerName.trimmingCharacters(in: .whitespaces)
        let code = roomCode.trimmingCharacters(in: .whitespaces).uppercased()
        guard !name.isEmpty, code.count == 6 else { return }

        viewModel.connect(url: serverURL)

        DispatchQueue.main.asyncAfter(deadline: .now() + 0.5) {
            viewModel.joinRoom(code: code, name: name, avatar: selectedAvatar)
        }
    }
}
