import { renderHook, act, waitFor } from '@testing-library/react';
import { useMatchHistory } from './useMatchHistory';
import type { GameRoom } from '../types/multiplayer';

// ── fixtures ──────────────────────────────────────────────────────────────────

const rankings = [
  { userId: 'u1', username: 'alice', score: 2048, rank: 1 },
  { userId: 'u2', username: 'bob', score: 1024, rank: 2 },
];

const waitingRoom = (overrides?: Partial<GameRoom>): GameRoom => ({
  id: 'ABC123',
  hostId: 'u1',
  players: [],
  status: 'waiting',
  maxPlayers: 2,
  createdAt: new Date().toISOString(),
  ...overrides,
});

// ── tests ─────────────────────────────────────────────────────────────────────

describe('useMatchHistory', () => {
  it('starts with empty history and closed modal', () => {
    const { result } = renderHook(() => useMatchHistory(null, null));
    expect(result.current.matchHistory).toHaveLength(0);
    expect(result.current.postGameOpen).toBe(false);
  });

  it('adds entry and opens modal when rankings arrive', async () => {
    const { result, rerender } = renderHook(
      ({ r }: { r: typeof rankings | null }) => useMatchHistory(r, null),
      { initialProps: { r: null as typeof rankings | null } },
    );

    act(() => { rerender({ r: rankings }); });

    await waitFor(() => {
      expect(result.current.matchHistory).toHaveLength(1);
      expect(result.current.matchHistory[0].rankings).toEqual(rankings);
      expect(result.current.postGameOpen).toBe(true);
    });
  });

  it('accumulates multiple matches', async () => {
    const rankings2 = [{ userId: 'u1', username: 'alice', score: 4096, rank: 1 }];
    const { result, rerender } = renderHook(
      ({ r }: { r: typeof rankings | null }) => useMatchHistory(r, null),
      { initialProps: { r: null as typeof rankings | null } },
    );

    act(() => { rerender({ r: rankings }); });
    await waitFor(() => expect(result.current.matchHistory).toHaveLength(1));

    act(() => { rerender({ r: null }); });
    act(() => { rerender({ r: rankings2 }); });
    await waitFor(() => expect(result.current.matchHistory).toHaveLength(2));
  });

  it('auto-closes modal when room transitions waiting → playing', async () => {
    const room = waitingRoom();
    const { result, rerender } = renderHook(
      ({ r, rm }: { r: typeof rankings | null; rm: GameRoom | null }) =>
        useMatchHistory(r, rm),
      { initialProps: { r: null as typeof rankings | null, rm: null as GameRoom | null } },
    );

    // Game ends — modal opens
    act(() => { rerender({ r: rankings, rm: room }); });
    await waitFor(() => expect(result.current.postGameOpen).toBe(true));

    // All players ready — room moves from waiting to playing
    act(() => {
      rerender({ r: rankings, rm: { ...room, status: 'playing' } });
    });

    await waitFor(() => expect(result.current.postGameOpen).toBe(false));
  });

  it('does not close modal on playing → playing (no transition)', async () => {
    const playingRoom: GameRoom = { ...waitingRoom(), status: 'playing' };
    const { result, rerender } = renderHook(
      ({ r, rm }: { r: typeof rankings | null; rm: GameRoom | null }) =>
        useMatchHistory(r, rm),
      { initialProps: { r: null as typeof rankings | null, rm: null as GameRoom | null } },
    );

    act(() => { rerender({ r: rankings, rm: playingRoom }); });
    await waitFor(() => expect(result.current.postGameOpen).toBe(true));

    // Status stays 'playing' — no transition, modal should remain open
    act(() => { rerender({ r: rankings, rm: { ...playingRoom, players: [] } }); });
    expect(result.current.postGameOpen).toBe(true);
  });

  it('setPostGameOpen allows manual close', async () => {
    const { result, rerender } = renderHook(
      ({ r }: { r: typeof rankings | null }) => useMatchHistory(r, null),
      { initialProps: { r: null as typeof rankings | null } },
    );

    act(() => { rerender({ r: rankings }); });
    await waitFor(() => expect(result.current.postGameOpen).toBe(true));

    act(() => { result.current.setPostGameOpen(false); });
    expect(result.current.postGameOpen).toBe(false);
  });
});
