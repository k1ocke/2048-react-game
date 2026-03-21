import { memo, useEffect, useState } from 'react';
import type { GameState } from '../types/game';
import Tile from './Tile';
import styles from './Board.module.css';

interface BoardProps {
  state: GameState;
  hideStatusOverlay?: boolean;
}

const CELL_SIZE = 100;
const GAP = 12;

const Board = memo(({ state, hideStatusOverlay }: BoardProps) => {
  const { tiles, size } = state;
  const boardSize = size * CELL_SIZE + (size + 1) * GAP;
  const [announcement, setAnnouncement] = useState('');

  useEffect(() => {
    setAnnouncement(`Score: ${state.score}`);
  }, [state.score]);

  return (
    <div
      className={styles.boardWrapper}
      style={{ width: `min(${boardSize}px, 100%)`, maxWidth: boardSize, aspectRatio: '1' }}
      role="region"
      aria-label="Game board"
    >
      <span className={styles.srOnly} aria-live="polite" aria-atomic="true">
        {announcement}
      </span>
      <div className={styles.grid}>
        {Array.from({ length: size * size }).map((_, i) => (
          <div key={i} className={styles.cell} />
        ))}
      </div>
      <div className={styles.tiles}>
        {tiles.map((tile) => (
          <Tile key={tile.id} tile={tile} />
        ))}
      </div>
      {state.status !== 'playing' && !hideStatusOverlay && (
        <div className={styles.overlay} role="alert">
          <p>{state.status === 'won' ? 'You win!' : 'Game over!'}</p>
        </div>
      )}
    </div>
  );
});

export default Board;
