// ============================================================
// MONOPOLY DEAL ONLINE — Game Board View
// ============================================================
// Main gameplay screen composing all sub-views, overlays,
// sheets, and full-screen covers for the active game.
// ============================================================

import SwiftUI

struct GameBoardView: View {
    @Environment(GameViewModel.self) private var viewModel

    @State private var selectedCard: Card?
    @State private var inspectedOpponent: OpponentView?
    @State private var showActionLog = false

    private var state: ClientGameState? { viewModel.currentState }

    var body: some View {
        ZStack {
            GameColors.background.ignoresSafeArea()

            if let state {
                gameContent(state: state)
            } else {
                ProgressView("Loading game...")
                    .foregroundStyle(GameColors.textSecondary)
            }
        }
        .navigationBarBackButtonHidden()
        // Card action sheet
        .sheet(item: $selectedCard) { card in
            if let state {
                CardActionSheet(
                    card: card,
                    player: state.you,
                    opponents: state.opponents,
                    actionsRemaining: state.actionsRemaining,
                    onAction: { action in
                        viewModel.sendAction(action)
                        selectedCard = nil
                    },
                    onDismiss: { selectedCard = nil }
                )
                .presentationDetents([.medium, .large])
                .presentationDragIndicator(.visible)
            }
        }
        // Opponent inspection
        .sheet(item: $inspectedOpponent) { opponent in
            OpponentInspectionView(opponent: opponent)
        }
        // Action log
        .sheet(isPresented: $showActionLog) {
            ActionLogView(entries: viewModel.actionLog, isPresented: $showActionLog)
                .presentationDetents([.medium, .large])
                .presentationDragIndicator(.visible)
        }
        // Payment demand
        .fullScreenCover(isPresented: Binding(
            get: { viewModel.isPaymentPending },
            set: { _ in }
        )) {
            paymentDemandContent
        }
        // Just Say No / steal response
        .fullScreenCover(isPresented: Binding(
            get: { viewModel.isStealPending },
            set: { _ in }
        )) {
            justSayNoContent
        }
        // Discard
        .fullScreenCover(isPresented: Binding(
            get: { viewModel.shouldShowDiscard },
            set: { _ in }
        )) {
            discardContent
        }
        // Game over
        .fullScreenCover(isPresented: Binding(
            get: { viewModel.shouldShowGameOver },
            set: { _ in }
        )) {
            gameOverContent
        }
    }

    // MARK: - Main Game Content

    private func gameContent(state: ClientGameState) -> some View {
        VStack(spacing: 0) {
            TurnStatusBar()

            ScrollView(.vertical, showsIndicators: false) {
                VStack(spacing: 12) {
                    OpponentsView(
                        opponents: state.opponents,
                        onOpponentTapped: { opponent in
                            inspectedOpponent = opponent
                        }
                    )

                    TableCenterView()
                        .padding(.top, 2)

                    PropertyAreaView(
                        properties: state.you.properties,
                        isPaymentMode: false,
                        selectedCardIds: .constant([])
                    )

                    BankView(
                        bank: state.you.bank,
                        selectedCardIds: .constant([])
                    )

                    HandView(
                        hand: state.you.hand,
                        actionsRemaining: state.actionsRemaining,
                        isMyTurn: viewModel.isMyTurn,
                        onCardTapped: { card in
                            if viewModel.isMyTurn && state.actionsRemaining > 0 {
                                selectedCard = card
                            }
                        }
                    )

                    // End Turn button
                    if viewModel.isMyTurn {
                        Button {
                            viewModel.endTurn()
                        } label: {
                            HStack {
                                Spacer()
                                Image(systemName: "arrow.right.circle.fill")
                                Text("End Turn")
                                    .fontWeight(.semibold)
                                Spacer()
                            }
                            .padding()
                            .background(GameColors.accent)
                            .foregroundStyle(.black)
                            .clipShape(RoundedRectangle(cornerRadius: 14))
                        }
                    }
                }
                .padding(.horizontal, 12)
                .padding(.top, 8)
                .padding(.bottom, 24)
            }
        }
        .overlay(alignment: .topTrailing) {
            Button {
                showActionLog = true
            } label: {
                HStack(spacing: 6) {
                    Image(systemName: "clock.arrow.circlepath")
                        .font(.system(size: 12, weight: .semibold))
                    Text("History")
                        .font(.system(size: 12, weight: .bold, design: .rounded))
                }
                .foregroundStyle(GameColors.textPrimary)
                .padding(.horizontal, 10)
                .padding(.vertical, 8)
                .background(
                    Capsule()
                        .fill(GameColors.surface.opacity(0.92))
                )
            }
            .padding(.top, 62)
            .padding(.trailing, 16)
        }
    }

    // MARK: - Full-Screen Cover Content

    @ViewBuilder
    private var paymentDemandContent: some View {
        if let state, let pending = state.pendingAction {
            PaymentDemandView(
                pendingAction: pending,
                playerState: state.you,
                onPay: { cardIds in
                    viewModel.payDebt(cardIds: cardIds)
                },
                onJustSayNo: viewModel.justSayNoCardId != nil ? { cardId in
                    viewModel.justSayNo(cardId: cardId)
                } : nil,
                timerSeconds: viewModel.timerSeconds > 0 ? viewModel.timerSeconds : nil
            )
        }
    }

    @ViewBuilder
    private var justSayNoContent: some View {
        if let state, let pending = state.pendingAction {
            JustSayNoChainView(
                pendingAction: pending,
                canCounter: viewModel.justSayNoCardId != nil,
                originalDescription: describeAction(pending),
                onCounter: { cardId in
                    viewModel.justSayNo(cardId: cardId)
                },
                onAccept: {
                    viewModel.acceptAction()
                },
                timerSeconds: viewModel.timerSeconds > 0 ? viewModel.timerSeconds : nil,
                hand: state.you.hand
            )
        }
    }

    @ViewBuilder
    private var discardContent: some View {
        if let state {
            DiscardView(
                hand: state.you.hand,
                excessCount: max(0, state.you.hand.count - 7),
                onDiscard: { cardIds in
                    viewModel.discard(cardIds: cardIds)
                }
            )
        }
    }

    @ViewBuilder
    private var gameOverContent: some View {
        if let state {
            GameOverView(
                winnerId: state.winnerId ?? "",
                winnerName: viewModel.gameOverWinner ?? "",
                state: state,
                onPlayAgain: {
                    viewModel.navigationPath = [.lobby]
                },
                onMenu: {
                    viewModel.disconnect()
                    viewModel.navigationPath = []
                }
            )
            .interactiveDismissDisabled()
        }
    }

    // MARK: - Helpers

    private func describeAction(_ pending: PendingAction) -> String {
        switch pending.type {
        case .respondToSlyDeal:
            return "Sly Deal -- someone wants to steal your property"
        case .respondToForcedDeal:
            return "Forced Deal -- someone wants to swap properties with you"
        case .respondToDealBreaker:
            return "Deal Breaker -- someone wants to steal your complete set"
        case .counterJustSayNo:
            return "Just Say No was played against you"
        default:
            return "An action is targeting you"
        }
    }
}
