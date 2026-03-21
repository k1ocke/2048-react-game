import jwt from 'jsonwebtoken';
import type { AuthTokenPayload } from './types';

const secret = (): string => {
  const s = process.env.JWT_SECRET;
  if (!s) throw new Error('JWT_SECRET env var is required');
  return s;
};

export const signToken = (
  payload: Omit<AuthTokenPayload, 'iat' | 'exp'>,
  expiresIn: string = '7d',
): string =>
  jwt.sign(payload, secret(), { expiresIn } as jwt.SignOptions);

export const verifyToken = (token: string): AuthTokenPayload =>
  jwt.verify(token, secret(), { algorithms: ['HS256'] }) as AuthTokenPayload;
