import { useEffect, useRef } from 'react';
import type { GameState } from '../types/game';
import type { ClientMessage, GameRoom } from '../types/multiplayer';

/**
 * Sends game:score-update to the server on every valid move during a multiplayer game.
 *
 * Fires on state.moves (not state.score) so the opponent board stays in sync even
 * when tiles rearrange without merging.
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

    const board: number[][] = Array.from({ length: state.size }, () => Array(state.size).fill(0));
    for (const tile of state.tiles) {
      board[tile.row][tile.col] = tile.value;
    }

    sendMessage({ type: 'game:score-update', score: state.score, status, board });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.moves, state.status]);
};
