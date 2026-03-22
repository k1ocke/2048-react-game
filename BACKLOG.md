# Security Backlog

OWASP vulnerability assessment conducted 2026-03-22. Findings listed by severity.

---

## HIGH

### HIGH-1 — Weak PRNG for Room IDs and Guest Suffixes ✅ FIXED
**OWASP**: A02 Cryptographic Failures | **Files**: `server/src/ws/RoomManager.ts`, `server/src/routes/auth.ts`
`Math.random()` generates multiplayer room IDs (6-char, ~2.18B possibilities). An attacker who
observes a few room IDs can predict the PRNG state and join future rooms uninvited.
**Fix**: Replace with `crypto.randomBytes()`.

### HIGH-2 — JWT Revocation Blocklist Not Persistent ✅ FIXED
**OWASP**: A07 Identification and Authentication Failures | **File**: `server/src/blocklist.ts`
Blocklist stored in process memory; lost on restart or across multiple instances. A revoked
token becomes valid again after a crash or deploy (up to 2h user / 24h guest).
**Fix**: Persist blocklist in PostgreSQL `revoked_tokens` table; load into in-memory cache on
startup. Writes are synchronous to cache + async to DB; reads are cache-first.

### HIGH-3 — No CSRF Protection on State-Changing Endpoints ✅ FIXED
**OWASP**: A01 Broken Access Control | **Files**: `server/src/app.ts`, `server/src/middleware/csrfProtect.ts`
`SameSite=Lax` does not protect against requests from a compromised subdomain. No custom-header
check exists on `POST /logout`, `POST /stats/game-end`, `PATCH /me`, `POST /upgrade`.
**Fix**: Require `X-Requested-With: fetch` header on all state-changing routes; add header in
`apiFetch` on the client.

---

## MEDIUM

### MED-1 — JWT_SECRET Minimum Entropy Not Enforced ✅ FIXED
**OWASP**: A02 Cryptographic Failures | **File**: `server/src/index.ts:11-13`
Startup rejects missing secret and warns on the known default, but accepts secrets shorter than
32 characters. An operator could deploy with `JWT_SECRET=abc`.
**Fix**: `process.exit(1)` if `JWT_SECRET.length < 32`.

### MED-2 — `password_hash` Selected in Every User Query ✅ FIXED
**OWASP**: A04 Insecure Design | **File**: `server/src/db.ts:20-26`
`USER_SELECT` includes `u.password_hash` in all queries, including `GET /me` and leaderboard
lookups. A future serialisation bug or accidental logging could expose bcrypt hashes.
**Fix**: Split into `USER_SELECT_AUTH` (includes hash, for login only) and `USER_SELECT_PROFILE`
(excludes hash, for all other queries).

### MED-3 — No Per-Account Login Lockout ✅ FIXED
**OWASP**: A07 Identification and Authentication Failures | **File**: `server/src/routes/auth.ts:72-98`
The IP-based rate limiter (10 attempts/15 min/IP) is trivially bypassed by rotating IPs.
A botnet can make unlimited guesses against a specific account.
**Fix**: Track failed attempts per username in the database; lock account after N failures.

### MED-4 — Single-Player Scores Are Client-Reported and Unverified ✅ FIXED
**OWASP**: A04 Insecure Design | **File**: `server/src/routes/stats.ts`
`POST /api/v1/stats/game-end` accepts `{won, score, moves}` directly from the client, validated
only up to a maximum of 500,000. Any authenticated user can claim a perfect game.
Note: Multiplayer final rankings already use server-authoritative scores.
**Fix**: Server-side move replay using a signed game-session token, or a signed proof-of-play
token issued at game start and redeemed on completion.

### MED-5 — No Rate Limiting on WebSocket Connection Establishment ✅ FIXED
**OWASP**: A05 Security Misconfiguration | **File**: `server/src/ws/server.ts:39-58`
No limit on simultaneous WebSocket connections per IP. An attacker can exhaust file descriptors
and server memory by opening thousands of connections.
**Fix**: Track active connections per IP in `verifyClient`; reject new connections above a
threshold (e.g. 20 concurrent per IP).

### MED-6 — Database SSL Not Enforced in Production ✅ FIXED
**OWASP**: A02 Cryptographic Failures | **File**: `server/src/db.ts:5-10`
`Pool` is created from `DATABASE_URL` with no `ssl` option. In a cloud deployment with DB on a
separate host, all query data (including password hashes) transits the network in plaintext.
**Fix**: `ssl: { rejectUnauthorized: true }` when `NODE_ENV === 'production'`.

### MED-7 — No Security Event Logging ✅ FIXED
**OWASP**: A09 Security Logging and Monitoring Failures | **File**: `server/src/routes/auth.ts`
Failed logins, successful logins, logouts, registrations, and upgrades are not logged. Only
unexpected 500 errors reach the logger, making brute-force detection impossible.
**Fix**: `logger.warn({username, ip, event:'login_failed'})` on failed auth;
`logger.info({userId, event:'login_success'})` on success; log all auth lifecycle events.

---

## LOW

### LOW-1 — `frame-ancestors` in CSP Meta Tag Is Ignored by Browsers
**OWASP**: A05 Security Misconfiguration | **File**: `index.html:7`
The CSP spec requires browsers to ignore `frame-ancestors` in `<meta>` tags — only HTTP headers
enforce it. Helmet's `X-Frame-Options: SAMEORIGIN` provides a partial fallback but
`frame-ancestors 'none'` is not enforced.
**Fix**: Move CSP to a Helmet HTTP header directive where `frame-ancestors` is honoured.

### LOW-2 — Cookie `secure` Flag Tied Only to `NODE_ENV=production`
**OWASP**: A02 Cryptographic Failures | **File**: `server/src/routes/auth.ts:28`
A staging environment with `NODE_ENV=staging` over HTTPS would issue cookies without the
`secure` flag.
**Fix**: `secure: process.env.COOKIE_SECURE === 'true' || process.env.NODE_ENV === 'production'`

### LOW-3 — `avatarUrl` Allows Stored Tracking Pixels
**OWASP**: A10 Server-Side Request Forgery (partial) | **File**: `server/src/validate.ts:31-36`
Any HTTPS URL is accepted as an avatar URL and served to all clients. An attacker can use it
as a tracking pixel to harvest other users' IPs.
**Fix**: Restrict to a whitelist of trusted image CDNs, or proxy images server-side.

### LOW-4 — Missing `object-src` and `base-uri` CSP Directives
**OWASP**: A05 Security Misconfiguration | **File**: `index.html:7`
The CSP lacks `object-src 'none'` (blocks plugins) and `base-uri 'self'` (prevents `<base>`
tag injection).
**Fix**: Add both directives to the CSP.

### LOW-5 — `style-src 'unsafe-inline'` in CSP
**OWASP**: A05 Security Misconfiguration | **File**: `index.html:7`
Inline styles are allowed, enabling CSS-based data exfiltration if an attacker achieves HTML
injection. React's JSX escaping makes exploitation low-probability but not impossible.
**Fix**: Replace with CSS nonces at build time, or document as accepted risk.

---

## Already Fixed (Prior Sessions)

| ID | Finding | Commit |
|----|---------|--------|
| CRIT-1 | Client-authoritative game scores | `fe2d9c1` |
| CRIT-2 | JWT secret committed in git history | `fe2d9c1` |
| PREV-HIGH-1 | JWT stored in localStorage | `ec9c112` |
| PREV-HIGH-2 | No server-side logout / token revocation | `ec9c112` |
| PREV-HIGH-3 | No Content Security Policy | `ec9c112` |
