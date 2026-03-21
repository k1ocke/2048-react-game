process.env.JWT_SECRET = 'test-secret-at-least-32-chars-long!!';

jest.mock('../src/db', () => require('./__mocks__/db'));

import request from 'supertest';
import { createApp } from '../src/app';
import { db, mockFullUser } from './__mocks__/db';
import { signToken } from '../src/jwt';
import type { LeaderboardRow } from '../src/types';

const app = createApp();
const validToken = () => signToken({ sub: mockFullUser.id, username: mockFullUser.username });

const mockEntries: LeaderboardRow[] = [
  {
    rank: 1,
    userId: 'user-uuid-1',
    username: 'testuser',
    avatarUrl: null,
    score: 8192,
    achievedAt: '2026-01-01T00:00:00.000Z',
  },
  {
    rank: 2,
    userId: 'user-uuid-2',
    username: 'player2',
    avatarUrl: 'https://example.com/avatar.png',
    score: 4096,
    achievedAt: '2026-01-02T00:00:00.000Z',
  },
];

beforeEach(() => {
  jest.clearAllMocks();
});

// ─── GET /leaderboard ─────────────────────────────────────────────────────────

describe('GET /leaderboard', () => {
  it('returns 200 with entries array', async () => {
    db.getTopScores.mockResolvedValue(mockEntries);

    const res = await request(app).get('/api/v1/leaderboard');

    expect(res.status).toBe(200);
    expect(res.body.entries).toEqual(mockEntries);
    expect(res.body.total).toBe(2);
    expect(db.getTopScores).toHaveBeenCalledWith(50);
  });

  it('respects the limit query param', async () => {
    db.getTopScores.mockResolvedValue(mockEntries.slice(0, 1));

    const res = await request(app).get('/api/v1/leaderboard?limit=5');

    expect(res.status).toBe(200);
    expect(db.getTopScores).toHaveBeenCalledWith(5);
  });

  it('returns 422 when limit exceeds max (200)', async () => {
    const res = await request(app).get('/api/v1/leaderboard?limit=200');

    expect(res.status).toBe(422);
    expect(db.getTopScores).not.toHaveBeenCalled();
  });
});

// ─── GET /leaderboard/me ──────────────────────────────────────────────────────

describe('GET /leaderboard/me', () => {
  it('returns 200 with rank and surrounding when authenticated and ranked', async () => {
    db.getUserRank.mockResolvedValue({ rank: 1, surrounding: mockEntries });

    const res = await request(app)
      .get('/api/v1/leaderboard/me')
      .set('Authorization', `Bearer ${validToken()}`);

    expect(res.status).toBe(200);
    expect(res.body.rank).toBe(1);
    expect(res.body.surrounding).toEqual(mockEntries);
    expect(db.getUserRank).toHaveBeenCalledWith(mockFullUser.id);
  });

  it('returns 404 when user has no scores', async () => {
    db.getUserRank.mockResolvedValue(null);

    const res = await request(app)
      .get('/api/v1/leaderboard/me')
      .set('Authorization', `Bearer ${validToken()}`);

    expect(res.status).toBe(404);
    expect(res.body.code).toBe('NOT_RANKED');
  });

  it('returns 401 when unauthenticated', async () => {
    const res = await request(app).get('/api/v1/leaderboard/me');

    expect(res.status).toBe(401);
    expect(db.getUserRank).not.toHaveBeenCalled();
  });
});
