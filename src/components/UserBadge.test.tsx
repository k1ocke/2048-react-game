import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import userEvent from '@testing-library/user-event';
import UserBadge from './UserBadge';
import type { CurrentUser } from '../types/multiplayer';

// ── fixtures ──────────────────────────────────────────────────────────────────

const fullUser: CurrentUser = {
  id: 'user-1',
  username: 'alice',
  createdAt: '2025-01-01T00:00:00Z',
  stats: { totalGames: 10, wins: 5, bestScore: 2048, totalScore: 5000, totalMoves: 200 },
};

const guestUser: CurrentUser = {
  id: 'guest-123',
  username: 'Guest-4567',
  isGuest: true,
};

const defaultProps = {
  onSignInClick: jest.fn(),
  onProfileClick: jest.fn(),
};

// ── tests ─────────────────────────────────────────────────────────────────────

describe('UserBadge', () => {
  it('renders a skeleton placeholder while loading', () => {
    const { container } = render(
      <UserBadge {...defaultProps} user={null} isLoading={true} />,
    );
    expect(container.firstChild).toBeInTheDocument();
    expect(container.firstChild).toHaveAttribute('aria-hidden', 'true');
  });

  it('shows Guest label and Sign up button when user is null', () => {
    render(<UserBadge {...defaultProps} user={null} isLoading={false} />);
    expect(screen.getByText('Guest')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /sign up/i })).toBeInTheDocument();
  });

  it('shows Guest label and Sign up button for a guest user', () => {
    render(<UserBadge {...defaultProps} user={guestUser} isLoading={false} />);
    expect(screen.getByText('Guest')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /sign up/i })).toBeInTheDocument();
  });

  it('shows the username for a full user', () => {
    render(<UserBadge {...defaultProps} user={fullUser} isLoading={false} />);
    expect(screen.getByText('alice')).toBeInTheDocument();
  });

  it('shows initials derived from username', () => {
    render(<UserBadge {...defaultProps} user={fullUser} isLoading={false} />);
    expect(screen.getByText('AL')).toBeInTheDocument();
  });

  it('calls onSignInClick when Sign up is clicked', async () => {
    const onSignInClick = jest.fn();
    render(
      <UserBadge {...defaultProps} onSignInClick={onSignInClick} user={null} isLoading={false} />,
    );
    await userEvent.click(screen.getByRole('button', { name: /sign up/i }));
    expect(onSignInClick).toHaveBeenCalled();
  });

  it('calls onProfileClick when user button is clicked', async () => {
    const onProfileClick = jest.fn();
    render(
      <UserBadge {...defaultProps} onProfileClick={onProfileClick} user={fullUser} isLoading={false} />,
    );
    await userEvent.click(screen.getByRole('button', { name: /open profile/i }));
    expect(onProfileClick).toHaveBeenCalled();
  });
});
