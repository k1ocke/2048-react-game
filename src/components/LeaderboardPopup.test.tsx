import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import LeaderboardPopup from './LeaderboardPopup';
import type { LeaderboardEntry } from '../types/game';
import type { LeaderboardRow } from '../types/multiplayer';

// ─── Shared fixtures ──────────────────────────────────────────────────────────

const mockEntries: LeaderboardEntry[] = [
  { score: 4096, date: '1/1/2026' },
  { score: 2048, date: '1/2/2026' },
  { score: 512,  date: '1/3/2026' },
];

const mockGlobalRows: LeaderboardRow[] = [
  { rank: 1, userId: 'u1', username: 'Alice', score: 8192, date: '2026-01-01' },
  { rank: 2, userId: 'u2', username: 'Bob',   score: 4096, date: '2026-01-02' },
  { rank: 3, userId: 'u3', username: 'Carol', score: 2048, date: '2026-01-03' },
];

const makeOkResponse = (data: unknown) =>
  Promise.resolve({
    ok: true,
    status: 200,
    json: () => Promise.resolve(data),
  } as Response);

const makeErrorResponse = (status: number) =>
  Promise.resolve({
    ok: false,
    status,
    json: () => Promise.resolve({ message: `Error ${status}` }),
  } as Response);

beforeEach(() => {
  jest.resetAllMocks();
  globalThis.fetch = jest.fn() as typeof fetch;
});

// ─── Existing local-fallback tests (must not regress) ─────────────────────────

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

  // ─── New: global leaderboard path ───────────────────────────────────────────

  it('renders loading skeleton when global fetch is in progress', () => {
    (globalThis.fetch as jest.Mock).mockReturnValue(new Promise(() => {})); // never resolves
    render(
      <LeaderboardPopup
        isOpen={true}
        entries={[]}
        onClose={jest.fn()}
        token="test-token"
      />
    );
    // Skeleton rows are aria-hidden; we check the container has the expected structure
    expect(screen.getByLabelText('Loading leaderboard')).toBeInTheDocument();
  });

  it('renders global entries when token provided and fetch succeeds', async () => {
    (globalThis.fetch as jest.Mock)
      .mockReturnValueOnce(makeOkResponse(mockGlobalRows))  // global leaderboard
      .mockReturnValueOnce(makeOkResponse({ rank: 1, surrounding: [] })); // /me
    render(
      <LeaderboardPopup
        isOpen={true}
        entries={[]}
        onClose={jest.fn()}
        token="test-token"
      />
    );
    await waitFor(() => expect(screen.getByText('Alice')).toBeInTheDocument());
    expect(screen.getByText('Bob')).toBeInTheDocument();
    expect(screen.getByText('Carol')).toBeInTheDocument();
    expect(screen.getByText('8,192')).toBeInTheDocument();
  });

  it('highlights the current user row', async () => {
    (globalThis.fetch as jest.Mock)
      .mockReturnValueOnce(makeOkResponse(mockGlobalRows))
      .mockReturnValueOnce(makeOkResponse({ rank: 2, surrounding: [] }));
    render(
      <LeaderboardPopup
        isOpen={true}
        entries={[]}
        onClose={jest.fn()}
        token="test-token"
        currentUserId="u2"
      />
    );
    await waitFor(() => expect(screen.getByTestId('highlighted-row')).toBeInTheDocument());
    expect(screen.getByTestId('highlighted-row')).toHaveTextContent('Bob');
  });

  it('shows error state with retry button on fetch failure', async () => {
    (globalThis.fetch as jest.Mock).mockReturnValue(makeErrorResponse(500));
    render(
      <LeaderboardPopup
        isOpen={true}
        entries={[]}
        onClose={jest.fn()}
        token="test-token"
      />
    );
    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument());
    expect(screen.getByRole('button', { name: /retry/i })).toBeInTheDocument();
  });

  it('retries fetch when Retry button is clicked', async () => {
    (globalThis.fetch as jest.Mock)
      .mockReturnValueOnce(makeErrorResponse(500))
      .mockReturnValueOnce(makeOkResponse(mockGlobalRows))
      .mockReturnValueOnce(makeOkResponse({ rank: 1, surrounding: [] }));

    render(
      <LeaderboardPopup
        isOpen={true}
        entries={[]}
        onClose={jest.fn()}
        token="test-token"
      />
    );
    await waitFor(() => expect(screen.getByRole('button', { name: /retry/i })).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: /retry/i }));

    await waitFor(() => expect(screen.getByText('Alice')).toBeInTheDocument());
  });
});
