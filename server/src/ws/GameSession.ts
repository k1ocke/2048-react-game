export interface PlayerGameState {
  userId: string;
  board: number[][];
  score: number;
  moves: number;
  status: 'playing' | 'won' | 'lost';
}

// ─── Pure game logic ──────────────────────────────────────────────────────────

const BOARD_SIZE = 4;
const WIN_TILE = 2048;

/** Slide a single row left: merge equal adjacent pairs, no chain merges. */
const slideRow = (row: number[]): { row: number[]; score: number } => {
  const tiles = row.filter((v) => v !== 0);
  let score = 0;
  const merged: number[] = [];
  let i = 0;
  while (i < tiles.length) {
    if (i + 1 < tiles.length && tiles[i] === tiles[i + 1]) {
      const val = tiles[i] * 2;
      merged.push(val);
      score += val;
      i += 2;
    } else {
      merged.push(tiles[i]);
      i++;
    }
  }
  while (merged.length < BOARD_SIZE) {
    merged.push(0);
  }
  return { row: merged, score };
};

const transpose = (board: number[][]): number[][] =>
  board[0].map((_, colIdx) => board.map((row) => row[colIdx]));

const reverseRows = (board: number[][]): number[][] =>
  board.map((row) => [...row].reverse());

/**
 * Apply a move to a board.
 * Strategy: normalise every direction to a left-slide by rotating/transposing,
 * then rotate/transpose back.
 */
const applyMoveToBoard = (
  board: number[][],
  direction: 'up' | 'down' | 'left' | 'right',
): { board: number[][]; score: number } => {
  let working = board.map((row) => [...row]);

  // Transform so the move is always "slide left"
  if (direction === 'right') {
    working = reverseRows(working);
  } else if (direction === 'up') {
    working = transpose(working);
  } else if (direction === 'down') {
    working = reverseRows(transpose(working));
  }

  let totalScore = 0;
  const slid = working.map((row) => {
    const result = slideRow(row);
    totalScore += result.score;
    return result.row;
  });

  // Undo the transformation
  let result = slid;
  if (direction === 'right') {
    result = reverseRows(slid);
  } else if (direction === 'up') {
    result = transpose(slid);
  } else if (direction === 'down') {
    result = transpose(reverseRows(slid));
  }

  return { board: result, score: totalScore };
};

const spawnTile = (board: number[][]): number[][] => {
  const empty: [number, number][] = [];
  for (let r = 0; r < BOARD_SIZE; r++) {
    for (let c = 0; c < BOARD_SIZE; c++) {
      if (board[r][c] === 0) empty.push([r, c]);
    }
  }
  if (empty.length === 0) return board;
  const [r, c] = empty[Math.floor(Math.random() * empty.length)];
  const newBoard = board.map((row) => [...row]);
  newBoard[r][c] = Math.random() < 0.9 ? 2 : 4;
  return newBoard;
};

const hasWon = (board: number[][]): boolean =>
  board.some((row) => row.some((v) => v >= WIN_TILE));

const hasMovesLeft = (board: number[][]): boolean => {
  for (let r = 0; r < BOARD_SIZE; r++) {
    for (let c = 0; c < BOARD_SIZE; c++) {
      if (board[r][c] === 0) return true;
      if (c + 1 < BOARD_SIZE && board[r][c] === board[r][c + 1]) return true;
      if (r + 1 < BOARD_SIZE && board[r][c] === board[r + 1][c]) return true;
    }
  }
  return false;
};

const initialBoard = (): number[][] => {
  let board: number[][] = Array.from({ length: BOARD_SIZE }, () =>
    Array(BOARD_SIZE).fill(0),
  );
  board = spawnTile(board);
  board = spawnTile(board);
  return board;
};

// ─── GameSession ──────────────────────────────────────────────────────────────

export class GameSession {
  private players: Map<string, PlayerGameState> = new Map();
  // Client-reported scores override the server simulation for rankings
  private clientScores: Map<string, { score: number; status: 'playing' | 'won' | 'lost' }> = new Map();

  /** Replaces a player's board with the given matrix. Useful in tests for deterministic scenarios. */
  setBoard(userId: string, board: number[][]): void {
    const state = this.players.get(userId);
    if (state) {
      state.board = board.map((row) => [...row]);
    }
  }

  addPlayer(userId: string): void {
    this.players.set(userId, {
      userId,
      board: initialBoard(),
      score: 0,
      moves: 0,
      status: 'playing',
    });
  }

  applyMove(
    userId: string,
    direction: 'up' | 'down' | 'left' | 'right',
  ): PlayerGameState | null {
    const state = this.players.get(userId);
    if (!state || state.status !== 'playing') return null;

    const { board: newBoard, score: gained } = applyMoveToBoard(state.board, direction);

    // Detect if the board actually changed
    const changed = newBoard.some((row, r) =>
      row.some((v, c) => v !== state.board[r][c]),
    );

    if (!changed) {
      return state; // no-op move
    }

    state.board = spawnTile(newBoard);
    state.score += gained;
    state.moves += 1;

    if (hasWon(state.board)) {
      state.status = 'won';
    } else if (!hasMovesLeft(state.board)) {
      state.status = 'lost';
    }

    return state;
  }

  getState(userId: string): PlayerGameState | undefined {
    return this.players.get(userId);
  }

  getAllStates(): PlayerGameState[] {
    return Array.from(this.players.values());
  }

  setClientScore(userId: string, score: number, status: 'playing' | 'won' | 'lost'): void {
    this.clientScores.set(userId, { score, status });
  }

  getClientScore(userId: string): { score: number; status: 'playing' | 'won' | 'lost' } | undefined {
    return this.clientScores.get(userId);
  }

  isComplete(): boolean {
    if (this.players.size === 0) return false;
    return Array.from(this.players.keys()).every((userId) => {
      const client = this.clientScores.get(userId);
      if (client) return client.status !== 'playing';
      const sim = this.players.get(userId)!;
      return sim.status === 'won' || sim.status === 'lost';
    });
  }

  getFinalRankings(): Array<{ userId: string; score: number; rank: number }> {
    const entries = Array.from(this.players.keys()).map((userId) => {
      const client = this.clientScores.get(userId);
      const sim = this.players.get(userId)!;
      return { userId, score: client?.score ?? sim.score };
    });
    const sorted = entries.sort((a, b) => b.score - a.score);
    return sorted.map((p, idx) => ({ userId: p.userId, score: p.score, rank: idx + 1 }));
  }
}
