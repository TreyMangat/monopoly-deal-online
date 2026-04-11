# Investigation: Recurring Mid-Game Disconnects on Render Free Tier

**Date**: 2026-04-10
**Problem**: Players experience silent WebSocket disconnects mid-game on Render free tier. Reconnect often fails, showing "Connection lost" or "No room found."

---

## Current Reconnect Flow Diagnosis

### 1. How does the client detect a dropped connection?

**Two mechanisms:**
- **WebSocket `onclose` handler** (index.html:1760): Fires when TCP connection closes. Calls `scheduleReconnect()`.
- **Application-level heartbeat** (index.html:1807-1821): Every 10s, checks if no message received in 20s. If stale, sends a JSON `{ type: "pong" }` message and waits 5s for any response. If no response, calls `forceReconnect()`.

**Gap**: The app-level heartbeat sends `type: "pong"` which the server treats as a no-op (ClientMessageType.Pong case in index.ts:531). The server doesn't echo anything back, so the only way the client gets a response is if the server happens to send a game state update or timer update within the 5s window. This is unreliable.

### 2. How does the client attempt to reconnect?

**Exponential backoff** (index.html:1764-1781): 2s, 4s, 8s delays. **Gives up after only 3 attempts** and shows "Connection lost. Tap to retry" requiring manual intervention.

**Gap**: 3 attempts = ~14s total wait time. Render cold starts take ~30s. If the server restarted, the client gives up before the server is ready. Manual tap required.

### 3. How does the server identify a returning player?

**Session token + player ID + room code** (index.ts:419-449, RoomManager.ts:94-115):
1. Client sends `{ type: "reconnect", payload: { roomCode, playerId, sessionToken } }`
2. RoomManager looks up room by code
3. Calls `room.getPlayerBySessionToken(sessionToken)` to find the player
4. Validates `player.id === playerId`
5. Calls `room.reconnectPlayer(playerId, ws)` to swap in new socket

**Working correctly** — the logic is sound. The issue is upstream (client gives up too early, or room was already deleted).

### 4. What errors does the server return on reconnect failure?

| Error Code | Trigger | Server Location |
|-----------|---------|-----------------|
| `RECONNECT_FAILED` / "Room not found" | Room doesn't exist (server restarted, or cleanup deleted it) | RoomManager.ts:101 |
| `RECONNECT_FAILED` / "Invalid session" | Session token doesn't match any player, or player ID mismatch | RoomManager.ts:104-105 |
| `RECONNECT_FAILED` / "Reconnection failed" | `reconnectPlayer()` returned false (player not in room) | RoomManager.ts:109-110 |
| `MISSING_FIELDS` | Client didn't send all 3 required fields | index.ts:425-430 |

**Gap**: All failures return the generic code `RECONNECT_FAILED`. The client doesn't distinguish between "room expired" (unrecoverable) and "try again" (transient). It should stop retrying on unrecoverable errors.

### 5. Does the server send WebSocket-level pings?

**Yes** (index.ts:185-195): `ws.ping()` every `PING_INTERVAL_MS` (15 seconds). Tracks `isAlive` flag via `ws.on('pong')`. If `isAlive === false` on next interval (missed 1 pong = 15s), terminates the socket.

**Gap**: 15s single-miss is too aggressive. A brief network hiccup (mobile switch, Render CPU spike, WiFi dropout) lasting >15s kills the connection. Standard practice: 2 missed pongs before termination.

### 6. Is there an application-level heartbeat?

**Client-side only** (index.html:1807-1821): Sends `{ type: "pong" }` every 10s if no messages received in 20s. This is a unidirectional "am I alive?" check — the server doesn't respond to it specifically.

**No server-initiated app-level heartbeat.** The server relies entirely on WebSocket-level ping/pong, which is invisible to JavaScript in the browser (browsers handle pong automatically at the protocol level).

### 7. What's the current grace period?

**120 seconds** (`RECONNECT_GRACE_MS` in constants.ts:59). Tracked per-player via `disconnectTimers` Map in GameRoom. On expiry, player is replaced by a medium bot.

**Gap**: During the grace period, the turn timer is NOT paused. If it's the disconnected player's turn, a separate grace timer fires (GameRoom.ts:247-252), but the regular turn timer may also be running. The grace timer replaces with a bot — the turn timer may have already auto-ended their turn. These two timers can race.

---

## Root Causes of Reconnect Failure

### 1. Render Free Tier Silently Kills WebSockets
Render's free tier infrastructure terminates idle WebSocket connections after ~5-15 minutes despite docs claiming no fixed timeout. The `ws` library ping/pong at the protocol level may not traverse Render's reverse proxy (they use HTTP-level load balancers that may not forward WebSocket frames). The connection dies silently — no close frame, no error. The client's TCP socket eventually times out (browser-dependent, 30-120s).

**Fix**: Server heartbeat at 25s (under the likely 30s intermediate timeout).

### 2. Client Gives Up After 3 Attempts (~14s)
Cold starts take ~30s. Client exhausted all retries before the server woke up.

**Fix**: Exponential backoff up to 5 minutes with more attempts.

### 3. Single Missed Pong = Termination
15s ping interval with 1-miss termination is too aggressive for mobile/cellular connections.

**Fix**: 25s interval, 2-miss termination (50s tolerance).

### 4. No Session Persistence
Session info (roomCode, playerId, sessionToken) stored only in JS variables. Page reload, browser crash, or PWA eviction loses them. Reconnect impossible.

**Fix**: Persist to sessionStorage. Restore on page load.

### 5. No Online/Offline Awareness
Client doesn't pause reconnect attempts when device is offline (airplane mode, subway). Wastes retry budget on guaranteed failures.

**Fix**: Listen for `online`/`offline` events.

---

## Render-Specific Notes

- **Free tier confirmed** to kill idle WebSockets despite docs claiming "no fixed timeout." Community reports consistent 5-15 min idle kills.
- **25s server heartbeat** is the workaround — keeps the connection alive through Render's load balancer.
- **Cold starts** after 15min idle take ~30s. REJOIN must handle this via client retry backoff.
- **Recommendation**: If disconnects persist after these fixes, upgrade to Render Starter ($7/mo) — eliminates cold starts and has more stable WebSocket infrastructure.
- **Alternatives to free tier**: Fly.io free tier or a $5 DigitalOcean droplet — neither has the same WebSocket idle kill behavior.

---

## Permanent Fix (Hosting Decision for Trey)

The Render free tier WebSocket disconnects are an **infrastructure issue**, not an application issue. No amount of pinging, heartbeating, or reconnect logic fully prevents them. Multiple Render community reports (2024-2025) confirm this. Our defense-in-depth strategy (Sprint 11 + Sprint 12) makes disconnects invisible in most cases by reconnecting in <2 seconds, but the underlying cause persists.

### Options to eliminate disconnects entirely:

| Option | Cost | Pros | Cons |
|--------|------|------|------|
| **Render Starter** | $7/mo | Same deploy workflow, no code changes, no cold starts, stable WS | Monthly cost |
| **Fly.io free tier** | $0 | Free, no WS idle kills, global edge | Different deploy config, smaller free tier limits |
| **Railway** | ~$5/mo | Easy deploy, stable WS, good DX | Monthly cost |
| **DigitalOcean Droplet** | $4/mo | Full control, stable, no proxy issues | Must manage server yourself |
| **Self-hosted (home)** | $0 | Free, full control | Requires port forwarding, static IP, uptime risk |

### Recommendation
For a family/friends game, **Fly.io free tier** is the best zero-cost option. For reliability without hassle, **Render Starter at $7/mo** is the simplest upgrade — zero code changes, just change the plan in the dashboard.
