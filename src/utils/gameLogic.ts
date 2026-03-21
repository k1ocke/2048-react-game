import type { Tile, Direction, GameState } from '../types/game';

let nextId = 1;

const createTile = (row: number, col: number, value: number): Tile => ({
  id: nextId++,
  value,
  row,
  col,
  merged: false,
  isNew: true,
});

export const createInitialState = (size: number = 4): GameState => {
  const tiles: Tile[] = [];
  const positions = getRandomPositions(size, 2);
  positions.forEach(([row, col]) => {
    tiles.push(createTile(row, col, Math.random() < 0.9 ? 2 : 4));
  });
  return {
    tiles,
    score: 0,
    bestScore: parseInt(localStorage.getItem('2048-best') ?? '0', 10),
    status: 'playing',
    size,
    moves: 0,
    startTime: Date.now(),
  };
};

const getRandomPositions = (size: number, count: number): [number, number][] => {
  const all: [number, number][] = [];
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      all.push([r, c]);
    }
  }
  const shuffled = all.sort(() => Math.random() - 0.5);
  return shuffled.slice(0, count);
};

const getEmptyCells = (tiles: Tile[], size: number): [number, number][] => {
  const occupied = new Set(tiles.map((t) => `${t.row},${t.col}`));
  const empty: [number, number][] = [];
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      if (!occupied.has(`${r},${c}`)) {
        empty.push([r, c]);
      }
    }
  }
  return empty;
};

const addRandomTile = (tiles: Tile[], size: number): Tile[] => {
  const empty = getEmptyCells(tiles, size);
  if (empty.length === 0) return tiles;
  const [row, col] = empty[Math.floor(Math.random() * empty.length)];
  return [...tiles, createTile(row, col, Math.random() < 0.9 ? 2 : 4)];
};

const slideRow = (row: number[]): { row: number[]; score: number } => {
  const filtered = row.filter((v) => v !== 0);
  let score = 0;
  const merged: number[] = [];
  let i = 0;
  while (i < filtered.length) {
    if (i + 1 < filtered.length && filtered[i] === filtered[i + 1]) {
      const val = filtered[i] * 2;
      merged.push(val);
      score += val;
      i += 2;
    } else {
      merged.push(filtered[i]);
      i++;
    }
  }
  while (merged.length < row.length) merged.push(0);
  return { row: merged, score };
};

export const move = (state: GameState, direction: Direction): GameState => {
  if (state.status !== 'playing') return state;

  const { size } = state;
  const grid: number[][] = Array.from({ length: size }, () => Array(size).fill(0));
  state.tiles.forEach((t) => {
    grid[t.row][t.col] = t.value;
  });

  let totalScore = 0;
  let moved = false;
  const newGrid: number[][] = Array.from({ length: size }, () => Array(size).fill(0));

  const processRow = (row: number[]) => {
    const { row: slid, score } = slideRow(row);
    totalScore += score;
    if (slid.some((v, i) => v !== row[i])) moved = true;
    return slid;
  };

  for (let i = 0; i < size; i++) {
    if (direction === 'left') {
      const slid = processRow(grid[i]);
      newGrid[i] = slid;
    } else if (direction === 'right') {
      const slid = processRow([...grid[i]].reverse());
      newGrid[i] = slid.reverse();
    } else if (direction === 'up') {
      const col = grid.map((r) => r[i]);
      const slid = processRow(col);
      slid.forEach((v, r) => (newGrid[r][i] = v));
    } else if (direction === 'down') {
      const col = grid.map((r) => r[i]).reverse();
      const slid = processRow(col);
      slid.reverse().forEach((v, r) => (newGrid[r][i] = v));
    }
  }

  if (!moved) return state;

  const newTiles: Tile[] = [];
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      if (newGrid[r][c] !== 0) {
        newTiles.push(createTile(r, c, newGrid[r][c]));
      }
    }
  }

  const withNew = addRandomTile(newTiles, size);
  const newScore = state.score + totalScore;
  const bestScore = Math.max(newScore, state.bestScore);
  if (bestScore > state.bestScore) {
    localStorage.setItem('2048-best', String(bestScore));
  }

  const hasWon = withNew.some((t) => t.value === 2048);
  const isLost = !hasWon && checkLost(withNew, size);

  return {
    ...state,
    tiles: withNew,
    score: newScore,
    bestScore,
    status: hasWon ? 'won' : isLost ? 'lost' : 'playing',
    moves: state.moves + 1,
  };
};

const checkLost = (tiles: Tile[], size: number): boolean => {
  if (tiles.length < size * size) return false;
  const grid: number[][] = Array.from({ length: size }, () => Array(size).fill(0));
  tiles.forEach((t) => (grid[t.row][t.col] = t.value));

  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      if (c + 1 < size && grid[r][c] === grid[r][c + 1]) return false;
      if (r + 1 < size && grid[r][c] === grid[r + 1][c]) return false;
    }
  }
  return true;
};
