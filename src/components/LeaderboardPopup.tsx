import { useEffect, useRef } from 'react';
import type { LeaderboardEntry } from '../types/game';
import styles from './LeaderboardPopup.module.css';

interface LeaderboardPopupProps {
  /** Whether the popup is currently visible */
  isOpen: boolean;
  /** Leaderboard entries sorted by score descending */
  entries: LeaderboardEntry[];
  /** Called when the user requests the popup to close */
  onClose: () => void;
}

const LeaderboardPopup = ({ isOpen, entries, onClose }: LeaderboardPopupProps) => {
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

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
      <div className={styles.popup} ref={dialogRef}>
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

        {entries.length === 0 ? (
          <p className={styles.empty}>No scores yet. Play a game!</p>
        ) : (
          <ol className={styles.list}>
            {entries.map((entry, i) => (
              <li key={i} className={styles.entry}>
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
};

export default LeaderboardPopup;
