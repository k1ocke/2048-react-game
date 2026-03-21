-- Run with: psql $DATABASE_URL -f migrations/001_initial.sql

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ── Users ──────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  username      VARCHAR(20) UNIQUE NOT NULL,
  password_hash TEXT        NOT NULL,
  avatar_url    TEXT,
  is_guest      BOOLEAN     NOT NULL DEFAULT FALSE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_users_username ON users (username);

-- ── Stats (updated atomically on every game end) ───────────────────────────────
CREATE TABLE IF NOT EXISTS user_stats (
  user_id      UUID    PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  total_games  INT     NOT NULL DEFAULT 0,
  wins         INT     NOT NULL DEFAULT 0,
  best_score   INT     NOT NULL DEFAULT 0,
  total_score  BIGINT  NOT NULL DEFAULT 0,
  total_moves  BIGINT  NOT NULL DEFAULT 0,
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Global scores (feeds leaderboard — Task #4) ────────────────────────────────
CREATE TABLE IF NOT EXISTS scores (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  score       INT         NOT NULL,
  achieved_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_scores_score   ON scores (score DESC);
CREATE INDEX IF NOT EXISTS idx_scores_user_id ON scores (user_id);

-- ── Rooms (persisted for reconnection grace period — Task #6) ──────────────────
CREATE TABLE IF NOT EXISTS rooms (
  id          CHAR(6)     PRIMARY KEY,
  host_id     UUID        NOT NULL REFERENCES users(id),
  status      VARCHAR(10) NOT NULL DEFAULT 'waiting',
  max_players SMALLINT    NOT NULL DEFAULT 2,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  finished_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS room_players (
  room_id   CHAR(6) NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  user_id   UUID    NOT NULL REFERENCES users(id),
  is_host   BOOLEAN NOT NULL DEFAULT FALSE,
  is_ready  BOOLEAN NOT NULL DEFAULT FALSE,
  joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (room_id, user_id)
);
