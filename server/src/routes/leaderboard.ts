import { Router } from 'express';
import { z } from 'zod';
import { db } from '../db';
import type { LeaderboardRow } from '../types';
import { requireAuth } from '../middleware/requireAuth';
import { logger } from '../logger';

const router = Router();

const CACHE_TTL_MS = 10_000;
interface CacheEntry { entries: LeaderboardRow[]; expiresAt: number; }
const leaderboardCache = new Map<number, CacheEntry>();

const ME_CACHE_TTL_MS = 60_000;
interface MeCacheEntry { result: { rank: number; surrounding: LeaderboardRow[] }; expiresAt: number; }
export const meRankCache = new Map<string, MeCacheEntry>();

const limitSchema = z
  .string()
  .optional()
  .transform((v) => (v === undefined ? 50 : parseInt(v, 10)))
  .pipe(z.number().int().min(1, 'limit must be at least 1').max(100, 'limit must be at most 100'));

// GET /api/v1/leaderboard?limit=50  — public
router.get('/', async (req, res) => {
  const parsed = limitSchema.safeParse(req.query.limit);
  if (!parsed.success) {
    res.status(422).json({ code: 'VALIDATION_ERROR', message: parsed.error.issues[0].message });
    return;
  }

  const limit = parsed.data;

  const cached = leaderboardCache.get(limit);
  if (cached && cached.expiresAt > Date.now()) {
    res.json({ entries: cached.entries, total: cached.entries.length });
    return;
  }

  try {
    const entries = await db.getTopScores(limit);
    leaderboardCache.set(limit, { entries, expiresAt: Date.now() + CACHE_TTL_MS });
    res.json({ entries, total: entries.length });
  } catch (err) {
    logger.error({ err }, 'GET /leaderboard error');
    res.status(500).json({ code: 'INTERNAL_ERROR', message: 'An unexpected error occurred' });
  }
});

// GET /api/v1/leaderboard/me  — requires JWT
router.get('/me', requireAuth, async (req, res) => {
  const userId = req.user!.sub;

  const cached = meRankCache.get(userId);
  if (cached && cached.expiresAt > Date.now()) {
    res.json({ rank: cached.result.rank, surrounding: cached.result.surrounding });
    return;
  }

  try {
    const result = await db.getUserRank(userId);
    if (!result) {
      res.status(404).json({ code: 'NOT_RANKED' });
      return;
    }
    meRankCache.set(userId, { result, expiresAt: Date.now() + ME_CACHE_TTL_MS });
    res.json({ rank: result.rank, surrounding: result.surrounding });
  } catch (err) {
    logger.error({ err }, 'GET /leaderboard/me error');
    res.status(500).json({ code: 'INTERNAL_ERROR', message: 'An unexpected error occurred' });
  }
});

export default router;
