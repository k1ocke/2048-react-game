import { useState, useCallback } from 'react';
import type { ScoreHistoryEntry } from '../types/game';

const STORAGE_KEY = '2048-score-history';
const MAX_HISTORY = 20;

const loadHistory = (): ScoreHistoryEntry[] => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as ScoreHistoryEntry[]) : [];
  } catch {
    return [];
  }
};

const saveHistory = (entries: ScoreHistoryEntry[]): void => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
  } catch {
    // localStorage unavailable — silently skip
  }
};

export const useScoreHistory = () => {
  const [history, setHistory] = useState<ScoreHistoryEntry[]>(loadHistory);

  const addHistoryEntry = useCallback(
    (score: number, status: 'won' | 'lost') => {
      if (score === 0) return;
      setHistory((prev) => {
        const next = [
          { score, status, date: new Date().toLocaleDateString() },
          ...prev,
        ].slice(0, MAX_HISTORY);
        saveHistory(next);
        return next;
      });
    },
    [],
  );

  return { history, addHistoryEntry };
};
