import { randomUUID } from 'node:crypto';
import jwt from 'jsonwebtoken';
import type { AuthTokenPayload } from './types';
import { isBlocklisted } from './blocklist';

const secret = (): string => {
  const s = process.env.JWT_SECRET;
  if (!s) throw new Error('JWT_SECRET env var is required');
  return s;
};

export const signToken = (
  payload: Omit<AuthTokenPayload, 'iat' | 'exp' | 'jti'>,
  expiresIn: string = '2h',
): string =>
  jwt.sign({ ...payload, jti: randomUUID() }, secret(), { algorithm: 'HS256', expiresIn } as jwt.SignOptions);

export const verifyToken = (token: string): AuthTokenPayload => {
  const payload = jwt.verify(token, secret(), { algorithms: ['HS256'] }) as AuthTokenPayload;
  if (payload.jti && isBlocklisted(payload.jti)) {
    throw new Error('Token has been revoked');
  }
  return payload;
};

// ── Game session tokens ────────────────────────────────────────────────────────
// Short-lived tokens that bind a single-player game to an authenticated user.
// Not checked against the blocklist — they expire in 4h and are single-use by
// convention (the game-end handler consumes them once per game).

export interface GameTokenPayload {
  sub: string;        // userId
  type: 'game-session';
  iat: number;
}

export const signGameToken = (userId: string): string =>
  jwt.sign({ sub: userId, type: 'game-session' }, secret(), {
    algorithm: 'HS256',
    expiresIn: '4h',
  } as jwt.SignOptions);

export const verifyGameToken = (token: string): GameTokenPayload => {
  const payload = jwt.verify(token, secret(), { algorithms: ['HS256'] }) as GameTokenPayload;
  if (payload.type !== 'game-session') throw new Error('Not a game session token');
  return payload;
};
