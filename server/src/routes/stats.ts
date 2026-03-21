import { Router } from 'express';
import { db } from '../db';
import { requireAuth } from '../middleware/requireAuth';
import { gameEndSchema } from '../validate';
import { logger } from '../logger';

const router = Router();

// POST /stats/game-end
// Called server-side (or from client via authenticated request) when a game finishes.
// Scores are recorded here — never trusted from an unauthenticated source.
router.post('/game-end', requireAuth, async (req, res) => {
  const parsed = gameEndSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(422).json({ code: 'VALIDATION_ERROR', message: parsed.error.issues[0].message });
    return;
  }
  const { won, score, moves } = parsed.data;
  const userId = req.user!.sub;

  try {
    await db.upsertStats(userId, { won, score, moves });
    res.json({ ok: true });
  } catch (err) {
    logger.error({ err }, 'POST /stats/game-end error');
    res.status(500).json({ code: 'INTERNAL_ERROR', message: 'An unexpected error occurred' });
  }
});

export default router;
