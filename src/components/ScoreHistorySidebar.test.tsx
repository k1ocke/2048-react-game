import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import ScoreHistorySidebar from './ScoreHistorySidebar';
import type { ScoreHistoryEntry } from '../types/game';

const mockHistory: ScoreHistoryEntry[] = [
  { score: 4096, status: 'won', date: '1/1/2026' },
  { score: 512, status: 'lost', date: '1/2/2026' },
  { score: 128, status: 'lost', date: '1/3/2026' },
];

describe('ScoreHistorySidebar', () => {
  it('renders the History heading', () => {
    render(<ScoreHistorySidebar history={[]} />);
    expect(screen.getByRole('heading', { name: 'History' })).toBeInTheDocument();
  });

  it('shows empty state when history is empty', () => {
    render(<ScoreHistorySidebar history={[]} />);
    expect(screen.getByText(/no games yet/i)).toBeInTheDocument();
  });

  it('renders all history entries', () => {
    render(<ScoreHistorySidebar history={mockHistory} />);
    expect(screen.getByText('4,096')).toBeInTheDocument();
    expect(screen.getByText('512')).toBeInTheDocument();
    expect(screen.getByText('128')).toBeInTheDocument();
  });

  it('displays Win badge for won games', () => {
    render(<ScoreHistorySidebar history={mockHistory} />);
    const winBadges = screen.getAllByText('Win');
    expect(winBadges).toHaveLength(1);
  });

  it('displays Loss badge for lost games', () => {
    render(<ScoreHistorySidebar history={mockHistory} />);
    const lossBadges = screen.getAllByText('Loss');
    expect(lossBadges).toHaveLength(2);
  });

  it('shows rank numbers', () => {
    render(<ScoreHistorySidebar history={mockHistory} />);
    expect(screen.getByText('#1')).toBeInTheDocument();
    expect(screen.getByText('#2')).toBeInTheDocument();
    expect(screen.getByText('#3')).toBeInTheDocument();
  });

  it('displays the date for each entry', () => {
    render(<ScoreHistorySidebar history={mockHistory} />);
    expect(screen.getByText('1/1/2026')).toBeInTheDocument();
    expect(screen.getByText('1/2/2026')).toBeInTheDocument();
  });

  it('has accessible landmark role', () => {
    render(<ScoreHistorySidebar history={mockHistory} />);
    expect(screen.getByRole('complementary', { name: 'Score history' })).toBeInTheDocument();
  });
});
