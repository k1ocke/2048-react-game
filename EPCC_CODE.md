# Implementation: Score History Sidebar

**Mode**: Default | **Date**: 2026-03-19 | **Status**: ✅ Complete

## 1. Changes (8 files, +198 lines)

**Created**:
- `src/types/game.ts` — added `ScoreHistoryEntry { score, status, date }` interface
- `src/hooks/useScoreHistory.ts` — localStorage-backed hook, newest-first, 20-entry cap
- `src/components/ScoreHistorySidebar.tsx` — always-visible sidebar panel with JSDoc props
- `src/components/ScoreHistorySidebar.module.css` — grid-layout entries, Win/Loss badges
- `src/hooks/useScoreHistory.test.ts` — 8 Jest unit tests
- `src/components/ScoreHistorySidebar.test.tsx` — 8 RTL component tests

**Modified**:
- `src/components/Game.tsx` — added `useScoreHistory`, wired `addHistoryEntry` to game-end effect, renders `<ScoreHistorySidebar>`
- `src/components/Game.module.css` — container changed to `flex-row` with `flex-wrap` for responsive layout
- `src/components/index.ts` — added `ScoreHistorySidebar` barrel export
- `jest.config.ts` — added `testPathIgnorePatterns` to exclude `tests/` (Playwright) from Jest
- `tests/game.spec.ts` — scoped leaderboard score check to dialog (ambiguous selector fix from sidebar appearing on page)

## 2. Quality (Tests 100% | Security N/A | Docs updated)

- **Jest**: 32/32 passing (8 new hook tests + 8 new component tests + 16 existing)
- **Playwright**: 29/29 passing (all existing tests unaffected by layout change)
- **Typecheck**: `tsc --noEmit` — zero errors
- **Build**: `npm run build` clean

## 3. Decisions

**Newest-first ordering**: `[newEntry, ...prev].slice(0, 20)` — prepend then cap, O(1) effective insert vs sort. Matches user expectation for "history" (most recent at top).

**Separate localStorage key**: `'2048-score-history'` distinct from `'2048-leaderboard'` — keeps concerns separate, no migration risk.

**`flex-wrap` on container**: Sidebar wraps below board on narrow viewports without a media query breakpoint — simpler, content-driven reflow.

**Scoped Playwright selector**: After adding the sidebar, `page.getByText('9,999')` matched both the sidebar and the leaderboard dialog. Fixed by scoping to `dialog.getByText(...)`. The sidebar being present exposed a pre-existing fragile selector.

## 4. Handoff

**Run**: `/epcc-commit` when ready
**Blockers**: None
**TODOs**: None — all plan items complete
