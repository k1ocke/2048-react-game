import { memo, useEffect, useRef } from 'react';
import type { LeaderboardEntry } from '../types/game';
import type { LeaderboardRow } from '../types/multiplayer';
import { useGlobalLeaderboard } from '../hooks/useGlobalLeaderboard';
import { useFocusTrap } from '../utils/useFocusTrap';
import styles from './LeaderboardPopup.module.css';

interface LeaderboardPopupProps {
  /** Whether the popup is currently visible */
  isOpen: boolean;
  /** Leaderboard entries sorted by score descending (local fallback) */
  entries: LeaderboardEntry[];
  /** Called when the user requests the popup to close */
  onClose: () => void;
  /** If provided, shows global leaderboard instead of local entries */
  token?: string | null;
  /** User ID to highlight in the global leaderboard */
  currentUserId?: string;
}

// ─── Loading skeleton ─────────────────────────────────────────────────────────

const SkeletonRow = () => (
  <li className={styles.skeletonRow} aria-hidden="true">
    <span className={styles.skeleton} style={{ width: 28 }} />
    <span className={styles.skeleton} style={{ flex: 1 }} />
    <span className={styles.skeleton} style={{ width: 60 }} />
    <span className={styles.skeleton} style={{ width: 64 }} />
  </li>
);

// ─── Global entry row ─────────────────────────────────────────────────────────

interface GlobalEntryProps {
  row: LeaderboardRow;
  isHighlighted: boolean;
}

const GlobalEntry = ({ row, isHighlighted }: GlobalEntryProps) => (
  <li
    className={`${styles.globalEntry}${isHighlighted ? ` ${styles.highlighted}` : ''}`}
    data-testid={isHighlighted ? 'highlighted-row' : undefined}
  >
    <span className={styles.rank}>#{row.rank}</span>
    <span className={styles.username}>{row.username}</span>
    <span className={styles.score}>{row.score.toLocaleString()}</span>
    <span className={styles.date}>{row.date}</span>
  </li>
);

// ─── Main component ───────────────────────────────────────────────────────────

const GlobalLeaderboardBody = ({
  token,
  currentUserId,
}: {
  token: string;
  currentUserId?: string;
}) => {
  const { entries, myRank, isLoading, error, refresh } = useGlobalLeaderboard(token);

  if (isLoading) {
    return (
      <ol className={styles.list} aria-label="Loading leaderboard">
        <SkeletonRow />
        <SkeletonRow />
        <SkeletonRow />
      </ol>
    );
  }

  if (error) {
    return (
      <div className={styles.errorState} role="alert">
        <p>{error}</p>
        <button className={styles.retryBtn} onClick={refresh}>
          Retry
        </button>
      </div>
    );
  }

  if (entries.length === 0) {
    return <p className={styles.empty}>No scores yet. Play a game!</p>;
  }

  // Determine whether the user is outside the listed top entries
  const currentUserInList =
    currentUserId != null && entries.some((e) => e.userId === currentUserId);
  const showRankContext =
    myRank != null && !currentUserInList && myRank.surrounding.length > 0;

  return (
    <>
      <ol className={styles.list}>
        {entries.map((row) => (
          <GlobalEntry
            key={row.userId + row.rank}
            row={row}
            isHighlighted={currentUserId != null && row.userId === currentUserId}
          />
        ))}
      </ol>

      {showRankContext && (
        <>
          <div className={styles.divider} aria-hidden="true" />
          <ol className={styles.list} aria-label="Your ranking context">
            {myRank.surrounding.map((row) => (
              <GlobalEntry
                key={`ctx-${row.userId}-${row.rank}`}
                row={row}
                isHighlighted={currentUserId != null && row.userId === currentUserId}
              />
            ))}
          </ol>
        </>
      )}
    </>
  );
};

// ─── Exported component ───────────────────────────────────────────────────────

const LeaderboardPopup = memo(({
  isOpen,
  entries,
  onClose,
  token,
  currentUserId,
}: LeaderboardPopupProps) => {
  const dialogRef = useRef<HTMLDivElement>(null);

  useFocusTrap(dialogRef, isOpen);

  useEffect(() => {
    if (!isOpen) return;
    dialogRef.current?.focus();
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const showGlobal = token != null && token !== '';

  return (
    <div
      className={styles.backdrop}
      role="dialog"
      aria-modal="true"
      aria-label="Leaderboard"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className={styles.popup} ref={dialogRef} tabIndex={-1}>
        <div className={styles.popupHeader}>
          <h2 className={styles.popupTitle}>Leaderboard</h2>
          <button
            className={styles.closeBtn}
            onClick={onClose}
            aria-label="Close leaderboard"
          >
            ✕
          </button>
        </div>

        {showGlobal ? (
          <GlobalLeaderboardBody token={token} currentUserId={currentUserId} />
        ) : entries.length === 0 ? (
          <p className={styles.empty}>No scores yet. Play a game!</p>
        ) : (
          <ol className={styles.list}>
            {entries.slice(0, 10).map((entry, i) => (
              <li key={`local-${entry.score}-${entry.date ?? i}`} className={styles.entry}>
                <span className={styles.rank}>#{i + 1}</span>
                <span className={styles.score}>{entry.score.toLocaleString()}</span>
                <span className={styles.date}>{entry.date}</span>
              </li>
            ))}
          </ol>
        )}
      </div>
    </div>
  );
});

export default LeaderboardPopup;
