import { useEffect, useRef } from 'react';
import type { GameRoom } from '../types/multiplayer';
import styles from './PostGameModal.module.css';

type RankingEntry = { userId: string; username: string; score: number; rank: number };

interface PostGameModalProps {
  isOpen: boolean;
  rankings: RankingEntry[];
  history: Array<{ rankings: RankingEntry[]; playedAt: Date }>;
  room: GameRoom | null;
  currentUserId: string;
  onPlayAgain: () => void;
  onLeave: () => void;
}

const MEDAL: Record<number, string> = { 1: '🥇', 2: '🥈', 3: '🥉' };

const PostGameModal = ({
  isOpen,
  rankings,
  history,
  room,
  currentUserId,
  onPlayAgain,
  onLeave,
}: PostGameModalProps) => {
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onLeave();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isOpen, onLeave]);

  if (!isOpen) return null;

  const sorted = [...rankings].sort((a, b) => a.rank - b.rank);
  const winner = sorted[0];

  // Derive ready state only during the 'waiting' phase (Play Again lobby).
  // During an active game (status='playing'), isReady is stale from game-start
  // and should not influence the UI.
  const isWaiting = room?.status === 'waiting';
  const iAmReady = isWaiting && (room?.players.find((p) => p.userId === currentUserId)?.isReady ?? false);
  const readyPlayers = isWaiting ? (room?.players.filter((p) => p.isReady) ?? []) : [];
  const totalPlayers = room?.players.length ?? 0;
  const waitingFor = isWaiting ? (room?.players.filter((p) => !p.isReady).map((p) => p.username) ?? []) : [];

  return (
    <div
      className={styles.backdrop}
      role="dialog"
      aria-modal="true"
      aria-label="Game Results"
      onClick={(e) => {
        if (e.target === e.currentTarget) onLeave();
      }}
    >
      <div className={styles.modal} ref={dialogRef}>
        <div className={styles.header}>
          <h2 className={styles.title}>Game Over</h2>
          {winner && (
            <p className={styles.winnerLine}>
              {MEDAL[1]} <strong>{winner.username}</strong> wins with{' '}
              <strong>{winner.score.toLocaleString()}</strong>!
            </p>
          )}
        </div>

        <ol className={styles.rankings} aria-label="Final rankings">
          {sorted.map((entry) => {
            const isMe = entry.userId === currentUserId;
            const rankClass =
              entry.rank === 1
                ? styles.rankGold
                : entry.rank === 2
                ? styles.rankSilver
                : entry.rank === 3
                ? styles.rankBronze
                : styles.rankDefault;

            return (
              <li
                key={entry.userId}
                className={`${styles.rankRow} ${rankClass}${isMe ? ` ${styles.currentUser}` : ''}`}
                data-testid={isMe ? 'current-user-row' : undefined}
              >
                <span className={styles.rankNum}>
                  {MEDAL[entry.rank] ?? `#${entry.rank}`}
                </span>
                <span className={styles.username}>{entry.username}</span>
                {isMe && <span className={styles.youBadge}>You</span>}
                <span className={styles.score}>{entry.score.toLocaleString()}</span>
              </li>
            );
          })}
        </ol>

        {history.length > 0 && (
          <div className={styles.historySection}>
            <p className={styles.historyTitle}>Previous Rounds</p>
            <ul className={styles.historyList}>
              {[...history].reverse().map((match, i) => {
                const matchSorted = [...match.rankings].sort((a, b) => a.rank - b.rank);
                const matchWinner = matchSorted[0];
                const roundNum = history.length - i;
                return (
                  <li key={i} className={styles.historyRow}>
                    <span className={styles.historyRound}>R{roundNum}</span>
                    <span className={styles.historyWinner}>
                      {MEDAL[1]} {matchWinner?.username}
                    </span>
                    <span className={styles.historyScores}>
                      {matchSorted.map((e) => (
                        <span
                          key={e.userId}
                          className={e.userId === currentUserId ? styles.historyMe : undefined}
                        >
                          {e.username}: {e.score.toLocaleString()}
                        </span>
                      ))}
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>
        )}

        <div className={styles.actions}>
          <button
            className={iAmReady ? styles.playAgainBtnReady : styles.playAgainBtn}
            onClick={onPlayAgain}
            disabled={iAmReady}
            aria-label={iAmReady ? 'Waiting for others' : 'Play Again'}
          >
            {iAmReady
              ? waitingFor.length > 0
                ? `Waiting for ${waitingFor.join(', ')}…`
                : 'Starting…'
              : totalPlayers > 1
              ? `Play Again (${readyPlayers.length}/${totalPlayers} ready)`
              : 'Play Again'}
          </button>
          <button className={styles.leaveBtn} onClick={onLeave}>
            Leave
          </button>
        </div>
      </div>
    </div>
  );
};

export default PostGameModal;
