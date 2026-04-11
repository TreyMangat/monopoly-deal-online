# Codebase Sweep Notes

**Date**: 2026-04-11
**Sprint**: 12 (Critical Fixes)

## Sweep Results

### TODO / FIXME / XXX / HACK markers
**None found** in src/ TypeScript files.

### `as any` escape hatches in src/
All found in test files only (acceptable — mock objects need type flexibility):

| File | Line | Context |
|------|------|---------|
| server-hardening.test.ts | 194, 326 | `type: "action_debt_collector" as any` — injecting test card with string type |
| server-hardening.test.ts | 455 | `type: "INVALID_ACTION_TYPE" as any` — intentional invalid type for error handling test |
| server-hardening.test.ts | 471, 473, 497 | `(ws1 as any).send` — accessing mock WebSocket internals |

**No `as any` in production code.**

### Untagged console.log / console.error
**None found.** All log statements use `[SERVER]`, `[ROOM:code]`, `[WS]`, `[Bot]`, or `[Static]` prefixes.

### Server error response codes
All error responses verified to use established codes:
- `ROOM_NOT_FOUND`, `ROOM_EXPIRED` — room lookup failures
- `INVALID_SESSION`, `PLAYER_NOT_IN_ROOM` — reconnect failures
- `RECONNECT_FAILED` — generic reconnect failure
- `ENGINE_ERROR` — applyAction throw
- `RATE_LIMITED`, `PARSE_ERROR`, `UNKNOWN_MESSAGE` — protocol errors
- `NOT_IN_ROOM`, `NOT_HOST`, `START_FAILED`, etc. — game action errors

### Deferred items (NOT fixed in this sprint)
1. **Bot `as any` in test mocks** — acceptable, not worth typed mock infrastructure
2. **`chargedThisTurn` optional field** — `chargedThisTurn?: Record<string, string[]>` should arguably be required on GameState, initialized to `{}` in `initializeGame`. Currently it's set in `advanceTurn` only. Not a bug, but slightly messy.
3. **iOS client** not updated for `stateVersion`, `heartbeat`, or `resync` message types — will need Swift-side updates when iOS is next worked on
