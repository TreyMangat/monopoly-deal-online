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
  ActionType,
  TurnPhase,
  RoomStatus,
  RoomInfo,
  ClientGameState,
  OpponentView,
  ServerMessageType,
  PendingActionType,
  Card,
} from "../shared/types";
import {
  MAX_PLAYERS,
  MIN_PLAYERS,
  ROOM_TIMEOUT_MS,
  RECONNECT_GRACE_MS,
  TURN_TIMER_MS,
  RESPONSE_TIMER_MS,
  DISCONNECTED_RESPONSE_TIMER_MS,
  TIMER_UPDATE_INTERVAL_MS,
} from "../shared/constants";
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

  // Timer state
  private turnTimer: ReturnType<typeof setTimeout> | null = null;
  private responseTimer: ReturnType<typeof setTimeout> | null = null;
  private timerInterval: ReturnType<typeof setInterval> | null = null;
  private timerDeadline: number = 0;
  private timerType: "turn" | "response" = "turn";
  private timerTargetPlayerId: string = "";

  // Disconnect handling
  private skippedPlayerIds: Set<string> = new Set();
  private disconnectTimers: Map<string, ReturnType<typeof setTimeout>> =
    new Map();

  constructor(
    code: string,
    hostId: string,
    hostName: string,
    hostAvatar: number,
    ws: WebSocket,
    sessionToken: string
  ) {
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

    // Clear disconnect timer if one exists
    const disconnectTimer = this.disconnectTimers.get(playerId);
    if (disconnectTimer) {
      clearTimeout(disconnectTimer);
      this.disconnectTimers.delete(playerId);
    }

    // Remove from skipped set — they're back
    this.skippedPlayerIds.delete(playerId);

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

    // If it's now their turn and timers aren't running, start turn timer
    if (this.gameState) {
      const currentPlayer =
        this.gameState.players[this.gameState.currentPlayerIndex];
      if (
        currentPlayer.id === playerId &&
        this.gameState.phase === TurnPhase.Play
      ) {
        this.startTurnTimer(playerId);
      }
    }

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

    // Handle disconnect during active game
    if (this.gameState && this.status === RoomStatus.Playing) {
      const currentPlayer =
        this.gameState.players[this.gameState.currentPlayerIndex];

      if (currentPlayer.id === playerId) {
        // It's the disconnected player's turn — give them grace period
        this.clearTimers();
        const timer = setTimeout(() => {
          this.disconnectTimers.delete(playerId);
          this.skippedPlayerIds.add(playerId);
          this.autoEndTurn(playerId);
        }, RECONNECT_GRACE_MS);
        this.disconnectTimers.set(playerId, timer);
      }

      // If they're targeted by a pending action, auto-accept after 10s
      if (
        this.gameState.pendingAction &&
        this.gameState.pendingAction.targetPlayerIds.includes(playerId) &&
        !this.gameState.pendingAction.respondedPlayerIds.includes(playerId)
      ) {
        this.clearTimers();
        this.startResponseTimer(playerId, DISCONNECTED_RESPONSE_TIMER_MS);
      }
    }
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

    // Start turn timer for the first player
    const firstPlayer = this.gameState.players[this.gameState.currentPlayerIndex];
    this.startTurnTimer(firstPlayer.id);

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

    // Track the current player and phase before action to detect turn changes
    const prevPlayerIndex = this.gameState.currentPlayerIndex;
    const prevPhase = this.gameState.phase;

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

    // Clear existing timers — we'll set new ones based on new state
    this.clearTimers();

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
      return { success: true };
    }

    // Set up timers based on new game phase
    this.setupTimersForCurrentState();

    return { success: true };
  }

  // ---- Timer Management ----

  private setupTimersForCurrentState(): void {
    if (!this.gameState) return;

    const currentPlayer =
      this.gameState.players[this.gameState.currentPlayerIndex];

    if (this.gameState.phase === TurnPhase.AwaitingResponse) {
      // Find the first unresponded target player
      const pending = this.gameState.pendingAction;
      if (pending) {
        const unrespondedId = pending.targetPlayerIds.find(
          (id) => !pending.respondedPlayerIds.includes(id)
        );
        if (unrespondedId) {
          const targetConnPlayer = this.players.find(
            (p) => p.id === unrespondedId
          );
          const isDisconnected = !targetConnPlayer?.ws;
          const duration = isDisconnected
            ? DISCONNECTED_RESPONSE_TIMER_MS
            : RESPONSE_TIMER_MS;
          this.startResponseTimer(unrespondedId, duration);
        }
      }
    } else if (
      this.gameState.phase === TurnPhase.Play ||
      this.gameState.phase === TurnPhase.Discard
    ) {
      // Check if the current player is skipped (disconnected too long)
      if (this.skippedPlayerIds.has(currentPlayer.id)) {
        // Auto-end their turn immediately
        setTimeout(() => this.autoEndTurn(currentPlayer.id), 0);
      } else if (!currentPlayer.connected) {
        // Player is disconnected but not yet skipped — start grace period
        const timer = setTimeout(() => {
          this.disconnectTimers.delete(currentPlayer.id);
          this.skippedPlayerIds.add(currentPlayer.id);
          this.autoEndTurn(currentPlayer.id);
        }, RECONNECT_GRACE_MS);
        this.disconnectTimers.set(currentPlayer.id, timer);
      } else {
        this.startTurnTimer(currentPlayer.id);
      }
    }
  }

  private startTurnTimer(playerId: string): void {
    this.clearTimers();
    this.timerType = "turn";
    this.timerTargetPlayerId = playerId;
    this.timerDeadline = Date.now() + TURN_TIMER_MS;

    this.turnTimer = setTimeout(() => {
      this.turnTimer = null;
      this.clearTimerInterval();
      this.autoEndTurn(playerId);
    }, TURN_TIMER_MS);

    // Send timer updates every 5 seconds
    this.sendTimerUpdate();
    this.timerInterval = setInterval(() => {
      this.sendTimerUpdate();
    }, TIMER_UPDATE_INTERVAL_MS);
  }

  private startResponseTimer(playerId: string, duration: number): void {
    this.clearTimers();
    this.timerType = "response";
    this.timerTargetPlayerId = playerId;
    this.timerDeadline = Date.now() + duration;

    this.responseTimer = setTimeout(() => {
      this.responseTimer = null;
      this.clearTimerInterval();
      this.autoAccept(playerId);
    }, duration);

    // Send timer updates every 5 seconds
    this.sendTimerUpdate();
    this.timerInterval = setInterval(() => {
      this.sendTimerUpdate();
    }, TIMER_UPDATE_INTERVAL_MS);
  }

  private sendTimerUpdate(): void {
    const secondsRemaining = Math.max(
      0,
      Math.ceil((this.timerDeadline - Date.now()) / 1000)
    );
    this.broadcast(
      serverMsg(ServerMessageType.TimerUpdate, {
        playerId: this.timerTargetPlayerId,
        secondsRemaining,
        timerType: this.timerType,
      })
    );
  }

  clearTimers(): void {
    if (this.turnTimer) {
      clearTimeout(this.turnTimer);
      this.turnTimer = null;
    }
    if (this.responseTimer) {
      clearTimeout(this.responseTimer);
      this.responseTimer = null;
    }
    this.clearTimerInterval();
  }

  private clearTimerInterval(): void {
    if (this.timerInterval) {
      clearInterval(this.timerInterval);
      this.timerInterval = null;
    }
  }

  private autoEndTurn(playerId: string): void {
    if (!this.gameState) return;
    const currentPlayer =
      this.gameState.players[this.gameState.currentPlayerIndex];
    if (currentPlayer.id !== playerId) return;

    if (this.gameState.phase === TurnPhase.Discard) {
      // Auto-discard: discard from the end of hand until at 7
      const hand = currentPlayer.hand;
      const excess = hand.length - 7;
      if (excess > 0) {
        const discardIds = hand.slice(-excess).map((c) => c.id);
        this.processAction({
          type: ActionType.DiscardCards,
          playerId,
          cardIds: discardIds,
        });
        return;
      }
    }

    this.processAction({
      type: ActionType.EndTurn,
      playerId,
    });
  }

  private autoAccept(playerId: string): void {
    if (!this.gameState || !this.gameState.pendingAction) return;

    const pending = this.gameState.pendingAction;
    const isPayment = [
      PendingActionType.PayRent,
      PendingActionType.PayDebtCollector,
      PendingActionType.PayBirthday,
    ].includes(pending.type);

    if (isPayment) {
      // Auto-pay: gather all bank + property card IDs
      const cardIds = this.getAutoPayCardIds(playerId);
      this.processAction({
        type: ActionType.PayWithCards,
        playerId,
        cardIds,
      });
    } else {
      // Steal/deal actions: auto-accept
      this.processAction({
        type: ActionType.AcceptAction,
        playerId,
      });
    }
  }

  private getAutoPayCardIds(playerId: string): string[] {
    if (!this.gameState) return [];
    const player = this.gameState.players.find((p) => p.id === playerId);
    if (!player) return [];

    const ids: string[] = [];
    // Bank cards first
    for (const card of player.bank) {
      ids.push(card.id);
    }
    // Then property cards
    for (const group of player.properties) {
      for (const card of group.cards) {
        ids.push(card.id);
      }
    }
    return ids;
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

  /** Clean up all timers when the room is destroyed */
  destroy(): void {
    this.clearTimers();
    for (const timer of this.disconnectTimers.values()) {
      clearTimeout(timer);
    }
    this.disconnectTimers.clear();
  }
}
