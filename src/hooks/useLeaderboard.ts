import { useState, useCallback } from 'react';
import type { LeaderboardEntry } from '../types/game';

const STORAGE_KEY = '2048-leaderboard';
const MAX_ENTRIES = 10;

const loadEntries = (): LeaderboardEntry[] => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as LeaderboardEntry[]) : [];
  } catch {
    return [];
  }
};

const saveEntries = (entries: LeaderboardEntry[]): void => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
  } catch {
    // localStorage unavailable — silently skip
  }
};

export const useLeaderboard = () => {
  const [entries, setEntries] = useState<LeaderboardEntry[]>(loadEntries);

  const addEntry = useCallback((score: number) => {
    if (score === 0) return;
    setEntries((prev) => {
      const next = [...prev, { score, date: new Date().toLocaleDateString() }]
        .sort((a, b) => b.score - a.score)
        .slice(0, MAX_ENTRIES);
      saveEntries(next);
      return next;
    });
  }, []);

  return { entries, addEntry };
};
