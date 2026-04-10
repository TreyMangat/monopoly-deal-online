#!/usr/bin/env npx tsx
// ============================================================
// MONOPOLY DEAL ONLINE — E2E WebSocket Connection Test
// ============================================================
// Usage: npx tsx scripts/test-connection.ts [ws://host:port/ws]
// ============================================================

import WebSocket from "ws";

const SERVER_URL = process.argv[2] || "ws://localhost:3000/ws";
const TIMEOUT_MS = 10_000;

// ANSI colors
const GREEN = "\x1b[32m";
const RED = "\x1b[31m";
const YELLOW = "\x1b[33m";
const RESET = "\x1b[0m";

function log(msg: string) {
  console.log(`${YELLOW}[TEST]${RESET} ${msg}`);
}

function pass(msg: string) {
  console.log(`${GREEN}  ✓ ${msg}${RESET}`);
}

function fail(msg: string): never {
  console.error(`${RED}  ✗ FAIL: ${msg}${RESET}`);
  cleanup();
  process.exit(1);
}

// ---- Helpers ----

const sockets: WebSocket[] = [];

function cleanup() {
  for (const ws of sockets) {
    try {
      ws.close();
    } catch {}
  }
}

function connect(label: string): Promise<WebSocket> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(SERVER_URL);
    sockets.push(ws);

    const timer = setTimeout(() => {
      reject(new Error(`${label}: connection timed out`));
    }, TIMEOUT_MS);

    ws.on("open", () => {
      clearTimeout(timer);
      log(`${label} connected`);
      resolve(ws);
    });

    ws.on("error", (err) => {
      clearTimeout(timer);
      reject(new Error(`${label}: ${err.message}`));
    });
  });
}

function send(ws: WebSocket, type: string, payload: Record<string, unknown>) {
  ws.send(JSON.stringify({ type, payload }));
}

function waitForMessage(
  ws: WebSocket,
  expectedType: string,
  label: string
): Promise<any> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`${label}: timed out waiting for "${expectedType}"`));
    }, TIMEOUT_MS);

    const handler = (data: WebSocket.Data) => {
      const msg = JSON.parse(data.toString());
      if (msg.type === expectedType) {
        clearTimeout(timer);
        ws.removeListener("message", handler);
        resolve(msg.payload);
      }
      // Ignore other message types (e.g. player_joined broadcasts)
    };

    ws.on("message", handler);
  });
}

// ---- Main Test Flow ----

async function main() {
  log(`Connecting to ${SERVER_URL}\n`);

  // Step 1: Connect Player 1 and create room
  const ws1 = await connect("Player 1");

  const roomCreatedPromise = waitForMessage(ws1, "room_created", "Player 1");
  send(ws1, "create_room", { playerName: "Alice", avatar: 0 });
  const roomCreated = await roomCreatedPromise;

  const roomCode = roomCreated.room.code;
  const player1Id = roomCreated.playerId;
  if (!roomCode || typeof roomCode !== "string") {
    fail("room_created did not contain a room code");
  }
  pass(`Room created with code: ${roomCode}`);

  // Step 2: Connect Player 2 and join
  const ws2 = await connect("Player 2");

  const p2JoinedPromise = waitForMessage(ws2, "player_joined", "Player 2");
  send(ws2, "join_room", { roomCode, playerName: "Bob", avatar: 1 });
  const p2Joined = await p2JoinedPromise;

  const player2Id = p2Joined.playerId;
  if (!player2Id) {
    fail("Player 2 did not receive a playerId on join");
  }
  pass("Player 2 joined the room");

  // Step 3: Connect Player 3 and join
  const ws3 = await connect("Player 3");

  const p3JoinedPromise = waitForMessage(ws3, "player_joined", "Player 3");
  send(ws3, "join_room", { roomCode, playerName: "Charlie", avatar: 2 });
  const p3Joined = await p3JoinedPromise;

  const player3Id = p3Joined.playerId;
  if (!player3Id) {
    fail("Player 3 did not receive a playerId on join");
  }
  pass("Player 3 joined the room");

  // Step 4: Player 1 starts the game
  log("Starting game...");

  const statePromise1 = waitForMessage(ws1, "game_state_update", "Player 1");
  const statePromise2 = waitForMessage(ws2, "game_state_update", "Player 2");
  const statePromise3 = waitForMessage(ws3, "game_state_update", "Player 3");

  send(ws1, "start_game", { roomCode });

  const [state1, state2, state3] = await Promise.all([
    statePromise1,
    statePromise2,
    statePromise3,
  ]);

  pass("All 3 players received game_state_update");

  // Step 5: Verify Player 1's initial state
  // Player 1 is index 0 (first player), so they get 5 dealt + 2 drawn = 7 cards
  const p1Hand = state1.state.you.hand;
  if (!Array.isArray(p1Hand)) {
    fail("Player 1's hand is not an array");
  }
  if (p1Hand.length !== 7) {
    fail(`Player 1 should have 7 cards (5 dealt + 2 drawn), got ${p1Hand.length}`);
  }
  pass("Player 1 has 7 cards in hand (5 dealt + 2 drawn)");

  // Step 6: Verify opponents from Player 1's perspective
  const opponents1 = state1.state.opponents;
  if (!Array.isArray(opponents1) || opponents1.length !== 2) {
    fail(`Player 1 should see 2 opponents, got ${opponents1?.length}`);
  }

  for (const opp of opponents1) {
    if (opp.handCount !== 5) {
      fail(`Opponent ${opp.name} should have handCount of 5, got ${opp.handCount}`);
    }
    // Verify opponents don't have actual hand data exposed
    if ((opp as any).hand !== undefined) {
      fail(`Opponent ${opp.name} has hand data exposed — security violation!`);
    }
  }
  pass("Opponents show handCount of 5 (hands hidden)");

  // Step 7: Player 1 ends turn
  log("Player 1 ending turn...");

  const endTurnStatePromise1 = waitForMessage(ws1, "game_state_update", "Player 1 (end turn)");
  const endTurnStatePromise2 = waitForMessage(ws2, "game_state_update", "Player 2 (end turn)");

  send(ws1, "player_action", {
    roomCode,
    type: "end_turn",
    playerId: player1Id,
  });

  const [endState1, endState2] = await Promise.all([
    endTurnStatePromise1,
    endTurnStatePromise2,
  ]);

  // Step 8: Verify current player advanced to index 1
  const newIndex = endState1.state.currentPlayerIndex;
  if (newIndex !== 1) {
    fail(`currentPlayerIndex should be 1 after end_turn, got ${newIndex}`);
  }
  pass("currentPlayerIndex advanced to 1");

  // Also verify from Player 2's perspective
  if (endState2.state.currentPlayerIndex !== 1) {
    fail("Player 2 sees wrong currentPlayerIndex");
  }
  pass("Player 2 also sees currentPlayerIndex = 1");

  // ---- Done ----
  console.log();
  console.log(`${GREEN}════════════════════════════════${RESET}`);
  console.log(`${GREEN}   ALL TESTS PASSED${RESET}`);
  console.log(`${GREEN}════════════════════════════════${RESET}`);

  cleanup();
  process.exit(0);
}

main().catch((err) => {
  fail(err.message || String(err));
});
