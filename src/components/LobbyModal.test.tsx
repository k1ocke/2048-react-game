import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import LobbyModal from './LobbyModal';
import type { GameRoom } from '../types/multiplayer';

const mockRoom: GameRoom = {
  id: 'ABC123',
  hostId: 'u1',
  maxPlayers: 2,
  status: 'waiting',
  createdAt: '2026-01-01T00:00:00Z',
  players: [
    { userId: 'u1', username: 'Alice', isHost: true, isReady: false },
    { userId: 'u2', username: 'Bob', isHost: false, isReady: true },
  ],
};

const defaultProps = {
  isOpen: true,
  onClose: jest.fn(),
  onRoomReady: jest.fn(),
  sendMessage: jest.fn(),
  leaveRoom: jest.fn(),
  room: null,
  connected: true,
  currentUserId: 'u1',
  error: null,
};

beforeEach(() => {
  jest.clearAllMocks();
  // Provide clipboard API
  Object.assign(navigator, {
    clipboard: { writeText: jest.fn().mockResolvedValue(undefined) },
  });
});

describe('LobbyModal', () => {
  it('does not render when isOpen is false', () => {
    const { container } = render(<LobbyModal {...defaultProps} isOpen={false} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders entry view when room is null', () => {
    render(<LobbyModal {...defaultProps} />);
    expect(screen.getByText('Create Room')).toBeInTheDocument();
    expect(screen.getByText('Join Room')).toBeInTheDocument();
  });

  it('disables buttons when not connected', () => {
    render(<LobbyModal {...defaultProps} connected={false} />);
    const buttons = screen.getAllByRole('button');
    const actionBtns = buttons.filter(
      (b) => b.textContent === 'Connecting…'
    );
    expect(actionBtns.length).toBeGreaterThan(0);
    actionBtns.forEach((btn) => expect(btn).toBeDisabled());
  });

  it('calls sendMessage with room:create on Create button click', () => {
    const sendMessage = jest.fn();
    render(<LobbyModal {...defaultProps} sendMessage={sendMessage} />);
    fireEvent.click(screen.getByRole('button', { name: /^create$/i }));
    expect(sendMessage).toHaveBeenCalledWith({ type: 'room:create', maxPlayers: 2 });
  });

  it('calls sendMessage with room:join on Join button click (uppercases the code)', () => {
    const sendMessage = jest.fn();
    render(<LobbyModal {...defaultProps} sendMessage={sendMessage} />);
    const input = screen.getByRole('textbox', { name: /room code/i });
    fireEvent.change(input, { target: { value: 'abc123' } });
    fireEvent.click(screen.getByRole('button', { name: /^join$/i }));
    expect(sendMessage).toHaveBeenCalledWith({ type: 'room:join', roomId: 'ABC123' });
  });

  it('renders waiting room view when room is provided', () => {
    render(<LobbyModal {...defaultProps} room={mockRoom} />);
    expect(screen.getByText('Waiting Room')).toBeInTheDocument();
    expect(screen.getByText('ABC123')).toBeInTheDocument();
    expect(screen.getByText('Alice')).toBeInTheDocument();
    expect(screen.getByText('Bob')).toBeInTheDocument();
  });

  it('calls leaveRoom on Leave click', () => {
    const leaveRoom = jest.fn();
    render(<LobbyModal {...defaultProps} leaveRoom={leaveRoom} room={mockRoom} />);
    fireEvent.click(screen.getByRole('button', { name: /leave room/i }));
    expect(leaveRoom).toHaveBeenCalled();
  });

  it('calls sendMessage with room:ready on Ready click', () => {
    const sendMessage = jest.fn();
    render(<LobbyModal {...defaultProps} sendMessage={sendMessage} room={mockRoom} />);
    fireEvent.click(screen.getByRole('button', { name: /^ready/i }));
    expect(sendMessage).toHaveBeenCalledWith({ type: 'room:ready' });
  });
});
