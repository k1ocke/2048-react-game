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

// Helper: obtain a valid game session token from POST /stats/game-start
const getGameToken = async (): Promise<string> => {
  const res = await request(app)
    .post('/api/v1/stats/game-start')
    .set('Authorization', `Bearer ${validToken()}`);
  expect(res.status).toBe(200);
  return res.body.gameToken as string;
};

// ─── POST /stats/game-start ───────────────────────────────────────────────────

describe('POST /stats/game-start', () => {
  it('returns a signed game session token for authenticated users', async () => {
    const res = await request(app)
      .post('/api/v1/stats/game-start')
      .set('Authorization', `Bearer ${validToken()}`);

    expect(res.status).toBe(200);
    expect(typeof res.body.gameToken).toBe('string');
    expect(res.body.gameToken.length).toBeGreaterThan(0);
  });

  it('returns 401 when unauthenticated', async () => {
    const res = await request(app).post('/api/v1/stats/game-start');
    expect(res.status).toBe(401);
  });
});

// ─── POST /stats/game-end ─────────────────────────────────────────────────────

describe('POST /stats/game-end', () => {
  it('records a win and returns ok', async () => {
    const gameToken = await getGameToken();

    const res = await request(app)
      .post('/api/v1/stats/game-end')
      .set('Authorization', `Bearer ${validToken()}`)
      .send({ won: true, score: 4096, moves: 120, gameToken });

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(db.upsertStats).toHaveBeenCalledWith(mockFullUser.id, {
      won: true,
      score: 4096,
      moves: 120,
    });
  });

  it('records a loss and returns ok', async () => {
    const gameToken = await getGameToken();

    const res = await request(app)
      .post('/api/v1/stats/game-end')
      .set('Authorization', `Bearer ${validToken()}`)
      .send({ won: false, score: 512, moves: 55, gameToken });

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(db.upsertStats).toHaveBeenCalledWith(mockFullUser.id, {
      won: false,
      score: 512,
      moves: 55,
    });
  });

  it('returns 401 when unauthenticated', async () => {
    const gameToken = await getGameToken();

    const res = await request(app)
      .post('/api/v1/stats/game-end')
      .send({ won: true, score: 1000, moves: 80, gameToken });

    expect(res.status).toBe(401);
    expect(db.upsertStats).not.toHaveBeenCalled();
  });

  it('returns 422 for invalid body — missing won field', async () => {
    const gameToken = await getGameToken();

    const res = await request(app)
      .post('/api/v1/stats/game-end')
      .set('Authorization', `Bearer ${validToken()}`)
      .send({ score: 1000, moves: 80, gameToken });

    expect(res.status).toBe(422);
    expect(db.upsertStats).not.toHaveBeenCalled();
  });

  it('returns 422 for negative score', async () => {
    const gameToken = await getGameToken();

    const res = await request(app)
      .post('/api/v1/stats/game-end')
      .set('Authorization', `Bearer ${validToken()}`)
      .send({ won: false, score: -1, moves: 10, gameToken });

    expect(res.status).toBe(422);
  });

  it('returns 422 when gameToken is missing', async () => {
    const res = await request(app)
      .post('/api/v1/stats/game-end')
      .set('Authorization', `Bearer ${validToken()}`)
      .send({ won: true, score: 4096, moves: 120 });

    expect(res.status).toBe(422);
    expect(db.upsertStats).not.toHaveBeenCalled();
  });

  it('returns 400 for an invalid game session token', async () => {
    const res = await request(app)
      .post('/api/v1/stats/game-end')
      .set('Authorization', `Bearer ${validToken()}`)
      .send({ won: true, score: 4096, moves: 120, gameToken: 'not-a-valid-token' });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('INVALID_GAME_TOKEN');
    expect(db.upsertStats).not.toHaveBeenCalled();
  });

  it('returns 403 when game token belongs to a different user', async () => {
    const { signGameToken } = jest.requireActual<typeof import('../src/jwt')>('../src/jwt');
    const otherUserToken = signGameToken('different-user-id');

    const res = await request(app)
      .post('/api/v1/stats/game-end')
      .set('Authorization', `Bearer ${validToken()}`)
      .send({ won: true, score: 4096, moves: 120, gameToken: otherUserToken });

    expect(res.status).toBe(403);
    expect(res.body.code).toBe('GAME_TOKEN_MISMATCH');
    expect(db.upsertStats).not.toHaveBeenCalled();
  });

  it('requires a valid game session token to record stats (prevents unbound score submission)', async () => {
    // In test mode, timing checks are skipped; the token signature and user binding are enforced.
    const gameToken = await getGameToken();

    const res = await request(app)
      .post('/api/v1/stats/game-end')
      .set('Authorization', `Bearer ${validToken()}`)
      .send({ won: true, score: 99999, moves: 200, gameToken });

    expect(res.status).toBe(200);
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
