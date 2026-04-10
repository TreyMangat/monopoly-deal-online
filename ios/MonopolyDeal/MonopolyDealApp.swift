// ============================================================
// MONOPOLY DEAL ONLINE — App Entry Point
// ============================================================

import SwiftUI

@main
struct MonopolyDealApp: App {
    @State private var viewModel = GameViewModel()

    var body: some Scene {
        WindowGroup {
            MainMenuView()
                .environment(viewModel)
        }
    }
}
