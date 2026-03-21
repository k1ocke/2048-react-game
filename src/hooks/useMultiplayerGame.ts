import { useCallback, useEffect, useRef, useState } from 'react';
import type { ClientMessage, GameRoom, ServerMessage } from '../types/multiplayer';
import { API_BASE } from '../utils/env';

const WS_BASE = API_BASE
  ? API_BASE.replace(/^http/, 'ws')
  : `${window.location.protocol === 'https:' ? 'wss' : 'ws'}://${window.location.host}`;

export interface OpponentState {
  userId: string;
  username: string;
  score: number;
  status: 'playing' | 'won' | 'lost';
  boardSnapshot: number[][];
}

export interface UseMultiplayerGameReturn {
  // Connection
  connected: boolean;
  error: string | null;

  // Room state
  room: GameRoom | null;
  sendMessage: (msg: ClientMessage) => void;
  leaveRoom: () => void;

  // Game state (own)
  myScore: number;
  myStatus: 'playing' | 'won' | 'lost';

  // Opponents
  opponents: OpponentState[];

  // Game end
  rankings: Array<{ userId: string; username: string; score: number; rank: number }> | null;
}

const RECONNECT_DELAY_MS = 2000;
const MAX_RECONNECT_DELAY_MS = 30000;

export const useMultiplayerGame = (token: string | null): UseMultiplayerGameReturn => {
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [room, setRoom] = useState<GameRoom | null>(null);
  const [myScore, setMyScore] = useState(0);
  const [myStatus, setMyStatus] = useState<'playing' | 'won' | 'lost'>('playing');
  const [opponents, setOpponents] = useState<OpponentState[]>([]);
  const [rankings, setRankings] = useState<Array<{ userId: string; username: string; score: number; rank: number }> | null>(null);

  const wsRef = useRef<WebSocket | null>(null);
  const reconnectAttemptsRef = useRef(0);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const unmountedRef = useRef(false);
  // Derive own userId from the JWT token payload (base64 middle segment)
  const myUserIdRef = useRef<string | null>(null);

  const parseUserIdFromToken = (tok: string): string | null => {
    try {
      const payload = tok.split('.')[1];
      if (!payload) return null;
      const decoded = JSON.parse(atob(payload));
      return (decoded.sub as string) ?? null;
    } catch {
      return null;
    }
  };

  const connect = useCallback(() => {
    if (!token || unmountedRef.current) return;
    // Don't open a second connection if one is already open or connecting
    if (wsRef.current && wsRef.current.readyState !== WebSocket.CLOSED) return;

    myUserIdRef.current = parseUserIdFromToken(token);

    const ws = new WebSocket(`${WS_BASE}/ws`);
    wsRef.current = ws;

    ws.onopen = () => {
      if (unmountedRef.current) {
        ws.close();
        return;
      }
      setConnected(true);
      setError(null);
      reconnectAttemptsRef.current = 0;
      ws.send(JSON.stringify({ type: 'auth', token }));
    };

    ws.onmessage = (event: MessageEvent) => {
      if (unmountedRef.current) return;
      let msg: ServerMessage;
      try {
        msg = JSON.parse(event.data as string) as ServerMessage;
      } catch {
        return;
      }

      switch (msg.type) {
        case 'room:state': {
          // Server sends roomId; client type uses id — normalise
          const raw = msg.room as GameRoom & { roomId?: string };
          const roomId = raw.id ?? (raw as unknown as { roomId: string }).roomId ?? '';
          const normalized: GameRoom = {
            ...raw,
            id: roomId,
            players: raw.players.map((p) => ({ ...p, isHost: p.userId === raw.hostId })),
          };
          setRoom(normalized);
          // Seed opponents list from room players when game is active
          if (normalized.status === 'playing' && myUserIdRef.current) {
            setOpponents((prev) => {
              const existing = new Set(prev.map((o) => o.userId));
              const seeded = normalized.players
                .filter((p) => p.userId !== myUserIdRef.current && !existing.has(p.userId))
                .map((p) => ({ userId: p.userId, username: p.username, score: 0, status: 'playing' as const, boardSnapshot: [] }));
              return seeded.length > 0 ? [...prev, ...seeded] : prev;
            });
          }
          break;
        }
        case 'player:update': {
          const { userId, score, status, boardSnapshot } = msg;
          if (userId === myUserIdRef.current) {
            setMyScore(score);
            setMyStatus(status);
          } else {
            setOpponents((prev) => {
              const existing = prev.find((o) => o.userId === userId);
              if (existing) {
                return prev.map((o) =>
                  o.userId === userId ? { ...o, score, status, boardSnapshot } : o
                );
              }
              // Need username — look it up from room players if available
              return [
                ...prev,
                { userId, username: userId, score, status, boardSnapshot },
              ];
            });
            // Enrich username from room state when room is available
            setRoom((prevRoom) => {
              if (prevRoom) {
                setOpponents((prev) =>
                  prev.map((o) => {
                    if (o.userId === userId && o.username === userId) {
                      const player = prevRoom.players.find((p) => p.userId === userId);
                      if (player) return { ...o, username: player.username };
                    }
                    return o;
                  })
                );
              }
              return prevRoom;
            });
          }
          break;
        }
        case 'game:start':
          // New game starting — reset live state from the previous round
          setRankings(null);
          setMyScore(0);
          setMyStatus('playing');
          setOpponents((prev) => prev.map((o) => ({ ...o, score: 0, status: 'playing' as const, boardSnapshot: [] })));
          break;
        case 'game:end':
          setRankings(msg.rankings);
          break;
        case 'room:error':
          setError(msg.message);
          break;
        default:
          break;
      }
    };

    ws.onerror = () => {
      if (unmountedRef.current) return;
      setError('WebSocket connection error');
    };

    ws.onclose = (event) => {
      if (unmountedRef.current) return;
      // Ignore close events from stale sockets (replaced by a newer connect() call)
      if (wsRef.current !== ws) return;
      setConnected(false);
      wsRef.current = null;
      // Reset room state on disconnect only when not in an active game.
      // During a game, keep the panel visible so the player isn't disoriented.
      setRoom((prev) => (prev?.status === 'playing' ? prev : null));
      setOpponents((prev) => (prev.length > 0 ? prev : []));

      // Don't retry on auth failures — the token is bad
      if (event.code === 4001) return;

      reconnectAttemptsRef.current += 1;
      const delay = Math.min(RECONNECT_DELAY_MS * reconnectAttemptsRef.current, MAX_RECONNECT_DELAY_MS);
      reconnectTimerRef.current = setTimeout(() => {
        if (!unmountedRef.current) connect();
      }, delay);
    };
  }, [token]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    unmountedRef.current = false;

    if (!token) return;

    connect();

    return () => {
      unmountedRef.current = true;
      if (reconnectTimerRef.current !== null) {
        clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = null;
      }
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, [token, connect]);

  const sendMessage = useCallback((msg: ClientMessage) => {
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(msg));
    }
  }, []);

  // Sends room:leave and immediately resets local state.
  // The server may or may not send room:state back (it doesn't when the room dissolves).
  const leaveRoom = useCallback(() => {
    sendMessage({ type: 'room:leave' });
    setRoom(null);
    setOpponents([]);
    setRankings(null);
    setMyScore(0);
    setMyStatus('playing');
  }, [sendMessage]);

  return {
    connected,
    error,
    room,
    sendMessage,
    leaveRoom,
    myScore,
    myStatus,
    opponents,
    rankings,
  };
};
