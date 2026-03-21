import { useEffect, useRef, useState } from 'react';
import type { MatchHistoryEntry } from '../types/game';
import type { GameRoom } from '../types/multiplayer';

type Rankings = Array<{ userId: string; username: string; score: number; rank: number }>;

export interface UseMatchHistoryReturn {
  matchHistory: MatchHistoryEntry[];
  postGameOpen: boolean;
  setPostGameOpen: React.Dispatch<React.SetStateAction<boolean>>;
}

/**
 * Accumulates per-match rankings and controls the PostGameModal open state.
 * Opens the modal whenever new rankings arrive; auto-closes it when the room
 * transitions from 'waiting' back to 'playing' (all players clicked Play Again).
 */
export const useMatchHistory = (
  rankings: Rankings | null,
  room: GameRoom | null,
): UseMatchHistoryReturn => {
  const [matchHistory, setMatchHistory] = useState<MatchHistoryEntry[]>([]);
  const [postGameOpen, setPostGameOpen] = useState(false);
  const prevRoomStatusRef = useRef<string | null>(null);

  // Add entry and open modal when a game ends with rankings
  useEffect(() => {
    if (rankings) {
      setMatchHistory((prev) => [...prev, { rankings, playedAt: new Date() }]);
      setPostGameOpen(true);
    }
  }, [rankings]);

  // Auto-close the modal when the room transitions waiting → playing (Play Again started)
  useEffect(() => {
    const prev = prevRoomStatusRef.current;
    prevRoomStatusRef.current = room?.status ?? null;
    if (room?.status === 'playing' && prev === 'waiting' && postGameOpen) {
      setPostGameOpen(false);
    }
  }, [room?.status, postGameOpen]);

  return { matchHistory, postGameOpen, setPostGameOpen };
};
