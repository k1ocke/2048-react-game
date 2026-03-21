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
});

// ─── GET /me ──────────────────────────────────────────────────────────────────

describe('GET /me', () => {
  it('returns the user profile when authenticated', async () => {
    db.findById.mockResolvedValue(mockFullUser);

    const res = await request(app)
      .get('/api/v1/me')
      .set('Authorization', `Bearer ${validToken()}`);

    expect(res.status).toBe(200);
    expect(res.body.id).toBe(mockFullUser.id);
    expect(res.body.username).toBe(mockFullUser.username);
    expect(res.body.stats.totalGames).toBe(5);
    expect(res.body.stats.wins).toBe(2);
    expect(res.body.stats.bestScore).toBe(4096);
    expect(res.body).not.toHaveProperty('password_hash');
  });

  it('returns 401 with no token', async () => {
    const res = await request(app).get('/api/v1/me');
    expect(res.status).toBe(401);
  });

  it('returns 401 with an invalid token', async () => {
    const res = await request(app)
      .get('/api/v1/me')
      .set('Authorization', 'Bearer not.a.valid.jwt');
    expect(res.status).toBe(401);
  });

  it('returns 401 with a malformed Authorization header', async () => {
    const res = await request(app)
      .get('/api/v1/me')
      .set('Authorization', 'NotBearer token');
    expect(res.status).toBe(401);
  });
});

// ─── PATCH /me ────────────────────────────────────────────────────────────────

describe('PATCH /me', () => {
  it('updates username and returns updated profile', async () => {
    const updated = { ...mockFullUser, username: 'newname' };
    db.findById.mockResolvedValue(mockFullUser);
    db.isUsernameTaken.mockResolvedValue(false);
    db.updateUser.mockResolvedValue(updated);

    const res = await request(app)
      .patch('/api/v1/me')
      .set('Authorization', `Bearer ${validToken()}`)
      .send({ username: 'newname' });

    expect(res.status).toBe(200);
    expect(res.body.username).toBe('newname');
    expect(db.updateUser).toHaveBeenCalledWith(mockFullUser.id, { username: 'newname', avatarUrl: undefined });
  });

  it('updates avatarUrl and returns updated profile', async () => {
    const url = 'https://example.com/avatar.png';
    const updated = { ...mockFullUser, avatar_url: url };
    db.findById.mockResolvedValue(mockFullUser);
    db.updateUser.mockResolvedValue(updated);

    const res = await request(app)
      .patch('/api/v1/me')
      .set('Authorization', `Bearer ${validToken()}`)
      .send({ avatarUrl: url });

    expect(res.status).toBe(200);
    expect(res.body.avatarUrl).toBe(url);
  });

  it('returns 409 when new username is already taken', async () => {
    db.findById.mockResolvedValue(mockFullUser);
    db.isUsernameTaken.mockResolvedValue(true);

    const res = await request(app)
      .patch('/api/v1/me')
      .set('Authorization', `Bearer ${validToken()}`)
      .send({ username: 'takenname' });

    expect(res.status).toBe(409);
    expect(res.body.code).toBe('USERNAME_TAKEN');
  });

  it('returns 422 for invalid avatarUrl', async () => {
    const res = await request(app)
      .patch('/api/v1/me')
      .set('Authorization', `Bearer ${validToken()}`)
      .send({ avatarUrl: 'not-a-url' });

    expect(res.status).toBe(422);
  });

  it('returns 401 with no token', async () => {
    const res = await request(app).patch('/api/v1/me').send({ username: 'x' });
    expect(res.status).toBe(401);
  });
});
