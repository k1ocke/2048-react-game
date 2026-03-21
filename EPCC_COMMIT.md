# Commit: Score History Sidebar

**SHA**: 9467d2b | **Branch**: main | **Status**: Committed (local)

## 1. Summary (49 files, +2,100 lines)

Added score history sidebar that tracks the last 20 game results (score + win/loss + date) and displays them in an always-visible panel beside the game board. This commit also includes the full game implementation: React 2048 with CSS-animated tiles, leaderboard popup, 32 Jest unit tests, and 29 Playwright E2E tests.

**Key files**:
- `src/hooks/useScoreHistory.ts` — localStorage-backed history hook, newest-first, 20-entry cap
- `src/components/ScoreHistorySidebar.tsx` — aside panel with Win/Loss badges and rank numbers
- `src/components/Game.tsx` — wires `addHistoryEntry` to game-end effect alongside leaderboard
- `src/components/Game.module.css` — flex-row container with flex-wrap for responsive sidebar layout
- `tests/game.spec.ts` — 29 Playwright tests using `FORCE_STATE` injection for deterministic board setup
- `src/utils/gameLogic.ts` — pure tile slide/merge/win/loss logic

**Commit**: `feat: add 2048 game with leaderboard, score history, and full test suite`

## 2. Validation (Tests 100% | Quality Clean | Security N/A)

**Tests**: 32/32 Jest passing (8 hook, 8 component, 16 existing) + 29/29 Playwright E2E passing
**Quality**: `tsc --noEmit` clean; ESLint/Prettier clean; build outputs 199KB JS + 6KB CSS
**Security**: No external auth, no user-supplied eval, no sensitive data beyond localStorage scores

## 3. Changes Detail

**Behavioral changes**:
- Score history recorded on every game end (win or loss), persisted to `localStorage['2048-score-history']`
- Sidebar visible at all times alongside the board; wraps below board on narrow viewports
- Playwright ambiguous selector for leaderboard score fixed by scoping to `dialog.getByText(...)`

**Breaking changes**: None

## 4. Completion

**PR**: Local commit only
**Next**: Push to remote when ready / create PR for review
