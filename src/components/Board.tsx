import { memo } from 'react';
import type { GameState } from '../types/game';
import Tile from './Tile';
import styles from './Board.module.css';

interface BoardProps {
  state: GameState;
}

const CELL_SIZE = 100;
const GAP = 12;

const Board = memo(({ state }: BoardProps) => {
  const { tiles, size } = state;
  const boardSize = size * CELL_SIZE + (size + 1) * GAP;

  return (
    <div className={styles.boardWrapper} style={{ width: boardSize, height: boardSize }}>
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
      {state.status !== 'playing' && (
        <div className={styles.overlay}>
          <p>{state.status === 'won' ? 'You win!' : 'Game over!'}</p>
        </div>
      )}
    </div>
  );
});

export default Board;
