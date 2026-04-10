// ============================================================
// MONOPOLY DEAL ONLINE — App Entry Point
// ============================================================

import SwiftUI

@main
struct MonopolyDealApp: App {
    @State private var viewModel = GameViewModel()

    var body: some Scene {
        WindowGroup {
            RootNavigationView()
                .environment(viewModel)
        }
    }
}

/// Wraps the NavigationStack so we can use @Bindable for the path binding.
private struct RootNavigationView: View {
    @Environment(GameViewModel.self) private var viewModel

    var body: some View {
        @Bindable var vm = viewModel
        NavigationStack(path: $vm.navigationPath) {
            MainMenuView()
                .navigationDestination(for: AppRoute.self) { route in
                    switch route {
                    case .createGame:
                        CreateGameView()
                    case .joinGame:
                        JoinGameView()
                    case .lobby:
                        LobbyView()
                    case .gameBoard:
                        GameBoardView()
                    }
                }
        }
    }
}
