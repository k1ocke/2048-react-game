import { useEffect, useRef, RefObject } from 'react';
import type { Direction } from '../types/game';

const MIN_SWIPE_PX = 20;

/** Translates touch swipe gestures into directional moves.
 *  When a containerRef is provided, events are bound to that element and
 *  only recognised when the touch originates inside it.
 *  Falls back to window when no containerRef is given. */
export const useTouchControls = (
  handleMove: (direction: Direction) => void,
  containerRef?: RefObject<HTMLElement | null>,
): void => {
  const touchStart = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    const target: EventTarget = containerRef?.current ?? window;

    const onTouchStart = (e: TouchEvent) => {
      if (containerRef?.current) {
        const touch = e.touches[0];
        const rect = containerRef.current.getBoundingClientRect();
        if (
          touch.clientX < rect.left ||
          touch.clientX > rect.right ||
          touch.clientY < rect.top ||
          touch.clientY > rect.bottom
        ) {
          return;
        }
      }
      const t = e.touches[0];
      touchStart.current = { x: t.clientX, y: t.clientY };
    };

    const onTouchEnd = (e: TouchEvent) => {
      if (!touchStart.current) return;
      const dx = e.changedTouches[0].clientX - touchStart.current.x;
      const dy = e.changedTouches[0].clientY - touchStart.current.y;
      touchStart.current = null;
      if (Math.abs(dx) < MIN_SWIPE_PX && Math.abs(dy) < MIN_SWIPE_PX) return;
      if (Math.abs(dx) > Math.abs(dy)) {
        handleMove(dx > 0 ? 'right' : 'left');
      } else {
        handleMove(dy > 0 ? 'down' : 'up');
      }
    };

    target.addEventListener('touchstart', onTouchStart as EventListener, { passive: false });
    target.addEventListener('touchend', onTouchEnd as EventListener);
    return () => {
      target.removeEventListener('touchstart', onTouchStart as EventListener);
      target.removeEventListener('touchend', onTouchEnd as EventListener);
    };
  }, [handleMove, containerRef]);
};
