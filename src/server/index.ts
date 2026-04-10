// ============================================================
// MONOPOLY DEAL ONLINE — Server Entry Point
// ============================================================
// Runs a lightweight HTTP server (for health checks / stats)
// and a WebSocket server (for game communication).
// ============================================================

import http from "http";
import { WebSocketServer, WebSocket } from "ws";
import { RoomManager } from "./RoomManager";
import {
  ClientMessageType,
  ServerMessageType,
} from "../shared/types";
import { parseClientMsg, serverMsg } from "../shared/protocol";
import { PING_INTERVAL_MS } from "../shared/constants";

const PORT = parseInt(process.env.PORT || "3000", 10);

// ---- Create HTTP Server ----

const httpServer = http.createServer((req, res) => {
  // CORS headers on all responses for cross-origin WebSocket upgrades
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");

  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  if (req.url === "/health") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ status: "ok", uptime: process.uptime() }));
    return;
  }

  if (req.url === "/stats") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify(roomManager.getStats()));
    return;
  }

  // Simple landing page
  if (req.url === "/") {
    res.writeHead(200, { "Content-Type": "text/html" });
    res.end(`
      <!DOCTYPE html>
      <html>
        <head><title>Monopoly Deal Online</title></head>
        <body style="font-family: system-ui; max-width: 600px; margin: 40px auto; padding: 0 20px;">
          <h1>🎴 Monopoly Deal Online</h1>
          <p>WebSocket game server is running.</p>
          <p><a href="/stats">Server Stats</a> | <a href="/health">Health Check</a></p>
          <hr>
          <p>Connect your iOS client to <code>wss://your-domain/ws</code></p>
        </body>
      </html>
    `);
    return;
  }

  res.writeHead(404);
  res.end("Not Found");
});

// ---- Create WebSocket Server ----

const wss = new WebSocketServer({ server: httpServer, path: "/ws" });
const roomManager = new RoomManager();

// Track alive status for ping/pong
const aliveSockets = new WeakMap<WebSocket, boolean>();

wss.on("connection", (ws: WebSocket) => {
  aliveSockets.set(ws, true);

  console.log(`[WS] New connection (total: ${wss.clients.size})`);

  ws.on("pong", () => {
    aliveSockets.set(ws, true);
  });

  ws.on("message", (data) => {
    // Rate limiting: max 10 messages per second
    if (!roomManager.checkRateLimit(ws)) {
      ws.send(
        serverMsg(ServerMessageType.Error, {
          code: "RATE_LIMITED",
          message: "Too many messages. Max 10 per second.",
        })
      );
      return;
    }

    const raw = data.toString();
    const msg = parseClientMsg(raw);

    if (!msg) {
      ws.send(
        serverMsg(ServerMessageType.Error, {
          code: "PARSE_ERROR",
          message: "Invalid message format",
        })
      );
      return;
    }

    handleClientMessage(ws, msg.type as ClientMessageType, msg.payload);
  });

  ws.on("close", () => {
    roomManager.handleDisconnect(ws);
    console.log(`[WS] Connection closed (total: ${wss.clients.size})`);
  });

  ws.on("error", (err) => {
    console.error("[WS] Socket error:", err.message);
  });
});

// ---- Ping/Pong Heartbeat ----
// Detect dead connections and clean them up.

const pingInterval = setInterval(() => {
  wss.clients.forEach((ws) => {
    if (aliveSockets.get(ws) === false) {
      console.log("[WS] Terminating dead connection");
      ws.terminate();
      return;
    }
    aliveSockets.set(ws, false);
    ws.ping();
  });
}, PING_INTERVAL_MS);

wss.on("close", () => {
  clearInterval(pingInterval);
});

// ---- Message Handler ----

function handleClientMessage(
  ws: WebSocket,
  type: ClientMessageType,
  payload: any
): void {
  switch (type) {
    case ClientMessageType.CreateRoom: {
      const { playerName, avatar } = payload;
      if (!playerName || typeof playerName !== "string") {
        ws.send(
          serverMsg(ServerMessageType.Error, {
            code: "INVALID_NAME",
            message: "Player name is required",
          })
        );
        return;
      }

      const { room, playerId, sessionToken } = roomManager.createRoom(
        playerName.trim().slice(0, 20),
        avatar ?? 0,
        ws
      );

      ws.send(
        serverMsg(ServerMessageType.RoomCreated, {
          room: room.getRoomInfo(),
          playerId,
          sessionToken,
        })
      );
      break;
    }

    case ClientMessageType.JoinRoom: {
      const { roomCode, playerName, avatar } = payload;
      if (!roomCode || !playerName) {
        ws.send(
          serverMsg(ServerMessageType.Error, {
            code: "MISSING_FIELDS",
            message: "Room code and player name are required",
          })
        );
        return;
      }

      const result = roomManager.joinRoom(
        roomCode.trim().toUpperCase(),
        playerName.trim().slice(0, 20),
        avatar ?? 0,
        ws
      );

      if (!result.success) {
        ws.send(
          serverMsg(ServerMessageType.Error, {
            code: "JOIN_FAILED",
            message: result.error,
          })
        );
        return;
      }

      ws.send(
        serverMsg(ServerMessageType.PlayerJoined, {
          room: result.room!.getRoomInfo(),
          playerId: result.playerId,
          sessionToken: result.sessionToken,
        })
      );
      break;
    }

    case ClientMessageType.StartGame: {
      const { roomCode } = payload;
      const room = roomManager.getRoom(roomCode);
      if (!room) {
        ws.send(
          serverMsg(ServerMessageType.Error, {
            code: "ROOM_NOT_FOUND",
            message: "Room not found",
          })
        );
        return;
      }

      // Find the requesting player by their WebSocket
      const requester = room.players.find((p) => p.ws === ws);
      if (!requester) {
        ws.send(
          serverMsg(ServerMessageType.Error, {
            code: "NOT_IN_ROOM",
            message: "You are not in this room",
          })
        );
        return;
      }

      const result = room.startGame(requester.id);
      if (!result.success) {
        ws.send(
          serverMsg(ServerMessageType.Error, {
            code: "START_FAILED",
            message: result.error,
          })
        );
      }
      break;
    }

    case ClientMessageType.PlayerAction: {
      const { roomCode, ...action } = payload;
      const room = roomManager.getRoom(roomCode);
      if (!room) {
        ws.send(
          serverMsg(ServerMessageType.Error, {
            code: "ROOM_NOT_FOUND",
            message: "Room not found",
          })
        );
        return;
      }

      room.processAction(action);
      break;
    }

    case ClientMessageType.Pong: {
      // Client responding to our ping — handled by ws 'pong' event
      break;
    }

    default: {
      ws.send(
        serverMsg(ServerMessageType.Error, {
          code: "UNKNOWN_MESSAGE",
          message: `Unknown message type: ${type}`,
        })
      );
    }
  }
}

// ---- Start Server ----

httpServer.listen(PORT, () => {
  console.log(`
╔═══════════════════════════════════════════╗
║   🎴 MONOPOLY DEAL ONLINE SERVER         ║
║   Running on port ${PORT}                    ║
║   WebSocket: ws://localhost:${PORT}/ws       ║
║   Health:    http://localhost:${PORT}/health  ║
╚═══════════════════════════════════════════╝
  `);
});

// ---- Graceful Shutdown ----

function shutdown() {
  console.log("\n[Server] Shutting down gracefully...");
  clearInterval(pingInterval);
  roomManager.destroy();
  wss.close();
  httpServer.close(() => {
    console.log("[Server] Goodbye!");
    process.exit(0);
  });
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
