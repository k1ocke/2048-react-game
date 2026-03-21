import { renderHook } from '@testing-library/react';
import { act } from 'react';
import { useTouchControls } from './useTouchControls';

// ── helpers ──────────────────────────────────────────────────────────────────

const swipe = (startX: number, startY: number, endX: number, endY: number) => {
  const touchStart = new TouchEvent('touchstart', {
    touches: [{ clientX: startX, clientY: startY } as Touch],
  });
  const touchEnd = new TouchEvent('touchend', {
    changedTouches: [{ clientX: endX, clientY: endY } as Touch],
  });
  act(() => {
    window.dispatchEvent(touchStart);
    window.dispatchEvent(touchEnd);
  });
};

// ── tests ─────────────────────────────────────────────────────────────────────

describe('useTouchControls', () => {
  let handleMove: jest.Mock;

  beforeEach(() => {
    handleMove = jest.fn();
  });

  it('calls handleMove("right") on a right swipe', () => {
    renderHook(() => useTouchControls(handleMove));
    swipe(0, 100, 50, 100);
    expect(handleMove).toHaveBeenCalledWith('right');
  });

  it('calls handleMove("left") on a left swipe', () => {
    renderHook(() => useTouchControls(handleMove));
    swipe(100, 100, 50, 100);
    expect(handleMove).toHaveBeenCalledWith('left');
  });

  it('calls handleMove("down") on a downward swipe', () => {
    renderHook(() => useTouchControls(handleMove));
    swipe(100, 0, 100, 50);
    expect(handleMove).toHaveBeenCalledWith('down');
  });

  it('calls handleMove("up") on an upward swipe', () => {
    renderHook(() => useTouchControls(handleMove));
    swipe(100, 100, 100, 50);
    expect(handleMove).toHaveBeenCalledWith('up');
  });

  it('ignores swipes shorter than 20px (horizontal)', () => {
    renderHook(() => useTouchControls(handleMove));
    swipe(0, 100, 10, 100); // only 10px — below threshold
    expect(handleMove).not.toHaveBeenCalled();
  });

  it('ignores swipes shorter than 20px (vertical)', () => {
    renderHook(() => useTouchControls(handleMove));
    swipe(100, 0, 100, 15); // only 15px — below threshold
    expect(handleMove).not.toHaveBeenCalled();
  });

  it('removes listeners on unmount', () => {
    const { unmount } = renderHook(() => useTouchControls(handleMove));
    unmount();
    swipe(0, 100, 100, 100);
    expect(handleMove).not.toHaveBeenCalled();
  });
});
