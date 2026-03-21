# Architecture

## Overview

```
Browser
  └── React SPA (Vite, port 3000)
        ├── /api/*  ──proxy──>  Express REST API (port 4000)
        └── /ws     ──proxy──>  WebSocket Server  (port 4000)
                                      |
                                 PostgreSQL (users, scores, stats)
```

The client is a single-page app. All state lives in React hooks; there is no external state library. The server is a Node.js process running Express (HTTP) and `ws` (WebSocket) on the same port.

---

## Frontend

### Components

#### `App`
Root component. Renders a single `<Game />`.

---

#### `Game`
Top-level game container. Composes all hooks and passes data down to presentational components. Owns all modal open/close state.

**Hooks used:** `useGame`, `useAuth`, `useLeaderboard`, `useScoreHistory`, `useGameStats`, `useGlobalLeaderboard`, `useMultiplayerGame`, `useMatchHistory`, `useMultiplayerScoreSync`, `useTouchControls`

---

#### `Board`
Renders the 4×4 game grid. Displays all tiles via `<Tile>` components plus empty cell backgrounds. Shows a win/lose overlay when the game ends.

**Props:** `{ state: GameState }`

---

#### `Tile`
Single animated tile. Position is computed from `row`/`col` using `CELL_SIZE = 100px, GAP = 12px`. CSS classes encode the tile value for colour theming.

**Props:** `{ tile: Tile }`

---

#### `ScoreBox`
Score display with an optional "Best!" badge.

**Props:** `{ label: string; value: number; isNewRecord?: boolean }`

---

#### `ScoreHistorySidebar`
Local game history panel (single-player only). Shows win/loss summary, win rate, average score, and a list of the last 20 games with metadata (moves, best tile, duration).

**Props:** `{ history: ScoreHistoryEntry[] }`

---

#### `AuthModal`
Tabbed login/register dialog. Handles loading and error states. Closes on Escape; focuses first input on open.

**Props:** `{ isOpen, onClose, onLogin, onRegister, onLoginAsGuest }`

---

#### `UserBadge`
Top-right user status indicator. Shows "Guest + Sign up" for unauthenticated users, or an initials avatar + username for authenticated users.

**Props:** `{ user: CurrentUser | null; isLoading: boolean; onSignInClick: () => void; onProfileClick: () => void }`

---

#### `ProfilePanel`
Slide-in profile drawer. Displays user stats, supports inline username editing, and offers guest-upgrade flow. Closes on backdrop click or Escape.

**Props:** `{ user, onClose, onLogout, onUpgrade, onUpdateUsername, onOpen }`

---

#### `LeaderboardPopup`
Global/local leaderboard modal. When a token is present it fetches the live global leaderboard and highlights the current user's rank. Falls back to localStorage scores when unauthenticated.

**Props:** `{ isOpen, entries, onClose, token, currentUserId }`

---

#### `LobbyModal`
Multiplayer lobby with two views:
1. **Entry** — create a room (choose player count) or join by code
2. **Waiting room** — shows room code, player list with ready indicators, and a "Ready" button

Auto-closes when the room transitions to `playing`.

**Props:** `{ isOpen, onClose, onRoomReady, sendMessage, leaveRoom, room, connected, currentUserId, error }`

---

#### `MultiplayerPanel`
Side panel shown during a multiplayer game. Displays compact opponent boards with live scores. Switches to a final-rankings view when `rankings` is provided.

**Props:** `{ opponents: OpponentState[]; myScore: number; rankings: RankingEntry[] | null; onLeave: () => void }`

---

#### `OpponentBoard`
Compact 4×4 grid showing a snapshot of an opponent's board. Overlays "Won!" or "Lost" on completion. Highlighted with a border when the opponent is leading.

**Props:** `{ opponent: OpponentState; isWinning: boolean }`

---

#### `PostGameModal`
End-of-game dialog. Shows final rankings with medals, a match history accordion, and a "Play Again" button that tracks how many players are ready.

**Props:** `{ isOpen, rankings, history, room, currentUserId, onPlayAgain, onLeave }`

---

#### `RoomCodeDisplay`
Displays a 6-character room code with a copy-to-clipboard button. Shows "Copied!" confirmation for 2 seconds.

**Props:** `{ code: string }`

---

### Custom Hooks

#### `useGame(onMove?)`
Core game state machine using `useReducer`. Handles keyboard input (arrow keys + WASD), ignores events when an input element is focused. Exposes `__gameDispatch` on `window` in dev mode for testing.

**Returns:** `{ state: GameState; handleMove(direction): void; restart(): void }`

---

#### `useAuth()`
JWT authentication with localStorage persistence (`2048-auth-token`). Restores the session on mount by calling `GET /api/v1/me`. Clears the token on 401 responses. Exposes the current token as React state (not a ref) so downstream hooks react to auth changes.

**Returns:** `{ user, token, isLoading, login, register, loginAsGuest, logout, upgradeGuest, updateUsername, refreshUser }`

---

#### `useLeaderboard()`
Local top-10 leaderboard in localStorage (`2048-leaderboard`). Scores are kept sorted descending.

**Returns:** `{ entries: LeaderboardEntry[]; addEntry(score): void }`

---

#### `useScoreHistory()`
Per-game history in localStorage (`2048-score-history`), capped at 20 entries. Records score, outcome, moves, best tile, and duration.

**Returns:** `{ history: ScoreHistoryEntry[]; addHistoryEntry(score, status, stats?): void }`

---

#### `useGameStats(state, token, refreshUser, addEntry, addHistoryEntry)`
Fires once when the game transitions from `playing` → `won|lost`. Calls `addEntry` and `addHistoryEntry` for local tracking, then `POST /api/v1/stats/game-end` if the user is authenticated and score > 0. Uses a `stateRef` to read the latest state without re-running the effect on every render.

**Returns:** `{ isNewRecord: boolean }` — true when `score > sessionStartBest`

---

#### `useGlobalLeaderboard(token)`
Fetches the global leaderboard (`GET /leaderboard`) and the user's rank context (`GET /leaderboard/me`). Exposes a manual refresh function.

**Returns:** `{ entries, myRank, isLoading, error, refresh }`

---

#### `useMultiplayerGame(token)`
WebSocket connection lifecycle: connects to `/ws`, authenticates, auto-reconnects with exponential backoff (2 s → 30 s). Decodes the user's ID from the JWT payload client-side. Manages room state and opponent snapshots from incoming server messages.

**Returns:** `{ connected, error, room, sendMessage, leaveRoom, myScore, myStatus, opponents, rankings }`

---

#### `useMatchHistory(rankings, room)`
Accumulates `MatchHistoryEntry` objects whenever `rankings` changes (i.e., at game end). Auto-opens the PostGameModal when rankings arrive. Auto-closes when the room transitions from `waiting` → `playing` (new game starting).

**Returns:** `{ matchHistory, postGameOpen, setPostGameOpen }`

---

#### `useMultiplayerScoreSync(state, sendMessage, room)`
Sends a `game:score-update` WebSocket message on every move. Uses a `roomStatusRef` to guard against sending updates before the game starts. Always broadcasts terminal `won`/`lost` status regardless of room state.

**Returns:** `void`

---

#### `useTouchControls(handleMove)`
Registers `touchstart`/`touchend` listeners on `window`. Computes swipe direction from `(dx, dy)` when the distance exceeds 20 px. Cleans up listeners on unmount.

**Returns:** `void`

---

### Utilities

#### `src/utils/gameLogic.ts`
Pure 2048 game logic with no side effects except localStorage for best score.

- `createInitialState(size?)` — Creates a new 4×4 board with 2 random starting tiles
- `move(state, direction)` — Slides and merges tiles; spawns a new tile (90% `2`, 10% `4`); detects win (`2048`) and loss (no moves available); updates best score in `localStorage('2048-best')`

---

#### `src/utils/formatters.ts`

- `getInitials(username)` — Returns first 2 characters uppercased; returns `'?'` for empty input

---

#### `src/utils/env.ts`

- `API_BASE` — `VITE_API_URL` env var, defaults to `''` (uses Vite proxy in dev)
- `IS_DEV` — `import.meta.env.DEV`; exported so it can be mocked in Jest tests

---

### Types

#### `src/types/game.ts`

| Type | Description |
|------|-------------|
| `Direction` | `'up' \| 'down' \| 'left' \| 'right'` |
| `Tile` | `{ id, value, row, col, merged, isNew }` |
| `GameState` | `{ tiles, score, bestScore, status, size, moves, startTime }` |
| `LeaderboardEntry` | `{ score, date }` — local leaderboard entry |
| `ScoreHistoryEntry` | `{ score, status, date, moves?, bestTile?, duration? }` |
| `MatchHistoryEntry` | `{ rankings, playedAt }` — post-game summary |

#### `src/types/multiplayer.ts`

| Type | Description |
|------|-------------|
| `UserProfile` | Full account with embedded `UserStats` |
| `GuestProfile` | `{ id: 'guest-*', username: 'Guest-*', isGuest: true }` |
| `CurrentUser` | `UserProfile \| GuestProfile` |
| `GameRoom` | Room state: `{ id, hostId, players, status, maxPlayers, createdAt }` |
| `RoomPlayer` | `{ userId, username, avatarUrl?, isHost, isReady }` |
| `LeaderboardRow` | `{ rank, userId, username, avatarUrl?, score, date }` |
| `ClientMessage` | Discriminated union of all client→server WS messages |
| `ServerMessage` | Discriminated union of all server→client WS messages |

---

## Backend

### Entry Point — `server/src/index.ts`

Creates the HTTP server via `createApp()`, attaches the WebSocket server with a shared `RoomManager`, starts on `PORT` (default `4000`), and registers a non-blocking 1-hour cleanup interval for stale rooms (`setInterval(...).unref()`).

---

### Express App — `server/src/app.ts`

Middleware stack (in order):
1. `helmet()` — security headers
2. `cors({ origin: CORS_ORIGIN })` — defaults to `http://localhost:3000`
3. `express.json()` — body parser
4. Rate limiter on `/api/v1/auth` — 10 requests / 15 min per IP (disabled in `NODE_ENV=test`)

Route mounts:
- `/api/v1/auth` — auth router
- `/api/v1/me` — user profile router
- `/api/v1/stats` — stats router
- `/api/v1/leaderboard` — leaderboard router
- `/health` — liveness probe

---

### Database — `server/src/db.ts`

Thin wrapper over `pg` (node-postgres). All queries use parameterised statements.

| Method | Description |
|--------|-------------|
| `findByUsername(username)` | Look up user by username |
| `findById(id)` | Look up user by UUID |
| `isUsernameTaken(username)` | Username availability check |
| `createUser(username, hash, isGuest?)` | Insert new user |
| `updateUser(id, fields)` | Update username / avatarUrl |
| `upgradeGuest(id, username, hash)` | Convert guest to full account |
| `upsertStats(userId, { won, score, moves })` | Atomic stats update + scores insert |
| `getTopScores(limit)` | Top-N leaderboard entries |
| `getUserRank(userId)` | User's rank + ±5 surrounding entries |

**Schema summary:**

```
users        — id (UUID PK), username (unique), password_hash, avatar_url, created_at, is_guest
user_stats   — user_id (FK), total_games, wins, best_score, total_score, total_moves, updated_at
scores       — id, user_id (FK), score, achieved_at
```

---

### Authentication — `server/src/jwt.ts` + `middleware/requireAuth.ts`

- **`signToken(payload, expiresIn)`** — Signs HS256 JWT; default expiry 7 days
- **`verifyToken(token)`** — Verifies and decodes; throws on invalid/expired
- **`requireAuth`** — Extracts `Authorization: Bearer` token, calls `verifyToken`, attaches `req.user`
- **`requireFullAccount`** — Rejects guests (`req.user.isGuest`)
- **`requireGuest`** — Rejects full accounts; used by `/auth/upgrade`

---

### Validation — `server/src/validate.ts`

Zod schemas:

| Schema | Fields |
|--------|--------|
| `registerSchema` | `username` (3–20 alphanum+`_`), `password` (min 8) |
| `loginSchema` | `username`, `password` (both min 1) |
| `patchMeSchema` | `username?`, `avatarUrl?` (URL or null) |
| `gameEndSchema` | `won` (bool), `score` (int ≥0), `moves` (int ≥0) |

---

### WebSocket Server — `server/src/ws/server.ts`

Maintains two maps:
- `connections: Map<userId, WebSocket>` — active authenticated connections
- `sessions: Map<roomId, GameSession>` — per-room server-side game simulation

**Connection lifecycle:**
1. Connection opens; a 5-second auth timeout is set
2. First message must be `{ type: "auth", token }` — on success, maps `userId → ws`; on failure, closes `4001`
3. Subsequent messages are routed by `type` (`room:*`, `game:*`)
4. On disconnect, the player is removed from their room; the room is dissolved if empty

After `game:end`, the server calls `db.upsertStats` for each player using the client-reported scores from `GameSession.getClientScore()`.

---

### Room Manager — `server/src/ws/RoomManager.ts`

In-memory room lifecycle. Room IDs are 6-character uppercase alphanumeric codes.

| Method | Description |
|--------|-------------|
| `createRoom(player, maxPlayers)` | Create room; creator becomes host |
| `joinRoom(roomId, player)` | Join if room is `waiting` and not full |
| `leaveRoom(roomId, userId)` | Remove player; transfer host or dissolve if empty |
| `setReady(roomId, userId)` | Mark player ready |
| `startGame(roomId)` | Requires ≥2 players all ready; transitions to `playing` |
| `finishRoom(roomId)` | Transitions to `finished` |
| `resetRoom(roomId)` | Resets `finished` room back to `waiting` for a rematch |
| `cleanupStaleRooms()` | Removes `finished` rooms older than 1 hour |

---

### Game Session — `server/src/ws/GameSession.ts`

Server-side 2048 simulation per room. Used for generating board snapshots that are broadcast as `player:update` messages.

**Ranking authority:** Client-reported scores (via `game:score-update`) are the authoritative source for final rankings, not the server simulation. This is intentional — the server simulation is used only for board snapshots; the client's score is assumed to be correct for gameplay.

| Method | Description |
|--------|-------------|
| `addPlayer(userId)` | Initialise player state |
| `applyMove(userId, direction)` | Apply move; return updated state |
| `setClientScore(userId, score, status)` | Record client-reported score |
| `getClientScore(userId)` | Retrieve stored score/status |
| `setBoard(userId, board)` | Set board snapshot directly (used in tests) |
| `isComplete()` | True when all players have finished |
| `getFinalRankings()` | Sort players by client score; assign ranks |

---

## Data Flow — Single-Player Game End

```
User makes last move
  → useGame reducer: status = 'lost'
  → useGameStats effect fires (status changed from 'playing')
      → addEntry(score)          [localStorage leaderboard]
      → addHistoryEntry(...)     [localStorage history]
      → POST /api/v1/stats/game-end  [if authenticated]
          → db.upsertStats()
          → refreshUser()        [re-fetches /me to update badge stats]
```

## Data Flow — Multiplayer Game End

```
All players reach won/lost state
  → Each client sends game:score-update { status: 'won'|'lost', score, board }
  → Server GameSession.setClientScore() records each player's result
  → When GameSession.isComplete():
      → server broadcasts game:end { rankings }
      → server calls db.upsertStats() for each player
  → Client useMultiplayerGame: sets rankings state
  → useMatchHistory: rankings change → adds MatchHistoryEntry, opens PostGameModal
  → PostGameModal rendered with final standings
```
