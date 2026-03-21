import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import authRouter from './routes/auth';
import meRouter from './routes/me';
import statsRouter from './routes/stats';
import leaderboardRouter from './routes/leaderboard';
import { pool } from './db';

export const createApp = () => {
  const app = express();

  app.use(helmet());
  app.use(cors({ origin: process.env.CORS_ORIGIN ?? 'http://localhost:3000' }));
  app.use(express.json({ limit: '10kb' }));

  // Rate limit auth routes: 10 attempts per 15 minutes per IP (disabled in test)
  const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 10,
    skip: () => process.env.NODE_ENV === 'test',
    standardHeaders: true,
    legacyHeaders: false,
    message: { code: 'RATE_LIMITED', message: 'Too many attempts, please try again later' },
  });

  app.use('/api/v1/auth', authLimiter, authRouter);
  const generalLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 60,
    skip: () => process.env.NODE_ENV === 'test',
    standardHeaders: true,
    legacyHeaders: false,
    message: { code: 'RATE_LIMITED', message: 'Too many requests, please try again later' },
  });

  app.use('/api/v1/me', generalLimiter, meRouter);
  app.use('/api/v1/stats', generalLimiter, statsRouter);
  const leaderboardLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 30,
    skip: () => process.env.NODE_ENV === 'test',
    standardHeaders: true,
    legacyHeaders: false,
    message: { code: 'RATE_LIMITED', message: 'Too many requests, please try again later' },
  });

  app.use('/api/v1/leaderboard', leaderboardLimiter, leaderboardRouter);

  app.get('/health', async (_req, res) => {
    try {
      await pool.query('SELECT 1');
      res.json({ ok: true, db: 'connected' });
    } catch {
      res.status(503).json({ ok: false, db: 'error' });
    }
  });

  return app;
};
