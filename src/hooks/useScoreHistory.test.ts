import { renderHook, act } from '@testing-library/react';
import { useScoreHistory } from './useScoreHistory';

const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: (key: string) => store[key] ?? null,
    setItem: (key: string, value: string) => { store[key] = value; },
    removeItem: (key: string) => { delete store[key]; },
    clear: () => { store = {}; },
  };
})();
Object.defineProperty(globalThis, 'localStorage', { value: localStorageMock });

const STORAGE_KEY = '2048-score-history';

beforeEach(() => {
  localStorageMock.clear();
});

describe('useScoreHistory', () => {
  it('initialises with empty history', () => {
    const { result } = renderHook(() => useScoreHistory());
    expect(result.current.history).toEqual([]);
  });

  it('adds an entry newest-first', () => {
    const { result } = renderHook(() => useScoreHistory());

    act(() => { result.current.addHistoryEntry(100, 'lost'); });
    act(() => { result.current.addHistoryEntry(200, 'won'); });

    expect(result.current.history[0].score).toBe(200);
    expect(result.current.history[1].score).toBe(100);
  });

  it('records the correct status', () => {
    const { result } = renderHook(() => useScoreHistory());

    act(() => { result.current.addHistoryEntry(512, 'won'); });
    act(() => { result.current.addHistoryEntry(64, 'lost'); });

    expect(result.current.history[0].status).toBe('lost');
    expect(result.current.history[1].status).toBe('won');
  });

  it('ignores entries with score 0', () => {
    const { result } = renderHook(() => useScoreHistory());
    act(() => { result.current.addHistoryEntry(0, 'lost'); });
    expect(result.current.history).toHaveLength(0);
  });

  it('caps history at 20 entries', () => {
    const { result } = renderHook(() => useScoreHistory());
    act(() => {
      for (let i = 1; i <= 25; i++) {
        result.current.addHistoryEntry(i * 10, 'lost');
      }
    });
    expect(result.current.history).toHaveLength(20);
    // Newest (250) should be first
    expect(result.current.history[0].score).toBe(250);
  });

  it('persists entries to localStorage', () => {
    const { result } = renderHook(() => useScoreHistory());
    act(() => { result.current.addHistoryEntry(1024, 'won'); });

    const stored = JSON.parse(localStorageMock.getItem(STORAGE_KEY) ?? '[]');
    expect(stored).toHaveLength(1);
    expect(stored[0].score).toBe(1024);
    expect(stored[0].status).toBe('won');
  });

  it('loads existing history from localStorage on mount', () => {
    const existing = [{ score: 999, status: 'won', date: '1/1/2026' }];
    localStorageMock.setItem(STORAGE_KEY, JSON.stringify(existing));

    const { result } = renderHook(() => useScoreHistory());
    expect(result.current.history).toHaveLength(1);
    expect(result.current.history[0].score).toBe(999);
  });

  it('returns empty array when localStorage contains invalid JSON', () => {
    localStorageMock.setItem(STORAGE_KEY, 'not-json');
    const { result } = renderHook(() => useScoreHistory());
    expect(result.current.history).toEqual([]);
  });
});
