// ─── Leaderboard ──────────────────────────────────────────────────────────────

export interface LeaderboardRow {
  rank: number;
  userId: string;
  username: string;
  score: number;
  date: string; // ISO 8601 or locale string
}

// ─── User Profiles ────────────────────────────────────────────────────────────

export interface UserStats {
  totalGames: number;
  wins: number;
  bestScore: number;
  /** Sum of all game scores — divide by totalGames for average */
  totalScore: number;
  totalMoves: number;
}

export interface UserProfile {
  id: string;          // UUID
  username: string;    // 3–20 chars, unique, alphanumeric + underscores
  avatarUrl?: string;  // optional custom image URL
  createdAt: string;   // ISO 8601
  stats: UserStats;
}

/** Ephemeral guest — no password, no persistence across sessions */
export interface GuestProfile {
  id: string;       // 'guest-{uuid}'
  username: string; // 'Guest-{4-digit code}'
  isGuest: true;
}

export type CurrentUser = UserProfile | GuestProfile;

export const isGuest = (user: CurrentUser): user is GuestProfile =>
  'isGuest' in user && user.isGuest === true;

// ─── Auth ─────────────────────────────────────────────────────────────────────

export interface LoginRequest {
  username: string;
  password: string;
}

export interface RegisterRequest {
  username: string;
  password: string; // min 8 chars, enforced server-side
}

export interface UpgradeGuestRequest {
  username: string;
  password: string;
}

export interface AuthResponse {
  token: string;      // signed JWT, 7-day expiry
  user: UserProfile;
}

export interface GuestAuthResponse {
  token: string;      // signed JWT, 24-hour expiry
  user: GuestProfile;
}

/**
 * JWT payload shape (decoded, not the raw token).
 * Use a library like `jose` or `jsonwebtoken` to verify.
 */
export interface AuthTokenPayload {
  sub: string;       // user ID
  username: string;
  isGuest?: true;
  iat: number;
  exp: number;
}

// ─── API Response envelope ────────────────────────────────────────────────────

export interface ApiError {
  code: string;   // e.g. 'USERNAME_TAKEN', 'INVALID_CREDENTIALS'
  message: string;
}

// ─── Multiplayer Rooms ────────────────────────────────────────────────────────

export interface RoomPlayer {
  userId: string;
  username: string;
  avatarUrl?: string;
  isHost: boolean;
  isReady: boolean;
}

export interface GameRoom {
  id: string;         // 6-char uppercase code, e.g. 'XK7P2Q'
  hostId: string;
  players: RoomPlayer[];
  status: 'waiting' | 'playing' | 'finished';
  maxPlayers: 2 | 3 | 4;
  createdAt: string;  // ISO 8601
}

// ─── WebSocket message protocol ───────────────────────────────────────────────

// Client → Server
export type ClientMessage =
  | { type: 'room:create'; maxPlayers: 2 | 3 | 4 }
  | { type: 'room:join'; roomId: string }
  | { type: 'room:leave' }
  | { type: 'room:ready' }
  | { type: 'game:move'; direction: 'up' | 'down' | 'left' | 'right' }
  | { type: 'game:score-update'; score: number; status: 'playing' | 'won' | 'lost'; board?: number[][] }
  | { type: 'game:restart' };

// Server → Client
export type ServerMessage =
  | { type: 'room:state'; room: GameRoom }
  | { type: 'room:error'; code: string; message: string }
  | { type: 'player:update'; userId: string; score: number; status: 'playing' | 'won' | 'lost'; boardSnapshot: number[][] }
  | { type: 'game:start'; startsAt: string }
  | { type: 'game:end'; rankings: Array<{ userId: string; username: string; score: number; rank: number }> };
