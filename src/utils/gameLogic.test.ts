import { createInitialState, move } from './gameLogic';

// Mock localStorage
const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: (key: string) => store[key] ?? null,
    setItem: (key: string, value: string) => { store[key] = value; },
    clear: () => { store = {}; },
  };
})();
Object.defineProperty(globalThis, 'localStorage', { value: localStorageMock });

describe('createInitialState', () => {
  it('creates a 4x4 board with 2 tiles', () => {
    const state = createInitialState(4);
    expect(state.tiles).toHaveLength(2);
    expect(state.score).toBe(0);
    expect(state.status).toBe('playing');
    expect(state.size).toBe(4);
  });

  it('all tiles have value 2 or 4', () => {
    const state = createInitialState(4);
    state.tiles.forEach((t) => expect([2, 4]).toContain(t.value));
  });

  it('tiles are within grid bounds', () => {
    const state = createInitialState(4);
    state.tiles.forEach((t) => {
      expect(t.row).toBeGreaterThanOrEqual(0);
      expect(t.row).toBeLessThan(4);
      expect(t.col).toBeGreaterThanOrEqual(0);
      expect(t.col).toBeLessThan(4);
    });
  });
});

describe('move', () => {
  it('does nothing when status is not playing', () => {
    const state = { ...createInitialState(4), status: 'lost' as const };
    const next = move(state, 'left');
    expect(next).toBe(state);
  });

  it('slides tiles left', () => {
    const state = createInitialState(4);
    // Place two 2-tiles in the same row, different cols
    const tiles = [
      { id: 1, value: 2, row: 0, col: 2, merged: false, isNew: false },
      { id: 2, value: 2, row: 0, col: 3, merged: false, isNew: false },
    ];
    const testState = { ...state, tiles };
    const next = move(testState, 'left');
    const row0Tiles = next.tiles.filter((t) => t.row === 0);
    expect(row0Tiles.some((t) => t.value === 4)).toBe(true);
  });

  it('merges tiles and updates score', () => {
    const state = createInitialState(4);
    const tiles = [
      { id: 1, value: 4, row: 0, col: 0, merged: false, isNew: false },
      { id: 2, value: 4, row: 0, col: 1, merged: false, isNew: false },
    ];
    const testState = { ...state, tiles, score: 0 };
    const next = move(testState, 'left');
    expect(next.score).toBe(8);
  });

  it('adds a new tile after a valid move', () => {
    const state = createInitialState(4);
    const tiles = [
      { id: 1, value: 2, row: 0, col: 0, merged: false, isNew: false },
    ];
    const testState = { ...state, tiles };
    const next = move(testState, 'right');
    expect(next.tiles.length).toBeGreaterThan(1);
  });

  it('detects win when a 2048 tile is created', () => {
    const state = createInitialState(4);
    const tiles = [
      { id: 1, value: 1024, row: 0, col: 0, merged: false, isNew: false },
      { id: 2, value: 1024, row: 0, col: 1, merged: false, isNew: false },
    ];
    const testState = { ...state, tiles };
    const next = move(testState, 'left');
    expect(next.status).toBe('won');
  });
});
