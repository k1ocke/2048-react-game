import { renderHook, act, waitFor } from '@testing-library/react';
import { useMultiplayerGame } from './useMultiplayerGame';

// ── WebSocket mock ───────────────────────────────────────────────────────────

type WSEventHandler = (event: { data?: string }) => void;

interface MockWS {
  send: jest.Mock;
  close: jest.Mock;
  readyState: number;
  onopen: WSEventHandler | null;
  onmessage: WSEventHandler | null;
  onerror: WSEventHandler | null;
  onclose: WSEventHandler | null;
}

let mockWS: MockWS;

const createMockWS = (): MockWS => ({
  send: jest.fn(),
  close: jest.fn(),
  readyState: WebSocket.OPEN,
  onopen: null,
  onmessage: null,
  onerror: null,
  onclose: null,
});

beforeEach(() => {
  jest.useFakeTimers();
  mockWS = createMockWS();
  globalThis.WebSocket = jest.fn(() => mockWS) as unknown as typeof WebSocket;
});

afterEach(() => {
  jest.useRealTimers();
  jest.clearAllMocks();
});

// Helper: simulate the WebSocket opening (triggers auth send)
const openWS = () => {
  act(() => {
    mockWS.onopen?.({});
  });
};

// Helper: simulate a server message
const receiveMessage = (data: unknown) => {
  act(() => {
    mockWS.onmessage?.({ data: JSON.stringify(data) });
  });
};

// A fake JWT whose payload contains sub: 'user-123'
// Payload base64: { "sub": "user-123", "username": "alice", "iat": 1, "exp": 9999999999 }
const fakeToken = `header.${btoa(JSON.stringify({ sub: 'user-123', username: 'alice', iat: 1, exp: 9999999999 }))}.sig`;

// ── tests ────────────────────────────────────────────────────────────────────

describe('useMultiplayerGame', () => {
  it('does not connect when token is null', () => {
    renderHook(() => useMultiplayerGame(null));
    expect(globalThis.WebSocket).not.toHaveBeenCalled();
  });

  it('sends auth message on connect', () => {
    renderHook(() => useMultiplayerGame(fakeToken));
    openWS();
    expect(mockWS.send).toHaveBeenCalledWith(
      JSON.stringify({ type: 'auth', token: fakeToken })
    );
  });

  it('updates room state on room:state message', async () => {
    const { result } = renderHook(() => useMultiplayerGame(fakeToken));
    openWS();

    const fakeRoom = {
      id: 'ABC123',
      hostId: 'user-123',
      players: [],
      status: 'waiting',
      maxPlayers: 2,
      createdAt: '2026-01-01T00:00:00.000Z',
    };

    receiveMessage({ type: 'room:state', room: fakeRoom });

    await waitFor(() => {
      expect(result.current.room).toEqual(fakeRoom);
    });
  });

  it('updates myScore on player:update for own userId', async () => {
    const { result } = renderHook(() => useMultiplayerGame(fakeToken));
    openWS();

    receiveMessage({
      type: 'player:update',
      userId: 'user-123',
      score: 512,
      status: 'playing',
      boardSnapshot: Array.from({ length: 4 }, () => Array(4).fill(0)),
    });

    await waitFor(() => {
      expect(result.current.myScore).toBe(512);
    });
  });

  it('adds opponent on player:update for other userId', async () => {
    const { result } = renderHook(() => useMultiplayerGame(fakeToken));
    openWS();

    receiveMessage({
      type: 'player:update',
      userId: 'user-456',
      score: 128,
      status: 'playing',
      boardSnapshot: Array.from({ length: 4 }, () => Array(4).fill(0)),
    });

    await waitFor(() => {
      expect(result.current.opponents).toHaveLength(1);
      expect(result.current.opponents[0].userId).toBe('user-456');
      expect(result.current.opponents[0].score).toBe(128);
    });
  });

  it('sets rankings on game:end message', async () => {
    const { result } = renderHook(() => useMultiplayerGame(fakeToken));
    openWS();

    const fakeRankings = [
      { userId: 'user-123', username: 'alice', score: 2048, rank: 1 },
      { userId: 'user-456', username: 'bob', score: 1024, rank: 2 },
    ];

    receiveMessage({ type: 'game:end', rankings: fakeRankings });

    await waitFor(() => {
      expect(result.current.rankings).toEqual(fakeRankings);
    });
  });

  it('sendMessage sends JSON to WebSocket', () => {
    const { result } = renderHook(() => useMultiplayerGame(fakeToken));
    openWS();

    act(() => {
      result.current.sendMessage({ type: 'room:create', maxPlayers: 2 });
    });

    expect(mockWS.send).toHaveBeenCalledWith(
      JSON.stringify({ type: 'room:create', maxPlayers: 2 })
    );
  });

  it('closes WebSocket on unmount', () => {
    const { unmount } = renderHook(() => useMultiplayerGame(fakeToken));
    openWS();
    unmount();
    expect(mockWS.close).toHaveBeenCalled();
  });

  it('resets scores, opponents and rankings on game:start', async () => {
    const { result } = renderHook(() => useMultiplayerGame(fakeToken));
    openWS();

    // Establish some opponent state and end a game
    receiveMessage({
      type: 'player:update',
      userId: 'user-456',
      score: 500,
      status: 'playing',
      boardSnapshot: [],
    });
    receiveMessage({
      type: 'game:end',
      rankings: [
        { userId: 'user-123', username: 'alice', score: 2048, rank: 1 },
        { userId: 'user-456', username: 'bob', score: 500, rank: 2 },
      ],
    });

    await waitFor(() => {
      expect(result.current.rankings).not.toBeNull();
      expect(result.current.opponents[0].score).toBe(500);
    });

    // New game starts
    receiveMessage({ type: 'game:start', startsAt: new Date().toISOString() });

    await waitFor(() => {
      expect(result.current.rankings).toBeNull();
      expect(result.current.myScore).toBe(0);
      expect(result.current.myStatus).toBe('playing');
      expect(result.current.opponents[0].score).toBe(0);
      expect(result.current.opponents[0].status).toBe('playing');
    });
  });
});
