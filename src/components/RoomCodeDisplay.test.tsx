import { render, screen, fireEvent, act } from '@testing-library/react';
import '@testing-library/jest-dom';
import RoomCodeDisplay from './RoomCodeDisplay';

describe('RoomCodeDisplay', () => {
  beforeEach(() => {
    Object.assign(navigator, {
      clipboard: {
        writeText: jest.fn().mockResolvedValue(undefined),
      },
    });
  });

  it('renders the room code', () => {
    render(<RoomCodeDisplay code="ABC123" />);
    expect(screen.getByText('ABC123')).toBeInTheDocument();
  });

  it('calls clipboard.writeText on copy click', async () => {
    render(<RoomCodeDisplay code="XK7P2Q" />);
    const copyBtn = screen.getByRole('button', { name: /copy room code/i });
    await act(async () => {
      fireEvent.click(copyBtn);
    });
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith('XK7P2Q');
  });

  it('shows "Copied!" confirmation after copy', async () => {
    render(<RoomCodeDisplay code="XK7P2Q" />);
    const copyBtn = screen.getByRole('button', { name: /copy room code/i });
    await act(async () => {
      fireEvent.click(copyBtn);
    });
    expect(screen.getByText('Copied!')).toBeInTheDocument();
  });
});
