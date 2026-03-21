import { memo } from 'react';
import type { Tile as TileType } from '../types/game';
import styles from './Tile.module.css';

interface TileProps {
  tile: TileType;
}

const CELL_SIZE = 100;
const GAP = 12;

const Tile = memo(({ tile }: TileProps) => {
  const x = tile.col * (CELL_SIZE + GAP);
  const y = tile.row * (CELL_SIZE + GAP);

  const valueClass = styles[`tile${tile.value}`]
    ?? (tile.value >= 16384 ? styles.tileHuge : styles.tileLarge);

  const classNames = [
    styles.tile,
    valueClass,
    tile.isNew ? styles.tileNew : '',
    tile.merged ? styles.tileMerged : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div
      className={classNames}
      style={{ top: y, left: x }}
      aria-label={`Tile with value ${tile.value}`}
    >
      {tile.value}
    </div>
  );
});

export default Tile;
