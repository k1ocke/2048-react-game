/** In-memory JWT revocation list keyed by jti → expiry timestamp (ms). */
const blocklist = new Map<string, number>();

export const addToBlocklist = (jti: string, exp: number): void => {
  blocklist.set(jti, exp * 1000); // exp is seconds; store as ms
};

export const isBlocklisted = (jti: string): boolean => {
  const expiry = blocklist.get(jti);
  if (expiry === undefined) return false;
  if (Date.now() > expiry) {
    blocklist.delete(jti);
    return false;
  }
  return true;
};

// Purge expired entries every 10 minutes so the map doesn't grow unboundedly
setInterval(() => {
  const now = Date.now();
  for (const [jti, expiry] of blocklist) {
    if (now > expiry) blocklist.delete(jti);
  }
}, 10 * 60 * 1000).unref();
