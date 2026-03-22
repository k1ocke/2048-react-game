# Security Backlog

OWASP vulnerability assessment conducted 2026-03-22. All findings resolved.

## Accepted Risk

### LOW-5 — `style-src 'unsafe-inline'` in CSP
**OWASP**: A05 Security Misconfiguration | **File**: `index.html`
`'unsafe-inline'` is retained. CSS nonce integration requires Vite build plugin changes not
warranted given React's XSS mitigations. Re-evaluate if CSS-in-JS or dynamic style injection
is added.

---

## Resolved Findings

| ID | Severity | Finding | Commit |
|----|----------|---------|--------|
| CRIT-1 | Critical | Client-authoritative game scores | `fe2d9c1` |
| CRIT-2 | Critical | JWT secret committed in git history | `fe2d9c1` |
| PREV-HIGH-1 | High | JWT stored in localStorage | `ec9c112` |
| PREV-HIGH-2 | High | No server-side logout / token revocation | `ec9c112` |
| PREV-HIGH-3 | High | No Content Security Policy | `ec9c112` |
| HIGH-1 | High | Weak PRNG for room IDs and guest suffixes | `bf1747c` |
| HIGH-2 | High | JWT revocation blocklist not persistent across restarts | `bf1747c` |
| HIGH-3 | High | No CSRF protection on state-changing endpoints | `bf1747c` |
| MED-1 | Medium | JWT_SECRET minimum entropy not enforced | `435a9b8` |
| MED-2 | Medium | `password_hash` selected in every user query | `435a9b8` |
| MED-3 | Medium | No per-account login lockout | `435a9b8` |
| MED-4 | Medium | Single-player scores client-reported and unverified | `435a9b8` |
| MED-5 | Medium | No rate limiting on WebSocket connection establishment | `435a9b8` |
| MED-6 | Medium | Database SSL not enforced in production | `435a9b8` |
| MED-7 | Medium | No security event logging | `435a9b8` |
| LOW-1 | Low | `frame-ancestors` in CSP meta tag ignored by browsers | `0c4e7d2` |
| LOW-2 | Low | Cookie `secure` flag tied only to `NODE_ENV=production` | `0c4e7d2` |
| LOW-3 | Low | `avatarUrl` allows stored tracking pixels | `0c4e7d2` |
| LOW-4 | Low | Missing `object-src` and `base-uri` CSP directives | `0c4e7d2` |
