import { Router } from 'express';
import bcrypt from 'bcryptjs';
import rateLimit from 'express-rate-limit';
import { db } from '../db';
import { signToken } from '../jwt';
import { registerSchema, loginSchema } from '../validate';
import { requireAuth, requireGuest } from '../middleware/requireAuth';
import { toUserProfile, toGuestProfile } from '../types';
import { logger } from '../logger';

const BCRYPT_ROUNDS = 12;
const DUMMY_HASH = bcrypt.hashSync('dummy-password-never-used', 12);

const GUEST_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
const GUEST_SUFFIX_LENGTH = 8;
const generateGuestSuffix = (): string => {
  let s = '';
  for (let i = 0; i < GUEST_SUFFIX_LENGTH; i++) {
    s += GUEST_CHARS[Math.floor(Math.random() * GUEST_CHARS.length)];
  }
  return s;
};

const guestLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 3,
  skip: () => process.env.NODE_ENV === 'test',
  standardHeaders: true,
  legacyHeaders: false,
  message: { code: 'RATE_LIMITED', message: 'Too many guest accounts created, please try again later' },
});

const router = Router();

// POST /auth/register
router.post('/register', async (req, res) => {
  const parsed = registerSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(422).json({ code: 'VALIDATION_ERROR', message: parsed.error.issues[0].message });
    return;
  }
  const { username, password } = parsed.data;

  try {
    if (await db.isUsernameTaken(username)) {
      res.status(409).json({ code: 'USERNAME_TAKEN', message: 'That username is already taken' });
      return;
    }
    const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
    const user = await db.createUser(username, passwordHash, false);
    const profile = toUserProfile(user);
    const token = signToken({ sub: user.id, username: user.username });
    res.status(201).json({ token, user: profile });
  } catch (err) {
    logger.error({ err }, 'register error');
    res.status(500).json({ code: 'INTERNAL_ERROR', message: 'An unexpected error occurred' });
  }
});

// POST /auth/login
router.post('/login', async (req, res) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    // Return 401 to avoid leaking which field failed (enumeration protection)
    res.status(401).json({ code: 'INVALID_CREDENTIALS', message: 'Invalid username or password' });
    return;
  }
  const { username, password } = parsed.data;

  try {
    const user = await db.findByUsername(username);
    // Run bcrypt even on not-found to prevent timing attacks
    const hash = user?.password_hash ?? DUMMY_HASH;
    const match = await bcrypt.compare(password, hash);

    if (!user || !match || user.is_guest) {
      res.status(401).json({ code: 'INVALID_CREDENTIALS', message: 'Invalid username or password' });
      return;
    }
    const profile = toUserProfile(user);
    const token = signToken({ sub: user.id, username: user.username });
    res.status(200).json({ token, user: profile });
  } catch (err) {
    logger.error({ err }, 'login error');
    res.status(500).json({ code: 'INTERNAL_ERROR', message: 'An unexpected error occurred' });
  }
});

// POST /auth/guest
router.post('/guest', guestLimiter, async (_req, res) => {
  try {
    const passwordHash = await bcrypt.hash(crypto.randomUUID(), BCRYPT_ROUNDS);
    let user;
    // Retry loop to handle username collisions
    for (let attempt = 0; attempt < 10; attempt++) {
      const username = `Guest-${generateGuestSuffix()}`;
      if (await db.isUsernameTaken(username)) continue;
      user = await db.createUser(username, passwordHash, true);
      break;
    }
    if (!user) {
      res.status(500).json({ code: 'INTERNAL_ERROR', message: 'Could not generate unique guest username' });
      return;
    }
    const profile = toGuestProfile(user);
    const token = signToken({ sub: user.id, username: user.username, isGuest: true }, '24h');
    res.status(201).json({ token, user: profile });
  } catch (err) {
    logger.error({ err }, 'guest error');
    res.status(500).json({ code: 'INTERNAL_ERROR', message: 'An unexpected error occurred' });
  }
});

// POST /auth/upgrade  — guest → full account
router.post('/upgrade', requireAuth, requireGuest, async (req, res) => {
  const parsed = registerSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(422).json({ code: 'VALIDATION_ERROR', message: parsed.error.issues[0].message });
    return;
  }
  const { username, password } = parsed.data;
  const userId = req.user!.sub;

  try {
    if (await db.isUsernameTaken(username)) {
      res.status(409).json({ code: 'USERNAME_TAKEN', message: 'That username is already taken' });
      return;
    }
    const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
    const user = await db.upgradeGuest(userId, username, passwordHash);
    if (!user) {
      res.status(404).json({ code: 'NOT_FOUND', message: 'User not found' });
      return;
    }
    const profile = toUserProfile(user);
    const token = signToken({ sub: user.id, username: user.username });
    res.status(200).json({ token, user: profile });
  } catch (err) {
    logger.error({ err }, 'upgrade error');
    res.status(500).json({ code: 'INTERNAL_ERROR', message: 'An unexpected error occurred' });
  }
});

export default router;
