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
