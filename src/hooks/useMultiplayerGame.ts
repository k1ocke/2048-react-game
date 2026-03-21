import { useCallback, useEffect, useReducer, useRef } from 'react';
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

// ─── Reducer ──────────────────────────────────────────────────────────────────

interface MultiplayerState {
  connected: boolean;
  error: string | null;
  room: GameRoom | null;
  myScore: number;
  myStatus: 'playing' | 'won' | 'lost';
  opponentsRecord: Record<string, OpponentState>;
  rankings: Array<{ userId: string; username: string; score: number; rank: number }> | null;
}

type MultiplayerAction =
  | { type: 'SET_CONNECTED'; connected: boolean; error?: string | null }
  | { type: 'SET_ERROR'; error: string }
  | { type: 'SET_ROOM'; room: GameRoom | null }
  | { type: 'UPDATE_MY_SCORE'; score: number; status: 'playing' | 'won' | 'lost' }
  | { type: 'UPDATE_OPPONENT'; userId: string; username: string; score: number; status: 'playing' | 'won' | 'lost'; boardSnapshot: number[][] }
  | { type: 'ENRICH_OPPONENT_USERNAME'; userId: string; username: string }
  | { type: 'SEED_OPPONENTS'; players: Array<{ userId: string; username: string }> }
  | { type: 'GAME_START' }
  | { type: 'GAME_END'; rankings: Array<{ userId: string; username: string; score: number; rank: number }> }
  | { type: 'LEAVE_ROOM' }
  | { type: 'DISCONNECT_RESET' };

const initialState: MultiplayerState = {
  connected: false,
  error: null,
  room: null,
  myScore: 0,
  myStatus: 'playing',
  opponentsRecord: {},
  rankings: null,
};

const reducer = (state: MultiplayerState, action: MultiplayerAction): MultiplayerState => {
  switch (action.type) {
    case 'SET_CONNECTED':
      return { ...state, connected: action.connected, error: action.error ?? state.error };
    case 'SET_ERROR':
      return { ...state, error: action.error };
    case 'SET_ROOM':
      return { ...state, room: action.room };
    case 'UPDATE_MY_SCORE':
      return { ...state, myScore: action.score, myStatus: action.status };
    case 'UPDATE_OPPONENT': {
      const existing = state.opponentsRecord[action.userId];
      const username = existing?.username !== action.userId ? existing?.username ?? action.userId : action.userId;
      return {
        ...state,
        opponentsRecord: {
          ...state.opponentsRecord,
          [action.userId]: { userId: action.userId, username, score: action.score, status: action.status, boardSnapshot: action.boardSnapshot },
        },
      };
    }
    case 'ENRICH_OPPONENT_USERNAME': {
      const o = state.opponentsRecord[action.userId];
      if (!o) return state;
      return {
        ...state,
        opponentsRecord: { ...state.opponentsRecord, [action.userId]: { ...o, username: action.username } },
      };
    }
    case 'SEED_OPPONENTS': {
      const additions: Record<string, OpponentState> = {};
      for (const p of action.players) {
        if (!state.opponentsRecord[p.userId]) {
          additions[p.userId] = { userId: p.userId, username: p.username, score: 0, status: 'playing', boardSnapshot: [] };
        }
      }
      if (Object.keys(additions).length === 0) return state;
      return { ...state, opponentsRecord: { ...state.opponentsRecord, ...additions } };
    }
    case 'GAME_START': {
      const reset: Record<string, OpponentState> = {};
      for (const [id, o] of Object.entries(state.opponentsRecord)) {
        reset[id] = { ...o, score: 0, status: 'playing', boardSnapshot: [] };
      }
      return { ...state, rankings: null, myScore: 0, myStatus: 'playing', opponentsRecord: reset };
    }
    case 'GAME_END':
      return { ...state, rankings: action.rankings };
    case 'LEAVE_ROOM':
      return { ...state, room: null, opponentsRecord: {}, rankings: null, myScore: 0, myStatus: 'playing' };
    case 'DISCONNECT_RESET':
      return { ...state, connected: false, room: state.room?.status === 'playing' ? state.room : null };
    default:
      return state;
  }
};

// ─── Hook ─────────────────────────────────────────────────────────────────────

const RECONNECT_DELAY_MS = 2000;
const MAX_RECONNECT_DELAY_MS = 30000;

export const useMultiplayerGame = (token: string | null): UseMultiplayerGameReturn => {
  const [state, dispatch] = useReducer(reducer, initialState);

  const wsRef = useRef<WebSocket | null>(null);
  const reconnectAttemptsRef = useRef(0);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const unmountedRef = useRef(false);
  // Derive own userId from the JWT token payload (base64 middle segment)
  const myUserIdRef = useRef<string | null>(null);
  // Keep a ref to current state so WebSocket callbacks can read it without
  // creating stale closures.
  const stateRef = useRef(state);
  stateRef.current = state;

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
      dispatch({ type: 'SET_CONNECTED', connected: true, error: null });
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
          // Seed opponents list from room players when game is active
          if (normalized.status === 'playing' && myUserIdRef.current) {
            dispatch({
              type: 'SEED_OPPONENTS',
              players: normalized.players.filter((p) => p.userId !== myUserIdRef.current),
            });
          }
          dispatch({ type: 'SET_ROOM', room: normalized });
          break;
        }
        case 'player:update': {
          const { userId, score, status, boardSnapshot } = msg;
          if (userId === myUserIdRef.current) {
            dispatch({ type: 'UPDATE_MY_SCORE', score, status });
          } else {
            dispatch({ type: 'UPDATE_OPPONENT', userId, username: userId, score, status, boardSnapshot });
            // Enrich username from current room state
            const currentRoom = stateRef.current.room;
            if (currentRoom) {
              const player = currentRoom.players.find((p) => p.userId === userId);
              if (player && stateRef.current.opponentsRecord[userId]?.username === userId) {
                dispatch({ type: 'ENRICH_OPPONENT_USERNAME', userId, username: player.username });
              }
            }
          }
          break;
        }
        case 'game:start':
          // New game starting — reset live state from the previous round
          dispatch({ type: 'GAME_START' });
          break;
        case 'game:end':
          dispatch({ type: 'GAME_END', rankings: msg.rankings });
          break;
        case 'room:error':
          dispatch({ type: 'SET_ERROR', error: msg.message });
          break;
        default:
          break;
      }
    };

    ws.onerror = () => {
      if (unmountedRef.current) return;
      dispatch({ type: 'SET_ERROR', error: 'WebSocket connection error' });
    };

    ws.onclose = (event) => {
      if (unmountedRef.current) return;
      // Ignore close events from stale sockets (replaced by a newer connect() call)
      if (wsRef.current !== ws) return;
      wsRef.current = null;
      dispatch({ type: 'DISCONNECT_RESET' });
      dispatch({ type: 'SET_CONNECTED', connected: false });

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
    dispatch({ type: 'LEAVE_ROOM' });
  }, [sendMessage]);

  return {
    connected: state.connected,
    error: state.error,
    room: state.room,
    sendMessage,
    leaveRoom,
    myScore: state.myScore,
    myStatus: state.myStatus,
    opponents: Object.values(state.opponentsRecord),
    rankings: state.rankings,
  };
};
