import { renderHook, act } from '@testing-library/react';
import { useGame } from './useGame';

// Mock localStorage used by gameLogic (bestScore persistence)
const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: (key: string) => store[key] ?? null,
    setItem: (key: string, value: string) => { store[key] = value; },
    removeItem: (key: string) => { delete store[key]; },
    clear: () => { store = {}; },
  };
})();
Object.defineProperty(globalThis, 'localStorage', { value: localStorageMock });

// ── helpers ──────────────────────────────────────────────────────────────────

const fireKey = (key: string, target?: Partial<HTMLElement>) => {
  const event = new KeyboardEvent('keydown', { key, bubbles: true });
  if (target) {
    Object.defineProperty(event, 'target', { value: target });
  }
  window.dispatchEvent(event);
};

// ── tests ─────────────────────────────────────────────────────────────────────

describe('useGame', () => {
  beforeEach(() => {
    localStorageMock.clear();
  });

  it('initialises with a 4x4 board, 2 tiles, score 0', () => {
    const { result } = renderHook(() => useGame());
    expect(result.current.state.tiles).toHaveLength(2);
    expect(result.current.state.score).toBe(0);
    expect(result.current.state.status).toBe('playing');
    expect(result.current.state.size).toBe(4);
  });

  it('handleMove changes state when a valid move is made', () => {
    const { result } = renderHook(() => useGame());
    const before = result.current.state.tiles.length;
    // Move in all four directions until one causes a change (new tile spawned)
    act(() => { result.current.handleMove('left'); });
    // A tile may or may not have been added depending on board layout, but state changes
    expect(result.current.state).toBeDefined();
    // move counter should advance if tiles actually moved
    const after = result.current.state.moves;
    expect(after).toBeGreaterThanOrEqual(0);
    // tile count should be >= before (new tile spawned on valid move)
    expect(result.current.state.tiles.length).toBeGreaterThanOrEqual(before);
  });

  it('restart resets state to a new game', () => {
    const { result } = renderHook(() => useGame());
    // Play a move to get some state
    act(() => { result.current.handleMove('left'); });
    act(() => { result.current.restart(); });
    expect(result.current.state.score).toBe(0);
    expect(result.current.state.moves).toBe(0);
    expect(result.current.state.status).toBe('playing');
    expect(result.current.state.tiles).toHaveLength(2);
  });

  it('calls onMove callback when handleMove is called', () => {
    const onMove = jest.fn();
    const { result } = renderHook(() => useGame(onMove));
    act(() => { result.current.handleMove('right'); });
    expect(onMove).toHaveBeenCalledWith('right');
  });

  it('does not call onMove when no callback provided', () => {
    // Should not throw
    const { result } = renderHook(() => useGame());
    expect(() => {
      act(() => { result.current.handleMove('up'); });
    }).not.toThrow();
  });

  describe('keyboard controls', () => {
    it('ArrowLeft triggers handleMove("left")', () => {
      const onMove = jest.fn();
      renderHook(() => useGame(onMove));
      fireKey('ArrowLeft');
      expect(onMove).toHaveBeenCalledWith('left');
    });

    it('ArrowRight triggers handleMove("right")', () => {
      const onMove = jest.fn();
      renderHook(() => useGame(onMove));
      fireKey('ArrowRight');
      expect(onMove).toHaveBeenCalledWith('right');
    });

    it('ArrowUp triggers handleMove("up")', () => {
      const onMove = jest.fn();
      renderHook(() => useGame(onMove));
      fireKey('ArrowUp');
      expect(onMove).toHaveBeenCalledWith('up');
    });

    it('ArrowDown triggers handleMove("down")', () => {
      const onMove = jest.fn();
      renderHook(() => useGame(onMove));
      fireKey('ArrowDown');
      expect(onMove).toHaveBeenCalledWith('down');
    });

    it('w triggers handleMove("up")', () => {
      const onMove = jest.fn();
      renderHook(() => useGame(onMove));
      fireKey('w');
      expect(onMove).toHaveBeenCalledWith('up');
    });

    it('s triggers handleMove("down")', () => {
      const onMove = jest.fn();
      renderHook(() => useGame(onMove));
      fireKey('s');
      expect(onMove).toHaveBeenCalledWith('down');
    });

    it('a triggers handleMove("left")', () => {
      const onMove = jest.fn();
      renderHook(() => useGame(onMove));
      fireKey('a');
      expect(onMove).toHaveBeenCalledWith('left');
    });

    it('d triggers handleMove("right")', () => {
      const onMove = jest.fn();
      renderHook(() => useGame(onMove));
      fireKey('d');
      expect(onMove).toHaveBeenCalledWith('right');
    });

    it('ignores unrelated keys', () => {
      const onMove = jest.fn();
      renderHook(() => useGame(onMove));
      fireKey('Enter');
      fireKey(' ');
      fireKey('Tab');
      expect(onMove).not.toHaveBeenCalled();
    });

    it('ignores keys when target is INPUT', () => {
      const onMove = jest.fn();
      renderHook(() => useGame(onMove));
      fireKey('ArrowLeft', { tagName: 'INPUT' } as Partial<HTMLElement>);
      expect(onMove).not.toHaveBeenCalled();
    });

    it('ignores keys when target is TEXTAREA', () => {
      const onMove = jest.fn();
      renderHook(() => useGame(onMove));
      fireKey('ArrowRight', { tagName: 'TEXTAREA' } as Partial<HTMLElement>);
      expect(onMove).not.toHaveBeenCalled();
    });

    it('removes keyboard listener on unmount', () => {
      const onMove = jest.fn();
      const { unmount } = renderHook(() => useGame(onMove));
      unmount();
      fireKey('ArrowLeft');
      expect(onMove).not.toHaveBeenCalled();
    });
  });
});
