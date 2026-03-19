import type { ScoreHistoryEntry } from '../types/game';
import styles from './ScoreHistorySidebar.module.css';

interface ScoreHistorySidebarProps {
  /** Game history entries, newest first */
  history: ScoreHistoryEntry[];
}

const ScoreHistorySidebar = ({ history }: ScoreHistorySidebarProps) => (
  <aside className={styles.sidebar} aria-label="Score history">
    <h2 className={styles.title}>History</h2>
    {history.length === 0 ? (
      <p className={styles.empty}>No games yet.<br />Play to see your history!</p>
    ) : (
      <ol className={styles.list}>
        {history.map((entry, i) => (
          <li key={i} className={styles.entry}>
            <span className={styles.index}>#{i + 1}</span>
            <span className={styles.score}>{entry.score.toLocaleString()}</span>
            <span
              className={`${styles.badge} ${entry.status === 'won' ? styles.won : styles.lost}`}
            >
              {entry.status === 'won' ? 'Win' : 'Loss'}
            </span>
            <span className={styles.date}>{entry.date}</span>
          </li>
        ))}
      </ol>
    )}
  </aside>
);

export default ScoreHistorySidebar;
