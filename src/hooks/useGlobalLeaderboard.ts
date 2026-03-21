import { useState, useEffect, useCallback } from 'react';
import type { LeaderboardRow } from '../types/multiplayer';
import { API_BASE } from '../utils/env';

export interface UseGlobalLeaderboardReturn {
  entries: LeaderboardRow[];
  myRank: { rank: number; surrounding: LeaderboardRow[] } | null;
  isLoading: boolean;
  error: string | null;
  refresh: () => void;
}

export const useGlobalLeaderboard = (token: string | null): UseGlobalLeaderboardReturn => {
  const [entries, setEntries] = useState<LeaderboardRow[]>([]);
  const [myRank, setMyRank] = useState<{ rank: number; surrounding: LeaderboardRow[] } | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  const refresh = useCallback(() => {
    setTick((prev) => prev + 1);
  }, []);

  useEffect(() => {
    let cancelled = false;

    const fetchData = async (): Promise<void> => {
      setIsLoading(true);

      try {
        const globalRes = await fetch(`${API_BASE}/api/v1/leaderboard?limit=10`, { cache: 'no-store' });
        if (!globalRes.ok) {
          if (globalRes.status === 401) {
            throw new Error('Unauthorised. Please log in again.');
          }
          throw new Error(`Failed to fetch leaderboard (${globalRes.status})`);
        }
        const raw = (await globalRes.json()) as { entries: Array<LeaderboardRow & { achievedAt?: string }>; total: number } | Array<LeaderboardRow & { achievedAt?: string }>;
        const rawEntries = Array.isArray(raw) ? raw : (raw.entries ?? []);
        const normalised: LeaderboardRow[] = rawEntries.map((e) => ({
          ...e,
          date: e.date ?? (e.achievedAt ? new Date(e.achievedAt).toLocaleDateString() : ''),
        }));
        if (!cancelled) {
          setEntries(normalised);
          setError(null);
        }
      } catch (err) {
        if (!cancelled) {
          setEntries([]);
          setError(err instanceof Error ? err.message : 'Failed to load leaderboard');
        }
        if (!cancelled) setIsLoading(false);
        return;
      }

      if (token) {
        try {
          const meRes = await fetch(`${API_BASE}/api/v1/leaderboard/me`, {
            headers: { Authorization: `Bearer ${token}` },
            cache: 'no-store',
          });
          if (meRes.ok) {
            const meData = (await meRes.json()) as unknown;
            if (
              !cancelled &&
              meData !== null &&
              typeof meData === 'object' &&
              'rank' in meData &&
              'surrounding' in meData &&
              Array.isArray((meData as { surrounding: unknown }).surrounding)
            ) {
              setMyRank(meData as { rank: number; surrounding: LeaderboardRow[] });
            }
          } else if (meRes.status === 401) {
            if (!cancelled) {
              setError('Unauthorised. Please log in again.');
            }
          }
          // non-401 errors for /me are silently ignored — global data is still shown
        } catch {
          // network error on /me — silently ignore, global data already set
        }
      } else {
        if (!cancelled) setMyRank(null);
      }

      if (!cancelled) setIsLoading(false);
    };

    void fetchData();

    return () => {
      cancelled = true;
    };
  }, [token, tick]);

  return { entries, myRank, isLoading, error, refresh };
};
