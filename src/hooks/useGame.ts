import { useCallback, useEffect, useLayoutEffect, useReducer, useRef } from 'react';
import type { Direction, GameState } from '../types/game';
import { createInitialState, move } from '../utils/gameLogic';
import { IS_DEV } from '../utils/env';

type Action =
  | { type: 'MOVE'; direction: Direction }
  | { type: 'RESTART' }
  | { type: 'FORCE_STATE'; state: GameState };

const reducer = (state: GameState, action: Action): GameState => {
  switch (action.type) {
    case 'MOVE':
      return move(state, action.direction);
    case 'RESTART':
      return createInitialState(state.size);
    case 'FORCE_STATE':
      return action.state;
    default:
      return state;
  }
};

export const useGame = (onMove?: (direction: Direction) => void, isModalOpen?: boolean) => {
  const [state, dispatch] = useReducer(reducer, undefined, () => createInitialState(4));

  const handleMove = useCallback((direction: Direction) => {
    dispatch({ type: 'MOVE', direction });
    onMove?.(direction);
  }, [onMove]);

  const restart = useCallback(() => {
    dispatch({ type: 'RESTART' });
  }, []);

  useEffect(() => {
    if (IS_DEV) {
      (window as unknown as Record<string, unknown>).__gameDispatch = dispatch;
    }
  }, [dispatch]);

  const handleMoveRef = useRef(handleMove);
  useLayoutEffect(() => {
    handleMoveRef.current = handleMove;
  });

  const isModalOpenRef = useRef(isModalOpen ?? false);
  useLayoutEffect(() => {
    isModalOpenRef.current = isModalOpen ?? false;
  });

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (isModalOpenRef.current) return;
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || (e.target as HTMLElement)?.isContentEditable) return;
      const map: Record<string, Direction> = {
        ArrowUp: 'up',
        ArrowDown: 'down',
        ArrowLeft: 'left',
        ArrowRight: 'right',
        w: 'up',
        s: 'down',
        a: 'left',
        d: 'right',
      };
      const direction = map[e.key];
      if (direction) {
        e.preventDefault();
        handleMoveRef.current(direction);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []); // empty deps — listener registered once, ref keeps it current

  return { state, handleMove, restart };
};
