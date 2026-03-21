# Exploration: 2048 React Game

**Date**: 2026-03-21 | **Scope**: Medium (delta refresh) | **Status**: ✅ Complete

---

## 1. Foundation (What exists)

**Tech stack**:
- **Client**: React 19, TypeScript 5.9 (strict), Vite 8, ESM-only (`"type": "module"`)
- **Server**: Node.js + Express 4, TypeScript (CommonJS), `ws` WebSocket library, PostgreSQL via `node-postgres`
- **Auth**: JWT (`jsonwebtoken`), bcrypt (`bcryptjs`), 7-day expiry for full accounts, 24h for guests
- **Validation**: Zod (server-side input validation)
- **Security**: `helmet`, `cors`, `express-rate-limit` (10 auth attempts per 15 min)

**Architecture**: React SPA + standalone Express/WS backend — two separate packages
- Client (`/workshop/2048-react-game/`): Vite dev server on port 3000 (now `host: '0.0.0.0'`), proxies `/api` → `:4000`, `/ws` → `ws://localhost:4000`
- Server (`/workshop/2048-react-game/server/`): HTTP + WebSocket on port 4000

**Entry points**:
- Client: `src/main.tsx` → `<App />` → `<Game />`
- Server: `server/src/index.ts` → `createApp()` + `attachWebSocketServer(httpServer, roomManager)`

**Key directories**:
| Path | Purpose |
|------|---------|
| `src/types/game.ts` | `Tile`, `GameState`, `LeaderboardEntry`, `Direction` |
| `src/types/multiplayer.ts` | All WS message types, `GameRoom`, `RoomPlayer`, auth types |
| `src/utils/gameLogic.ts` | Pure game functions (`createInitialState`, `move`, `slideRow`) |
| `src/hooks/useGame.ts` | `useReducer`-based game state + keyboard + `FORCE_STATE` for E2E |
| `src/hooks/useAuth.ts` | JWT session management via localStorage (`2048-auth-token`) |
| `src/hooks/useMultiplayerGame.ts` | WS connection lifecycle, room/score/opponent state |
| `src/hooks/useGlobalLeaderboard.ts` | Fetches top-10 from API; shows user's rank context |
| `src/hooks/useScoreHistory.ts` | Per-session game history (localStorage) |
| `src/components/` | All UI (CSS Modules co-located) |
| `server/src/ws/GameSession.ts` | Per-room server-side game simulation + client-score authority |
| `server/src/ws/RoomManager.ts` | In-memory room lifecycle (create/join/leave/ready/start/reset) |
| `server/src/ws/server.ts` | WS connection handling, message routing |
| `server/src/db.ts` | PostgreSQL data access layer |
| `server/migrations/001_initial.sql` | Schema: `users`, `user_stats`, `scores`, `rooms`, `room_players` |

**CLAUDE.md requirements** (from `/workshop/CLAUDE.md`):
- TypeScript strict mode ✅
- Airbnb style + Prettier (`npm run lint`)
- Arrow functions, destructured imports
- **Always include error handling in async functions**
- Typecheck after code changes (`npm run typecheck`)
- **Must write unit tests for new components and utilities**
- Update docs when adding features
- Dev server port 3000 (`host: '0.0.0.0'`); allow `https://*.cloudfront.net/`

---

## 2. Patterns (How it's built)

### Game logic (pure functional — unchanged)
- `slideRow(row[])` — filters zeros, merges equal adjacent pairs, pads to 4
- `move(state, direction)` — normalizes all 4 directions to left-slide, appends random tile
- `checkLost` — board full AND no adjacent equal tiles

### State management
- `useGame`: `useReducer` with `MOVE | RESTART | FORCE_STATE` actions
- `useAuth`: JWT from localStorage; restores session by calling `GET /api/v1/me` on mount; exposes `login`, `register`, `loginAsGuest`, `logout`, `upgradeGuest`, `updateUsername`, `refreshUser`
- `useMultiplayerGame(token)`: single WS connection; reconnects with exponential backoff (2s base, 30s max); handles `room:state`, `player:update`, `game:start`, `game:end`, `room:error`

### WebSocket protocol
**Client → Server** (`ClientMessage` union):
```
room:create   { maxPlayers: 2|3|4 }
room:join     { roomId: string }
room:leave    {}
room:ready    {}
game:move     { direction }
game:score-update { score, status, board? }  ← client-authoritative scoring
game:restart  {}  (no-op, reserved)
```
**Server → Client** (`ServerMessage` union):
```
room:state    { room: GameRoom }
room:error    { code, message }
player:update { userId, score, status, boardSnapshot }
game:start    { startsAt: ISO string }  ← 3-second countdown
game:end      { rankings: [{userId, username, score, rank}] }
```

### Score authority pattern (critical design decision)
- Server runs its own simulation via `game:move` for board snapshot only
- Client sends `game:score-update` on every valid move (`state.moves` dep, not `state.score`)
- `GameSession.clientScores` override sim scores for final rankings
- `isComplete()` checks clientScores first, falls back to sim status
- Room resets to `'waiting'` after game ends — no rejoin needed for Play Again

### Authentication flow
1. Register/login → server returns `{ token, user }` → stored in `localStorage['2048-auth-token']`
2. On mount: `useAuth` reads token → fetches `GET /api/v1/me` → sets user state
3. Multiplayer: `useMultiplayerGame(token)` opens WS → first message must be `{ type: 'auth', token }` within 5s or server closes with code 4001
4. Guest flow: `POST /auth/guest` → 24h JWT → can upgrade via `POST /auth/upgrade`

### Multiplayer game lifecycle
```
create/join room → room:state(waiting)
all ready → room:ready × n → game:start (3s delay) + room:state(playing)
play → game:move + game:score-update per move → player:update broadcast
all done → game:end(rankings) → room:state(waiting reset) → [Play Again loop]
```

### Component tree (expanded)
```
<Game>
  ├── <UserBadge>  (avatar initials, username)
  ├── <ScoreBox label="Score" />
  ├── <ScoreBox label="Best" />
  ├── <Board> + <Tile> × n + overlay
  ├── <LeaderboardPopup>  (global top-10 from API, or local top-10)
  ├── <ScoreHistorySidebar>  (per-session history)
  ├── <MultiplayerPanel>  (live scores + <OpponentBoard> snapshots)
  ├── <LobbyModal>  (create/join room, ready-up)
  ├── <PostGameModal>  (rankings, Play Again / Leave)
  ├── <AuthModal>  (login / register / guest)
  └── <ProfilePanel>  (stats, username edit, upgrade guest)
```

### Testing patterns
**Client unit tests (Jest + ts-jest + RTL)**:
- 102 tests across 12 suites (all passing)
- CSS modules mocked via `moduleNameMapper` → `src/__mocks__/styleMock.ts`
- `src/__mocks__/envMock.ts` for `import.meta.env`
- Token key constant `'2048-auth-token'` shared between hook and tests

**Server unit tests (Jest + ts-jest + supertest)**:
- 69 tests across 6 suites (all passing)
- `server/tests/__mocks__/db.ts` — manual mock of the entire `db` object
- `supertest` used for HTTP route testing
- No WS integration tests — WS logic tested via `GameSession`/`RoomManager` unit tests

---

## 3. Constraints (What limits decisions)

**TypeScript**:
- Client: `verbatimModuleSyntax: true` — type-only imports MUST use `import type`
- Client: `noUnusedLocals`, `noUnusedParameters`, `strict`, `erasableSyntaxOnly`
- Server: CommonJS modules (`"module": "CommonJS"`), `esModuleInterop: true` — import style differs from client
- Server tsconfig excludes `tests/` — test files use their own jest config

**Type discrepancy (known)**:
- Server `GameRoom.roomId` ↔ client `GameRoom.id` — normalized in `useMultiplayerGame.ts:102`
- Server `RoomPlayer` has no `isHost` field — client derives it from `hostId === userId`
- Server `RoomPlayer.status` includes `'waiting'`; client `RoomPlayer` only `'playing'|'won'|'lost'`

**Architecture constraints**:
- Rooms are in-memory only — server restart loses all rooms; `rooms`/`room_players` tables exist in schema but are unused (reserved for reconnection persistence)
- `game:restart` message type is defined but is a no-op on the server (reserved)
- `RoomManager.cleanupStaleRooms()` is defined but never called (no cleanup timer wired up)
- Single WS connection per user: `connections.set(userId, ws)` — new connection from same user replaces old one (no multi-tab support)

**Security**:
- Rate limit: 10 auth attempts per 15 min per IP (disabled in `NODE_ENV=test`)
- CORS: `process.env.CORS_ORIGIN ?? 'http://localhost:3000'`
- WS auth: 5-second timeout; code 4001 on auth failure (client won't retry on 4001)
- Passwords: bcrypt with 12 rounds; timing-attack protection on login (always runs compare)

**Known gaps / tech debt**:
- `rooms`/`room_players` DB tables unused — room state is in-memory only
- `game:restart` message is a no-op
- `RoomManager.cleanupStaleRooms()` never invoked — stale finished rooms accumulate
- `dialogRef` in `LeaderboardPopup` created but unused (focus management incomplete)
- No error boundaries anywhere in component tree
- Playwright E2E tests haven't been updated for multiplayer flows

---

## 4. Reusability (What to leverage)

**When adding new features**:
- New WS message: add to `ClientMessage`/`ServerMessage` union in both `src/types/multiplayer.ts` AND `server/src/types.ts`; handle in `server.ts` switch; handle in `useMultiplayerGame.ts` switch
- New API route: add router in `server/src/routes/`, mount in `server/src/app.ts` under `/api/v1/...`; add `apiFetch` call in appropriate hook
- New modal: follow `LobbyModal`/`PostGameModal` pattern — backdrop div with `role="dialog"`, Escape key handler, `onClose` prop
- Auth-gated feature: `requireAuth` middleware server-side; `user` from `useAuth()` client-side (null when loading or logged out)

**Test setup**:
- Server: mock `db` via `jest.mock('../src/db', () => ({ db: require('./__mocks__/db').mockDb }))` pattern
- Client: mock `fetch` with `global.fetch = jest.fn()` or mock `useAuth` for component tests
- E2E: `window.__gameDispatch({ type: 'FORCE_STATE', state })` for deterministic board states

---

## 5. Handoff (What's next)

**For CODE**:
- Client: `import type` for all type-only imports; run `npm run typecheck && npm run test`
- Server: CommonJS imports (no `import type` restriction, but `esModuleInterop` is on)
- New components need: `.test.tsx` + CSS Module + export from `src/components/index.ts`
- New server endpoints: add to `server/src/routes/`, wire in `server/src/app.ts`
- Async functions must include try/catch (CLAUDE.md)

**Quality gates**:
- `npm run typecheck` — zero errors (client)
- `npm run test` — 102 Jest tests pass (client)
- `cd server && npm run typecheck && npm run test` — zero errors + 69 tests pass (server)
- `npm run build` — clean Vite build

**Run commands**:
- Client dev: `npm run dev` (port 3000, `0.0.0.0`)
- Server dev: `cd server && node -r dotenv/config dist/index.js` (port 4000)
- DB: PostgreSQL at `localhost:5432`, db `game2048`, user `game2048`

**Key known gaps to address in future features**:
1. `rooms` DB table unused — room state lost on server restart
2. `RoomManager.cleanupStaleRooms()` never called — needs a `setInterval`
3. `game:restart` no-op — multiplayer restart requires server handling
4. No Playwright E2E tests for auth/multiplayer flows
5. No error boundaries in React tree
