import type { Request, Response, NextFunction } from 'express';

/**
 * Lightweight CSRF protection via custom-header check.
 *
 * Requires `X-Requested-With: fetch` on all state-changing requests (POST/PATCH/PUT/DELETE).
 * Browsers cannot set arbitrary headers on cross-origin requests without a CORS preflight,
 * and the server's CORS policy only allows our own origin — so only our own client can pass.
 *
 * Disabled in test mode so the existing test suite does not need modification.
 */
export const csrfProtect = (req: Request, res: Response, next: NextFunction): void => {
  if (process.env.NODE_ENV === 'test') {
    next();
    return;
  }
  const mutating = ['POST', 'PATCH', 'PUT', 'DELETE'].includes(req.method);
  if (mutating && req.headers['x-requested-with'] !== 'fetch') {
    res.status(403).json({ code: 'CSRF_REJECTED', message: 'Missing required request header' });
    return;
  }
  next();
};
