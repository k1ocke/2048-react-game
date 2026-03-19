# Plan: Score History Sidebar

**Created**: 2026-03-19 | **Effort**: ~4.5h | **Complexity**: Medium
**Status**: 📋 DRAFT — awaiting user approval

---

## 1. Objective

**Goal**: Add a persistent sidebar panel that shows the player's recent game results in chronological order.

**Why**: The existing leaderboard popup shows only top-10 scores sorted by value. Players have no way to review their recent game history or track improvement over time.

**Success criteria**:
- Sidebar shows last 20 games (score + win/loss outcome + date), newest first
- Sidebar is always visible alongside the board on desktop; collapses gracefully on mobile
- New game results auto-append to the history when a game ends
- Jest unit tests pass for new hook and component
- All 29 existing Playwright E2E tests continue to pass

---

## 2. Approach

**Pattern to follow** (from EPCC_EXPLORE.md):
- New hook → `useScoreHistory` mirroring `useLeaderboard` pattern (localStorage + `useState`)
- New component → `ScoreHistorySidebar` mirroring `LeaderboardPopup` structure (JSDoc props, CSS Module co-located)
- Export from `src/components/index.ts` barrel
- `import type` for all type-only imports (verbatimModuleSyntax constraint)
- Error handling in async functions per CLAUDE.md

**Data model**: New `ScoreHistoryEntry` interface in `src/types/game.ts`:
```ts
interface ScoreHistoryEntry {
  score: number;
  status: 'won' | 'lost';
  date: string;
}
```
Stored in localStorage under key `'2048-score-history'`, capped at 20 entries (const `MAX_HISTORY = 20`).

**Layout change** — `Game.tsx` container becomes flex-row on ≥560px:
```
┌─────────────────────┬──────────────────┐
│  header / controls  │                  │
│  ┌───────────────┐  │  Score History   │
│  │   4×4 Board   │  │  ─────────────── │
│  └───────────────┘  │  #1  4,096  Won  │
│  [Leaderboard btn]  │  #2    512  Lost │
└─────────────────────┴──────────────────┘
```
On screens <560px: sidebar stacks below the board.

**Integration points**:
- `Game.tsx` — add `useScoreHistory`, pass `addHistoryEntry` to game-end effect (alongside existing `addEntry` for leaderboard)
- `useGame.ts` — no changes needed
- `useLeaderboard.ts` — no changes needed (separate concerns)

**Trade-off — replace vs coexist with leaderboard**:
- Chosen: coexist. The leaderboard (top scores) and history (chronological) answer different questions. Removing the leaderboard button would be a regression.

---

## 3. Tasks

### Phase 1: Types + Hook (~1h)

1. **Add `ScoreHistoryEntry` type** (15min)
   - Append to `src/types/game.ts`
   - Deps: None | Risk: Low

2. **Create `useScoreHistory` hook** (45min)
   - `src/hooks/useScoreHistory.ts`
   - localStorage key `'2048-score-history'`, max 20, newest-first
   - `addHistoryEntry(score, status)` function
   - Error handling in localStorage read/write (try/catch)
   - Deps: Type added | Risk: Low

### Phase 2: Component (~1.5h)

3. **Create `ScoreHistorySidebar` component** (1h)
   - `src/components/ScoreHistorySidebar.tsx` + `ScoreHistorySidebar.module.css`
   - Props: `{ entries: ScoreHistoryEntry[] }` (JSDoc)
   - Renders ordered list; empty state message; win/lost badge per row
   - Deps: Hook created | Risk: Low

4. **Export from barrel** (5min)
   - Add to `src/components/index.ts`
   - Deps: Component created | Risk: Low

### Phase 3: Layout + Wiring (~1h)

5. **Update `Game.tsx`** (30min)
   - Import `useScoreHistory` and `ScoreHistorySidebar`
   - Call `addHistoryEntry(state.score, state.status)` in game-end `useEffect` (alongside existing `addEntry`)
   - Render `<ScoreHistorySidebar>` in JSX

6. **Update `Game.module.css`** (30min)
   - Change `.container` to flex-row with gap on ≥560px
   - Add `.gameArea` wrapper for existing left-column content
   - Mobile: flex-column (sidebar below)

### Phase 4: Tests (~1h)

7. **Unit test `useScoreHistory`** (30min)
   - `src/hooks/useScoreHistory.test.ts` (Jest)
   - Test: adds entry, caps at 20, newest-first order, skips score=0, persists to localStorage

8. **Unit test `ScoreHistorySidebar`** (30min)
   - `src/components/ScoreHistorySidebar.test.tsx` (React Testing Library)
   - Test: renders entries, empty state, win/lost labels, score formatting

**Total**: ~4.5h

---

## 4. Quality Strategy

**Tests**:
- Unit: `useScoreHistory.test.ts` — entry creation, ordering, cap enforcement, localStorage persistence, score=0 guard
- Unit: `ScoreHistorySidebar.test.tsx` — rendering, empty state, entry display
- E2E: Verify sidebar visible after game ends and contains the correct score (extend `tests/game.spec.ts`)
- Existing 29 E2E tests must continue passing

**Quality gates** (from EPCC_EXPLORE.md):
- `npm run typecheck` — zero errors
- `npm run test` — all Jest tests pass
- `npx playwright test` — all 29 + new tests pass
- `npm run build` — clean output

---

## 5. Risks

| Risk | Impact | Mitigation |
|------|--------|------------|
| Layout reflow breaks existing Playwright position checks (tiles use `top`/`left` px) | M | Sidebar is outside the board wrapper; tile positions unaffected |
| localStorage key collision with existing data | L | New key `'2048-score-history'` distinct from `'2048-leaderboard'` and `'2048-best'` |
| Mobile layout creates scrollable mess | M | CSS `flex-wrap` + `min-width: 0` on sidebar; test at 375px viewport |

**Assumptions** (could invalidate plan if wrong):
- Sidebar is always visible (not toggleable) — if user wants a toggle, adds ~1h
- No pagination needed for 20-entry cap — if more is needed, adds complexity
- Score history and leaderboard are separate features — if user wants to replace leaderboard, plan changes

**Out of scope**:
- Replacing or modifying the existing leaderboard popup
- Exporting/sharing score history
- Score history graphs or charts
