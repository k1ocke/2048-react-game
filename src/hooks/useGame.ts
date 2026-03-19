import { useCallback, useEffect, useReducer } from 'react';
import type { Direction, GameState } from '../types/game';
import { createInitialState, move } from '../utils/gameLogic';

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

export const useGame = () => {
  const [state, dispatch] = useReducer(reducer, undefined, () => createInitialState(4));

  const handleMove = useCallback((direction: Direction) => {
    dispatch({ type: 'MOVE', direction });
  }, []);

  const restart = useCallback(() => {
    dispatch({ type: 'RESTART' });
  }, []);

  useEffect(() => {
    if (import.meta.env.DEV) {
      (window as unknown as Record<string, unknown>).__gameDispatch = dispatch;
    }
  }, [dispatch]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
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
        handleMove(direction);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [handleMove]);

  return { state, handleMove, restart };
};
