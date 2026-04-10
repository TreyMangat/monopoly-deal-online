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
  CardType,
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
import { shuffle } from "../engine/helpers";
import { serverMsg } from "../shared/protocol";
import { BotManager, type BotDifficulty } from "../engine/BotManager";

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

  // Vote state
  private votes: Map<string, "play_again" | "leave"> = new Map();
  private voteTimer: ReturnType<typeof setTimeout> | null = null;
  private voteTimerInterval: ReturnType<typeof setInterval> | null = null;
  private voteDeadline: number = 0;

  // Track if any cards have been played this game (for early quit)
  private cardsPlayedByPlayer: Map<string, number> = new Map();

  // Bot management
  private _botManager: BotManager | null = null;
  private _hasBots: boolean = false;
  get botManager(): BotManager {
    if (!this._botManager) this._botManager = new BotManager();
    return this._botManager;
  }
  private botTimers: Map<string, ReturnType<typeof setTimeout>> = new Map();

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
        (this.gameState.phase === TurnPhase.Play ||
          this.gameState.phase === TurnPhase.Draw)
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

    // During voting, treat disconnect as "leave" vote
    if (this.status === RoomStatus.Voting) {
      this.castVote(playerId, "leave");
      return;
    }

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

  // ---- Bot Management ----

  addBot(difficulty: BotDifficulty): { success: boolean; bot?: { id: string; name: string; avatar: number; difficulty: string }; error?: string } {
    if (this.status !== RoomStatus.Waiting) {
      return { success: false, error: "Game already in progress" };
    }
    if (this.players.length >= MAX_PLAYERS) {
      return { success: false, error: "Room is full" };
    }

    const botInfo = this.botManager.createBot(difficulty);
    this._hasBots = true;

    this.players.push({
      id: botInfo.id,
      name: botInfo.name,
      avatar: botInfo.avatar,
      ws: null,
      sessionToken: `bot_${botInfo.id}`,
      disconnectedAt: null,
    });

    this.lastActivityAt = Date.now();
    this.broadcastRoomInfo();

    return { success: true, bot: { id: botInfo.id, name: botInfo.name, avatar: botInfo.avatar, difficulty } };
  }

  removeBot(botId: string): { success: boolean; error?: string } {
    if (!this.botManager.isBotPlayer(botId)) {
      return { success: false, error: "Not a bot" };
    }

    this.botManager.removeBot(botId);
    this.players = this.players.filter((p) => p.id !== botId);
    this.lastActivityAt = Date.now();
    this.broadcastRoomInfo();

    return { success: true };
  }

  replacePlayerWithBot(
    playerId: string,
    difficulty: BotDifficulty
  ): { success: boolean; bot?: { id: string; name: string }; error?: string } {
    if (!this.gameState || this.status !== RoomStatus.Playing) {
      return { success: false, error: "No active game" };
    }

    const playerIdx = this.players.findIndex((p) => p.id === playerId);
    if (playerIdx === -1) return { success: false, error: "Player not found" };

    const player = this.players[playerIdx];

    // Create bot with a unique name
    const botInfo = this.botManager.createBot(difficulty);
    this._hasBots = true;

    // Update ConnectedPlayer entry in-place (keep same array position)
    player.id = botInfo.id;
    player.name = botInfo.name;
    player.avatar = botInfo.avatar;
    player.ws = null;
    player.sessionToken = `bot_${botInfo.id}`;
    player.disconnectedAt = null;

    // Update the GameState player entry
    const gamePlayer = this.gameState.players.find((p) => p.id === playerId);
    if (gamePlayer) {
      gamePlayer.id = botInfo.id;
      gamePlayer.name = botInfo.name;
      gamePlayer.avatar = botInfo.avatar;
      gamePlayer.connected = true;
    }

    // Update pending action references
    if (this.gameState.pendingAction) {
      const pa = this.gameState.pendingAction;
      if (pa.fromPlayerId === playerId) pa.fromPlayerId = botInfo.id;
      pa.targetPlayerIds = pa.targetPlayerIds.map((id) =>
        id === playerId ? botInfo.id : id
      );
      pa.respondedPlayerIds = pa.respondedPlayerIds.map((id) =>
        id === playerId ? botInfo.id : id
      );
    }

    // Clean up disconnect timers for old player
    const disconnectTimer = this.disconnectTimers.get(playerId);
    if (disconnectTimer) {
      clearTimeout(disconnectTimer);
      this.disconnectTimers.delete(playerId);
    }
    this.skippedPlayerIds.delete(playerId);

    // Update card tracking
    const played = this.cardsPlayedByPlayer.get(playerId) || 0;
    this.cardsPlayedByPlayer.delete(playerId);
    this.cardsPlayedByPlayer.set(botInfo.id, played);

    this.clearTimers();
    this.broadcastGameState(`${botInfo.name} (Bot) replaced a disconnected player`);

    // Set up timers, then check if the bot should act
    this.setupTimersForCurrentState();
    this.checkBotSchedule();

    return { success: true, bot: { id: botInfo.id, name: botInfo.name } };
  }

  private scheduleBotTurn(botId: string): void {
    const existing = this.botTimers.get(botId);
    if (existing) clearTimeout(existing);

    const botName = this.botManager.getBotInfo(botId)?.name || botId;
    const delay = 800 + Math.floor(Math.random() * 700); // 800-1500ms
    console.log(`[Bot] Scheduling turn for ${botName} in ${delay}ms`);
    const timer = setTimeout(() => {
      this.botTimers.delete(botId);
      this.processBotTurn(botId);
    }, delay);
    this.botTimers.set(botId, timer);
  }

  private scheduleBotResponse(botId: string): void {
    const existing = this.botTimers.get(botId);
    if (existing) clearTimeout(existing);

    const botName = this.botManager.getBotInfo(botId)?.name || botId;
    const delay = 1000 + Math.floor(Math.random() * 500); // 1000-1500ms
    console.log(`[Bot] Scheduling response for ${botName} in ${delay}ms`);
    const timer = setTimeout(() => {
      this.botTimers.delete(botId);
      this.processBotResponse(botId);
    }, delay);
    this.botTimers.set(botId, timer);
  }

  private processBotTurn(botId: string): void {
    if (!this.gameState) return;
    if (this.gameState.phase === TurnPhase.GameOver) return;
    const currentPlayer = this.gameState.players[this.gameState.currentPlayerIndex];
    if (currentPlayer.id !== botId) return;

    const botInfo = this.botManager.getBotInfo(botId);
    const botName = botInfo?.name || botId;
    const difficulty = botInfo?.difficulty || "medium";

    const action = this.botManager.getBotAction(this.gameState, botId, difficulty);
    console.log(`[Bot] ${botName} plays ${action.type}`);

    const result = this.processAction(action);

    if (!result.success) {
      // Bot made an illegal move — log and force end turn to prevent stuck game
      console.error(`[Bot] ${botName} error: ${result.error} — forcing EndTurn`);
      this.processAction({ type: ActionType.EndTurn, playerId: botId });
    }

    // processAction calls setupTimersForCurrentState + checkBotSchedule,
    // which will schedule the next bot action if the bot still needs to act.
    // But if the turn advanced to a bot (Draw phase), we need an explicit check
    // because checkBotSchedule runs inside processAction's success path.
    // If processAction failed and we forced EndTurn, the forced EndTurn's
    // processAction already handles it.
  }

  private processBotResponse(botId: string): void {
    if (!this.gameState || !this.gameState.pendingAction) return;
    if (this.gameState.phase === TurnPhase.GameOver) return;

    const botInfo = this.botManager.getBotInfo(botId);
    const botName = botInfo?.name || botId;
    const difficulty = botInfo?.difficulty || "medium";

    const action = this.botManager.getBotAction(this.gameState, botId, difficulty);
    console.log(`[Bot] ${botName} responds with ${action.type}`);

    const result = this.processAction(action);

    if (!result.success) {
      console.error(`[Bot] ${botName} response error: ${result.error} — auto-accepting`);
      this.processAction({ type: ActionType.AcceptAction, playerId: botId });
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

    // Reset play tracking for early quit detection
    this.cardsPlayedByPlayer.clear();
    this.players.forEach((p) => this.cardsPlayedByPlayer.set(p.id, 0));

    this.gameState = initializeGame(
      this.code,
      this.players.map((p) => ({
        id: p.id,
        name: p.name,
        avatar: p.avatar,
      }))
    );

    // Mark bots as connected in game state (bots have no WebSocket but are always "present")
    if (this._hasBots) {
      for (const p of this.gameState.players) {
        if (this.botManager.isBotPlayer(p.id)) p.connected = true;
      }
    }

    // Send initial state to all players
    this.broadcastGameState("Game started!");

    // Start turn timer for the first player
    const firstPlayer = this.gameState.players[this.gameState.currentPlayerIndex];
    this.startTurnTimer(firstPlayer.id);

    // If first player is a bot, override with bot scheduling
    if (this._hasBots) this.checkBotSchedule();

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

    // Track card plays for early quit detection
    const playActions = [
      ActionType.PlayPropertyCard, ActionType.PlayMoneyToBank,
      ActionType.PlayActionToBank, ActionType.PlayPassGo,
      ActionType.PlayRentCard, ActionType.PlayDebtCollector,
      ActionType.PlayBirthday, ActionType.PlaySlyDeal,
      ActionType.PlayForcedDeal, ActionType.PlayDealBreaker,
      ActionType.PlayHouse, ActionType.PlayHotel, ActionType.PlayDoubleRent,
    ];
    if (playActions.includes(action.type)) {
      const prev = this.cardsPlayedByPlayer.get(action.playerId) || 0;
      this.cardsPlayedByPlayer.set(action.playerId, prev + 1);
    }

    // Clear existing timers — we'll set new ones based on new state
    this.clearTimers();

    // Broadcast to all
    this.broadcastGameState(result.description);

    // Check for game over
    if (this.gameState.phase === TurnPhase.GameOver) {
      const winner = this.gameState.players.find(
        (p) => p.id === this.gameState!.winnerId
      );
      this.broadcast(
        serverMsg(ServerMessageType.GameOver, {
          winnerId: this.gameState.winnerId,
          winnerName: winner?.name || "Unknown",
        })
      );
      this.startVote();
      return { success: true };
    }

    // Set up timers based on new game phase
    this.setupTimersForCurrentState();

    // If a bot now needs to act, override the human timer with bot scheduling
    if (this._hasBots) this.checkBotSchedule();

    return { success: true };
  }

  private checkBotSchedule(): void {
    if (!this._hasBots) return;
    if (!this.gameState || this.gameState.phase === TurnPhase.GameOver) return;

    const currentPlayer = this.gameState.players[this.gameState.currentPlayerIndex];

    if (this.gameState.phase === TurnPhase.AwaitingResponse && this.gameState.pendingAction) {
      const pa = this.gameState.pendingAction;
      const unrespondedBot = pa.targetPlayerIds.find(
        (id) => !pa.respondedPlayerIds.includes(id) && this.botManager.isBotPlayer(id)
      );
      if (unrespondedBot) {
        this.clearTimers(); // Cancel human response timer
        this.scheduleBotResponse(unrespondedBot);
      }
    } else if (
      this.botManager.isBotPlayer(currentPlayer.id) &&
      (this.gameState.phase === TurnPhase.Play ||
        this.gameState.phase === TurnPhase.Draw ||
        this.gameState.phase === TurnPhase.Discard)
    ) {
      this.clearTimers(); // Cancel any human timer
      this.scheduleBotTurn(currentPlayer.id);
    }
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
      this.gameState.phase === TurnPhase.Discard ||
      this.gameState.phase === TurnPhase.Draw
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

    if (this.gameState.phase === TurnPhase.Draw) {
      // Auto-draw first, then end turn
      this.processAction({
        type: ActionType.DrawCards,
        playerId,
      });
      if (this.gameState && (this.gameState.phase as TurnPhase) === TurnPhase.Play) {
        this.processAction({
          type: ActionType.EndTurn,
          playerId,
        });
      }
      return;
    }

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

  // ---- Vote System ----

  startVote(): void {
    this.status = RoomStatus.Voting;
    this.votes.clear();
    this.clearTimers();
    this.voteDeadline = Date.now() + 15000;

    this.broadcastVoteUpdate();

    // 15-second countdown
    this.voteTimer = setTimeout(() => {
      this.voteTimer = null;
      this.clearVoteTimerInterval();
      this.resolveVote();
    }, 15000);

    this.voteTimerInterval = setInterval(() => {
      this.broadcastVoteUpdate();
    }, 1000);
  }

  castVote(
    playerId: string,
    vote: "play_again" | "leave"
  ): { success: boolean; error?: string } {
    if (this.status !== RoomStatus.Voting) {
      return { success: false, error: "Not in voting phase" };
    }
    if (!this.players.some((p) => p.id === playerId)) {
      return { success: false, error: "Not in this room" };
    }

    this.votes.set(playerId, vote);
    this.lastActivityAt = Date.now();

    // If player voted leave, disconnect them immediately
    if (vote === "leave") {
      const player = this.players.find((p) => p.id === playerId);
      if (player?.ws) {
        player.ws.send(
          serverMsg(ServerMessageType.VoteUpdate, {
            votes: this.getVoteTally(),
            secondsRemaining: 0,
            resolved: true,
            result: "you_left",
          })
        );
      }
    }

    this.broadcastVoteUpdate();

    // Check if all connected players have voted
    const connectedPlayers = this.players.filter(
      (p) => p.ws !== null || this.votes.has(p.id)
    );
    const allVoted = connectedPlayers.every((p) => this.votes.has(p.id));
    if (allVoted) {
      this.clearVoteTimer();
      this.clearVoteTimerInterval();
      this.resolveVote();
    }

    return { success: true };
  }

  resolveVote(): void {
    if (this.status !== RoomStatus.Voting) return;

    this.clearVoteTimer();
    this.clearVoteTimerInterval();

    // Anyone who hasn't voted counts as "play_again"
    for (const player of this.players) {
      if (!this.votes.has(player.id)) {
        this.votes.set(player.id, "play_again");
      }
    }

    const playAgainCount = [...this.votes.values()].filter(
      (v) => v === "play_again"
    ).length;
    const leaveCount = [...this.votes.values()].filter(
      (v) => v === "leave"
    ).length;

    const majority = playAgainCount > leaveCount;

    if (majority) {
      // Remove players who voted leave
      const leavers = [...this.votes.entries()]
        .filter(([, v]) => v === "leave")
        .map(([id]) => id);
      this.players = this.players.filter((p) => !leavers.includes(p.id));

      // Update host if needed
      if (this.players.length > 0 && !this.players.some((p) => p.id === this.hostId)) {
        this.hostId = this.players[0].id;
      }

      if (this.players.length >= MIN_PLAYERS) {
        // Restart game immediately
        this.votes.clear();
        this.cardsPlayedByPlayer.clear();
        this.skippedPlayerIds.clear();
        this.players.forEach((p) => this.cardsPlayedByPlayer.set(p.id, 0));

        this.status = RoomStatus.Playing;
        this.gameState = initializeGame(
          this.code,
          this.players.map((p) => ({
            id: p.id,
            name: p.name,
            avatar: p.avatar,
          }))
        );

        this.broadcast(
          serverMsg(ServerMessageType.VoteUpdate, {
            votes: this.getVoteTally(),
            secondsRemaining: 0,
            resolved: true,
            result: "play_again",
          })
        );

        this.broadcastGameState("New game started — Play Again won the vote!");

        const firstPlayer =
          this.gameState.players[this.gameState.currentPlayerIndex];
        this.startTurnTimer(firstPlayer.id);
      } else {
        // Not enough players to continue
        this.status = RoomStatus.Finished;
        this.broadcast(
          serverMsg(ServerMessageType.VoteUpdate, {
            votes: this.getVoteTally(),
            secondsRemaining: 0,
            resolved: true,
            result: "leave",
          })
        );
      }
    } else {
      // Majority leave — room closes
      this.status = RoomStatus.Finished;
      this.broadcast(
        serverMsg(ServerMessageType.VoteUpdate, {
          votes: this.getVoteTally(),
          secondsRemaining: 0,
          resolved: true,
          result: "leave",
        })
      );
    }
  }

  private getVoteTally(): {
    play_again: number;
    leave: number;
    waiting: number;
    total: number;
  } {
    const total = this.players.length;
    const playAgain = [...this.votes.values()].filter(
      (v) => v === "play_again"
    ).length;
    const leave = [...this.votes.values()].filter(
      (v) => v === "leave"
    ).length;
    return {
      play_again: playAgain,
      leave,
      waiting: total - playAgain - leave,
      total,
    };
  }

  private broadcastVoteUpdate(): void {
    const secondsRemaining = Math.max(
      0,
      Math.ceil((this.voteDeadline - Date.now()) / 1000)
    );
    this.broadcast(
      serverMsg(ServerMessageType.VoteUpdate, {
        votes: this.getVoteTally(),
        secondsRemaining,
        resolved: false,
      })
    );
  }

  private clearVoteTimer(): void {
    if (this.voteTimer) {
      clearTimeout(this.voteTimer);
      this.voteTimer = null;
    }
  }

  private clearVoteTimerInterval(): void {
    if (this.voteTimerInterval) {
      clearInterval(this.voteTimerInterval);
      this.voteTimerInterval = null;
    }
  }

  // ---- Force End Game (host only) ----

  forceEndGame(requesterId: string): { success: boolean; error?: string } {
    if (requesterId !== this.hostId) {
      return { success: false, error: "Only the host can end the game" };
    }
    if (this.status !== RoomStatus.Playing || !this.gameState) {
      return { success: false, error: "No active game to end" };
    }

    this.clearTimers();
    this.gameState.phase = TurnPhase.GameOver;
    this.gameState.winnerId = null;

    this.broadcastGameState("Host ended the game");
    this.broadcast(
      serverMsg(ServerMessageType.GameOver, {
        winnerId: null,
        winnerName: null,
      })
    );
    this.startVote();
    return { success: true };
  }

  // ---- Early Quit (first turn, no cards played) ----

  handleEarlyQuit(playerId: string): boolean {
    if (!this.gameState || this.status !== RoomStatus.Playing) return false;

    // Only during the first turn
    if (this.gameState.turnNumber > 1) return false;

    // Only if this player has played zero cards
    const played = this.cardsPlayedByPlayer.get(playerId) || 0;
    if (played > 0) return false;

    const playerIdx = this.gameState.players.findIndex(
      (p) => p.id === playerId
    );
    if (playerIdx === -1) return false;

    const player = this.gameState.players[playerIdx];
    const playerName = player.name;

    // Return hand to deck and reshuffle
    this.gameState.deck.push(...player.hand);
    this.gameState.deck = shuffle(this.gameState.deck);

    // Remove from game state
    this.gameState.players.splice(playerIdx, 1);

    // Fix currentPlayerIndex if needed
    if (this.gameState.currentPlayerIndex >= this.gameState.players.length) {
      this.gameState.currentPlayerIndex = 0;
    } else if (this.gameState.currentPlayerIndex > playerIdx) {
      this.gameState.currentPlayerIndex--;
    }

    // Remove from connected players
    this.players = this.players.filter((p) => p.id !== playerId);
    this.cardsPlayedByPlayer.delete(playerId);

    // Update host if needed
    if (this.hostId === playerId && this.players.length > 0) {
      this.hostId = this.players[0].id;
    }

    // Check if enough players remain
    if (this.gameState.players.length < MIN_PLAYERS) {
      this.clearTimers();
      this.gameState.phase = TurnPhase.GameOver;
      this.gameState.winnerId = null;
      this.broadcastGameState(
        `${playerName} left before playing — not enough players to continue`
      );
      this.status = RoomStatus.Finished;
      return true;
    }

    this.clearTimers();
    this.broadcastGameState(
      `${playerName} left before playing — removed from game`
    );
    this.setupTimersForCurrentState();

    return true;
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
    const yourPlayerIndex = gs.players.findIndex((p) => p.id === playerId);

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
      yourPlayerIndex,
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

  getRoomInfo(): RoomInfo & { bots?: string[] } {
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
      bots: this.botManager.getAllBots().map((b) => b.id),
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
    this.clearVoteTimer();
    this.clearVoteTimerInterval();
    for (const timer of this.disconnectTimers.values()) {
      clearTimeout(timer);
    }
    this.disconnectTimers.clear();
    for (const timer of this.botTimers.values()) {
      clearTimeout(timer);
    }
    this.botTimers.clear();
    this.botManager.clear();
  }
}
