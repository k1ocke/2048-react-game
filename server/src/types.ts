// Server-local type definitions (mirrors src/types/multiplayer.ts for the backend)

export interface UserStats {
  totalGames: number;
  wins: number;
  bestScore: number;
  totalScore: number;
  totalMoves: number;
}

export interface UserProfile {
  id: string;
  username: string;
  avatarUrl?: string;
  createdAt: string;   // ISO 8601
  stats: UserStats;
}

export interface GuestProfile {
  id: string;
  username: string;
  isGuest: true;
}

export interface AuthTokenPayload {
  sub: string;       // user UUID
  username: string;
  isGuest?: true;
  jti?: string;      // JWT ID — used for revocation
  iat: number;
  exp: number;
}

// Shape of a row joined from users + user_stats
export interface UserRow {
  id: string;
  username: string;
  password_hash: string;
  avatar_url: string | null;
  is_guest: boolean;
  created_at: Date;
  total_games: number | null;
  wins: number | null;
  best_score: number | null;
  total_score: string | null; // BIGINT → string in node-postgres
  total_moves: string | null;
}

export const toUserProfile = (row: UserRow): UserProfile => ({
  id: row.id,
  username: row.username,
  avatarUrl: row.avatar_url ?? undefined,
  createdAt: row.created_at.toISOString(),
  stats: {
    totalGames: row.total_games ?? 0,
    wins: row.wins ?? 0,
    bestScore: row.best_score ?? 0,
    totalScore: row.total_score ? parseInt(row.total_score, 10) : 0,
    totalMoves: row.total_moves ? parseInt(row.total_moves, 10) : 0,
  },
});

export const toGuestProfile = (row: UserRow): GuestProfile => ({
  id: row.id,
  username: row.username,
  isGuest: true,
});

export interface LeaderboardRow {
  rank: number;
  userId: string;
  username: string;
  avatarUrl: string | null;
  score: number;
  achievedAt: string; // ISO 8601
}

// ─── Multiplayer / WebSocket types ────────────────────────────────────────────

export interface RoomPlayer {
  userId: string;
  username: string;
  isReady: boolean;
  score: number;
  status: 'waiting' | 'playing' | 'won' | 'lost';
}

export interface GameRoom {
  id: string;
  hostId: string;
  maxPlayers: 2 | 3 | 4;
  players: RoomPlayer[];
  status: 'waiting' | 'playing' | 'finished';
  createdAt: number; // unix ms
}

export type ClientMessage =
  | { type: 'room:create'; maxPlayers: 2 | 3 | 4 }
  | { type: 'room:join'; roomId: string }
  | { type: 'room:leave' }
  | { type: 'room:ready' }
  | { type: 'game:move'; direction: 'up' | 'down' | 'left' | 'right' }
  | { type: 'game:score-update'; score: number; status: 'playing' | 'won' | 'lost'; board?: number[][] }
  | { type: 'game:restart' };

export type ServerMessage =
  | { type: 'hello'; userId: string }
  | { type: 'room:state'; room: GameRoom }
  | { type: 'room:error'; code: string; message: string }
  | { type: 'player:update'; userId: string; score: number; status: 'playing' | 'won' | 'lost'; boardSnapshot: number[][] }
  | { type: 'game:start'; startsAt: string }
  | { type: 'game:end'; rankings: Array<{ userId: string; username: string; score: number; rank: number }> };

// ─── Extend Express Request with authenticated user ────────────────────────────

// Extend Express Request with authenticated user
declare global {
  namespace Express {
    interface Request {
      user?: AuthTokenPayload;
    }
  }
}
