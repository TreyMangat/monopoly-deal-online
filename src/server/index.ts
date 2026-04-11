// ============================================================
// MONOPOLY DEAL ONLINE — Server Entry Point
// ============================================================
// Runs a lightweight HTTP server (for health checks / stats)
// and a WebSocket server (for game communication).
// ============================================================

import http from "http";
import fs from "fs";
import path from "path";
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

  // Serve browser client
  if (req.url === "/") {
    const htmlPath = path.join(__dirname, "..", "..", "public", "index.html");
    try {
      const html = fs.readFileSync(htmlPath, "utf-8");
      res.writeHead(200, { "Content-Type": "text/html" });
      res.end(html);
    } catch {
      res.writeHead(500, { "Content-Type": "text/plain" });
      res.end("Could not load index.html");
    }
    return;
  }

  // Serve static files from public/ (manifest, service worker, icons, images, etc.)
  const MIME_TYPES: Record<string, string> = {
    ".json": "application/json",
    ".js": "application/javascript",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".gif": "image/gif",
    ".webp": "image/webp",
    ".svg": "image/svg+xml",
    ".ico": "image/x-icon",
    ".webmanifest": "application/manifest+json",
    ".css": "text/css",
    ".html": "text/html",
  };

  // Strip query strings before resolving path
  const urlPath = (req.url || "").split("?")[0];
  const publicDir = path.join(__dirname, "..", "..", "public");
  const safePath = path.normalize(urlPath).replace(/^(\.\.[/\\])+/, "");
  const filePath = path.join(publicDir, safePath);

  // Ensure the resolved path stays within public/
  if (!filePath.startsWith(publicDir)) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }

  // Debug logging for icon requests
  if (urlPath.startsWith("/icons/")) {
    const exists = fs.existsSync(filePath);
    console.log(`[Static] Icon request: ${urlPath} -> ${filePath} (exists: ${exists})`);
  }

  try {
    const stat = fs.statSync(filePath);
    if (stat.isFile()) {
      const ext = path.extname(filePath).toLowerCase();
      const contentType = MIME_TYPES[ext] || "application/octet-stream";

      // Service worker and icons must not be cached
      const isNoCacheFile =
        filePath.endsWith("service-worker.js") ||
        filePath.includes(`${path.sep}icons${path.sep}`);
      const cacheControl = isNoCacheFile
        ? "no-cache"
        : "public, max-age=86400";

      res.writeHead(200, {
        "Content-Type": contentType,
        "Cache-Control": cacheControl,
      });
      fs.createReadStream(filePath).pipe(res);
      return;
    }
  } catch {
    // File not found — fall through to 404
  }

  res.writeHead(404);
  res.end("Not Found");
});

// ---- Create WebSocket Server ----

const wss = new WebSocketServer({ server: httpServer, path: "/ws" });
const roomManager = new RoomManager();

// Track alive status for ping/pong — require 2 missed pongs before termination
const missedPongs = new WeakMap<WebSocket, number>();

wss.on("connection", (ws: WebSocket) => {
  missedPongs.set(ws, 0);

  console.log(`[WS] New connection (total: ${wss.clients.size})`);

  ws.on("pong", () => {
    missedPongs.set(ws, 0);
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
    const missed = (missedPongs.get(ws) ?? 0) + 1;
    if (missed >= 2) {
      console.log(`[SERVER] ${new Date().toISOString()} Terminating dead connection (${missed} missed pongs)`);
      ws.terminate();
      return;
    }
    missedPongs.set(ws, missed);
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

    case ClientMessageType.CastVote: {
      const { roomCode: voteRoomCode, vote } = payload;
      const voteRoom = roomManager.getRoom(voteRoomCode);
      if (!voteRoom) {
        ws.send(
          serverMsg(ServerMessageType.Error, {
            code: "ROOM_NOT_FOUND",
            message: "Room not found",
          })
        );
        return;
      }
      const voter = voteRoom.players.find((p) => p.ws === ws);
      if (!voter) {
        ws.send(
          serverMsg(ServerMessageType.Error, {
            code: "NOT_IN_ROOM",
            message: "You are not in this room",
          })
        );
        return;
      }
      const voteResult = voteRoom.castVote(voter.id, vote);
      if (!voteResult.success) {
        ws.send(
          serverMsg(ServerMessageType.Error, {
            code: "VOTE_FAILED",
            message: voteResult.error,
          })
        );
      }
      break;
    }

    case ClientMessageType.EndGame: {
      const { roomCode: endRoomCode } = payload;
      const endRoom = roomManager.getRoom(endRoomCode);
      if (!endRoom) {
        ws.send(
          serverMsg(ServerMessageType.Error, {
            code: "ROOM_NOT_FOUND",
            message: "Room not found",
          })
        );
        return;
      }
      const requesterPlayer = endRoom.players.find((p) => p.ws === ws);
      if (!requesterPlayer) {
        ws.send(
          serverMsg(ServerMessageType.Error, {
            code: "NOT_IN_ROOM",
            message: "You are not in this room",
          })
        );
        return;
      }
      const endResult = endRoom.forceEndGame(requesterPlayer.id);
      if (!endResult.success) {
        ws.send(
          serverMsg(ServerMessageType.Error, {
            code: "END_GAME_FAILED",
            message: endResult.error,
          })
        );
      }
      break;
    }

    case ClientMessageType.LeaveGame: {
      const { roomCode: leaveRoomCode } = payload;
      const leaveRoom = roomManager.getRoom(leaveRoomCode);
      if (!leaveRoom) break;
      const leaver = leaveRoom.players.find((p) => p.ws === ws);
      if (!leaver) break;

      // Try early quit (first turn, no cards played)
      if (
        leaveRoom.status === "playing" &&
        leaveRoom.handleEarlyQuit(leaver.id)
      ) {
        // Player was removed from game
        break;
      }

      // Otherwise just disconnect normally
      leaveRoom.handleDisconnect(leaver.id);
      break;
    }

    case ClientMessageType.Reconnect: {
      const {
        roomCode: reconnRoomCode,
        playerId: reconnPlayerId,
        sessionToken: reconnSessionToken,
      } = payload;
      if (!reconnRoomCode || !reconnPlayerId || !reconnSessionToken) {
        ws.send(
          serverMsg(ServerMessageType.Error, {
            code: "MISSING_FIELDS",
            message: "Room code, player ID, and session token are required",
          })
        );
        return;
      }
      const reconnResult = roomManager.reconnect(
        reconnRoomCode,
        reconnPlayerId,
        reconnSessionToken,
        ws
      );
      if (!reconnResult.success) {
        ws.send(
          serverMsg(ServerMessageType.Error, {
            code: reconnResult.errorCode || "RECONNECT_FAILED",
            message: reconnResult.error,
          })
        );
      }
      break;
    }

    case ClientMessageType.AddBot: {
      const { roomCode: addBotRoomCode, difficulty } = payload;
      const addBotRoom = roomManager.getRoom(addBotRoomCode);
      if (!addBotRoom) {
        ws.send(serverMsg(ServerMessageType.Error, { code: "ROOM_NOT_FOUND", message: "Room not found" }));
        return;
      }
      const addBotRequester = addBotRoom.players.find((p) => p.ws === ws);
      if (!addBotRequester || addBotRequester.id !== addBotRoom.hostId) {
        ws.send(serverMsg(ServerMessageType.Error, { code: "NOT_HOST", message: "Only the host can add bots" }));
        return;
      }
      const addBotResult = addBotRoom.addBot(difficulty || "medium");
      if (!addBotResult.success) {
        ws.send(serverMsg(ServerMessageType.Error, { code: "ADD_BOT_FAILED", message: addBotResult.error }));
      } else {
        addBotRoom.players.forEach((p) => {
          if (p.ws?.readyState === WebSocket.OPEN) {
            p.ws.send(serverMsg(ServerMessageType.BotAdded, addBotResult.bot));
          }
        });
      }
      break;
    }

    case ClientMessageType.RemoveBot: {
      const { roomCode: rmBotRoomCode, botId } = payload;
      const rmBotRoom = roomManager.getRoom(rmBotRoomCode);
      if (!rmBotRoom) {
        ws.send(serverMsg(ServerMessageType.Error, { code: "ROOM_NOT_FOUND", message: "Room not found" }));
        return;
      }
      const rmBotRequester = rmBotRoom.players.find((p) => p.ws === ws);
      if (!rmBotRequester || rmBotRequester.id !== rmBotRoom.hostId) {
        ws.send(serverMsg(ServerMessageType.Error, { code: "NOT_HOST", message: "Only the host can remove bots" }));
        return;
      }
      const rmBotResult = rmBotRoom.removeBot(botId);
      if (!rmBotResult.success) {
        ws.send(serverMsg(ServerMessageType.Error, { code: "REMOVE_BOT_FAILED", message: rmBotResult.error }));
      } else {
        rmBotRoom.players.forEach((p) => {
          if (p.ws?.readyState === WebSocket.OPEN) {
            p.ws.send(serverMsg(ServerMessageType.BotRemoved, { botId }));
          }
        });
      }
      break;
    }

    case ClientMessageType.ReplaceWithBot: {
      const { roomCode: replRoomCode, playerId: replPlayerId, difficulty: replDifficulty } = payload;
      const replRoom = roomManager.getRoom(replRoomCode);
      if (!replRoom) {
        ws.send(serverMsg(ServerMessageType.Error, { code: "ROOM_NOT_FOUND", message: "Room not found" }));
        return;
      }
      const replRequester = replRoom.players.find((p) => p.ws === ws);
      if (!replRequester || replRequester.id !== replRoom.hostId) {
        ws.send(serverMsg(ServerMessageType.Error, { code: "NOT_HOST", message: "Only the host can replace players" }));
        return;
      }
      const replResult = replRoom.replacePlayerWithBot(replPlayerId, replDifficulty || "medium");
      if (!replResult.success) {
        ws.send(serverMsg(ServerMessageType.Error, { code: "REPLACE_FAILED", message: replResult.error }));
      }
      break;
    }

    case ClientMessageType.ChatMessage: {
      const { roomCode: chatRoomCode, text } = payload;
      const chatRoom = roomManager.getRoom(chatRoomCode);
      if (!chatRoom) return;
      const chatPlayer = chatRoom.players.find((p) => p.ws === ws);
      if (!chatPlayer) return;
      chatRoom.handleChatMessage(chatPlayer.id, text || "");
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
  console.log(`[SERVER] ${new Date().toISOString()} Server started — PID=${process.pid} PORT=${PORT}`);
  console.log(`[SERVER] WebSocket: ws://localhost:${PORT}/ws | Health: http://localhost:${PORT}/health`);
});

// ---- Graceful Shutdown ----

function shutdown() {
  console.log(`[SERVER] ${new Date().toISOString()} Shutting down gracefully — PID=${process.pid}`);
  clearInterval(pingInterval);
  roomManager.destroy();
  wss.close();
  httpServer.close(() => {
    console.log(`[SERVER] ${new Date().toISOString()} Shutdown complete`);
    process.exit(0);
  });
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
