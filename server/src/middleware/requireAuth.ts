import type { Request, Response, NextFunction } from 'express';
import { verifyToken } from '../jwt';

/** Parse the `token` cookie value from a raw Cookie header string. */
const parseCookieToken = (cookieHeader: string | undefined): string | undefined => {
  if (!cookieHeader) return undefined;
  const match = cookieHeader.match(/(?:^|;\s*)token=([^;]+)/);
  return match ? decodeURIComponent(match[1]) : undefined;
};

export const requireAuth = (req: Request, res: Response, next: NextFunction): void => {
  // Primary: httpOnly cookie (browser clients)
  const cookieToken = parseCookieToken(req.headers.cookie);
  // Fallback: Authorization Bearer header (programmatic / test clients)
  const bearerToken = req.headers.authorization?.startsWith('Bearer ')
    ? req.headers.authorization.slice(7)
    : undefined;

  const token = cookieToken ?? bearerToken;
  if (!token) {
    res.status(401).json({ code: 'UNAUTHORIZED', message: 'Authentication required' });
    return;
  }
  try {
    req.user = verifyToken(token);
    next();
  } catch {
    res.status(401).json({ code: 'UNAUTHORIZED', message: 'Invalid or expired token' });
  }
};

export const requireFullAccount = (req: Request, res: Response, next: NextFunction): void => {
  if (!req.user) {
    res.status(401).json({ code: 'UNAUTHORIZED', message: 'Not authenticated' });
    return;
  }
  if (req.user.isGuest) {
    res.status(403).json({ code: 'GUEST_ONLY_ROUTE', message: 'Full account required' });
    return;
  }
  next();
};

export const requireGuest = (req: Request, res: Response, next: NextFunction): void => {
  if (!req.user) {
    res.status(401).json({ code: 'UNAUTHORIZED', message: 'Not authenticated' });
    return;
  }
  if (!req.user.isGuest) {
    res.status(401).json({ code: 'NOT_A_GUEST', message: 'This route is only for guest accounts' });
    return;
  }
  next();
};
