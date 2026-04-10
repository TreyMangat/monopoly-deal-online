// ============================================================
// MONOPOLY DEAL ONLINE — Game Room
// ============================================================
// A single game room. Holds the authoritative GameState,
// processes actions through the engine, and broadcasts
// filtered state to each connected player.
// ============================================================

import { WebSocket } from "ws";
import {
  GameState,
  PlayerState,
  PlayerAction,
  TurnPhase,
  RoomStatus,
  RoomInfo,
  ClientGameState,
  OpponentView,
  ServerMessageType,
  Card,
} from "../shared/types";
import { MAX_PLAYERS, MIN_PLAYERS, ROOM_TIMEOUT_MS } from "../shared/constants";
import { initializeGame, applyAction } from "../engine/GameEngine";
import { serverMsg } from "../shared/protocol";

interface ConnectedPlayer {
  id: string;
  name: string;
  avatar: number;
  ws: WebSocket | null;
  sessionToken: string;
  disconnectedAt: number | null;
}

export class GameRoom {
  code: string;
  status: RoomStatus;
  hostId: string;
  players: ConnectedPlayer[];
  gameState: GameState | null;
  createdAt: number;
  lastActivityAt: number;

  constructor(code: string, hostId: string, hostName: string, hostAvatar: number, ws: WebSocket, sessionToken: string) {
    this.code = code;
    this.status = RoomStatus.Waiting;
    this.hostId = hostId;
    this.players = [
      {
        id: hostId,
        name: hostName,
        avatar: hostAvatar,
        ws,
        sessionToken,
        disconnectedAt: null,
      },
    ];
    this.gameState = null;
    this.createdAt = Date.now();
    this.lastActivityAt = Date.now();
  }

  // ---- Lobby ----

  addPlayer(
    id: string,
    name: string,
    avatar: number,
    ws: WebSocket,
    sessionToken: string
  ): { success: boolean; error?: string } {
    if (this.status !== RoomStatus.Waiting) {
      return { success: false, error: "Game already in progress" };
    }
    if (this.players.length >= MAX_PLAYERS) {
      return { success: false, error: "Room is full" };
    }
    if (this.players.some((p) => p.name === name)) {
      return { success: false, error: "Name already taken in this room" };
    }

    this.players.push({
      id,
      name,
      avatar,
      ws,
      sessionToken,
      disconnectedAt: null,
    });

    this.lastActivityAt = Date.now();

    // Broadcast updated room info to all
    this.broadcastRoomInfo();

    return { success: true };
  }

  removePlayer(playerId: string): void {
    this.players = this.players.filter((p) => p.id !== playerId);
    if (this.players.length > 0 && this.hostId === playerId) {
      this.hostId = this.players[0].id;
    }
    this.broadcastRoomInfo();
  }

  reconnectPlayer(playerId: string, ws: WebSocket): boolean {
    const player = this.players.find((p) => p.id === playerId);
    if (!player) return false;

    player.ws = ws;
    player.disconnectedAt = null;

    if (this.gameState) {
      const gamePlayer = this.gameState.players.find(
        (p) => p.id === playerId
      );
      if (gamePlayer) gamePlayer.connected = true;
    }

    // Send current state to reconnected player
    if (this.gameState) {
      this.sendStateToPlayer(playerId);
    }

    this.broadcast(
      serverMsg(ServerMessageType.PlayerReconnected, {
        playerId,
        playerName: player.name,
      })
    );

    return true;
  }

  handleDisconnect(playerId: string): void {
    const player = this.players.find((p) => p.id === playerId);
    if (!player) return;

    player.ws = null;
    player.disconnectedAt = Date.now();

    if (this.gameState) {
      const gamePlayer = this.gameState.players.find(
        (p) => p.id === playerId
      );
      if (gamePlayer) gamePlayer.connected = false;
    }

    this.broadcast(
      serverMsg(ServerMessageType.PlayerLeft, {
        playerId,
        playerName: player.name,
        temporary: this.status === RoomStatus.Playing,
      })
    );
  }

  // ---- Game Start ----

  startGame(requesterId: string): { success: boolean; error?: string } {
    if (requesterId !== this.hostId) {
      return { success: false, error: "Only the host can start the game" };
    }
    if (this.players.length < MIN_PLAYERS) {
      return {
        success: false,
        error: `Need at least ${MIN_PLAYERS} players`,
      };
    }

    this.status = RoomStatus.Playing;

    this.gameState = initializeGame(
      this.code,
      this.players.map((p) => ({
        id: p.id,
        name: p.name,
        avatar: p.avatar,
      }))
    );

    // Send initial state to all players
    this.broadcastGameState("Game started!");

    return { success: true };
  }

  // ---- Action Processing ----

  processAction(
    action: PlayerAction
  ): { success: boolean; error?: string } {
    if (!this.gameState) {
      return { success: false, error: "Game not started" };
    }
    if (this.gameState.phase === TurnPhase.GameOver) {
      return { success: false, error: "Game is over" };
    }

    this.lastActivityAt = Date.now();

    const result = applyAction(this.gameState, action);

    if (!result.ok) {
      // Send rejection to the acting player only
      const player = this.players.find((p) => p.id === action.playerId);
      if (player?.ws?.readyState === WebSocket.OPEN) {
        player.ws.send(
          serverMsg(ServerMessageType.ActionRejected, {
            reason: result.error,
            action,
          })
        );
      }
      return { success: false, error: result.error };
    }

    // Update the authoritative state
    this.gameState = result.state;

    // Broadcast to all
    this.broadcastGameState(result.description);

    // Check for game over
    if (this.gameState.phase === TurnPhase.GameOver) {
      this.status = RoomStatus.Finished;
      const winner = this.gameState.players.find(
        (p) => p.id === this.gameState!.winnerId
      );
      this.broadcast(
        serverMsg(ServerMessageType.GameOver, {
          winnerId: this.gameState.winnerId,
          winnerName: winner?.name || "Unknown",
        })
      );
    }

    return { success: true };
  }

  // ---- State Broadcasting ----

  private broadcastGameState(description: string): void {
    for (const player of this.players) {
      if (player.ws?.readyState === WebSocket.OPEN) {
        const filteredState = this.filterStateForPlayer(player.id);
        player.ws.send(
          serverMsg(ServerMessageType.GameStateUpdate, {
            state: filteredState,
            lastAction: { description },
          })
        );
      }
    }
  }

  private sendStateToPlayer(playerId: string): void {
    const player = this.players.find((p) => p.id === playerId);
    if (!player?.ws || player.ws.readyState !== WebSocket.OPEN) return;

    const filteredState = this.filterStateForPlayer(playerId);
    player.ws.send(
      serverMsg(ServerMessageType.GameStateUpdate, {
        state: filteredState,
        lastAction: { description: "Reconnected — here's the current state" },
      })
    );
  }

  /**
   * Filter game state so each player only sees their own hand.
   * Opponents' hands are shown as counts only.
   */
  private filterStateForPlayer(playerId: string): ClientGameState {
    const gs = this.gameState!;
    const you = gs.players.find((p) => p.id === playerId)!;

    const opponents: OpponentView[] = gs.players
      .filter((p) => p.id !== playerId)
      .map((p) => ({
        id: p.id,
        name: p.name,
        avatar: p.avatar,
        handCount: p.hand.length,
        bank: p.bank,
        properties: p.properties,
        connected: p.connected,
      }));

    return {
      roomCode: gs.roomCode,
      phase: gs.phase,
      currentPlayerIndex: gs.currentPlayerIndex,
      actionsRemaining: gs.actionsRemaining,
      turnNumber: gs.turnNumber,
      drawPileCount: gs.deck.length,
      discardPileTop:
        gs.discardPile.length > 0
          ? gs.discardPile[gs.discardPile.length - 1]
          : null,
      you,
      opponents,
      pendingAction: gs.pendingAction,
      winnerId: gs.winnerId,
    };
  }

  private broadcastRoomInfo(): void {
    const info = this.getRoomInfo();
    this.broadcast(
      serverMsg(ServerMessageType.PlayerJoined, { room: info })
    );
  }

  private broadcast(msg: string): void {
    for (const player of this.players) {
      if (player.ws?.readyState === WebSocket.OPEN) {
        player.ws.send(msg);
      }
    }
  }

  // ---- Queries ----

  getRoomInfo(): RoomInfo {
    return {
      code: this.code,
      status: this.status,
      players: this.players.map((p) => ({
        id: p.id,
        name: p.name,
        avatar: p.avatar,
      })),
      hostId: this.hostId,
      maxPlayers: MAX_PLAYERS,
      createdAt: this.createdAt,
    };
  }

  isExpired(): boolean {
    return Date.now() - this.lastActivityAt > ROOM_TIMEOUT_MS;
  }

  isEmpty(): boolean {
    return this.players.every((p) => p.ws === null);
  }

  getPlayerBySessionToken(token: string): ConnectedPlayer | undefined {
    return this.players.find((p) => p.sessionToken === token);
  }
}
