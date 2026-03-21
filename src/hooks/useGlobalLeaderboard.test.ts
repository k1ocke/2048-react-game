import { renderHook, act, waitFor } from '@testing-library/react';
import { useGlobalLeaderboard } from './useGlobalLeaderboard';
import type { LeaderboardRow } from '../types/multiplayer';

// API_BASE is mocked to 'http://localhost:4000' via jest moduleNameMapper

const mockEntries: LeaderboardRow[] = [
  { rank: 1, userId: 'u1', username: 'Alice', score: 8192, date: '2026-01-01' },
  { rank: 2, userId: 'u2', username: 'Bob',   score: 4096, date: '2026-01-02' },
];

const mockMyRank = {
  rank: 42,
  surrounding: [
    { rank: 41, userId: 'u41', username: 'Prev', score: 500, date: '2026-01-10' },
    { rank: 42, userId: 'u3',  username: 'Me',   score: 480, date: '2026-01-11' },
    { rank: 43, userId: 'u43', username: 'Next', score: 460, date: '2026-01-12' },
  ],
};

const makeOkResponse = (data: unknown) =>
  Promise.resolve({
    ok: true,
    status: 200,
    json: () => Promise.resolve(data),
  } as Response);

const makeErrorResponse = (status: number) =>
  Promise.resolve({
    ok: false,
    status,
    json: () => Promise.resolve({ message: `Error ${status}` }),
  } as Response);

beforeEach(() => {
  jest.resetAllMocks();
  globalThis.fetch = jest.fn() as typeof fetch;
});

describe('useGlobalLeaderboard', () => {
  it('initialises with empty entries and isLoading true', () => {
    (globalThis.fetch as jest.Mock).mockReturnValue(new Promise(() => {})); // never resolves
    const { result } = renderHook(() => useGlobalLeaderboard(null));
    expect(result.current.entries).toEqual([]);
    expect(result.current.isLoading).toBe(true);
    expect(result.current.error).toBeNull();
    expect(result.current.myRank).toBeNull();
  });

  it('sets entries on successful fetch', async () => {
    (globalThis.fetch as jest.Mock).mockReturnValue(makeOkResponse(mockEntries));
    const { result } = renderHook(() => useGlobalLeaderboard(null));
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.entries).toEqual(mockEntries);
    expect(result.current.error).toBeNull();
  });

  it('sets error on failed fetch', async () => {
    (globalThis.fetch as jest.Mock).mockReturnValue(makeErrorResponse(500));
    const { result } = renderHook(() => useGlobalLeaderboard(null));
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.entries).toEqual([]);
    expect(result.current.error).not.toBeNull();
  });

  it('sets error on network failure', async () => {
    (globalThis.fetch as jest.Mock).mockRejectedValue(new Error('Network error'));
    const { result } = renderHook(() => useGlobalLeaderboard(null));
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.entries).toEqual([]);
    expect(result.current.error).toBe('Network error');
  });

  it('fetches myRank when token is provided', async () => {
    (globalThis.fetch as jest.Mock)
      .mockReturnValueOnce(makeOkResponse(mockEntries))   // global leaderboard
      .mockReturnValueOnce(makeOkResponse(mockMyRank));   // /me

    const { result } = renderHook(() => useGlobalLeaderboard('test-token'));
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.entries).toEqual(mockEntries);
    expect(result.current.myRank).toEqual(mockMyRank);

    // Verify Authorization header was sent for the /me request
    const calls = (globalThis.fetch as jest.Mock).mock.calls as [string, RequestInit][];
    const meCall = calls.find(([url]) => url.includes('/leaderboard/me'));
    expect(meCall).toBeDefined();
    expect((meCall![1].headers as Record<string, string>)['Authorization']).toBe('Bearer test-token');
  });

  it('does not fetch myRank when token is null', async () => {
    (globalThis.fetch as jest.Mock).mockReturnValue(makeOkResponse(mockEntries));
    const { result } = renderHook(() => useGlobalLeaderboard(null));
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    const calls = (globalThis.fetch as jest.Mock).mock.calls as [string][];
    const meCall = calls.find(([url]) => url.includes('/leaderboard/me'));
    expect(meCall).toBeUndefined();
    expect(result.current.myRank).toBeNull();
  });

  it('sets error on 401 response', async () => {
    (globalThis.fetch as jest.Mock).mockReturnValue(makeErrorResponse(401));
    const { result } = renderHook(() => useGlobalLeaderboard(null));
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.error).toMatch(/unauthorised/i);
  });

  it('refresh() re-fetches data', async () => {
    (globalThis.fetch as jest.Mock).mockReturnValue(makeOkResponse(mockEntries));
    const { result } = renderHook(() => useGlobalLeaderboard(null));
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    const callCount = (globalThis.fetch as jest.Mock).mock.calls.length;

    act(() => {
      result.current.refresh();
    });

    await waitFor(() =>
      expect((globalThis.fetch as jest.Mock).mock.calls.length).toBeGreaterThan(callCount)
    );
  });
});
