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

  // Incremented each time a game:start message is received
  gameStartCount: number;
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
  gameStartCount: number;
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
  gameStartCount: 0,
};

const reducer = (state: MultiplayerState, action: MultiplayerAction): MultiplayerState => {
  switch (action.type) {
    case 'SET_CONNECTED':
      return { ...state, connected: action.connected, error: action.error ?? state.error };
    case 'SET_ERROR':
      return { ...state, error: action.error };
    case 'SET_ROOM': {
      const newRoom = action.room;
      if (newRoom && newRoom.status === 'playing') {
        const activePlayerIds = new Set(newRoom.players.map((p) => p.userId));
        const pruned: Record<string, OpponentState> = {};
        for (const [id, o] of Object.entries(state.opponentsRecord)) {
          if (activePlayerIds.has(id)) {
            pruned[id] = o;
          }
        }
        return { ...state, room: newRoom, opponentsRecord: pruned };
      }
      return { ...state, room: newRoom };
    }
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
      return { ...state, rankings: null, myScore: 0, myStatus: 'playing', opponentsRecord: reset, gameStartCount: state.gameStartCount + 1 };
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
const MAX_RECONNECT_ATTEMPTS = 10;

export const useMultiplayerGame = (isAuthenticated: boolean): UseMultiplayerGameReturn => {
  const [state, dispatch] = useReducer(reducer, initialState);

  const wsRef = useRef<WebSocket | null>(null);
  const reconnectAttemptsRef = useRef(0);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const unmountedRef = useRef(false);
  // Populated from the server's 'hello' message after cookie authentication
  const myUserIdRef = useRef<string | null>(null);
  // Keep a ref to current state so WebSocket callbacks can read it without
  // creating stale closures.
  const stateRef = useRef(state);
  stateRef.current = state;

  const connect = useCallback(() => {
    if (!isAuthenticated || unmountedRef.current) return;
    // Don't open a second connection if one is already open or connecting
    if (wsRef.current && wsRef.current.readyState !== WebSocket.CLOSED) return;

    const ws = new WebSocket(`${WS_BASE}/ws`);
    wsRef.current = ws;

    ws.onopen = () => {
      if (unmountedRef.current) {
        ws.close();
        return;
      }
      dispatch({ type: 'SET_CONNECTED', connected: true, error: null });
      reconnectAttemptsRef.current = 0;
      // Cookie handles authentication — no auth message needed
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
        case 'hello':
          myUserIdRef.current = msg.userId;
          break;
        case 'room:state': {
          const normalized: GameRoom = {
            ...msg.room,
            players: msg.room.players.map((p) => ({ ...p, isHost: p.userId === msg.room.hostId })),
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
        case 'room:error': {
          const ROOM_ERROR_MESSAGES: Record<string, string> = {
            JOIN_FAILED: 'This room is full or unavailable — try creating a new one.',
            NOT_FOUND: 'Room not found — check the code and try again.',
            ALREADY_STARTED: 'That game has already started.',
          };
          const friendly = ROOM_ERROR_MESSAGES[msg.code] ?? msg.message;
          dispatch({ type: 'SET_ERROR', error: friendly });
          break;
        }
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
      if (reconnectAttemptsRef.current > MAX_RECONNECT_ATTEMPTS) {
        dispatch({ type: 'SET_ERROR', error: 'Connection lost. Please refresh the page.' });
        return;
      }
      const delay = Math.min(RECONNECT_DELAY_MS * reconnectAttemptsRef.current, MAX_RECONNECT_DELAY_MS);
      reconnectTimerRef.current = setTimeout(() => {
        if (!unmountedRef.current) connect();
      }, delay);
    };
  }, [isAuthenticated]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    unmountedRef.current = false;

    if (!isAuthenticated) return;

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
  }, [isAuthenticated, connect]);

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
    gameStartCount: state.gameStartCount,
  };
};
