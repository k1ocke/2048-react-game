/**
 * JWT revocation list.
 *
 * In-memory Map (jti → expiry ms) is the fast-path for every token verification.
 * PostgreSQL `revoked_tokens` table is the durable store that survives restarts.
 *
 * Write path  : synchronous cache write + async DB write (fire-and-forget).
 * Read path   : synchronous cache lookup only (loaded from DB at startup).
 * Startup     : initBlocklist() loads all unexpired rows into the cache.
 */

import { pool } from './db';
import { logger } from './logger';

const cache = new Map<string, number>(); // jti → expiry ms

export const addToBlocklist = (jti: string, exp: number): void => {
  const expiryMs = exp * 1000; // exp is Unix seconds
  cache.set(jti, expiryMs);

  // Persist asynchronously — fire-and-forget; cache already protects this request
  pool
    .query(
      `INSERT INTO revoked_tokens (jti, expires_at)
       VALUES ($1, to_timestamp($2))
       ON CONFLICT (jti) DO NOTHING`,
      [jti, exp],
    )
    .catch((err: unknown) => logger.error({ err, jti }, 'Failed to persist revoked token'));
};

export const isBlocklisted = (jti: string): boolean => {
  const expiry = cache.get(jti);
  if (expiry === undefined) return false;
  if (Date.now() > expiry) {
    cache.delete(jti);
    return false;
  }
  return true;
};

/** Called once at startup to restore revoked tokens from the database into the cache. */
export const initBlocklist = async (): Promise<void> => {
  try {
    const { rows } = await pool.query<{ jti: string; expires_at: Date }>(
      `SELECT jti, expires_at FROM revoked_tokens WHERE expires_at > NOW()`,
    );
    for (const row of rows) {
      cache.set(row.jti, row.expires_at.getTime());
    }
    logger.info({ count: rows.length }, 'Blocklist restored from database');
  } catch (err) {
    logger.error({ err }, 'Failed to restore blocklist from database — revocations from before this restart will not be enforced until tokens expire naturally');
  }
};

// Purge expired entries from cache and DB every 10 minutes
setInterval(() => {
  const now = Date.now();
  for (const [jti, expiry] of cache) {
    if (now > expiry) cache.delete(jti);
  }
  pool
    .query(`DELETE FROM revoked_tokens WHERE expires_at <= NOW()`)
    .catch((err: unknown) => logger.error({ err }, 'Failed to clean up expired revoked tokens'));
}, 10 * 60 * 1000).unref();
