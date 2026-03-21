import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import AuthModal from './AuthModal';

const noop = jest.fn();
const successFn = jest.fn().mockResolvedValue(undefined);

const defaultProps = {
  isOpen: true,
  onClose: noop,
  onLogin: successFn,
  onRegister: successFn,
  onLoginAsGuest: successFn,
};

beforeEach(() => {
  jest.clearAllMocks();
  successFn.mockResolvedValue(undefined);
});

describe('AuthModal', () => {
  it('renders nothing when closed', () => {
    const { container } = render(<AuthModal {...defaultProps} isOpen={false} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders login tab by default', () => {
    render(<AuthModal {...defaultProps} />);
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    const loginTab = screen.getByRole('tab', { name: /login/i });
    expect(loginTab).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByLabelText(/username/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/password/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^login$/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /continue as guest/i })).toBeInTheDocument();
  });

  it('switches to register tab when clicked', () => {
    render(<AuthModal {...defaultProps} />);
    const registerTab = screen.getByRole('tab', { name: /register/i });
    fireEvent.click(registerTab);

    expect(registerTab).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('button', { name: /^register$/i })).toBeInTheDocument();
    // Guest link should not be visible on register tab
    expect(screen.queryByRole('button', { name: /continue as guest/i })).not.toBeInTheDocument();
  });

  it('shows error on failed login', async () => {
    const failingLogin = jest.fn().mockRejectedValue(new Error('Invalid username or password'));
    render(<AuthModal {...defaultProps} onLogin={failingLogin} />);

    fireEvent.change(screen.getByLabelText(/username/i), { target: { value: 'baduser' } });
    fireEvent.change(screen.getByLabelText(/password/i), { target: { value: 'badpass' } });
    fireEvent.click(screen.getByRole('button', { name: /^login$/i }));

    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeInTheDocument();
      expect(screen.getByRole('alert')).toHaveTextContent('Invalid username or password');
    });
  });

  it('shows error on failed registration', async () => {
    const failingRegister = jest.fn().mockRejectedValue(new Error('Username already taken'));
    render(<AuthModal {...defaultProps} onRegister={failingRegister} />);

    fireEvent.click(screen.getByRole('tab', { name: /register/i }));
    fireEvent.change(screen.getByLabelText(/username/i), { target: { value: 'takenuser' } });
    fireEvent.change(screen.getByLabelText(/password/i), { target: { value: 'password123' } });
    fireEvent.click(screen.getByRole('button', { name: /^register$/i }));

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('Username already taken');
    });
  });

  it('calls onClose when close button is clicked', () => {
    const onClose = jest.fn();
    render(<AuthModal {...defaultProps} onClose={onClose} />);
    fireEvent.click(screen.getByRole('button', { name: /close/i }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('closes on Escape key press', () => {
    const onClose = jest.fn();
    render(<AuthModal {...defaultProps} onClose={onClose} />);
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('closes on backdrop click', () => {
    const onClose = jest.fn();
    render(<AuthModal {...defaultProps} onClose={onClose} />);
    fireEvent.click(screen.getByRole('dialog'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('calls onLogin with username and password on form submit', async () => {
    const onLogin = jest.fn().mockResolvedValue(undefined);
    const onClose = jest.fn();
    render(<AuthModal {...defaultProps} onLogin={onLogin} onClose={onClose} />);

    fireEvent.change(screen.getByLabelText(/username/i), { target: { value: 'myuser' } });
    fireEvent.change(screen.getByLabelText(/password/i), { target: { value: 'mypass' } });
    fireEvent.click(screen.getByRole('button', { name: /^login$/i }));

    await waitFor(() => {
      expect(onLogin).toHaveBeenCalledWith('myuser', 'mypass');
      expect(onClose).toHaveBeenCalled();
    });
  });

  it('calls onLoginAsGuest when guest link is clicked', async () => {
    const onLoginAsGuest = jest.fn().mockResolvedValue(undefined);
    const onClose = jest.fn();
    render(<AuthModal {...defaultProps} onLoginAsGuest={onLoginAsGuest} onClose={onClose} />);

    fireEvent.click(screen.getByRole('button', { name: /continue as guest/i }));

    await waitFor(() => {
      expect(onLoginAsGuest).toHaveBeenCalledTimes(1);
      expect(onClose).toHaveBeenCalled();
    });
  });
});
