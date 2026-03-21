# Post-Release Backlog

All critical and high severity issues have been resolved in commit `fd413c4`.
The items below are the remaining medium and low priority improvements, grouped by theme.

---

## Medium Priority — Next Sprint

### Security

**#21 · Rate-limit `/api/v1/me` and `/api/v1/stats`**
Add `express-rate-limit` middleware (~60 req/min/IP) to these routes in `server/src/app.ts`.
`POST /stats/game-end` writes to the DB on every call and is currently unbounded.

**#34 · Harden guest account creation**
In `server/src/routes/auth.ts` `POST /guest`:
- Replace 4-digit suffix (only 9,000 values) with 8-char alphanumeric random string
- Add retry loop on username collision
- Add a dedicated rate limiter (e.g. 3/hour/IP) separate from the shared auth limiter

**#35 · Enforce password complexity and bcrypt 72-byte max**
In `server/src/validate.ts` `registerSchema` / `upgradeGuestSchema`:
- Add `.max(72)` — bcrypt silently truncates beyond 72 bytes
- Require at least one lowercase letter, one uppercase letter, one digit

**#37 · Restrict `avatarUrl` to HTTPS URLs**
In `server/src/validate.ts` `patchMeSchema`, add
`.regex(/^https:\/\//, 'avatarUrl must use HTTPS').max(2048)`
to block `javascript:` URIs, `file://` paths, and SSRF vectors.

---

### Infrastructure

**#39 · Structured JSON logging with pino**
Replace all `console.error`/`console.log` in server routes and `ws/server.ts` with a
`pino` logger (`server/src/logger.ts`). JSON output enables log aggregation in production
(CloudWatch, Datadog, ELK). Add `pino` to `server/package.json`.

**#38 · Clean up abandoned `waiting` rooms**
`server/src/ws/RoomManager.ts` `cleanupStaleRooms()` only removes `finished` rooms.
Add cleanup for `waiting` rooms older than 1 hour — abandoned when the host disconnects
without the WS close handler firing. Add a `STALE_WAITING_ROOM_TTL_MS` constant.

---

### Frontend

**#33 · Prevent keyboard game moves when a modal is open**
`src/hooks/useGame.ts` global keydown listener fires arrow/WASD moves even while
LobbyModal, AuthModal, or PostGameModal are open. Add an `isModalOpen` flag passed
from `Game.tsx` to gate the move handler.

**#22 · AuthModal — ARIA tab pattern, inline validation, password hint**
Three improvements to `src/components/AuthModal.tsx`:
1. Add `aria-controls`/`id` linkage and `role="tabpanel"` to complete the ARIA tab pattern
2. Client-side inline validation (empty fields, password < 8 chars) before submission
3. Show password requirements below the field on the Register tab

**#23 · PostGameModal backdrop/Escape should not leave room**
In `src/components/PostGameModal.tsx`, backdrop click and Escape currently call `onLeave`
(permanently leaves the room). Change them to call a softer `onClose` that only hides the
modal. Only the explicit "Leave" button should call `onLeave`.

**#28 · User-friendly room error messages with auto-dismiss**
In `src/components/LobbyModal.tsx`, map known `room:error` codes to friendly strings
(e.g. `JOIN_FAILED` → "This room is full — try creating a new one.").
Auto-dismiss the banner after 5 seconds or on the next user action.

**#24 · Fix color-only status indicators**
Connection dot and player ready dot in `src/components/LobbyModal.tsx` use color as
the sole differentiator (fails WCAG 1.4.1). Add a secondary visual: checkmark (✓) for
ready, pulsing ring for connecting, text label alongside each dot.

**#25 · WebSocket reconnection attempt limit**
`src/hooks/useMultiplayerGame.ts` retries forever for all non-4001 errors.
Add `MAX_RECONNECT_ATTEMPTS = 10`. After exceeding it, dispatch `SET_ERROR` with
"Connection lost. Please refresh the page." and stop retrying.

---

## Low Priority — Backlog

### Security / Auth

**#40 · Reduce JWT token expiry from 7d to 2h**
In `server/src/jwt.ts`, change regular-user expiry from `'7d'` to `'2h'`.
Guest tokens are already 24h. Longer term: implement httpOnly cookie refresh tokens.

---

### Type Safety

**#26 · Align `GameRoom` `id`/`roomId` between client and server**
Server `GameRoom` uses `roomId`; client uses `id`, requiring an unsafe cast in
`src/hooks/useMultiplayerGame.ts:192`. Fix:
1. Update `server/src/types.ts` `GameRoom` to use `id`
2. Update `server/src/ws/RoomManager.ts` to populate `id`
3. Remove the manual normalization and `as unknown as {roomId:string}` cast from the hook

---

### Frontend Polish

**#36 · Consistent score formatting in MultiplayerPanel**
`src/components/MultiplayerPanel.tsx` lines 27 and 60 render raw numbers.
Apply `.toLocaleString()` to match `ScoreBox` formatting everywhere else.

**#27 · UserBadge loading skeleton**
`src/components/UserBadge.tsx` returns `null` during auth load, causing layout shift (CLS).
Return a same-size placeholder to hold the space until auth resolves.

**#29 · Tile overflow protection for large values (16384+)**
`src/components/Tile.module.css` `.tileLarge` does not handle 5-digit values.
Add a `.tileHuge` class (or dynamic font-size) and `overflow: hidden` for safety.

**#32 · Score-delta animation (+N popup on merge)**
Add a brief "+N" floating animation on score increase (classic 2048 UX).
Track previous score in `ScoreBox` or `Game.tsx`; render a CSS keyframe element
that fades upward and disappears.

**#30 · Modal z-index stacking order**
All 5 modal backdrops use `z-index: 100`. Establish a scale to prevent unpredictable
layering if two render simultaneously:
`LeaderboardPopup=100, LobbyModal=110, AuthModal=110, PostGameModal=120, ProfilePanel=120`

**#31 · Remove dead `App.css` Vite scaffold file**
`src/App.css` contains Vite template styles (`.counter`, `.hero`, `#center`, etc.)
that are not imported by anything. Verify no imports, then delete.
