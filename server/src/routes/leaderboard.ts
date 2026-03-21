import { Router } from 'express';
import { z } from 'zod';
import { db } from '../db';
import { requireAuth } from '../middleware/requireAuth';

const router = Router();

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

  try {
    const entries = await db.getTopScores(limit);
    res.json({ entries, total: entries.length });
  } catch (err) {
    console.error('GET /leaderboard error', err);
    res.status(500).json({ code: 'INTERNAL_ERROR', message: 'An unexpected error occurred' });
  }
});

// GET /api/v1/leaderboard/me  — requires JWT
router.get('/me', requireAuth, async (req, res) => {
  const userId = req.user!.sub;

  try {
    const result = await db.getUserRank(userId);
    if (!result) {
      res.status(404).json({ code: 'NOT_RANKED' });
      return;
    }
    res.json({ rank: result.rank, surrounding: result.surrounding });
  } catch (err) {
    console.error('GET /leaderboard/me error', err);
    res.status(500).json({ code: 'INTERNAL_ERROR', message: 'An unexpected error occurred' });
  }
});

export default router;
