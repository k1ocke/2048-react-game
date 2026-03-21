# 2048 — Full-Stack Multiplayer

A full-stack 2048 game with real-time multiplayer, persistent leaderboards, and JWT-based authentication.

**Stack:** React 19 + TypeScript + Vite (client) · Express + WebSocket + PostgreSQL (server)

---

## Quick Start

### Prerequisites

- Node.js 20+
- PostgreSQL 14+

### 1. Database

```sql
-- Run the schema (see docs/ARCHITECTURE.md for full DDL)
psql -U postgres -c "CREATE DATABASE game2048;"
psql -U postgres -d game2048 -f server/schema.sql
```

### 2. Server

```bash
cd server
cp .env.example .env          # fill in DATABASE_URL and JWT_SECRET
npm install
npm run dev                   # listens on :4000
```

### 3. Client

```bash
npm install
npm run dev                   # listens on :3000, proxies /api and /ws to :4000
```

Open `http://localhost:3000`.

---

## NPM Scripts

| Location | Command | Description |
|----------|---------|-------------|
| client | `npm run dev` | Vite dev server (HMR) on port 3000 |
| client | `npm run build` | TypeScript check + Vite production build |
| client | `npm run test` | Jest unit tests |
| client | `npm run lint` | ESLint + Prettier check |
| client | `npm run typecheck` | `tsc --noEmit` |
| server | `npm run dev` | ts-node dev server on port 4000 |
| server | `npm run build` | Compile TypeScript to `dist/` |
| server | `npm run test` | Jest + supertest API tests |
| server | `npm run typecheck` | `tsc --noEmit` |

---

## Project Structure

```
/
├── src/
│   ├── components/       # React UI components
│   ├── hooks/            # Custom React hooks
│   ├── utils/            # Pure utility functions
│   ├── types/            # TypeScript type definitions
│   └── __mocks__/        # Jest module mocks
├── server/
│   ├── src/
│   │   ├── routes/       # Express route handlers
│   │   ├── ws/           # WebSocket server + room/game logic
│   │   ├── middleware/   # Auth middleware
│   │   ├── app.ts        # Express app factory
│   │   ├── db.ts         # PostgreSQL access layer
│   │   ├── jwt.ts        # Token sign/verify
│   │   └── index.ts      # Server entry point
│   └── tests/            # Server integration + unit tests
├── docs/
│   ├── API.md            # REST API + WebSocket protocol reference
│   └── ARCHITECTURE.md   # Component, hook, and system architecture
└── vite.config.ts
```

---

## Environment Variables

### Server (`server/.env`)

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `DATABASE_URL` | Yes | — | PostgreSQL connection string |
| `JWT_SECRET` | Yes | — | HS256 signing secret (min 32 chars) |
| `PORT` | No | `4000` | HTTP/WS listen port |
| `CORS_ORIGIN` | No | `http://localhost:3000` | Allowed CORS origin |
| `NODE_ENV` | No | `development` | `development` / `test` / `production` |

### Client (`/.env.local`)

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `VITE_API_URL` | No | `""` | API base URL (empty = use Vite proxy) |

---

## Features

- **Single-player** — classic 2048 with score tracking, local leaderboard, and game history
- **Multiplayer** — real-time 2-4 player rooms via WebSocket with live opponent boards
- **Authentication** — register/login with JWT; guest sessions that can be upgraded to full accounts
- **Global leaderboard** — top scores persisted in PostgreSQL with personal rank context
- **Score history** — last 20 games stored locally (moves, best tile, duration)

---

## Documentation

- [API Reference](docs/API.md) — all REST endpoints and WebSocket message types
- [Architecture](docs/ARCHITECTURE.md) — components, hooks, utilities, and server internals
