import type { OpponentState } from '../hooks/useMultiplayerGame';
import styles from './OpponentBoard.module.css';

interface OpponentBoardProps {
  opponent: OpponentState;
  isWinning: boolean;
}

const TILE_CLASS_MAP: Record<number, string> = {
  2: styles.cell2,
  4: styles.cell4,
  8: styles.cell8,
  16: styles.cell16,
  32: styles.cell32,
  64: styles.cell64,
  128: styles.cell128,
  256: styles.cell256,
  512: styles.cell512,
  1024: styles.cell1024,
  2048: styles.cell2048,
};

const getCellClass = (value: number): string => {
  if (value === 0) return styles.cell;
  return TILE_CLASS_MAP[value] ?? styles.cellLarge;
};

const OpponentBoard = ({ opponent, isWinning }: OpponentBoardProps) => {
  const { username, score, status, boardSnapshot } = opponent;

  return (
    <div className={`${styles.wrapper} ${isWinning ? styles.winningWrapper : ''}`}>
      <div className={styles.header}>
        <span className={styles.username}>{username}</span>
        {isWinning && (
          <span className={styles.crown} aria-label="Currently winning">
            &#9813;
          </span>
        )}
      </div>

      <div className={styles.boardContainer}>
        <div className={styles.grid}>
          {boardSnapshot.map((row, rowIdx) =>
            row.map((value, colIdx) => (
              <div
                key={`${rowIdx}-${colIdx}`}
                className={`${styles.cell} ${getCellClass(value)}`}
                data-value={value || undefined}
              >
                {value !== 0 ? value : null}
              </div>
            ))
          )}
        </div>

        {status !== 'playing' && (
          <div className={styles.overlay}>
            <span className={styles.overlayText}>
              {status === 'won' ? 'Won!' : 'Lost'}
            </span>
          </div>
        )}
      </div>

      <div className={styles.score}>
        Score: <span className={styles.scoreValue}>{score}</span>
      </div>
    </div>
  );
};

export default OpponentBoard;
