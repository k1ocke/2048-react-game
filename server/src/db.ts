import { Pool } from 'pg';
import type { UserRow, LeaderboardRow } from './types';

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
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

  async createUser(
    username: string,
    passwordHash: string,
    isGuest = false,
  ): Promise<UserRow> {
    const { rows } = await pool.query<UserRow>(
      `INSERT INTO users (username, password_hash, is_guest)
       VALUES ($1, $2, $3)
       RETURNING id, username, password_hash, avatar_url, is_guest, created_at,
                 NULL AS total_games, NULL AS wins, NULL AS best_score,
                 NULL AS total_score, NULL AS total_moves`,
      [username, passwordHash, isGuest],
    );
    await pool.query(
      `INSERT INTO user_stats (user_id) VALUES ($1) ON CONFLICT DO NOTHING`,
      [rows[0].id],
    );
    return rows[0];
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
    await pool.query(
      `UPDATE users SET ${updates.join(', ')} WHERE id = $${i}`,
      values,
    );
    return this.findById(id);
  },

  async upgradeGuest(
    id: string,
    username: string,
    passwordHash: string,
  ): Promise<UserRow | null> {
    await pool.query(
      `UPDATE users SET username = $1, password_hash = $2, is_guest = FALSE WHERE id = $3`,
      [username, passwordHash, id],
    );
    return this.findById(id);
  },

  async upsertStats(
    userId: string,
    { won, score, moves }: { won: boolean; score: number; moves: number },
  ): Promise<void> {
    await pool.query(
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
      await pool.query(
        `INSERT INTO scores (user_id, score) VALUES ($1, $2)`,
        [userId, score],
      );
    }
  },

  async getTopScores(limit: number): Promise<LeaderboardRow[]> {
    const { rows } = await pool.query<{
      rank: string;
      user_id: string;
      username: string;
      avatar_url: string | null;
      score: number;
      achieved_at: Date;
    }>(
      `SELECT
         ROW_NUMBER() OVER (ORDER BY s.score DESC) AS rank,
         s.user_id,
         u.username,
         u.avatar_url,
         s.score,
         s.achieved_at
       FROM scores s
       JOIN users u ON u.id = s.user_id
       ORDER BY s.score DESC
       LIMIT $1`,
      [limit],
    );
    return rows.map((r) => ({
      rank: parseInt(r.rank, 10),
      userId: r.user_id,
      username: r.username,
      avatarUrl: r.avatar_url,
      score: r.score,
      achievedAt: r.achieved_at.toISOString(),
    }));
  },

  async getUserRank(
    userId: string,
  ): Promise<{ rank: number; surrounding: LeaderboardRow[] } | null> {
    const { rows } = await pool.query<{
      rank: string;
      user_id: string;
      username: string;
      avatar_url: string | null;
      score: number;
      achieved_at: Date;
    }>(
      `WITH ranked AS (
         SELECT
           ROW_NUMBER() OVER (ORDER BY s.score DESC) AS rank,
           s.user_id, s.score, s.achieved_at, u.username, u.avatar_url
         FROM scores s JOIN users u ON u.id = s.user_id
       )
       SELECT * FROM ranked
       WHERE rank BETWEEN (
         SELECT rank FROM ranked WHERE user_id = $1 ORDER BY rank LIMIT 1
       ) - 5
       AND (
         SELECT rank FROM ranked WHERE user_id = $1 ORDER BY rank LIMIT 1
       ) + 5
       ORDER BY rank`,
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
