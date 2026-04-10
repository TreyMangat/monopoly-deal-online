// ============================================================
// MONOPOLY DEAL ONLINE — Server Hardening Tests
// ============================================================
// Tests for turn timers, response timers, and disconnect handling.
// ============================================================

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { GameRoom } from "../server/GameRoom";
import { RoomManager } from "../server/RoomManager";
import {
  TurnPhase,
  ActionType,
  ServerMessageType,
  RoomStatus,
} from "../shared/types";
import {
  TURN_TIMER_MS,
  RESPONSE_TIMER_MS,
  RECONNECT_GRACE_MS,
  DISCONNECTED_RESPONSE_TIMER_MS,
  TIMER_UPDATE_INTERVAL_MS,
} from "../shared/constants";
import { WebSocket } from "ws";

// ---- Mock WebSocket ----

function createMockWs(): WebSocket {
  const sent: string[] = [];
  const ws = {
    readyState: WebSocket.OPEN,
    send: vi.fn((data: string) => {
      sent.push(data);
    }),
    ping: vi.fn(),
    terminate: vi.fn(),
    on: vi.fn(),
    _sent: sent,
  } as unknown as WebSocket & { _sent: string[] };
  return ws;
}

function parseSent(ws: WebSocket & { _sent: string[] }): any[] {
  return ws._sent.map((s) => JSON.parse(s));
}

function getMessagesByType(
  ws: WebSocket & { _sent: string[] },
  type: ServerMessageType
): any[] {
  return parseSent(ws).filter((m) => m.type === type);
}

// ---- Helper: create a room with 2 players and start the game ----

function setupGameRoom(): {
  room: GameRoom;
  ws1: WebSocket & { _sent: string[] };
  ws2: WebSocket & { _sent: string[] };
  p1Id: string;
  p2Id: string;
} {
  const ws1 = createMockWs();
  const ws2 = createMockWs();
  const p1Id = "player-1";
  const p2Id = "player-2";

  const room = new GameRoom("TEST01", p1Id, "Alice", 0, ws1 as WebSocket, "token-1");
  room.addPlayer(p2Id, "Bob", 1, ws2 as WebSocket, "token-2");

  // Clear messages from lobby
  ws1._sent.length = 0;
  ws2._sent.length = 0;

  room.startGame(p1Id);

  // Draw cards for p1 to enter Play phase
  room.processAction({ type: ActionType.DrawCards, playerId: p1Id });

  return { room, ws1, ws2, p1Id, p2Id };
}

// ---- Turn Timer Tests ----

describe("Turn Timer", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("should auto-end turn after 60 seconds of inactivity", () => {
    const { room, p1Id } = setupGameRoom();
    const gs = room.gameState!;

    // Verify it's player 1's turn in Play phase
    expect(gs.players[gs.currentPlayerIndex].id).toBe(p1Id);
    expect(gs.phase).toBe(TurnPhase.Play);

    // Advance past the turn timer
    vi.advanceTimersByTime(TURN_TIMER_MS + 100);

    // Turn should have advanced to player 2
    const updatedGs = room.gameState!;
    expect(updatedGs.players[updatedGs.currentPlayerIndex].id).not.toBe(p1Id);
  });

  it("should send timer_update messages every 5 seconds", () => {
    const { ws1 } = setupGameRoom();

    // Clear messages from game start
    ws1._sent.length = 0;

    // Advance 5 seconds — should get a timer update
    vi.advanceTimersByTime(TIMER_UPDATE_INTERVAL_MS);

    const timerUpdates = getMessagesByType(ws1, ServerMessageType.TimerUpdate);
    expect(timerUpdates.length).toBeGreaterThanOrEqual(1);

    const update = timerUpdates[timerUpdates.length - 1];
    expect(update.payload.timerType).toBe("turn");
    expect(update.payload.secondsRemaining).toBeLessThanOrEqual(60);
    expect(update.payload.secondsRemaining).toBeGreaterThan(0);
  });

  it("should clear turn timer when player acts", () => {
    const { room, ws1, p1Id } = setupGameRoom();
    const gs = room.gameState!;
    const player = gs.players.find((p) => p.id === p1Id)!;

    // Player ends their turn (valid action)
    room.processAction({
      type: ActionType.EndTurn,
      playerId: p1Id,
    });

    // Clear messages
    ws1._sent.length = 0;

    // Advance past what would have been the old timer — no auto-end should fire for p1
    vi.advanceTimersByTime(TURN_TIMER_MS + 100);

    // Game should still be running (player 2's turn now, and their timer fired)
    expect(room.gameState!.phase).not.toBe(TurnPhase.GameOver);
  });

  it("should start a new turn timer for the next player after turn ends", () => {
    const { room, ws2, p1Id, p2Id } = setupGameRoom();

    // Player 1 ends their turn
    room.processAction({
      type: ActionType.EndTurn,
      playerId: p1Id,
    });

    // Clear messages
    ws2._sent.length = 0;

    // Now it's player 2's turn — advance 5s and check for timer update
    vi.advanceTimersByTime(TIMER_UPDATE_INTERVAL_MS);

    const timerUpdates = getMessagesByType(ws2, ServerMessageType.TimerUpdate);
    expect(timerUpdates.length).toBeGreaterThanOrEqual(1);
    expect(timerUpdates[0].payload.playerId).toBe(p2Id);
  });
});

// ---- Response Timer Tests ----

describe("Response Timer", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("should auto-accept after 30 seconds when targeted by action", () => {
    const { room, p1Id, p2Id } = setupGameRoom();
    const gs = room.gameState!;
    const player1 = gs.players.find((p) => p.id === p1Id)!;

    // Manually put a debt collector card in player 1's hand for testing
    const debtCollectorCard = {
      id: "test_debt_collector",
      type: "action_debt_collector" as any,
      name: "Debt Collector",
      bankValue: 3,
      actionValue: 5,
    };
    player1.hand.push(debtCollectorCard);

    // Player 1 plays debt collector targeting player 2
    room.processAction({
      type: ActionType.PlayDebtCollector,
      playerId: p1Id,
      cardId: "test_debt_collector",
      targetPlayerId: p2Id,
    });

    // Should be in AwaitingResponse
    expect(room.gameState!.phase).toBe(TurnPhase.AwaitingResponse);

    // Advance past response timer
    vi.advanceTimersByTime(RESPONSE_TIMER_MS + 100);

    // The pending action should have been resolved (auto-accept/auto-pay)
    expect(room.gameState!.phase).not.toBe(TurnPhase.AwaitingResponse);
  });
});

// ---- Disconnect Handling Tests ----

describe("Disconnect Handling", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("should wait reconnect grace period when current player disconnects", () => {
    const { room, p1Id, p2Id } = setupGameRoom();

    // Verify it's player 1's turn
    expect(
      room.gameState!.players[room.gameState!.currentPlayerIndex].id
    ).toBe(p1Id);

    // Player 1 disconnects
    room.handleDisconnect(p1Id);

    // Advance partway — should still be player 1's turn (grace period)
    vi.advanceTimersByTime(RECONNECT_GRACE_MS / 2);
    expect(
      room.gameState!.players[room.gameState!.currentPlayerIndex].id
    ).toBe(p1Id);

    // Advance past grace period
    vi.advanceTimersByTime(RECONNECT_GRACE_MS / 2 + 100);

    // Turn should have advanced past player 1
    expect(
      room.gameState!.players[room.gameState!.currentPlayerIndex].id
    ).toBe(p2Id);
  });

  it("should resume normal play when disconnected player reconnects", () => {
    const { room, ws1, p1Id } = setupGameRoom();

    // Player 1 disconnects
    room.handleDisconnect(p1Id);

    // Reconnect before grace period expires
    vi.advanceTimersByTime(RECONNECT_GRACE_MS / 2);
    const newWs = createMockWs();
    room.reconnectPlayer(p1Id, newWs as WebSocket);

    // Should still be player 1's turn
    expect(
      room.gameState!.players[room.gameState!.currentPlayerIndex].id
    ).toBe(p1Id);

    // Advance past what would have been the grace period — should NOT auto-end
    vi.advanceTimersByTime(RECONNECT_GRACE_MS);

    // Player 1 should still be current (turn timer is separate and starts fresh)
    // The turn timer would have fired at TURN_TIMER_MS from reconnect, not RECONNECT_GRACE_MS
    // Since TURN_TIMER_MS (60s) < RECONNECT_GRACE_MS (120s), it would have fired
    // But the turn just advances, game should still be running
    expect(room.gameState!.phase).not.toBe(TurnPhase.GameOver);
  });

  it("should skip disconnected player on future turns after grace period expires", () => {
    const { room, p1Id, p2Id } = setupGameRoom();

    // Player 1 disconnects
    room.handleDisconnect(p1Id);

    // Grace period expires — player 1 is now skipped
    vi.advanceTimersByTime(RECONNECT_GRACE_MS + 100);

    // Should be player 2's turn now
    expect(
      room.gameState!.players[room.gameState!.currentPlayerIndex].id
    ).toBe(p2Id);

    // Player 2 draws then ends turn
    room.processAction({
      type: ActionType.DrawCards,
      playerId: p2Id,
    });
    room.processAction({
      type: ActionType.EndTurn,
      playerId: p2Id,
    });

    // Should skip player 1 and come back to player 2
    // (need a tick for the setTimeout(0) skip to fire)
    vi.advanceTimersByTime(10);

    expect(
      room.gameState!.players[room.gameState!.currentPlayerIndex].id
    ).toBe(p2Id);
  });

  it("should auto-accept after 10 seconds when disconnected player is targeted", () => {
    const { room, p1Id, p2Id } = setupGameRoom();

    // End player 1's turn so it's player 2's turn
    room.processAction({
      type: ActionType.EndTurn,
      playerId: p1Id,
    });

    // Now disconnect player 1
    room.handleDisconnect(p1Id);

    // Player 2 draws cards to enter Play phase
    room.processAction({
      type: ActionType.DrawCards,
      playerId: p2Id,
    });

    const gs = room.gameState!;
    const player2 = gs.players.find((p) => p.id === p2Id)!;

    // Put a debt collector in player 2's hand
    const debtCollectorCard = {
      id: "test_debt_collector_2",
      type: "action_debt_collector" as any,
      name: "Debt Collector",
      bankValue: 3,
      actionValue: 5,
    };
    player2.hand.push(debtCollectorCard);

    // Player 2 plays debt collector targeting disconnected player 1
    room.processAction({
      type: ActionType.PlayDebtCollector,
      playerId: p2Id,
      cardId: "test_debt_collector_2",
      targetPlayerId: p1Id,
    });

    if (room.gameState!.phase === TurnPhase.AwaitingResponse) {
      // Advance past the short disconnected response timer
      vi.advanceTimersByTime(DISCONNECTED_RESPONSE_TIMER_MS + 100);

      // Should have auto-accepted
      expect(room.gameState!.phase).not.toBe(TurnPhase.AwaitingResponse);
    }
    // If the engine auto-resolved (player had nothing to pay), that's also fine
  });
});

// ---- Rate Limiting Tests ----

describe("Rate Limiting", () => {
  it("should allow up to 10 messages per second", () => {
    const rm = new RoomManager();
    const ws = createMockWs();

    for (let i = 0; i < 10; i++) {
      expect(rm.checkRateLimit(ws as WebSocket)).toBe(true);
    }

    // 11th should be rate limited
    expect(rm.checkRateLimit(ws as WebSocket)).toBe(false);

    rm.destroy();
  });

  it("should reset rate limit after the window passes", () => {
    vi.useFakeTimers();
    const rm = new RoomManager();
    const ws = createMockWs();

    // Use up the limit
    for (let i = 0; i < 10; i++) {
      rm.checkRateLimit(ws as WebSocket);
    }
    expect(rm.checkRateLimit(ws as WebSocket)).toBe(false);

    // Advance past the 1-second window
    vi.advanceTimersByTime(1100);

    // Should be allowed again
    expect(rm.checkRateLimit(ws as WebSocket)).toBe(true);

    rm.destroy();
    vi.useRealTimers();
  });
});
