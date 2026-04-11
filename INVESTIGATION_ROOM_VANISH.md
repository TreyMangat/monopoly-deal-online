# Investigation: Room Vanishes Mid-Game

**Date**: 2026-04-10
**Bug**: Both connected players simultaneously saw "Reconnecting..." then "No room found" during a near-win game state.

---

## Hypothesis Analysis

### 1. Room cleanup race condition — CONFIRMED

**Evidence**: `RoomManager.cleanup()` (RoomManager.ts:155-161) deletes rooms when:
```ts
room.isExpired() || (room.isEmpty() && room.status !== "waiting")
```

`isEmpty()` (GameRoom.ts:1320-1322) checks:
```ts
return this.players.every((p) => p.ws === null);
```

If both players disconnect simultaneously (network blip, Render hiccup), both get `ws = null`. The room is in `"playing"` status (not `"waiting"`), so `room.isEmpty() && room.status !== "waiting"` evaluates to **true**. The next cleanup cycle (every 5 minutes) deletes the room with no regard for:
- Active disconnect timers (grace period)
- Whether players might reconnect
- Game state (playing, voting, etc.)

Additionally, after bot replacement (120s grace), bots have `ws: null` too, so `isEmpty()` remains true even with active bot players.

**Severity**: HIGH — This is a confirmed deletion path. The 5-minute cleanup interval means it won't be instant, but if a cleanup cycle happens to run during a simultaneous disconnect window, the room is gone.

### 2. Grace period vs cleanup timer interaction — CONFIRMED

**Evidence**: The disconnect grace period (GameRoom.ts:247-252) sets a 120s timer to replace with a bot, but this timer is purely internal to GameRoom. The RoomManager cleanup (RoomManager.ts:155-161) has **zero awareness** of these timers. There is no flag, timestamp, or method that cleanup checks to see "this room has players who might reconnect."

Code path:
1. Player A disconnects → `handleDisconnect()` sets `ws = null`, starts 120s grace timer
2. Player B disconnects → same
3. Cleanup fires → `isEmpty()` is true (both `ws === null`), status is `"playing"` → **room deleted**
4. Grace timers fire into the void (room reference may still exist but is no longer in the `rooms` Map)
5. Players try to reconnect → `rooms.get(roomCode)` returns undefined → "Room not found"

**Severity**: HIGH — Direct interaction bug between two independent timer systems.

### 3. Game-end cleanup firing early — RULED OUT

**Evidence**: When a win is detected (GameRoom.ts:598-609), the code:
1. Broadcasts `GameOver` message
2. Calls `startVote()` which sets status to `"voting"`
3. Does NOT delete the room

The vote system (GameRoom.ts:929-1017) either restarts the game or sets status to `"finished"` — neither deletes the room from `RoomManager.rooms`. Deletion only happens in `cleanup()` or `handleDisconnect()` for waiting rooms.

However, there IS a secondary issue: during voting, if a player disconnects, `handleDisconnect` auto-casts a "leave" vote (GameRoom.ts:234-237). If both disconnect simultaneously during voting, both vote "leave", resolveVote fires, and status becomes "finished". This doesn't explain the reported bug (which happened during gameplay, not voting), but is worth noting.

### 4. Bot auto-replace interaction — POSSIBLE

**Evidence**: `replacePlayerWithBot()` (GameRoom.ts:308-379) does significant state mutation:
- Changes player ID, name, avatar in-place
- Updates GameState player entry
- Updates pending action references
- Calls `processAction` indirectly via `checkBotSchedule()`

If player A is being replaced by a bot at the exact moment player B also disconnects, the `handleDisconnect` for player B could race with the bot replacement's `broadcastGameState()` call. Since JavaScript is single-threaded, this wouldn't be a true race condition, but the bot's first `processAction` call could throw if game state is in an unexpected intermediate state.

Without try/catch around `processAction`, a thrown error crashes the room (or the process).

**Severity**: MEDIUM — Requires specific timing, but unprotected code path.

### 5. Unhandled exception in applyAction or broadcast — CONFIRMED

**Evidence**: `processAction()` (GameRoom.ts:542-616) calls `applyAction()` at line 558 with **no try/catch**:
```ts
const result = applyAction(this.gameState, action);
```

If `applyAction` throws (edge case in winning move, deck empty, malformed state), the exception propagates through:
1. `processAction()` → no catch
2. `handleClientMessage()` in index.ts → no catch
3. `ws.on("message", ...)` callback → no catch
4. **Becomes an unhandled exception → crashes the Node.js process**

A process crash kills ALL rooms (in-memory state). Render auto-restarts the container. When clients reconnect, ALL rooms return "Room not found."

This is the **most likely explanation** for the "sudden" aspect of the bug — a cleanup race would take up to 5 minutes, but an unhandled exception is instant.

Similarly, `broadcastGameState()` (GameRoom.ts:1160-1179) calls `filterStateForPlayer()` which accesses `this.gameState!` and `gs.players.find()`. If game state is corrupted (e.g., winnerId points to a removed player), this could throw, and there's no try/catch.

**Severity**: CRITICAL — Can crash the entire server, affecting all rooms.

### 6. Render free tier restart — POSSIBLE

**Evidence**: Render free tier spins down after ~15 min idle and can restart containers. All in-memory state is lost. The server startup log (index.ts:548-557) has an ASCII banner but:
- No ISO timestamp
- No PID
- No way to distinguish cold start from warm restart in logs

Without timestamps on startup, there's no way to correlate "room vanished at time T" with "server restarted at time T" from Render logs.

**Severity**: MEDIUM — Expected behavior for free tier, but we need logging to diagnose.

### 7. WebSocket heartbeat/ping timeout — POSSIBLE

**Evidence**: Ping interval (index.ts:185-195) is 15 seconds (`PING_INTERVAL_MS`). If a client fails to respond to ONE ping:
```ts
if (aliveSockets.get(ws) === false) {
  ws.terminate(); // Killed after missing just 1 pong
  return;
}
```

A 15-second network hiccup (Render CPU spike, mobile backgrounding, WiFi switch) causes both clients to miss a single pong → both terminated → both trigger `handleDisconnect` → room becomes "empty" → vulnerable to cleanup deletion.

The 15-second single-miss termination is aggressive. Standard WebSocket best practice is 2-3 missed pings before termination.

**Severity**: MEDIUM — Amplifies the cleanup race condition by making simultaneous disconnects more likely.

---

## Root Cause Assessment

**Primary suspect**: **Hypothesis 5 (unhandled exception)** — Most likely cause of the "sudden" simultaneous failure. An uncaught error during the winning move path crashes the entire Node process, killing all rooms instantly. Both players see "Reconnecting..." (server is down) then "No room found" (server restarted, rooms gone).

**Secondary suspect**: **Hypotheses 1+2 (cleanup race)** — If both clients had a brief network interruption (hypothesis 7 makes this easier), the 5-minute cleanup could delete the room. This would be slower than the exception scenario but is a confirmed bug regardless.

**Contributing factor**: **Hypothesis 7 (aggressive ping)** — Makes simultaneous disconnects more likely, feeding into the cleanup race.

---

## Recommended Fixes

### Fix 1: Try/catch around processAction + broadcast (CRITICAL)
Wrap `applyAction()` and all broadcast paths in try/catch. On error: log with room code + action type, send error to client, do NOT propagate to crash the process.

### Fix 2: Protect rooms from premature cleanup (HIGH)
- `cleanup()` must skip rooms with active disconnect timers
- `cleanup()` must skip rooms in Playing or Voting status that aren't expired
- `isEmpty()` should not count bot players (they have `ws: null` but are active)
- Add a 5-minute absolute protection for rooms in Voting status

### Fix 3: Add diagnostic logging (HIGH)
ISO timestamps + PID on server startup. Structured logging on room create/delete/disconnect/reconnect/game-end with `[ROOM:code]` prefixes for Render log grep.

### Fix 4: (Future) Consider less aggressive ping timeout
Current: terminate after 1 missed pong (15s). Recommendation: terminate after 2 missed pongs (30s). Not implemented in this fix to keep scope tight.

### Fix 5: (Future / Engine-side — DO NOT TOUCH)
Audit `applyAction()` for potential throws in the winning-move path, especially around deck-empty + win detection. **Flagged for other terminal** — engine file is locked.

---

## Engine-Side Flag (DO NOT FIX HERE)

The `applyAction()` function in `src/engine/GameEngine.ts` needs auditing for uncaught throws in:
- Win condition detection when player has exactly 3 sets
- Deck-empty handling during draw phase
- Any `find()` that could return undefined and then be dereferenced

This is the upstream cause of Hypothesis 5, but the server-side try/catch is the correct defensive fix.
