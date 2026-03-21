import { useEffect, useRef } from 'react';
import type { GameState } from '../types/game';
import type { ClientMessage, GameRoom } from '../types/multiplayer';

// Maximum rate for mid-game score-update messages (terminal won/lost always bypass this)
const THROTTLE_MS = 100;

/**
 * Sends game:score-update to the server on every valid move during a multiplayer game.
 *
 * Fires on state.moves (not state.score) so the opponent board stays in sync even
 * when tiles rearrange without merging.
 *
 * Mid-game updates (status === 'playing', moves > 0) are throttled to at most one
 * message per THROTTLE_MS to avoid flooding the server during rapid play.
 * Terminal updates (won/lost) always bypass the throttle.
 *
 * Uses a ref for room.status to avoid stale closures: if the server resets the room
 * milliseconds after game-end, the ref ensures the final 'won'/'lost' update is always
 * sent so server rankings use the real client score rather than the server simulation.
 */
export const useMultiplayerScoreSync = (
  state: GameState,
  sendMessage: (msg: ClientMessage) => void,
  room: GameRoom | null,
): void => {
  const roomStatusRef = useRef<string | null>(null);
  const lastSentAtRef = useRef<number>(0);
  roomStatusRef.current = room?.status ?? null;

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    const roomStatus = roomStatusRef.current;
    // For mid-game updates, only send while the room is active.
    // Always send the terminal won/lost status regardless of room state.
    if (state.status === 'playing' && roomStatus !== 'playing') return;

    const status = state.status === 'playing' ? 'playing'
      : state.status === 'won' ? 'won'
      : 'lost';

    // Throttle mid-game updates (moves > 0) to avoid flooding the server.
    // The first move (moves === 0, initial state) and all terminal updates bypass throttle.
    if (status === 'playing' && state.moves > 0) {
      const now = Date.now();
      if (now - lastSentAtRef.current < THROTTLE_MS) return;
      lastSentAtRef.current = now;
    }

    const board: number[][] = Array.from({ length: state.size }, () => Array(state.size).fill(0));
    for (const tile of state.tiles) {
      board[tile.row][tile.col] = tile.value;
    }

    sendMessage({ type: 'game:score-update', score: state.score, status, board });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.moves, state.status]);
};
