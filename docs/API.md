# API Reference

Base URL: `/api/v1`

All authenticated endpoints require an `Authorization: Bearer <token>` header.
Error responses follow the shape `{ code: string; message: string }`.

---

## Authentication

### POST `/auth/register`

Create a full account.

**Request**
```json
{ "username": "alice", "password": "s3cur3pass" }
```

**Validation**
- `username`: 3–20 characters, alphanumeric + underscores
- `password`: minimum 8 characters

**Response `201`**
```json
{
  "token": "<jwt>",
  "user": {
    "id": "uuid",
    "username": "alice",
    "createdAt": "2025-01-01T00:00:00Z",
    "stats": { "totalGames": 0, "wins": 0, "bestScore": 0, "totalScore": 0, "totalMoves": 0 }
  }
}
```

**Errors**
| Status | Code | Condition |
|--------|------|-----------|
| 409 | `USERNAME_TAKEN` | Username already registered |
| 422 | `VALIDATION_ERROR` | Failed validation rules |

---

### POST `/auth/login`

Exchange credentials for a JWT.

**Request**
```json
{ "username": "alice", "password": "s3cur3pass" }
```

**Response `200`** — same shape as `/auth/register`

**Errors**
| Status | Code | Condition |
|--------|------|-----------|
| 401 | `INVALID_CREDENTIALS` | Unknown username or wrong password |

---

### POST `/auth/guest`

Create an ephemeral guest session. No request body required.

**Response `201`**
```json
{
  "token": "<jwt — expires in 24 hours>",
  "user": {
    "id": "guest-<uuid>",
    "username": "Guest-4521",
    "isGuest": true
  }
}
```

---

### POST `/auth/upgrade`

Convert a guest account to a full account. Migrates all stats and scores.

**Auth:** Guest JWT required
**Request**
```json
{ "username": "alice", "password": "s3cur3pass" }
```

**Response `200`** — full `UserProfile` + new 7-day token

**Errors**
| Status | Code | Condition |
|--------|------|-----------|
| 401 | `NOT_A_GUEST` | Called with a full account token |
| 409 | `USERNAME_TAKEN` | Username already registered |
| 422 | `VALIDATION_ERROR` | Failed validation rules |

---

## User Profile

### GET `/me`

Return the authenticated user's profile with embedded stats.

**Auth:** JWT required

**Response `200`**
```json
{
  "id": "uuid",
  "username": "alice",
  "avatarUrl": null,
  "createdAt": "2025-01-01T00:00:00Z",
  "stats": {
    "totalGames": 12,
    "wins": 4,
    "bestScore": 8192,
    "totalScore": 34500,
    "totalMoves": 980
  }
}
```

---

### PATCH `/me`

Update username or avatar URL. All fields are optional.

**Auth:** JWT required
**Request**
```json
{ "username": "alice2", "avatarUrl": "https://..." }
```

**Response `200`** — updated `UserProfile`

**Errors**
| Status | Code | Condition |
|--------|------|-----------|
| 409 | `USERNAME_TAKEN` | New username already registered |
| 422 | `VALIDATION_ERROR` | Invalid URL format |

---

## Stats

### POST `/stats/game-end`

Record the result of a completed game. Atomically updates `user_stats` and appends a `scores` row.

**Auth:** JWT required
**Request**
```json
{ "won": false, "score": 3840, "moves": 214 }
```

**Validation**
- `won`: boolean
- `score`: integer ≥ 0
- `moves`: integer ≥ 0

**Response `200`**
```json
{ "ok": true }
```

---

## Leaderboard

### GET `/leaderboard`

Top global scores. Public — no auth required.

**Query params**

| Param | Default | Max | Description |
|-------|---------|-----|-------------|
| `limit` | `50` | `100` | Number of entries to return |

**Response `200`**
```json
{
  "entries": [
    { "rank": 1, "userId": "uuid", "username": "alice", "score": 65536, "date": "2025-06-01T10:00:00Z" }
  ],
  "total": 1
}
```

---

### GET `/leaderboard/me`

The authenticated user's rank and surrounding context entries (5 above + 5 below).

**Auth:** JWT required

**Response `200`**
```json
{
  "rank": 42,
  "surrounding": [
    { "rank": 37, "userId": "uuid", "username": "bob", "score": 12288, "date": "..." },
    ...
  ]
}
```

Returns `null` if the user has no scores yet.

---

## Health

### GET `/health`

Server liveness probe.

**Response `200`**
```json
{ "ok": true }
```

---

## Rate Limiting

The `/api/v1/auth` prefix is rate-limited to **10 requests per 15 minutes per IP** in non-test environments.

---

## WebSocket Protocol

Connect to `ws://<host>/ws`. The connection must authenticate within **5 seconds** or it is closed.

### Authentication Handshake

After connecting, send as the very first message:

```json
{ "type": "auth", "token": "<jwt>" }
```

On success the server begins routing subsequent messages. On failure (invalid/expired token, timeout) the connection is closed with code `4001`.

---

### Client → Server Messages

All messages are JSON. Send after successful authentication.

#### `room:create`
```json
{ "type": "room:create", "maxPlayers": 2 }
```
`maxPlayers`: `2 | 3 | 4`

#### `room:join`
```json
{ "type": "room:join", "roomId": "ABC123" }
```

#### `room:leave`
```json
{ "type": "room:leave" }
```

#### `room:ready`
```json
{ "type": "room:ready" }
```
Marks the player as ready. Game starts automatically once all players are ready (minimum 2).

#### `game:move`
```json
{ "type": "game:move", "direction": "left" }
```
`direction`: `"up" | "down" | "left" | "right"`

#### `game:score-update`
```json
{
  "type": "game:score-update",
  "score": 1024,
  "status": "playing",
  "board": [[0,2,0,4],[0,0,0,0],[0,0,0,0],[0,0,0,2]]
}
```
Sent after every move. `board` is a 4×4 grid of tile values (0 = empty). `status`: `"playing" | "won" | "lost"`.

#### `game:restart`
```json
{ "type": "game:restart" }
```
Request a new round in the same room. Room resets to `waiting` status when all players send this.

---

### Server → Client Messages

#### `room:state`
Sent whenever the room changes (player joins/leaves/readies, game starts/ends).
```json
{
  "type": "room:state",
  "room": {
    "id": "ABC123",
    "hostId": "uuid",
    "players": [
      { "userId": "uuid", "username": "alice", "isHost": true, "isReady": false }
    ],
    "status": "waiting",
    "maxPlayers": 2,
    "createdAt": "2025-01-01T00:00:00Z"
  }
}
```
`status`: `"waiting" | "playing" | "finished"`

#### `room:error`
```json
{ "type": "room:error", "code": "ROOM_FULL", "message": "Room is full" }
```

#### `player:update`
Broadcast to all room members when any player's score or board changes.
```json
{
  "type": "player:update",
  "userId": "uuid",
  "score": 512,
  "status": "playing",
  "boardSnapshot": [[0,2,4,0],[...],[...],[...]]
}
```

#### `game:start`
Sent 3 seconds before gameplay begins.
```json
{ "type": "game:start", "startsAt": "2025-01-01T12:00:03Z" }
```

#### `game:end`
Sent when all players have finished (won or lost).
```json
{
  "type": "game:end",
  "rankings": [
    { "userId": "uuid", "username": "alice", "score": 8192, "rank": 1 },
    { "userId": "uuid2", "username": "bob",   "score": 4096, "rank": 2 }
  ]
}
```

---

### WebSocket Close Codes

| Code | Meaning |
|------|---------|
| `4001` | Authentication failed or timed out (no retry) |
| `1000` | Normal closure |
| `1006` | Abnormal closure — client will attempt reconnect with backoff |
