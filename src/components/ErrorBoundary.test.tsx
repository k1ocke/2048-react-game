import { render, screen, fireEvent } from '@testing-library/react';
import ErrorBoundary from './ErrorBoundary';

const Thrower = ({ shouldThrow }: { shouldThrow: boolean }) => {
  if (shouldThrow) throw new Error('boom');
  return <div>ok</div>;
};

// Suppress React's console.error output for expected boundary errors
let consoleSpy: jest.SpyInstance;
beforeEach(() => {
  consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => {
  consoleSpy.mockRestore();
});

describe('ErrorBoundary', () => {
  it('renders children when there is no error', () => {
    render(
      <ErrorBoundary>
        <Thrower shouldThrow={false} />
      </ErrorBoundary>,
    );
    expect(screen.getByText('ok')).toBeDefined();
  });

  it('shows fallback UI when a child throws', () => {
    render(
      <ErrorBoundary>
        <Thrower shouldThrow={true} />
      </ErrorBoundary>,
    );
    expect(screen.getByRole('alert')).toBeDefined();
    expect(screen.getByText('Something went wrong.')).toBeDefined();
    expect(screen.getByText('boom')).toBeDefined();
  });

  it('logs the error via componentDidCatch', () => {
    render(
      <ErrorBoundary>
        <Thrower shouldThrow={true} />
      </ErrorBoundary>,
    );
    expect(consoleSpy).toHaveBeenCalled();
  });

  it('resets to showing children after "Try again" if children no longer throw', () => {
    let throwing = true;
    const Controlled = () => {
      if (throwing) throw new Error('boom');
      return <div>recovered</div>;
    };

    render(
      <ErrorBoundary>
        <Controlled />
      </ErrorBoundary>,
    );
    expect(screen.getByRole('alert')).toBeDefined();

    throwing = false;
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));

    expect(screen.getByText('recovered')).toBeDefined();
  });
});
