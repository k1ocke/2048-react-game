import { z } from 'zod';

// Trusted origins for user avatar images. Prevents stored tracking pixels
// by ensuring avatar URLs only point to known image CDNs.
const AVATAR_URL_ALLOWLIST = [
  'https://secure.gravatar.com/',
  'https://avatars.githubusercontent.com/',
  'https://lh3.googleusercontent.com/',
  'https://api.dicebear.com/',
  'https://ui-avatars.com/',
];

export const registerSchema = z.object({
  username: z
    .string()
    .min(3, 'Username must be at least 3 characters')
    .max(20, 'Username must be at most 20 characters')
    .regex(/^[a-zA-Z0-9_]+$/, 'Username may only contain letters, numbers, and underscores'),
  password: z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .max(72, 'Password must be at most 72 characters')
    .regex(/[a-z]/, 'Password must contain at least one lowercase letter')
    .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
    .regex(/[0-9]/, 'Password must contain at least one digit'),
});

export const loginSchema = z.object({
  username: z.string().min(1, 'Username is required'),
  password: z.string().min(1, 'Password is required'),
});

export const patchMeSchema = z.object({
  username: z
    .string()
    .min(3)
    .max(20)
    .regex(/^[a-zA-Z0-9_]+$/)
    .optional(),
  avatarUrl: z
    .string()
    .url('avatarUrl must be a valid URL')
    .max(2048, 'avatarUrl must be at most 2048 characters')
    .regex(/^https:\/\//, 'avatarUrl must use HTTPS')
    .refine(
      (url) => AVATAR_URL_ALLOWLIST.some((prefix) => url.startsWith(prefix)),
      { message: 'avatarUrl must be from an allowed image host' },
    )
    .nullable()
    .optional(),
});

export const gameEndSchema = z.object({
  won: z.boolean(),
  score: z.number().int().min(0).max(500000),
  moves: z.number().int().min(0).max(100000),
  gameToken: z.string().min(1),
});
