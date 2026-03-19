import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import LeaderboardPopup from './LeaderboardPopup';
import type { LeaderboardEntry } from '../types/game';

const mockEntries: LeaderboardEntry[] = [
  { score: 4096, date: '1/1/2026' },
  { score: 2048, date: '1/2/2026' },
  { score: 512, date: '1/3/2026' },
];

describe('LeaderboardPopup', () => {
  it('renders nothing when closed', () => {
    const { container } = render(
      <LeaderboardPopup isOpen={false} entries={mockEntries} onClose={jest.fn()} />
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('renders the popup when open', () => {
    render(
      <LeaderboardPopup isOpen={true} entries={mockEntries} onClose={jest.fn()} />
    );
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText('Leaderboard')).toBeInTheDocument();
  });

  it('displays all leaderboard entries', () => {
    render(
      <LeaderboardPopup isOpen={true} entries={mockEntries} onClose={jest.fn()} />
    );
    expect(screen.getByText('4,096')).toBeInTheDocument();
    expect(screen.getByText('2,048')).toBeInTheDocument();
    expect(screen.getByText('512')).toBeInTheDocument();
  });

  it('shows empty state when no entries', () => {
    render(
      <LeaderboardPopup isOpen={true} entries={[]} onClose={jest.fn()} />
    );
    expect(screen.getByText(/no scores yet/i)).toBeInTheDocument();
  });

  it('calls onClose when close button is clicked', () => {
    const onClose = jest.fn();
    render(
      <LeaderboardPopup isOpen={true} entries={mockEntries} onClose={onClose} />
    );
    fireEvent.click(screen.getByLabelText('Close leaderboard'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('calls onClose when backdrop is clicked', () => {
    const onClose = jest.fn();
    render(
      <LeaderboardPopup isOpen={true} entries={mockEntries} onClose={onClose} />
    );
    fireEvent.click(screen.getByRole('dialog'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('calls onClose when Escape key is pressed', () => {
    const onClose = jest.fn();
    render(
      <LeaderboardPopup isOpen={true} entries={mockEntries} onClose={onClose} />
    );
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('displays rank numbers', () => {
    render(
      <LeaderboardPopup isOpen={true} entries={mockEntries} onClose={jest.fn()} />
    );
    expect(screen.getByText('#1')).toBeInTheDocument();
    expect(screen.getByText('#2')).toBeInTheDocument();
    expect(screen.getByText('#3')).toBeInTheDocument();
  });
});
