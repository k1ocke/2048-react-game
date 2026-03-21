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

  it('displays the date for entries without a timestamp', () => {
    render(<ScoreHistorySidebar history={mockHistory} />);
    expect(screen.getByText('1/1/2026')).toBeInTheDocument();
    expect(screen.getByText('1/2/2026')).toBeInTheDocument();
  });

  it('shows aggregate stats when history is non-empty', () => {
    render(<ScoreHistorySidebar history={mockHistory} />);
    expect(screen.getByText('3 games')).toBeInTheDocument();
    expect(screen.getByText(/wins/)).toBeInTheDocument();
  });

  it('renders move count chip when moves are present', () => {
    const historyWithStats: ScoreHistoryEntry[] = [
      { score: 512, status: 'lost', date: '1/1/2026', moves: 42, bestTile: 256 },
    ];
    render(<ScoreHistorySidebar history={historyWithStats} />);
    expect(screen.getByText('42mv')).toBeInTheDocument();
    expect(screen.getByText('top 256')).toBeInTheDocument();
  });

  it('renders duration chip when duration is present', () => {
    const historyWithDuration: ScoreHistoryEntry[] = [
      { score: 200, status: 'lost', date: '1/1/2026', duration: 75 },
    ];
    render(<ScoreHistorySidebar history={historyWithDuration} />);
    expect(screen.getByText('1m 15s')).toBeInTheDocument();
  });

  it('has accessible landmark role', () => {
    render(<ScoreHistorySidebar history={mockHistory} />);
    expect(screen.getByRole('complementary', { name: 'Score history' })).toBeInTheDocument();
  });
});
