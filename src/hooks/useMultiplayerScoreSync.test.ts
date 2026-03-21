import { renderHook } from '@testing-library/react';
import { act } from 'react';
import { useMultiplayerScoreSync } from './useMultiplayerScoreSync';
import type { GameState } from '../types/game';
import type { ClientMessage, GameRoom } from '../types/multiplayer';

// ── fixtures ──────────────────────────────────────────────────────────────────

const makeTile = (id: number, value: number, row = 0, col = 0) => ({
  id, value, row, col, merged: false, isNew: false,
});

const gameState = (overrides?: Partial<GameState>): GameState => ({
  tiles: [makeTile(1, 2)],
  score: 0,
  bestScore: 0,
  status: 'playing',
  size: 4,
  moves: 0,
  startTime: Date.now(),
  ...overrides,
});

const playingRoom = (): GameRoom => ({
  id: 'ROOM01',
  hostId: 'u1',
  players: [],
  status: 'playing',
  maxPlayers: 2,
  createdAt: new Date().toISOString(),
});

// ── tests ─────────────────────────────────────────────────────────────────────

describe('useMultiplayerScoreSync', () => {
  let sendMessage: jest.Mock;

  beforeEach(() => {
    sendMessage = jest.fn();
  });

  it('sends score-update when moves increments during a playing room', () => {
    const { rerender } = renderHook(
      ({ state, room }: { state: GameState; room: GameRoom | null }) =>
        useMultiplayerScoreSync(state, sendMessage, room),
      { initialProps: { state: gameState({ moves: 0 }), room: playingRoom() } },
    );

    act(() => {
      rerender({ state: gameState({ moves: 1, score: 4 }), room: playingRoom() });
    });

    expect(sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'game:score-update', score: 4, status: 'playing' }),
    );
  });

  it('does NOT send when room is null and game is still playing', () => {
    const { rerender } = renderHook(
      ({ state, room }: { state: GameState; room: GameRoom | null }) =>
        useMultiplayerScoreSync(state, sendMessage, room),
      { initialProps: { state: gameState({ moves: 0 }), room: null } },
    );

    act(() => {
      rerender({ state: gameState({ moves: 1 }), room: null });
    });

    // sendMessage may have been called on mount but not on the move update
    const calls = (sendMessage as jest.Mock).mock.calls;
    // No call should have status: 'playing' with a null room
    const playingCalls = calls.filter((c: [ClientMessage]) =>
      (c[0] as { type: string; status?: string }).status === 'playing',
    );
    expect(playingCalls).toHaveLength(0);
  });

  it('always sends when game status becomes "lost" regardless of room state', () => {
    const { rerender } = renderHook(
      ({ state, room }: { state: GameState; room: GameRoom | null }) =>
        useMultiplayerScoreSync(state, sendMessage, room),
      { initialProps: { state: gameState({ status: 'playing' }), room: null } },
    );

    sendMessage.mockClear();

    act(() => {
      rerender({ state: gameState({ status: 'lost', score: 512 }), room: null });
    });

    expect(sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'game:score-update', status: 'lost', score: 512 }),
    );
  });

  it('always sends when game status becomes "won"', () => {
    const { rerender } = renderHook(
      ({ state, room }: { state: GameState; room: GameRoom | null }) =>
        useMultiplayerScoreSync(state, sendMessage, room),
      { initialProps: { state: gameState({ status: 'playing' }), room: null } },
    );

    sendMessage.mockClear();

    act(() => {
      rerender({ state: gameState({ status: 'won', score: 2048 }), room: null });
    });

    expect(sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'game:score-update', status: 'won', score: 2048 }),
    );
  });

  it('includes a board snapshot in the message', () => {
    const tile = makeTile(1, 4, 1, 2);
    const { rerender } = renderHook(
      ({ state, room }: { state: GameState; room: GameRoom | null }) =>
        useMultiplayerScoreSync(state, sendMessage, room),
      { initialProps: { state: gameState({ tiles: [tile], moves: 0 }), room: playingRoom() } },
    );

    act(() => {
      rerender({ state: gameState({ tiles: [tile], moves: 1, score: 8 }), room: playingRoom() });
    });

    const lastCall = sendMessage.mock.calls[sendMessage.mock.calls.length - 1][0] as {
      board: number[][];
    };
    expect(lastCall.board).toBeDefined();
    expect(lastCall.board[1][2]).toBe(4); // tile at row 1, col 2
  });
});
