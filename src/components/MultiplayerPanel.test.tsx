import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import userEvent from '@testing-library/user-event';
import MultiplayerPanel from './MultiplayerPanel';
import type { OpponentState } from '../hooks/useMultiplayerGame';

// ── fixtures ──────────────────────────────────────────────────────────────────

const makeOpponent = (overrides?: Partial<OpponentState>): OpponentState => ({
  userId: 'opp-1',
  username: 'bob',
  score: 128,
  status: 'playing',
  boardSnapshot: [],
  ...overrides,
});

const rankings = [
  { userId: 'me', username: 'alice', score: 2048, rank: 1 },
  { userId: 'opp-1', username: 'bob', score: 1024, rank: 2 },
];

// ── tests ─────────────────────────────────────────────────────────────────────

describe('MultiplayerPanel', () => {
  const defaultProps = {
    opponents: [],
    myScore: 0,
    rankings: null,
    onLeave: jest.fn(),
    connected: true,
  };

  it('renders the panel title', () => {
    render(<MultiplayerPanel {...defaultProps} />);
    expect(screen.getByText('Multiplayer')).toBeInTheDocument();
  });

  it('shows "Waiting for opponents" when opponents list is empty and no rankings', () => {
    render(<MultiplayerPanel {...defaultProps} />);
    expect(screen.getByText(/Waiting for opponents/i)).toBeInTheDocument();
  });

  it('shows my score when no rankings', () => {
    render(<MultiplayerPanel {...defaultProps} myScore={512} />);
    expect(screen.getByText('512')).toBeInTheDocument();
  });

  it('renders opponent username and score', () => {
    render(
      <MultiplayerPanel
        {...defaultProps}
        opponents={[makeOpponent({ username: 'charlie', score: 256 })]}
      />,
    );
    expect(screen.getByText('charlie')).toBeInTheDocument();
  });

  it('renders rankings when provided (not opponents list)', () => {
    render(
      <MultiplayerPanel
        {...defaultProps}
        opponents={[makeOpponent()]}
        rankings={rankings}
      />,
    );
    expect(screen.getByText('alice')).toBeInTheDocument();
    expect(screen.getByText('bob')).toBeInTheDocument();
    // Should NOT show the live "Waiting for opponents" text
    expect(screen.queryByText(/Waiting for opponents/i)).not.toBeInTheDocument();
  });

  it('shows rank numbers in rankings view', () => {
    render(
      <MultiplayerPanel
        {...defaultProps}
        rankings={rankings}
      />,
    );
    expect(screen.getByText('#1')).toBeInTheDocument();
    expect(screen.getByText('#2')).toBeInTheDocument();
  });

  it('calls onLeave when Leave Game is clicked', async () => {
    const onLeave = jest.fn();
    render(<MultiplayerPanel {...defaultProps} onLeave={onLeave} />);
    await userEvent.click(screen.getByRole('button', { name: /leave game/i }));
    expect(onLeave).toHaveBeenCalled();
  });
});
