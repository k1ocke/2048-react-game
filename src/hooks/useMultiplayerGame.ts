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
  const [opponentsRecord, setOpponentsRecord] = useState<Record<string, OpponentState>>({});
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
            setOpponentsRecord((prev) => {
              const additions: Record<string, OpponentState> = {};
              for (const p of normalized.players) {
                if (p.userId !== myUserIdRef.current && !prev[p.userId]) {
                  additions[p.userId] = { userId: p.userId, username: p.username, score: 0, status: 'playing', boardSnapshot: [] };
                }
              }
              return Object.keys(additions).length > 0 ? { ...prev, ...additions } : prev;
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
            setOpponentsRecord((prev) => {
              const existing = prev[userId];
              const username = existing?.username ?? userId;
              return { ...prev, [userId]: { userId, username, score, status, boardSnapshot } };
            });
            // Enrich username from room state when room is available
            setRoom((prevRoom) => {
              if (prevRoom) {
                setOpponentsRecord((prev) => {
                  const o = prev[userId];
                  if (o && o.username === userId) {
                    const player = prevRoom.players.find((p) => p.userId === userId);
                    if (player) return { ...prev, [userId]: { ...o, username: player.username } };
                  }
                  return prev;
                });
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
          setOpponentsRecord((prev) => {
            const reset: Record<string, OpponentState> = {};
            for (const [id, o] of Object.entries(prev)) {
              reset[id] = { ...o, score: 0, status: 'playing', boardSnapshot: [] };
            }
            return reset;
          });
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
    setOpponentsRecord({});
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
    opponents: Object.values(opponentsRecord),
    rankings,
  };
};
