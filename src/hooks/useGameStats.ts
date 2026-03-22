import { useEffect, useRef } from 'react';
import type { GameState } from '../types/game';
import { API_BASE } from '../utils/env';

type AddHistoryEntry = (
  score: number,
  status: 'won' | 'lost',
  stats?: { moves?: number; bestTile?: number; duration?: number },
) => void;

export interface UseGameStatsReturn {
  /** True when the current score exceeds the best score at the start of this session. */
  isNewRecord: boolean;
}

/**
 * Tracks game completion: saves to the local leaderboard + score history,
 * and submits stats to the server when a token is present.
 * Also tracks whether the current score is a new record.
 */
export const useGameStats = (
  state: GameState,
  isAuthenticated: boolean,
  refreshUser: () => Promise<void>,
  addEntry: (score: number) => void,
  addHistoryEntry: AddHistoryEntry,
): UseGameStatsReturn => {
  const scoreSaved = useRef(false);
  const sessionStartBest = useRef(state.bestScore);
  // Always holds the latest state so effects can read it without stale closures
  const stateRef = useRef(state);
  stateRef.current = state;
  // Game session token issued by POST /stats/game-start; required for score submission
  const gameTokenRef = useRef<string | null>(null);

  // Reset the baseline best score whenever a new game starts at 0
  useEffect(() => {
    if (state.status === 'playing' && state.score === 0) {
      sessionStartBest.current = state.bestScore;
    }
  }, [state.status, state.score, state.bestScore]);

  // Request a game session token when a new game starts (MED-4: bind score to authenticated session)
  useEffect(() => {
    if (state.status === 'playing' && state.score === 0 && isAuthenticated) {
      gameTokenRef.current = null;
      fetch(`${API_BASE}/api/v1/stats/game-start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'fetch' },
        credentials: 'include',
      })
        .then((r) => (r.ok ? (r.json() as Promise<{ gameToken: string }>) : null))
        .then((data) => {
          if (data) gameTokenRef.current = data.gameToken;
        })
        .catch(() => { /* silent — stats won't be submitted if token fetch fails */ });
    }
  }, [state.status, state.score, isAuthenticated]);

  useEffect(() => {
    const { status, score, tiles, moves, startTime } = stateRef.current;

    if (status !== 'playing' && !scoreSaved.current) {
      scoreSaved.current = true;
      addEntry(score);
      const bestTile = tiles.reduce((max, t) => Math.max(max, t.value), 0);
      const duration = Math.round((Date.now() - startTime) / 1000);
      addHistoryEntry(score, status as 'won' | 'lost', { moves, bestTile, duration });

      if (isAuthenticated && score > 0 && gameTokenRef.current) {
        const token = gameTokenRef.current;
        gameTokenRef.current = null; // prevent reuse
        fetch(`${API_BASE}/api/v1/stats/game-end`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'fetch' },
          credentials: 'include',
          body: JSON.stringify({ won: status === 'won', score, moves, gameToken: token }),
        })
          .then((res) => {
            if (!res.ok) {
              console.error('Failed to save stats', res.status);
              return;
            }
            return refreshUser();
          })
          .catch((err: unknown) => console.error('Failed to submit stats:', err));
      }
    }

    if (status === 'playing') {
      scoreSaved.current = false;
    }
  }, [state.status, addEntry, addHistoryEntry, isAuthenticated, refreshUser]);

  const isNewRecord = state.score > 0 && state.score > sessionStartBest.current;
  return { isNewRecord };
};
