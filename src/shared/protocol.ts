// ============================================================
// MONOPOLY DEAL ONLINE — WebSocket Protocol
// ============================================================
// Defines the exact shape of every message between client
// and server. Both sides import this as the contract.
// ============================================================

import {
  ClientGameState,
  PlayerAction,
  RoomInfo,
  ServerMessageType,
  ClientMessageType,
} from "./types";

// ---- Client → Server Payloads ----

export interface CreateRoomPayload {
  playerName: string;
  avatar: number;
}

export interface JoinRoomPayload {
  roomCode: string;
  playerName: string;
  avatar: number;
}

export interface StartGamePayload {
  roomCode: string;
}

export interface PlayerActionPayload extends PlayerAction {
  roomCode: string;
}

export interface ReconnectPayload {
  roomCode: string;
  playerId: string;
  sessionToken: string;
}

// ---- Server → Client Payloads ----

export interface RoomCreatedPayload {
  room: RoomInfo;
  playerId: string;
  sessionToken: string;
}

export interface PlayerJoinedPayload {
  room: RoomInfo;
  playerId: string;
  sessionToken: string;
}

export interface GameStartedPayload {
  state: ClientGameState;
}

export interface GameStateUpdatePayload {
  state: ClientGameState;
  lastAction?: {
    playerId: string;
    description: string; // human-readable, e.g. "Alex played Sly Deal on Jordan"
  };
}

export interface ActionRejectedPayload {
  reason: string;
  action: PlayerAction;
}

export interface GameOverPayload {
  winnerId: string;
  winnerName: string;
  finalState: ClientGameState;
}

export interface ErrorPayload {
  code: string;
  message: string;
}

// ---- Typed message constructors ----

export function serverMsg(
  type: ServerMessageType,
  payload: unknown
): string {
  return JSON.stringify({ type, payload });
}

export function parseClientMsg(
  raw: string
): { type: ClientMessageType; payload: unknown } | null {
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed.type === "string") {
      return parsed;
    }
    return null;
  } catch {
    return null;
  }
}
