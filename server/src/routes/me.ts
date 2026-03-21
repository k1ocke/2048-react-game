import { Router } from 'express';
import { db } from '../db';
import { requireAuth } from '../middleware/requireAuth';
import { patchMeSchema } from '../validate';
import { toUserProfile } from '../types';

const router = Router();

// GET /me
router.get('/', requireAuth, async (req, res) => {
  try {
    const user = await db.findById(req.user!.sub);
    if (!user) {
      res.status(404).json({ code: 'NOT_FOUND', message: 'User not found' });
      return;
    }
    res.json(toUserProfile(user));
  } catch (err) {
    console.error('GET /me error', err);
    res.status(500).json({ code: 'INTERNAL_ERROR', message: 'An unexpected error occurred' });
  }
});

// PATCH /me
router.patch('/', requireAuth, async (req, res) => {
  const parsed = patchMeSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(422).json({ code: 'VALIDATION_ERROR', message: parsed.error.issues[0].message });
    return;
  }
  const { username, avatarUrl } = parsed.data;
  const userId = req.user!.sub;

  try {
    if (username !== undefined) {
      const current = await db.findById(userId);
      if (current?.username !== username && await db.isUsernameTaken(username)) {
        res.status(409).json({ code: 'USERNAME_TAKEN', message: 'That username is already taken' });
        return;
      }
    }
    const user = await db.updateUser(userId, { username, avatarUrl });
    if (!user) {
      res.status(404).json({ code: 'NOT_FOUND', message: 'User not found' });
      return;
    }
    res.json(toUserProfile(user));
  } catch (err) {
    console.error('PATCH /me error', err);
    res.status(500).json({ code: 'INTERNAL_ERROR', message: 'An unexpected error occurred' });
  }
});

export default router;
