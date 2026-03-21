import { Pool } from 'pg';
import type { UserRow, LeaderboardRow } from './types';

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 10,
  connectionTimeoutMillis: 3000,
  idleTimeoutMillis: 30000,
});

pool.on('connect', (client) => {
  void client.query('SET statement_timeout = 5000');
});

pool.on('error', (err) => {
  console.error('PostgreSQL pool error:', err);
});

const USER_SELECT = `
  SELECT
    u.id, u.username, u.password_hash, u.avatar_url, u.is_guest, u.created_at,
    s.total_games, s.wins, s.best_score, s.total_score, s.total_moves
  FROM users u
  LEFT JOIN user_stats s ON s.user_id = u.id
`;

export const db = {
  async findByUsername(username: string): Promise<UserRow | null> {
    const { rows } = await pool.query<UserRow>(
      `${USER_SELECT} WHERE u.username = $1`,
      [username],
    );
    return rows[0] ?? null;
  },

  async findById(id: string): Promise<UserRow | null> {
    const { rows } = await pool.query<UserRow>(
      `${USER_SELECT} WHERE u.id = $1`,
      [id],
    );
    return rows[0] ?? null;
  },

  async isUsernameTaken(username: string): Promise<boolean> {
    const { rows } = await pool.query<{ exists: boolean }>(
      `SELECT EXISTS(SELECT 1 FROM users WHERE username = $1) AS exists`,
      [username],
    );
    return rows[0].exists;
  },

  async isUsernameTakenByOther(username: string, excludeUserId: string): Promise<boolean> {
    const { rows } = await pool.query<{ exists: boolean }>(
      `SELECT EXISTS(SELECT 1 FROM users WHERE username = $1 AND id != $2) AS exists`,
      [username, excludeUserId],
    );
    return rows[0].exists;
  },

  async createUser(
    username: string,
    passwordHash: string,
    isGuest = false,
  ): Promise<UserRow> {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const { rows } = await client.query<UserRow>(
        `INSERT INTO users (username, password_hash, is_guest)
         VALUES ($1, $2, $3)
         RETURNING id, username, password_hash, avatar_url, is_guest, created_at,
                   NULL AS total_games, NULL AS wins, NULL AS best_score,
                   NULL AS total_score, NULL AS total_moves`,
        [username, passwordHash, isGuest],
      );
      await client.query(
        `INSERT INTO user_stats (user_id) VALUES ($1) ON CONFLICT DO NOTHING`,
        [rows[0].id],
      );
      await client.query('COMMIT');
      return rows[0];
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  },

  async updateUser(
    id: string,
    fields: { username?: string; avatarUrl?: string | null },
  ): Promise<UserRow | null> {
    const updates: string[] = [];
    const values: (string | null)[] = [];
    let i = 1;

    if (fields.username !== undefined) {
      updates.push(`username = $${i++}`);
      values.push(fields.username);
    }
    if (fields.avatarUrl !== undefined) {
      updates.push(`avatar_url = $${i++}`);
      values.push(fields.avatarUrl);
    }
    if (updates.length === 0) return this.findById(id);

    values.push(id);
    const { rows } = await pool.query<UserRow>(
      `WITH updated AS (
         UPDATE users SET ${updates.join(', ')} WHERE id = $${i}
         RETURNING id, username, password_hash, avatar_url, is_guest, created_at
       )
       SELECT
         updated.id, updated.username, updated.password_hash, updated.avatar_url,
         updated.is_guest, updated.created_at,
         s.total_games, s.wins, s.best_score, s.total_score, s.total_moves
       FROM updated
       LEFT JOIN user_stats s ON s.user_id = updated.id`,
      values,
    );
    return rows[0] ?? null;
  },

  async upgradeGuest(
    id: string,
    username: string,
    passwordHash: string,
  ): Promise<UserRow | null> {
    const { rows } = await pool.query<UserRow>(
      `WITH updated AS (
         UPDATE users SET username = $1, password_hash = $2, is_guest = FALSE WHERE id = $3
         RETURNING id, username, password_hash, avatar_url, is_guest, created_at
       )
       SELECT
         updated.id, updated.username, updated.password_hash, updated.avatar_url,
         updated.is_guest, updated.created_at,
         s.total_games, s.wins, s.best_score, s.total_score, s.total_moves
       FROM updated
       LEFT JOIN user_stats s ON s.user_id = updated.id`,
      [username, passwordHash, id],
    );
    return rows[0] ?? null;
  },

  async upsertStats(
    userId: string,
    { won, score, moves }: { won: boolean; score: number; moves: number },
  ): Promise<void> {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(
        `INSERT INTO user_stats (user_id, total_games, wins, best_score, total_score, total_moves)
         VALUES ($1, 1, $2, $3, $4, $5)
         ON CONFLICT (user_id) DO UPDATE SET
           total_games = user_stats.total_games + 1,
           wins        = user_stats.wins        + EXCLUDED.wins,
           best_score  = GREATEST(user_stats.best_score, EXCLUDED.best_score),
           total_score = user_stats.total_score + EXCLUDED.total_score,
           total_moves = user_stats.total_moves + EXCLUDED.total_moves,
           updated_at  = NOW()`,
        [userId, won ? 1 : 0, score, score, moves],
      );
      if (score > 0) {
        await client.query(
          `INSERT INTO scores (user_id, score) VALUES ($1, $2)`,
          [userId, score],
        );
      }
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  },

  async getTopScores(limit: number): Promise<LeaderboardRow[]> {
    const { rows } = await pool.query<{
      user_id: string;
      username: string;
      avatar_url: string | null;
      score: number;
      achieved_at: Date;
    }>(
      `SELECT best.user_id, u.username, u.avatar_url, best.score, best.achieved_at
       FROM (
         SELECT DISTINCT ON (s.user_id) s.user_id, s.score, s.achieved_at
         FROM scores s
         ORDER BY s.user_id, s.score DESC, s.achieved_at ASC, s.id ASC
       ) best
       JOIN users u ON u.id = best.user_id
       ORDER BY best.score DESC, best.achieved_at ASC, best.user_id ASC
       LIMIT $1`,
      [limit],
    );
    return rows.map((r, i) => ({
      rank: i + 1,
      userId: r.user_id,
      username: r.username,
      avatarUrl: r.avatar_url,
      score: r.score,
      achievedAt: r.achieved_at.toISOString(),
    }));
  },

  async getUserRank(userId: string): Promise<{ rank: number; surrounding: LeaderboardRow[] } | null> {
    const { rows } = await pool.query<{
      rank: string;
      user_id: string;
      username: string;
      avatar_url: string | null;
      score: number;
      achieved_at: Date;
    }>(
      `WITH my_best AS (
         SELECT MAX(score) AS score FROM scores WHERE user_id = $1
       ),
       my_rank_val AS (
         SELECT COUNT(*)::int + 1 AS rank
         FROM scores
         WHERE score > (SELECT score FROM my_best)
       )
       SELECT
         ((SELECT rank FROM my_rank_val) + ROW_NUMBER() OVER (ORDER BY s.score DESC) - 1)::int AS rank,
         s.user_id, s.score, s.achieved_at, u.username, u.avatar_url
       FROM (
         SELECT s2.user_id, s2.score, s2.achieved_at
         FROM scores s2
         ORDER BY s2.score DESC
         LIMIT 11
         OFFSET GREATEST((SELECT rank FROM my_rank_val) - 6, 0)
       ) s
       JOIN users u ON u.id = s.user_id
       ORDER BY s.score DESC`,
      [userId],
    );

    if (rows.length === 0) return null;

    const userRow = rows.find((r) => r.user_id === userId);
    if (!userRow) return null;

    const userRank = parseInt(userRow.rank, 10);
    const surrounding: LeaderboardRow[] = rows.map((r) => ({
      rank: parseInt(r.rank, 10),
      userId: r.user_id,
      username: r.username,
      avatarUrl: r.avatar_url,
      score: r.score,
      achievedAt: r.achieved_at.toISOString(),
    }));

    return { rank: userRank, surrounding };
  },
};
