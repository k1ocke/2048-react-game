import { Router } from 'express';
import { db } from '../db';
import { requireAuth } from '../middleware/requireAuth';
import { gameEndSchema } from '../validate';
import { signGameToken, verifyGameToken } from '../jwt';
import { logger } from '../logger';

const router = Router();

// POST /stats/game-start
// Issues a signed game session token that must be redeemed at game-end.
// Binds the score submission to an authenticated user and a real play session.
router.post('/game-start', requireAuth, (_req, res) => {
  const gameToken = signGameToken(_req.user!.sub);
  res.json({ gameToken });
});

// POST /stats/game-end
router.post('/game-end', requireAuth, async (req, res) => {
  const parsed = gameEndSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(422).json({ code: 'VALIDATION_ERROR', message: parsed.error.issues[0].message });
    return;
  }
  const { won, score, moves, gameToken } = parsed.data;
  const userId = req.user!.sub;

  // Verify the game session token
  let gamePayload: ReturnType<typeof verifyGameToken>;
  try {
    gamePayload = verifyGameToken(gameToken);
  } catch {
    res.status(400).json({ code: 'INVALID_GAME_TOKEN', message: 'Invalid or expired game session token' });
    return;
  }

  if (gamePayload.sub !== userId) {
    res.status(403).json({ code: 'GAME_TOKEN_MISMATCH', message: 'Game token does not match authenticated user' });
    return;
  }

  // Score plausibility check — skipped in test mode to allow fast integration tests
  if (process.env.NODE_ENV !== 'test') {
    const elapsedSeconds = Date.now() / 1000 - gamePayload.iat;
    const MINIMUM_GAME_SECONDS = 10;
    const MAX_POINTS_PER_SECOND = 500; // generous: ~30k/min, impossible in practice
    if (elapsedSeconds < MINIMUM_GAME_SECONDS) {
      res.status(400).json({ code: 'GAME_TOO_SHORT', message: 'Game session is too short' });
      return;
    }
    if (score > elapsedSeconds * MAX_POINTS_PER_SECOND) {
      res.status(400).json({ code: 'SCORE_IMPLAUSIBLE', message: 'Score is not plausible for game duration' });
      return;
    }
  }

  try {
    await db.upsertStats(userId, { won, score, moves });
    res.json({ ok: true });
  } catch (err) {
    logger.error({ err }, 'POST /stats/game-end error');
    res.status(500).json({ code: 'INTERNAL_ERROR', message: 'An unexpected error occurred' });
  }
});

export default router;
