// ============================================================
// MONOPOLY DEAL ONLINE — Post-Game Vote Tests
// ============================================================

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { GameRoom } from "../server/GameRoom";
import {
  TurnPhase,
  ActionType,
  RoomStatus,
  ServerMessageType,
} from "../shared/types";
import { WebSocket } from "ws";

// ---- Mock WebSocket ----

function createMockWs(): WebSocket & { _sent: string[] } {
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
  type: string
): any[] {
  return parseSent(ws).filter((m) => m.type === type);
}

// ---- Helper: create room, start game, play to game over ----

function setupGameRoom(playerCount = 2): {
  room: GameRoom;
  wsList: (WebSocket & { _sent: string[] })[];
  playerIds: string[];
} {
  const wsList: (WebSocket & { _sent: string[] })[] = [];
  const playerIds: string[] = [];

  const ws1 = createMockWs();
  wsList.push(ws1);
  playerIds.push("player-1");

  const room = new GameRoom(
    "VOTE01",
    "player-1",
    "Alice",
    0,
    ws1 as WebSocket,
    "token-1"
  );

  for (let i = 2; i <= playerCount; i++) {
    const ws = createMockWs();
    wsList.push(ws);
    const pid = `player-${i}`;
    playerIds.push(pid);
    room.addPlayer(pid, `Player${i}`, i - 1, ws as WebSocket, `token-${i}`);
  }

  // Clear lobby messages
  wsList.forEach((ws) => (ws._sent.length = 0));

  room.startGame("player-1");

  // Fix starting player to player-1 for deterministic tests
  if (room.gameState) {
    room.gameState.currentPlayerIndex = 0;
  }

  return { room, wsList, playerIds };
}

function forceGameOver(room: GameRoom): void {
  // Use forceEndGame by host
  room.forceEndGame("player-1");
}

// ---- Vote Tests ----

describe("Post-Game Vote", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("should transition to voting status when game ends", () => {
    const { room } = setupGameRoom();

    forceGameOver(room);

    expect(room.status).toBe(RoomStatus.Voting);
  });

  it("should broadcast vote_update messages during voting", () => {
    const { room, wsList } = setupGameRoom();

    forceGameOver(room);

    const ws1 = wsList[0];
    const voteUpdates = getMessagesByType(ws1, "vote_update");
    expect(voteUpdates.length).toBeGreaterThan(0);

    const lastUpdate = voteUpdates[voteUpdates.length - 1];
    expect(lastUpdate.payload.votes).toBeDefined();
    expect(lastUpdate.payload.votes.total).toBe(2);
    expect(lastUpdate.payload.votes.waiting).toBe(2);
    expect(lastUpdate.payload.resolved).toBe(false);
  });

  it("should resolve immediately when all players vote play_again", () => {
    const { room, wsList, playerIds } = setupGameRoom();

    forceGameOver(room);

    room.castVote(playerIds[0], "play_again");
    room.castVote(playerIds[1], "play_again");

    // Should have started a new game
    expect(room.status).toBe(RoomStatus.Playing);
    expect(room.gameState).not.toBeNull();
    expect(room.gameState!.turnNumber).toBe(1);
    expect(room.gameState!.phase).toBe(TurnPhase.Draw);
  });

  it("should resolve immediately when all players vote leave", () => {
    const { room, playerIds } = setupGameRoom();

    forceGameOver(room);

    room.castVote(playerIds[0], "leave");
    room.castVote(playerIds[1], "leave");

    expect(room.status).toBe(RoomStatus.Finished);
  });

  it("should resolve to play_again on majority", () => {
    const { room, playerIds } = setupGameRoom(3);

    forceGameOver(room);

    room.castVote(playerIds[0], "play_again");
    room.castVote(playerIds[1], "play_again");
    room.castVote(playerIds[2], "leave");

    expect(room.status).toBe(RoomStatus.Playing);
    // The player who left should be removed
    expect(room.players.length).toBe(2);
  });

  it("should resolve to leave on majority", () => {
    const { room, playerIds } = setupGameRoom(3);

    forceGameOver(room);

    room.castVote(playerIds[0], "leave");
    room.castVote(playerIds[1], "leave");
    room.castVote(playerIds[2], "play_again");

    expect(room.status).toBe(RoomStatus.Finished);
  });

  it("should auto-resolve after 15 seconds with non-voters as play_again", () => {
    const { room, playerIds } = setupGameRoom();

    forceGameOver(room);

    // Only one player votes leave
    room.castVote(playerIds[0], "leave");

    // Timer hasn't expired yet
    expect(room.status).toBe(RoomStatus.Voting);

    // Advance past vote timer
    vi.advanceTimersByTime(16000);

    // Non-voter counts as play_again → 1 play_again vs 1 leave = play_again wins (not majority leave)
    // With equal, play_again wins because > is used (1 > 1 is false, so majority is false => leave wins)
    // Actually: playAgainCount(1) > leaveCount(1) is false, so majority = false => Finished
    expect(room.status).toBe(RoomStatus.Finished);
  });

  it("should auto-resolve after 15 seconds with non-voters defaulting to play_again", () => {
    const { room, playerIds } = setupGameRoom(3);

    forceGameOver(room);

    // One votes leave, two don't vote
    room.castVote(playerIds[0], "leave");

    vi.advanceTimersByTime(16000);

    // 2 play_again (default) vs 1 leave → play_again wins
    expect(room.status).toBe(RoomStatus.Playing);
  });

  it("should reject votes from players not in the room", () => {
    const { room } = setupGameRoom();
    forceGameOver(room);

    const result = room.castVote("unknown-player", "play_again");
    expect(result.success).toBe(false);
  });

  it("should reject votes when not in voting phase", () => {
    const { room, playerIds } = setupGameRoom();
    // Game is playing, not voting

    const result = room.castVote(playerIds[0], "play_again");
    expect(result.success).toBe(false);
    expect(result.error).toBe("Not in voting phase");
  });

  it("should remove leavers and keep same room code on play_again", () => {
    const { room, playerIds } = setupGameRoom(3);

    forceGameOver(room);

    room.castVote(playerIds[0], "play_again");
    room.castVote(playerIds[1], "play_again");
    room.castVote(playerIds[2], "leave");

    expect(room.code).toBe("VOTE01");
    expect(room.gameState!.roomCode).toBe("VOTE01");
    expect(room.players.length).toBe(2);
    expect(room.players.some((p) => p.id === playerIds[2])).toBe(false);
  });

  it("should end with finished if play_again leaves too few players", () => {
    const { room, playerIds } = setupGameRoom(2);

    forceGameOver(room);

    room.castVote(playerIds[0], "play_again");
    room.castVote(playerIds[1], "leave");

    // 1 play_again vs 1 leave: not majority play_again => finished
    expect(room.status).toBe(RoomStatus.Finished);
  });
});

// ---- Host End Game Tests ----

describe("Host End Game", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("should allow host to force end the game", () => {
    const { room } = setupGameRoom();

    const result = room.forceEndGame("player-1");
    expect(result.success).toBe(true);
    expect(room.gameState!.phase).toBe(TurnPhase.GameOver);
    expect(room.gameState!.winnerId).toBeNull();
    expect(room.status).toBe(RoomStatus.Voting);
  });

  it("should reject non-host from ending the game", () => {
    const { room } = setupGameRoom();

    const result = room.forceEndGame("player-2");
    expect(result.success).toBe(false);
    expect(result.error).toBe("Only the host can end the game");
  });

  it("should broadcast game_over with null winner on host end", () => {
    const { room, wsList } = setupGameRoom();

    forceGameOver(room);

    const ws1 = wsList[0];
    const gameOvers = getMessagesByType(ws1, "game_over");
    expect(gameOvers.length).toBe(1);
    expect(gameOvers[0].payload.winnerId).toBeNull();
  });
});

// ---- Early Quit Tests ----

describe("Early Quit", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("should remove player who quits on first turn with no cards played", () => {
    const { room, playerIds } = setupGameRoom(3);

    // Player 3 hasn't played any cards, it's turn 1
    const result = room.handleEarlyQuit(playerIds[2]);
    expect(result).toBe(true);
    expect(room.gameState!.players.length).toBe(2);
    expect(
      room.gameState!.players.some((p) => p.id === playerIds[2])
    ).toBe(false);
  });

  it("should return cards to deck on early quit", () => {
    const { room, playerIds } = setupGameRoom(3);

    const deckBefore = room.gameState!.deck.length;
    const handSize = room.gameState!.players.find(
      (p) => p.id === playerIds[2]
    )!.hand.length;

    room.handleEarlyQuit(playerIds[2]);

    expect(room.gameState!.deck.length).toBe(deckBefore + handSize);
  });

  it("should not allow early quit after cards have been played", () => {
    const { room, playerIds } = setupGameRoom();

    // Draw and play a card for player 1
    room.processAction({
      type: ActionType.DrawCards,
      playerId: playerIds[0],
    });

    // Try to early-quit player 1 who has drawn (but drawing doesn't count as playing)
    // Actually, we need them to play an action. Let's just play money to bank.
    const hand = room.gameState!.players[0].hand;
    const moneyCard = hand.find((c) => c.type === "money");
    if (moneyCard) {
      room.processAction({
        type: ActionType.PlayMoneyToBank,
        playerId: playerIds[0],
        cardId: moneyCard.id,
      });
    }

    const result = room.handleEarlyQuit(playerIds[0]);
    expect(result).toBe(false);
  });

  it("should not allow early quit after turn 1", () => {
    const { room, playerIds } = setupGameRoom();

    // Advance to turn 2
    room.processAction({
      type: ActionType.DrawCards,
      playerId: playerIds[0],
    });
    room.processAction({
      type: ActionType.EndTurn,
      playerId: playerIds[0],
    });

    // Now it's turn 2
    expect(room.gameState!.turnNumber).toBeGreaterThan(1);

    const result = room.handleEarlyQuit(playerIds[1]);
    expect(result).toBe(false);
  });

  it("should end game if early quit drops below 2 players", () => {
    const { room, playerIds } = setupGameRoom(2);

    room.handleEarlyQuit(playerIds[1]);

    expect(room.gameState!.phase).toBe(TurnPhase.GameOver);
  });
});
