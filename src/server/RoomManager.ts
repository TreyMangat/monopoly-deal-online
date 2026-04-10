// ============================================================
// MONOPOLY DEAL ONLINE — Room Manager
// ============================================================
// Creates rooms, assigns room codes, handles room lifecycle.
// ============================================================

import { WebSocket } from "ws";
import { v4 as uuidv4 } from "uuid";
import { GameRoom } from "./GameRoom";
import { ROOM_CODE_LENGTH } from "../shared/constants";

export class RoomManager {
  private rooms: Map<string, GameRoom> = new Map();
  private cleanupInterval: ReturnType<typeof setInterval>;

  constructor() {
    // Cleanup expired/empty rooms every 5 minutes
    this.cleanupInterval = setInterval(() => this.cleanup(), 5 * 60 * 1000);
  }

  createRoom(
    playerName: string,
    avatar: number,
    ws: WebSocket
  ): { room: GameRoom; playerId: string; sessionToken: string } {
    const code = this.generateRoomCode();
    const playerId = uuidv4();
    const sessionToken = uuidv4();

    const room = new GameRoom(
      code,
      playerId,
      playerName,
      avatar,
      ws,
      sessionToken
    );
    this.rooms.set(code, room);

    console.log(
      `[RoomManager] Room ${code} created by "${playerName}" (${playerId})`
    );

    return { room, playerId, sessionToken };
  }

  joinRoom(
    roomCode: string,
    playerName: string,
    avatar: number,
    ws: WebSocket
  ): {
    success: boolean;
    room?: GameRoom;
    playerId?: string;
    sessionToken?: string;
    error?: string;
  } {
    const room = this.rooms.get(roomCode.toUpperCase());
    if (!room) {
      return { success: false, error: "Room not found" };
    }

    const playerId = uuidv4();
    const sessionToken = uuidv4();

    const result = room.addPlayer(
      playerId,
      playerName,
      avatar,
      ws,
      sessionToken
    );

    if (!result.success) {
      return { success: false, error: result.error };
    }

    console.log(
      `[RoomManager] "${playerName}" (${playerId}) joined room ${roomCode}`
    );

    return { success: true, room, playerId, sessionToken };
  }

  reconnect(
    roomCode: string,
    playerId: string,
    sessionToken: string,
    ws: WebSocket
  ): { success: boolean; error?: string } {
    const room = this.rooms.get(roomCode.toUpperCase());
    if (!room) return { success: false, error: "Room not found" };

    const player = room.getPlayerBySessionToken(sessionToken);
    if (!player || player.id !== playerId) {
      return { success: false, error: "Invalid session" };
    }

    const reconnected = room.reconnectPlayer(playerId, ws);
    if (!reconnected) {
      return { success: false, error: "Reconnection failed" };
    }

    console.log(`[RoomManager] Player ${playerId} reconnected to room ${roomCode}`);
    return { success: true };
  }

  getRoom(roomCode: string): GameRoom | undefined {
    return this.rooms.get(roomCode.toUpperCase());
  }

  handleDisconnect(ws: WebSocket): void {
    for (const [code, room] of this.rooms) {
      const player = room.players.find((p) => p.ws === ws);
      if (player) {
        room.handleDisconnect(player.id);
        console.log(
          `[RoomManager] Player ${player.id} disconnected from room ${code}`
        );

        // Remove from waiting rooms entirely
        if (room.status === "waiting") {
          room.removePlayer(player.id);
          if (room.isEmpty()) {
            this.rooms.delete(code);
            console.log(`[RoomManager] Empty waiting room ${code} removed`);
          }
        }
        break;
      }
    }
  }

  private generateRoomCode(): string {
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no I,O,0,1 to avoid confusion
    let code: string;
    do {
      code = "";
      for (let i = 0; i < ROOM_CODE_LENGTH; i++) {
        code += chars[Math.floor(Math.random() * chars.length)];
      }
    } while (this.rooms.has(code));
    return code;
  }

  private cleanup(): void {
    for (const [code, room] of this.rooms) {
      if (room.isExpired() || (room.isEmpty() && room.status !== "waiting")) {
        this.rooms.delete(code);
        console.log(`[RoomManager] Cleaned up expired room ${code}`);
      }
    }
  }

  getStats(): { totalRooms: number; waitingRooms: number; activeGames: number } {
    let waiting = 0;
    let active = 0;
    for (const room of this.rooms.values()) {
      if (room.status === "waiting") waiting++;
      if (room.status === "playing") active++;
    }
    return {
      totalRooms: this.rooms.size,
      waitingRooms: waiting,
      activeGames: active,
    };
  }

  destroy(): void {
    clearInterval(this.cleanupInterval);
    this.rooms.clear();
  }
}
