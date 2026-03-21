import type { Request, Response, NextFunction } from 'express';
import { verifyToken } from '../jwt';

export const requireAuth = (req: Request, res: Response, next: NextFunction): void => {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    res.status(401).json({ code: 'UNAUTHORIZED', message: 'Missing or invalid Authorization header' });
    return;
  }
  const token = header.slice(7);
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
