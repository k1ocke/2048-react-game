import { memo } from 'react';
import type { ScoreHistoryEntry } from '../types/game';
import styles from './ScoreHistorySidebar.module.css';

interface ScoreHistorySidebarProps {
  /** Game history entries, newest first */
  history: ScoreHistoryEntry[];
}

const formatDuration = (seconds: number) => {
  if (seconds < 60) return `${seconds}s`;
  return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
};

const formatTime = (timestamp: number) =>
  new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

const ScoreHistorySidebar = memo(({ history }: ScoreHistorySidebarProps) => {
  const wins = history.filter((e) => e.status === 'won').length;
  const avgScore =
    history.length > 0
      ? Math.round(history.reduce((sum, e) => sum + e.score, 0) / history.length)
      : 0;

  return (
    <aside className={styles.sidebar} aria-label="Score history">
      <h2 className={styles.title}>History</h2>
      {history.length > 0 && (
        <div className={styles.stats}>
          <span>{history.length} games</span>
          <span>{Math.round((wins / history.length) * 100)}% wins</span>
          <span>avg {avgScore.toLocaleString()}</span>
        </div>
      )}
      {history.length === 0 ? (
        <p className={styles.empty}>No games yet.<br />Play to see your history!</p>
      ) : (
        <ol className={styles.list}>
          {history.map((entry, i) => (
            <li key={`${entry.score}-${entry.date}-${i}`} className={styles.entry}>
              <span className={styles.index}>#{i + 1}</span>
              <span className={styles.score}>{entry.score.toLocaleString()}</span>
              <span
                className={`${styles.badge} ${entry.status === 'won' ? styles.won : styles.lost}`}
              >
                {entry.status === 'won' ? 'Win' : 'Loss'}
              </span>
              <span className={styles.meta}>
                {entry.bestTile != null && (
                  <span className={styles.chip}>top {entry.bestTile.toLocaleString()}</span>
                )}
                {entry.moves != null && (
                  <span className={styles.chip}>{entry.moves}mv</span>
                )}
                {entry.duration != null && (
                  <span className={styles.chip}>{formatDuration(entry.duration)}</span>
                )}
              </span>
              <span className={styles.date}>
                {entry.timestamp != null ? formatTime(entry.timestamp) : entry.date}
              </span>
            </li>
          ))}
        </ol>
      )}
    </aside>
  );
});

export default ScoreHistorySidebar;
