# Exploration: 2048 React Game

**Date**: 2026-03-19 | **Scope**: Medium | **Status**: ✅ Complete

---

## 1. Foundation (What exists)

**Tech stack**: React 19, TypeScript 5.9 (strict), Vite 8, ESM-only (`"type": "module"`)
**Architecture**: React SPA — pure functional game logic + React hooks for state + CSS Modules for styling
**Entry point**: `src/main.tsx` → `<App />` → `<Game />` (single root component tree)

**Key directories**:
| Path | Purpose |
|------|---------|
| `src/types/game.ts` | Shared TS interfaces: `Tile`, `GameState`, `LeaderboardEntry`, `Direction` |
| `src/utils/gameLogic.ts` | Pure functions: `createInitialState`, `move`, `slideRow`, `checkLost` |
| `src/hooks/useGame.ts` | `useReducer`-based game state + keyboard input + dev test hook |
| `src/hooks/useLeaderboard.ts` | localStorage-backed top-10 leaderboard via `useState` |
| `src/components/` | All UI components (CSS Modules co-located) |
| `tests/` | Playwright E2E specs |
| `src/utils/*.test.ts` | Jest unit tests |
| `src/components/*.test.tsx` | Jest + React Testing Library component tests |

**CLAUDE.md requirements** (from `/workshop/CLAUDE.md`):
- TypeScript strict mode ✅
- Airbnb style + Prettier (lint: `npm run lint`)
- Arrow functions, destructured imports
- **Always include error handling in async functions**
- Typecheck after code changes (`npm run typecheck`)
- **Must write unit tests for new components and utilities**
- Update docs when adding features
- Dev server port 3000; allow `https://*.cloudfront.net/`

---

## 2. Patterns (How it's built)

### Game logic (pure functional)
- `slideRow(row[])` — filters zeros, merges equal adjacent pairs left-to-right (one merge per pair per move), pads back to original length
- `move(state, direction)` — builds 4×4 grid, normalizes to left-slide for all 4 directions via `reverse()`, rebuilds `Tile[]` from result, appends one random tile (90% chance value=2, 10% value=4), returns same reference if no movement (`!moved`)
- `checkLost` — true when board full AND no adjacent equal tiles remain

### State management
- `useGame`: `useReducer` with 3 actions: `MOVE | RESTART | FORCE_STATE`
  - `FORCE_STATE` exists **only for E2E testing** — sets arbitrary `GameState` directly
  - `window.__gameDispatch` exposed on `import.meta.env.DEV` for Playwright to call
- `useLeaderboard`: `useState` initialized from localStorage; `addEntry` keeps top 10 sorted desc

### Component tree
```
<Game>
  ├── <ScoreBox label="Score" />
  ├── <ScoreBox label="Best" />
  ├── <Board>
  │   ├── grid cells (background, 4×4 divs)
  │   ├── <Tile> × n  (absolute-positioned via top/left px)
  │   └── overlay div (win/lose, conditional)
  └── <LeaderboardPopup isOpen entries onClose />
```

### Tile positioning
- `top: row * 112px`, `left: col * 112px` (cell=100px + gap=12px)
- CSS transition: `top 0.1s ease, left 0.1s ease` for slide animation
- CSS animations: `@keyframes appear` (scale 0→1 for new tiles), `@keyframes pop` (scale bounce for merged tiles)
- **Critical**: `transform` is reserved for animations only; positioning uses `top`/`left` to avoid conflict

### CSS Modules pattern
- Every component has a co-located `ComponentName.module.css`
- Style object properties used as class names: `styles.tile`, `styles.tile2048`, etc.
- Test mock: `src/__mocks__/styleMock.ts` returns a `Proxy` mapping property names to strings

### Testing patterns
**Unit tests (Jest + ts-jest)**:
- File: `*.test.ts` or `*.test.tsx` alongside source
- Config: `jest.config.ts` → `tsconfig.test.json` (extends `tsconfig.app.json`, relaxes `verbatimModuleSyntax` and unused-locals rules)
- CSS modules mocked via `moduleNameMapper`
- localStorage manually mocked with `Object.defineProperty(globalThis, 'localStorage', ...)`
- Run: `node --experimental-vm-modules node_modules/.bin/jest`

**E2E tests (Playwright)**:
- File: `tests/game.spec.ts`
- Config: Chromium-only, serial (workers:1), reuses running dev server on port 3001
- State injection pattern: `page.evaluate(() => window.__gameDispatch({ type: 'FORCE_STATE', state }))` for deterministic scenarios
- Position verification: parse inline `style` attribute for `top: Xpx` / `left: Xpx` values
- Tile selection: `[aria-label^="Tile with value"]`

---

## 3. Constraints (What limits decisions)

**TypeScript**:
- `verbatimModuleSyntax: true` in app tsconfig — type-only imports MUST use `import type`
- `noUnusedLocals`, `noUnusedParameters`, `strict`, `erasableSyntaxOnly` all enabled
- Test tsconfig relaxes these constraints for test files

**Architecture constraints**:
- `nextId` is a module-level `let` counter in `gameLogic.ts` — persists across test runs; not resetable without module reload
- `FORCE_STATE` action bypasses all game logic — misuse could leave `merged`/`isNew` flags stale
- Leaderboard does NOT auto-reload from localStorage after external writes — `entries` state initialized once on mount

**Dev server**:
- Configured for port 3000 (`vite.config.ts`), but Playwright targets 3001 (port 3000 was occupied during setup)
- `webServer.reuseExistingServer: true` — Playwright attaches to running dev server

**Known gaps / tech debt**:
- `src/App.css` exists but is unused (Vite template leftover); `src/assets/` contains unused SVG/PNG
- No error boundaries anywhere in component tree
- `dialogRef` is created in `LeaderboardPopup` but never used (focus management incomplete)
- `useLeaderboard` entries don't sync across tabs (no `storage` event listener)
- Playwright `baseURL` is hardcoded to `localhost:3001` rather than dynamically matched to Vite's actual port

---

## 4. Reusability (What to leverage)

**When adding new features**:
- New game actions: add to `Action` union in `useGame.ts`, handle in `reducer`
- New localStorage persistence: follow `useLeaderboard` pattern (try/catch, typed parse)
- New modal/popup: follow `LeaderboardPopup` pattern (backdrop click, Escape key, `role="dialog"`)
- New display component: follow `ScoreBox` pattern (CSS Module co-located, typed props with JSDoc)

**Test setup for E2E**:
- Use `forceState(page, GameState)` helper to bypass randomness for deterministic tests
- Tile aria-labels and `top`/`left` inline styles are the reliable selectors

---

## 5. Handoff (What's next)

**For PLAN/CODE**:
- Must use `import type` for all type-only imports
- Must run `npm run typecheck && npm run test` after changes
- New components need: `.test.tsx` file + CSS Module + export in `src/components/index.ts`
- Async functions must include try/catch (CLAUDE.md requirement)
- Port 3000 is the intended dev port; the 3001 situation is a session artifact

**For COMMIT quality gates**:
- `npm run typecheck` must pass (zero errors)
- `npm run test` — 16 Jest unit tests must pass
- `npx playwright test` — 29 E2E tests must pass (requires dev server running)
- `npm run build` must produce clean output

**Search commands used during exploration**:
- `find /workshop/2048-react-game/src -type f | sort`
- `find /workshop/2048-react-game/tests -type f | sort`
- All source files read directly — codebase is small enough (~25 source files)
