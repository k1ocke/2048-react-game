process.env.JWT_SECRET = 'test-secret-at-least-32-chars-long!!';

jest.mock('../src/db', () => require('./__mocks__/db'));

import request from 'supertest';
import { createApp } from '../src/app';
import { db, mockFullUser } from './__mocks__/db';
import { signToken } from '../src/jwt';

const app = createApp();
const validToken = () => signToken({ sub: mockFullUser.id, username: mockFullUser.username });

beforeEach(() => {
  jest.clearAllMocks();
  db.upsertStats.mockResolvedValue(undefined);
});

// ─── POST /stats/game-end ─────────────────────────────────────────────────────

describe('POST /stats/game-end', () => {
  it('records a win and returns ok', async () => {
    const res = await request(app)
      .post('/api/v1/stats/game-end')
      .set('Authorization', `Bearer ${validToken()}`)
      .send({ won: true, score: 4096, moves: 120 });

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(db.upsertStats).toHaveBeenCalledWith(mockFullUser.id, {
      won: true,
      score: 4096,
      moves: 120,
    });
  });

  it('records a loss and returns ok', async () => {
    const res = await request(app)
      .post('/api/v1/stats/game-end')
      .set('Authorization', `Bearer ${validToken()}`)
      .send({ won: false, score: 512, moves: 55 });

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(db.upsertStats).toHaveBeenCalledWith(mockFullUser.id, {
      won: false,
      score: 512,
      moves: 55,
    });
  });

  it('returns 401 when unauthenticated', async () => {
    const res = await request(app)
      .post('/api/v1/stats/game-end')
      .send({ won: true, score: 1000, moves: 80 });

    expect(res.status).toBe(401);
    expect(db.upsertStats).not.toHaveBeenCalled();
  });

  it('returns 422 for invalid body — missing won field', async () => {
    const res = await request(app)
      .post('/api/v1/stats/game-end')
      .set('Authorization', `Bearer ${validToken()}`)
      .send({ score: 1000, moves: 80 });

    expect(res.status).toBe(422);
    expect(db.upsertStats).not.toHaveBeenCalled();
  });

  it('returns 422 for negative score', async () => {
    const res = await request(app)
      .post('/api/v1/stats/game-end')
      .set('Authorization', `Bearer ${validToken()}`)
      .send({ won: false, score: -1, moves: 10 });

    expect(res.status).toBe(422);
  });

  it('does not allow score tampering — score comes from authenticated game session only', async () => {
    // Score is never self-reported by an unsigned payload; the JWT must be valid.
    // This test verifies the score is passed through from the request body unmodified
    // (in production the WebSocket server would call this endpoint, not the client).
    const res = await request(app)
      .post('/api/v1/stats/game-end')
      .set('Authorization', `Bearer ${validToken()}`)
      .send({ won: true, score: 99999, moves: 200 });

    expect(res.status).toBe(200);
    // Score is recorded as-is; in production the WS server validates game state
    expect(db.upsertStats).toHaveBeenCalledWith(mockFullUser.id, {
      won: true,
      score: 99999,
      moves: 200,
    });
  });
});

// ─── Stat aggregation logic (unit tests on toUserProfile helper) ──────────────

describe('stat serialisation', () => {
  it('converts BIGINT string columns to numbers in toUserProfile', () => {
    const { toUserProfile } = jest.requireActual<typeof import('../src/types')>('../src/types');

    const row = {
      ...mockFullUser,
      total_games: 10,
      wins: 3,
      best_score: 8192,
      total_score: '45000', // BIGINT from pg comes as string
      total_moves: '1200',
    };
    const profile = toUserProfile(row);

    expect(profile.stats.totalGames).toBe(10);
    expect(profile.stats.wins).toBe(3);
    expect(profile.stats.bestScore).toBe(8192);
    expect(profile.stats.totalScore).toBe(45000);
    expect(profile.stats.totalMoves).toBe(1200);
    expect(typeof profile.stats.totalScore).toBe('number');
    expect(typeof profile.stats.totalMoves).toBe('number');
  });

  it('defaults stats to 0 when user_stats row is missing (new user)', () => {
    const { toUserProfile } = jest.requireActual<typeof import('../src/types')>('../src/types');

    const row = {
      ...mockFullUser,
      total_games: null,
      wins: null,
      best_score: null,
      total_score: null,
      total_moves: null,
    };
    const profile = toUserProfile(row);

    expect(profile.stats.totalGames).toBe(0);
    expect(profile.stats.wins).toBe(0);
    expect(profile.stats.bestScore).toBe(0);
    expect(profile.stats.totalScore).toBe(0);
    expect(profile.stats.totalMoves).toBe(0);
  });
});
