# Multiplayer Design — Task #1: User Profile Data Model & Auth

## 1. Auth Strategy Decision: JWT

**Chosen: JWT (HS256), 7-day expiry, stateless**

Reasons:
- WebSocket connections authenticate at handshake time using the token in the query string or first message — no server-side session store needed
- Stateless: scales horizontally without sticky sessions
- Guest tokens use the same flow with `isGuest: true` in the payload and 24-hour expiry

**Rejected: session-based cookies**
- Requires session store (Redis/Postgres) shared across nodes
- SameSite cookie flags complicate WebSocket auth on cross-origin setups

### JWT config
```
Algorithm : HS256
Secret    : process.env.JWT_SECRET (min 32 chars, required at startup)
Expiry    : 7 days (full accounts) / 24 hours (guests)
Payload   : { sub: userId, username, isGuest?, iat, exp }
```

---

## 2. Database Schema (PostgreSQL)

```sql
-- Accounts
CREATE TABLE users (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  username      VARCHAR(20) UNIQUE NOT NULL,
  password_hash TEXT        NOT NULL,        -- bcrypt, cost factor 12
  avatar_url    TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  is_guest      BOOLEAN     NOT NULL DEFAULT FALSE
);

CREATE INDEX idx_users_username ON users (username);

-- Stats (separate table — updated atomically on game end)
CREATE TABLE user_stats (
  user_id      UUID    PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  total_games  INT     NOT NULL DEFAULT 0,
  wins         INT     NOT NULL DEFAULT 0,
  best_score   INT     NOT NULL DEFAULT 0,
  total_score  BIGINT  NOT NULL DEFAULT 0,
  total_moves  BIGINT  NOT NULL DEFAULT 0,
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Global scores (feeds Task #4 leaderboard)
CREATE TABLE scores (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  score       INT         NOT NULL,
  achieved_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_scores_score    ON scores (score DESC);
CREATE INDEX idx_scores_user_id  ON scores (user_id);

-- Rooms (in-memory is fine for MVP; persist for reconnection support)
CREATE TABLE rooms (
  id          CHAR(6)     PRIMARY KEY,   -- e.g. 'XK7P2Q'
  host_id     UUID        NOT NULL REFERENCES users(id),
  status      VARCHAR(10) NOT NULL DEFAULT 'waiting', -- waiting | playing | finished
  max_players SMALLINT    NOT NULL DEFAULT 2,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  finished_at TIMESTAMPTZ
);

CREATE TABLE room_players (
  room_id   CHAR(6) NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  user_id   UUID    NOT NULL REFERENCES users(id),
  is_host   BOOLEAN NOT NULL DEFAULT FALSE,
  is_ready  BOOLEAN NOT NULL DEFAULT FALSE,
  joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (room_id, user_id)
);
```

### Stat update on game end (atomic)
```sql
INSERT INTO user_stats (user_id, total_games, wins, best_score, total_score, total_moves)
VALUES ($userId, 1, $won::int, $score, $score, $moves)
ON CONFLICT (user_id) DO UPDATE SET
  total_games = user_stats.total_games + 1,
  wins        = user_stats.wins        + EXCLUDED.wins,
  best_score  = GREATEST(user_stats.best_score, EXCLUDED.best_score),
  total_score = user_stats.total_score + EXCLUDED.total_score,
  total_moves = user_stats.total_moves + EXCLUDED.total_moves,
  updated_at  = NOW();
```

---

## 3. REST API Contract

Base URL: `/api/v1`

| Method | Path              | Auth     | Description                              |
|--------|-------------------|----------|------------------------------------------|
| POST   | /auth/register    | None     | Create a full account                    |
| POST   | /auth/login       | None     | Exchange credentials for JWT             |
| POST   | /auth/guest       | None     | Create an ephemeral guest session        |
| POST   | /auth/upgrade     | Guest JWT| Convert guest account to full account    |
| GET    | /me               | JWT      | Get authenticated user's profile + stats |
| PATCH  | /me               | JWT      | Update username or avatarUrl             |

### POST /auth/register
```
Request:  { username: string, password: string }
Response: 201 { token, user: UserProfile }
Errors:
  409 { code: "USERNAME_TAKEN" }
  422 { code: "VALIDATION_ERROR", message: "..." }
        username: 3–20 chars, alphanumeric + underscores
        password: min 8 chars
```

### POST /auth/login
```
Request:  { username: string, password: string }
Response: 200 { token, user: UserProfile }
Errors:
  401 { code: "INVALID_CREDENTIALS" }
```

### POST /auth/guest
```
Request:  {} (empty)
Response: 201 { token, user: GuestProfile }
Note: Guest id prefixed 'guest-', username 'Guest-{4-digit}'
      Token expires in 24 hours
```

### POST /auth/upgrade (guest → full account)
```
Request:  { username: string, password: string }  (Bearer: guest JWT)
Response: 200 { token, user: UserProfile }
          Guest stats are migrated to the new account
Errors:
  401 { code: "NOT_A_GUEST" }  (if called with a full account token)
  409 { code: "USERNAME_TAKEN" }
```

### GET /me
```
Response: 200 UserProfile (with stats embedded)
Errors:
  401 { code: "UNAUTHORIZED" }
```

### PATCH /me
```
Request:  { username?: string, avatarUrl?: string }
Response: 200 UserProfile
Errors:
  409 { code: "USERNAME_TAKEN" }
  422 { code: "VALIDATION_ERROR" }
```

---

## 4. Guest Mode Design

Flow:
1. First visit → auto-create guest session (POST /auth/guest), store token in localStorage
2. Guest can play fully — scores recorded under guest account
3. After a game, show soft prompt: "Save your scores permanently — create an account"
4. POST /auth/upgrade migrates all stats and scores to the new account
5. Guest token replaced with full-account token in localStorage

Guest limitations:
- Cannot appear on global leaderboard (optional: show with "Guest" label)
- No avatar customisation
- Token expires in 24h; if expired, create a new guest (stats lost — this is the upgrade incentive)

---

## 5. TypeScript Interfaces

All interfaces are defined in `src/types/multiplayer.ts`. Key types:

- `UserProfile` — full account with embedded `UserStats`
- `GuestProfile` — ephemeral, `isGuest: true` discriminant
- `CurrentUser = UserProfile | GuestProfile` — union used throughout UI
- `isGuest(user)` — type-guard helper
- `AuthTokenPayload` — decoded JWT shape
- `GameRoom` / `RoomPlayer` — multiplayer room state
- `ClientMessage` / `ServerMessage` — WebSocket protocol discriminated unions

---

## 6. Security Considerations

| Concern | Mitigation |
|---------|-----------|
| Password storage | bcrypt, cost factor 12 |
| JWT secret | 32+ char random secret, env var only, never committed |
| Brute force | Rate limit /auth/login: 10 req/15min per IP (express-rate-limit) |
| Username enumeration | Return 401 (not 404) on login failure |
| Score tampering | Scores recorded server-side from validated game events, never from client POST |
| WebSocket auth | Token validated at handshake; unauthenticated connections rejected immediately |
| Guest token expiry | 24h short-lived to limit resource abuse |
