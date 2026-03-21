import { useEffect, RefObject } from 'react';

const FOCUSABLE = 'a[href],button:not([disabled]),input:not([disabled]),select,textarea,[tabindex]:not([tabindex="-1"])';

export const useFocusTrap = (ref: RefObject<HTMLElement | null>, isActive: boolean): void => {
  useEffect(() => {
    if (!isActive || !ref.current) return;
    const el = ref.current;
    const focusable = () => Array.from(el.querySelectorAll<HTMLElement>(FOCUSABLE));
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return;
      const items = focusable();
      if (items.length === 0) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    el.addEventListener('keydown', onKeyDown);
    return () => el.removeEventListener('keydown', onKeyDown);
  }, [ref, isActive]);
};
