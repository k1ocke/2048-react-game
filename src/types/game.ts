export type Direction = 'up' | 'down' | 'left' | 'right';

export interface LeaderboardEntry {
  score: number;
  date: string;
}

export interface ScoreHistoryEntry {
  score: number;
  status: 'won' | 'lost';
  date: string;
  timestamp?: number;
  moves?: number;
  bestTile?: number;
  duration?: number;
}

export interface Tile {
  id: number;
  value: number;
  row: number;
  col: number;
  merged: boolean;
  isNew: boolean;
}

export interface GameState {
  tiles: Tile[];
  score: number;
  bestScore: number;
  status: 'playing' | 'won' | 'lost';
  size: number;
  moves: number;
  startTime: number;
}
