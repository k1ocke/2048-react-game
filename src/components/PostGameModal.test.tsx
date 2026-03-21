import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import PostGameModal from './PostGameModal';
import type { GameRoom } from '../types/multiplayer';

const mockRankings = [
  { userId: 'u1', username: 'Alice', score: 8192, rank: 1 },
  { userId: 'u2', username: 'Bob', score: 4096, rank: 2 },
  { userId: 'u3', username: 'Carol', score: 2048, rank: 3 },
];

const mockRoom: GameRoom = {
  id: 'ABC123',
  hostId: 'u1',
  maxPlayers: 2,
  status: 'waiting',
  createdAt: '2026-01-01T00:00:00Z',
  players: [
    { userId: 'u1', username: 'Alice', isHost: true, isReady: false },
    { userId: 'u2', username: 'Bob', isHost: false, isReady: false },
  ],
};

const defaultProps = {
  isOpen: true,
  rankings: mockRankings,
  history: [],
  room: null,
  currentUserId: 'u1',
  onPlayAgain: jest.fn(),
  onLeave: jest.fn(),
};

beforeEach(() => jest.clearAllMocks());

describe('PostGameModal', () => {
  it('renders rankings in order', () => {
    render(<PostGameModal {...defaultProps} />);
    const items = screen.getAllByRole('listitem');
    expect(items[0]).toHaveTextContent('Alice');
    expect(items[1]).toHaveTextContent('Bob');
    expect(items[2]).toHaveTextContent('Carol');
  });

  it('highlights current user\'s row', () => {
    render(<PostGameModal {...defaultProps} currentUserId="u2" />);
    const currentUserRow = screen.getByTestId('current-user-row');
    expect(currentUserRow).toHaveTextContent('Bob');
    expect(screen.getByText('You')).toBeInTheDocument();
  });

  it('calls onLeave when Leave is clicked', () => {
    const onLeave = jest.fn();
    render(<PostGameModal {...defaultProps} onLeave={onLeave} />);
    fireEvent.click(screen.getByRole('button', { name: /leave/i }));
    expect(onLeave).toHaveBeenCalledTimes(1);
  });

  it('calls onPlayAgain when Play Again is clicked', () => {
    const onPlayAgain = jest.fn();
    render(<PostGameModal {...defaultProps} onPlayAgain={onPlayAgain} />);
    fireEvent.click(screen.getByRole('button', { name: /play again/i }));
    expect(onPlayAgain).toHaveBeenCalledTimes(1);
  });

  it('does not render when isOpen is false', () => {
    const { container } = render(<PostGameModal {...defaultProps} isOpen={false} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('shows winner announcement', () => {
    render(<PostGameModal {...defaultProps} />);
    expect(screen.getByText(/wins with/)).toBeInTheDocument();
    expect(screen.getAllByText(/Alice/).length).toBeGreaterThan(0);
  });

  it('shows match history when previous rounds exist', () => {
    const history = [
      {
        rankings: [
          { userId: 'u1', username: 'Alice', score: 5000, rank: 1 },
          { userId: 'u2', username: 'Bob', score: 3000, rank: 2 },
        ],
        playedAt: new Date(),
      },
    ];
    render(<PostGameModal {...defaultProps} history={history} />);
    expect(screen.getByText('Previous Rounds')).toBeInTheDocument();
    expect(screen.getByText(/R1/)).toBeInTheDocument();
  });

  it('does not show history section when no previous rounds', () => {
    render(<PostGameModal {...defaultProps} history={[]} />);
    expect(screen.queryByText('Previous Rounds')).not.toBeInTheDocument();
  });

  it('shows ready count when room is provided', () => {
    render(<PostGameModal {...defaultProps} room={mockRoom} />);
    expect(screen.getByRole('button', { name: /play again/i })).toHaveTextContent('0/2 ready');
  });

  it('disables Play Again button and shows waiting message when current user is ready', () => {
    const roomWithMeReady: GameRoom = {
      ...mockRoom,
      players: [
        { userId: 'u1', username: 'Alice', isHost: true, isReady: true },
        { userId: 'u2', username: 'Bob', isHost: false, isReady: false },
      ],
    };
    render(<PostGameModal {...defaultProps} room={roomWithMeReady} />);
    const btn = screen.getByRole('button', { name: /waiting for others/i });
    expect(btn).toBeDisabled();
    expect(btn).toHaveTextContent(/Waiting for Bob/);
  });
});
