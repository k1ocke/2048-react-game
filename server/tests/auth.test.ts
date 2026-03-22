process.env.JWT_SECRET = 'test-secret-at-least-32-chars-long!!';

jest.mock('../src/db', () => require('./__mocks__/db'));

import request from 'supertest';
import bcrypt from 'bcryptjs';
import { createApp } from '../src/app';
import { db, mockFullUser, mockGuestUser } from './__mocks__/db';

const app = createApp();

beforeEach(() => {
  jest.clearAllMocks();
});

// ─── POST /auth/register ──────────────────────────────────────────────────────

describe('POST /auth/register', () => {
  it('creates a new account and returns 201 with Set-Cookie + profile', async () => {
    db.isUsernameTaken.mockResolvedValue(false);
    db.createUser.mockResolvedValue(mockFullUser);

    const res = await request(app)
      .post('/api/v1/auth/register')
      .send({ username: 'testuser', password: 'Password123' });

    expect(res.status).toBe(201);
    expect(res.body).not.toHaveProperty('token');
    expect(res.headers['set-cookie']).toBeDefined();
    expect(res.headers['set-cookie'][0]).toMatch(/^token=/);
    expect(res.headers['set-cookie'][0]).toMatch(/HttpOnly/i);
    expect(res.body.user.username).toBe('testuser');
    expect(res.body.user).not.toHaveProperty('password_hash');
  });

  it('returns 409 when username is already taken', async () => {
    db.isUsernameTaken.mockResolvedValue(true);

    const res = await request(app)
      .post('/api/v1/auth/register')
      .send({ username: 'taken', password: 'Password123' });

    expect(res.status).toBe(409);
    expect(res.body.code).toBe('USERNAME_TAKEN');
  });

  it('returns 422 when username is too short', async () => {
    const res = await request(app)
      .post('/api/v1/auth/register')
      .send({ username: 'ab', password: 'Password123' });

    expect(res.status).toBe(422);
    expect(res.body.code).toBe('VALIDATION_ERROR');
  });

  it('returns 422 when password is too short', async () => {
    const res = await request(app)
      .post('/api/v1/auth/register')
      .send({ username: 'validuser', password: 'short' });

    expect(res.status).toBe(422);
    expect(res.body.code).toBe('VALIDATION_ERROR');
  });

  it('returns 422 when username contains invalid characters', async () => {
    const res = await request(app)
      .post('/api/v1/auth/register')
      .send({ username: 'bad name!', password: 'Password123' });

    expect(res.status).toBe(422);
  });
});

// ─── POST /auth/login ─────────────────────────────────────────────────────────

describe('POST /auth/login', () => {
  it('returns 200 with Set-Cookie when credentials are correct', async () => {
    const hash = await bcrypt.hash('Password123', 12);
    db.findByUsername.mockResolvedValue({ ...mockFullUser, password_hash: hash });

    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ username: 'testuser', password: 'Password123' });

    expect(res.status).toBe(200);
    expect(res.body).not.toHaveProperty('token');
    expect(res.headers['set-cookie']).toBeDefined();
    expect(res.headers['set-cookie'][0]).toMatch(/^token=/);
    expect(res.headers['set-cookie'][0]).toMatch(/HttpOnly/i);
    expect(res.body.user.username).toBe('testuser');
  });

  it('returns 401 when password is wrong', async () => {
    const hash = await bcrypt.hash('correctpassword', 12);
    db.findByUsername.mockResolvedValue({ ...mockFullUser, password_hash: hash });

    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ username: 'testuser', password: 'wrongpassword' });

    expect(res.status).toBe(401);
    expect(res.body.code).toBe('INVALID_CREDENTIALS');
  });

  it('returns 401 when user does not exist (same response — no enumeration)', async () => {
    db.findByUsername.mockResolvedValue(null);

    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ username: 'nobody', password: 'Password123' });

    expect(res.status).toBe(401);
    expect(res.body.code).toBe('INVALID_CREDENTIALS');
  });

  it('returns 401 when trying to log in as a guest', async () => {
    const hash = await bcrypt.hash('Password123', 12);
    db.findByUsername.mockResolvedValue({ ...mockGuestUser, password_hash: hash });

    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ username: 'Guest-1234', password: 'Password123' });

    expect(res.status).toBe(401);
  });
});

// ─── POST /auth/guest ─────────────────────────────────────────────────────────

describe('POST /auth/guest', () => {
  it('creates a guest session and returns 201 with Set-Cookie', async () => {
    db.isUsernameTaken.mockResolvedValue(false);
    db.createUser.mockResolvedValue(mockGuestUser);

    const res = await request(app).post('/api/v1/auth/guest');

    expect(res.status).toBe(201);
    expect(res.body).not.toHaveProperty('token');
    expect(res.headers['set-cookie']).toBeDefined();
    expect(res.headers['set-cookie'][0]).toMatch(/^token=/);
    expect(res.headers['set-cookie'][0]).toMatch(/HttpOnly/i);
    expect(res.body.user.isGuest).toBe(true);
    expect(res.body.user).not.toHaveProperty('password_hash');
  });
});

// ─── POST /auth/upgrade ───────────────────────────────────────────────────────

describe('POST /auth/upgrade', () => {
  const getGuestToken = () => {
    const { signToken } = jest.requireActual<typeof import('../src/jwt')>('../src/jwt');
    return signToken({ sub: mockGuestUser.id, username: mockGuestUser.username, isGuest: true }, '24h');
  };

  it('upgrades a guest to a full account', async () => {
    db.isUsernameTaken.mockResolvedValue(false);
    db.upgradeGuest.mockResolvedValue({ ...mockGuestUser, username: 'newuser', is_guest: false });

    const res = await request(app)
      .post('/api/v1/auth/upgrade')
      .set('Authorization', `Bearer ${getGuestToken()}`)
      .send({ username: 'newuser', password: 'Password123' });

    expect(res.status).toBe(200);
    expect(res.body).not.toHaveProperty('token');
    expect(res.headers['set-cookie']).toBeDefined();
    expect(res.headers['set-cookie'][0]).toMatch(/^token=/);
    expect(res.body.user.username).toBe('newuser');
  });

  it('returns 401 when called without a token', async () => {
    const res = await request(app)
      .post('/api/v1/auth/upgrade')
      .send({ username: 'newuser', password: 'Password123' });

    expect(res.status).toBe(401);
  });

  it('returns 401 when called with a full-account token', async () => {
    const { signToken } = jest.requireActual<typeof import('../src/jwt')>('../src/jwt');
    const fullToken = signToken({ sub: mockFullUser.id, username: mockFullUser.username });

    const res = await request(app)
      .post('/api/v1/auth/upgrade')
      .set('Authorization', `Bearer ${fullToken}`)
      .send({ username: 'newuser', password: 'Password123' });

    expect(res.status).toBe(401);
    expect(res.body.code).toBe('NOT_A_GUEST');
  });

  it('returns 409 when the new username is taken', async () => {
    db.isUsernameTaken.mockResolvedValue(true);

    const res = await request(app)
      .post('/api/v1/auth/upgrade')
      .set('Authorization', `Bearer ${getGuestToken()}`)
      .send({ username: 'taken', password: 'Password123' });

    expect(res.status).toBe(409);
  });
});

// ─── POST /auth/logout ────────────────────────────────────────────────────────

describe('POST /auth/logout', () => {
  const getFullToken = () => {
    const { signToken } = jest.requireActual<typeof import('../src/jwt')>('../src/jwt');
    return signToken({ sub: mockFullUser.id, username: mockFullUser.username });
  };

  it('returns 204 and clears the cookie', async () => {
    const res = await request(app)
      .post('/api/v1/auth/logout')
      .set('Authorization', `Bearer ${getFullToken()}`);

    expect(res.status).toBe(204);
    // Cookie should be cleared (expires=Thu, 01 Jan 1970 or Max-Age=0)
    expect(res.headers['set-cookie']).toBeDefined();
    expect(res.headers['set-cookie'][0]).toMatch(/token=;|token=(?:;|$)/);
  });

  it('returns 401 when called without a token', async () => {
    const res = await request(app).post('/api/v1/auth/logout');
    expect(res.status).toBe(401);
  });
});
