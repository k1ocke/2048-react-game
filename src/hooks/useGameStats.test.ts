import { renderHook, act, waitFor } from '@testing-library/react';
import { useGameStats } from './useGameStats';
import type { GameState } from '../types/game';

// ── mocks ─────────────────────────────────────────────────────────────────────

const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: (key: string) => store[key] ?? null,
    setItem: (key: string, value: string) => { store[key] = value; },
    clear: () => { store = {}; },
  };
})();
Object.defineProperty(globalThis, 'localStorage', { value: localStorageMock });

// ── fixtures ──────────────────────────────────────────────────────────────────

const makeTile = (id: number, value: number) => ({ id, value, row: 0, col: 0, merged: false, isNew: false });

const playingState = (score = 0, moves = 0): GameState => ({
  tiles: [makeTile(1, 2), makeTile(2, 4)],
  score,
  bestScore: 0,
  status: 'playing',
  size: 4,
  moves,
  startTime: Date.now(),
});

const lostState = (score: number): GameState => ({
  ...playingState(score, 10),
  status: 'lost',
  tiles: [makeTile(1, 256)],
});

const wonState = (score: number): GameState => ({
  ...playingState(score, 20),
  status: 'won',
  tiles: [makeTile(1, 2048)],
});

// ── tests ─────────────────────────────────────────────────────────────────────

describe('useGameStats', () => {
  let addEntry: jest.Mock;
  let addHistoryEntry: jest.Mock;
  let refreshUser: jest.Mock;

  beforeEach(() => {
    addEntry = jest.fn();
    addHistoryEntry = jest.fn();
    refreshUser = jest.fn().mockResolvedValue(undefined);
    localStorageMock.clear();
    globalThis.fetch = jest.fn().mockResolvedValue({ ok: true }) as typeof fetch;
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('isNewRecord', () => {
    it('is false when score is 0', () => {
      const { result } = renderHook(() =>
        useGameStats(playingState(0), null, refreshUser, addEntry, addHistoryEntry),
      );
      expect(result.current.isNewRecord).toBe(false);
    });

    it('is false when score equals best at session start', () => {
      const state: GameState = { ...playingState(100), bestScore: 100 };
      const { result } = renderHook(() =>
        useGameStats(state, null, refreshUser, addEntry, addHistoryEntry),
      );
      expect(result.current.isNewRecord).toBe(false);
    });

    it('is true when score exceeds best at session start', () => {
      const state: GameState = { ...playingState(200), bestScore: 100 };
      const { result } = renderHook(() =>
        useGameStats(state, null, refreshUser, addEntry, addHistoryEntry),
      );
      expect(result.current.isNewRecord).toBe(true);
    });
  });

  describe('score saving on game end', () => {
    it('calls addEntry and addHistoryEntry when game is lost', async () => {
      const { rerender } = renderHook(
        ({ state }: { state: GameState }) =>
          useGameStats(state, null, refreshUser, addEntry, addHistoryEntry),
        { initialProps: { state: playingState(500) } },
      );

      act(() => {
        rerender({ state: lostState(500) });
      });

      await waitFor(() => {
        expect(addEntry).toHaveBeenCalledWith(500);
        expect(addHistoryEntry).toHaveBeenCalledWith(500, 'lost', expect.objectContaining({ moves: 10 }));
      });
    });

    it('calls addEntry and addHistoryEntry when game is won', async () => {
      const { rerender } = renderHook(
        ({ state }: { state: GameState }) =>
          useGameStats(state, null, refreshUser, addEntry, addHistoryEntry),
        { initialProps: { state: playingState(1000) } },
      );

      act(() => {
        rerender({ state: wonState(1000) });
      });

      await waitFor(() => {
        expect(addEntry).toHaveBeenCalledWith(1000);
        expect(addHistoryEntry).toHaveBeenCalledWith(1000, 'won', expect.any(Object));
      });
    });

    it('does not double-save if state stays in same non-playing status', async () => {
      const lost = lostState(200);
      const { rerender } = renderHook(
        ({ state }: { state: GameState }) =>
          useGameStats(state, null, refreshUser, addEntry, addHistoryEntry),
        { initialProps: { state: lost } },
      );

      await waitFor(() => expect(addEntry).toHaveBeenCalledTimes(1));

      act(() => { rerender({ state: { ...lost, score: 200 } }); });
      expect(addEntry).toHaveBeenCalledTimes(1);
    });

    it('saves again after a new game starts', async () => {
      const { rerender } = renderHook(
        ({ state }: { state: GameState }) =>
          useGameStats(state, null, refreshUser, addEntry, addHistoryEntry),
        { initialProps: { state: playingState(100) } },
      );

      act(() => { rerender({ state: lostState(100) }); });
      await waitFor(() => expect(addEntry).toHaveBeenCalledTimes(1));

      // New game resets the flag
      act(() => { rerender({ state: playingState(0) }); });
      act(() => { rerender({ state: lostState(200) }); });
      await waitFor(() => expect(addEntry).toHaveBeenCalledTimes(2));
    });
  });

  describe('server stats submission', () => {
    it('calls fetch when token exists and score > 0', async () => {
      const { rerender } = renderHook(
        ({ state }: { state: GameState }) =>
          useGameStats(state, 'tok123', refreshUser, addEntry, addHistoryEntry),
        { initialProps: { state: playingState(0) } },
      );

      act(() => { rerender({ state: lostState(400) }); });

      await waitFor(() => {
        expect(globalThis.fetch).toHaveBeenCalledWith(
          expect.stringContaining('/api/v1/stats/game-end'),
          expect.objectContaining({ method: 'POST' }),
        );
        expect(refreshUser).toHaveBeenCalled();
      });
    });

    it('does not call fetch when token is null', async () => {
      const { rerender } = renderHook(
        ({ state }: { state: GameState }) =>
          useGameStats(state, null, refreshUser, addEntry, addHistoryEntry),
        { initialProps: { state: playingState(0) } },
      );

      act(() => { rerender({ state: lostState(300) }); });

      await waitFor(() => expect(addEntry).toHaveBeenCalled());
      expect(globalThis.fetch).not.toHaveBeenCalled();
    });

    it('does not call fetch when score is 0', async () => {
      const { rerender } = renderHook(
        ({ state }: { state: GameState }) =>
          useGameStats(state, 'tok123', refreshUser, addEntry, addHistoryEntry),
        { initialProps: { state: playingState(0) } },
      );

      act(() => { rerender({ state: lostState(0) }); });

      await waitFor(() => expect(addEntry).toHaveBeenCalled());
      expect(globalThis.fetch).not.toHaveBeenCalled();
    });
  });
});
