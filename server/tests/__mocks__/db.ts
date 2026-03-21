import type { UserRow, LeaderboardRow } from '../../src/types';

// Shared mock user rows used across tests
export const mockFullUser: UserRow = {
  id: 'user-uuid-1',
  username: 'testuser',
  password_hash: '$2a$12$placeholder', // replaced per-test with real hash
  avatar_url: null,
  is_guest: false,
  created_at: new Date('2026-01-01T00:00:00Z'),
  total_games: 5,
  wins: 2,
  best_score: 4096,
  total_score: '12000',
  total_moves: '340',
};

export const mockGuestUser: UserRow = {
  id: 'guest-uuid-1',
  username: 'Guest-1234',
  password_hash: '$2a$12$randomguesthash',
  avatar_url: null,
  is_guest: true,
  created_at: new Date('2026-01-01T00:00:00Z'),
  total_games: 0,
  wins: 0,
  best_score: 0,
  total_score: '0',
  total_moves: '0',
};

// All db methods are jest.fn() — configure return values in each test
export const db = {
  findByUsername: jest.fn<Promise<UserRow | null>, [string]>(),
  findById: jest.fn<Promise<UserRow | null>, [string]>(),
  isUsernameTaken: jest.fn<Promise<boolean>, [string]>(),
  createUser: jest.fn<Promise<UserRow>, [string, string, boolean?]>(),
  updateUser: jest.fn<Promise<UserRow | null>, [string, object]>(),
  upgradeGuest: jest.fn<Promise<UserRow | null>, [string, string, string]>(),
  upsertStats: jest.fn<Promise<void>, [string, object]>(),
  getTopScores: jest.fn<Promise<LeaderboardRow[]>, [number]>(),
  getUserRank: jest.fn<Promise<{ rank: number; surrounding: LeaderboardRow[] } | null>, [string]>(),
};

export const pool = { query: jest.fn(), end: jest.fn() };
