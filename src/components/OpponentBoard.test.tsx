import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import OpponentBoard from './OpponentBoard';
import type { OpponentState } from '../hooks/useMultiplayerGame';

const makeBoard = (value = 0): number[][] =>
  Array.from({ length: 4 }, () => Array(4).fill(value));

const baseOpponent: OpponentState = {
  userId: 'user-1',
  username: 'PlayerOne',
  score: 256,
  status: 'playing',
  boardSnapshot: makeBoard(0),
};

describe('OpponentBoard', () => {
  it('renders opponent username and score', () => {
    render(<OpponentBoard opponent={baseOpponent} isWinning={false} />);
    expect(screen.getByText('PlayerOne')).toBeInTheDocument();
    expect(screen.getByText('256')).toBeInTheDocument();
  });

  it('shows "Won!" overlay when status is won', () => {
    const opponent = { ...baseOpponent, status: 'won' as const };
    render(<OpponentBoard opponent={opponent} isWinning={false} />);
    expect(screen.getByText('Won!')).toBeInTheDocument();
  });

  it('shows "Lost" overlay when status is lost', () => {
    const opponent = { ...baseOpponent, status: 'lost' as const };
    render(<OpponentBoard opponent={opponent} isWinning={false} />);
    expect(screen.getByText('Lost')).toBeInTheDocument();
  });

  it('renders cells for each tile value in boardSnapshot', () => {
    const board: number[][] = [
      [2, 4, 8, 16],
      [32, 64, 128, 256],
      [512, 1024, 2048, 0],
      [0, 0, 0, 0],
    ];
    const opponent = { ...baseOpponent, boardSnapshot: board };
    render(<OpponentBoard opponent={opponent} isWinning={false} />);

    // Non-zero values should be visible as text
    expect(screen.getByText('2')).toBeInTheDocument();
    expect(screen.getByText('2048')).toBeInTheDocument();
    expect(screen.getByText('1024')).toBeInTheDocument();
  });

  it('shows crown indicator when isWinning is true', () => {
    render(<OpponentBoard opponent={baseOpponent} isWinning={true} />);
    expect(screen.getByLabelText('Currently winning')).toBeInTheDocument();
  });

  it('does not show crown indicator when isWinning is false', () => {
    render(<OpponentBoard opponent={baseOpponent} isWinning={false} />);
    expect(screen.queryByLabelText('Currently winning')).not.toBeInTheDocument();
  });
});
