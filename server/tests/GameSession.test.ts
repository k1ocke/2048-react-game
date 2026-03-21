import { GameSession } from '../src/ws/GameSession';

describe('GameSession', () => {
  describe('addPlayer', () => {
    it('initialises a player with a 4x4 board and zero score', () => {
      const session = new GameSession();
      session.addPlayer('user-1');

      const state = session.getState('user-1');
      expect(state).toBeDefined();
      expect(state!.userId).toBe('user-1');
      expect(state!.score).toBe(0);
      expect(state!.moves).toBe(0);
      expect(state!.status).toBe('playing');
      expect(state!.board).toHaveLength(4);
      expect(state!.board[0]).toHaveLength(4);
    });

    it('spawns two tiles on the initial board', () => {
      const session = new GameSession();
      session.addPlayer('user-1');
      const board = session.getState('user-1')!.board;
      const nonZero = board.flat().filter((v) => v !== 0);
      expect(nonZero).toHaveLength(2);
    });
  });

  describe('applyMove — slide correctness', () => {

    it('slides tiles left: [0,0,2,2] → row starts with 4', () => {
      const session = new GameSession();
      session.addPlayer('user-1');
      // Place a board where only row 0 has tiles so the merge is predictable.
      session.setBoard('user-1', [
        [0, 0, 2, 2],
        [0, 0, 0, 0],
        [0, 0, 0, 0],
        [0, 0, 0, 0],
      ]);

      const state = session.applyMove('user-1', 'left');
      expect(state).not.toBeNull();
      // First cell should be 4 (merged), rest of row is 0 (plus a newly spawned tile somewhere)
      expect(state!.board[0][0]).toBe(4);
      // score from merge
      expect(state!.score).toBe(4);
    });

    it('slides tiles right: [2,2,0,0] → row ends with 4', () => {
      const session = new GameSession();
      session.addPlayer('user-1');
      session.setBoard('user-1', [
        [2, 2, 0, 0],
        [0, 0, 0, 0],
        [0, 0, 0, 0],
        [0, 0, 0, 0],
      ]);

      const state = session.applyMove('user-1', 'right');
      expect(state).not.toBeNull();
      expect(state!.board[0][3]).toBe(4);
      expect(state!.score).toBe(4);
    });

    it('no-chain-merge: [2,2,4,0] left → [4,4,0,0], score 4 not 8', () => {
      const session = new GameSession();
      session.addPlayer('user-1');
      session.setBoard('user-1', [
        [2, 2, 4, 0],
        [0, 0, 0, 0],
        [0, 0, 0, 0],
        [0, 0, 0, 0],
      ]);

      const state = session.applyMove('user-1', 'left');
      expect(state).not.toBeNull();
      expect(state!.board[0][0]).toBe(4);
      expect(state!.board[0][1]).toBe(4);
      expect(state!.score).toBe(4); // only the 2+2 merge, not 4+4
    });

    it('scores correctly on merge', () => {
      const session = new GameSession();
      session.addPlayer('user-1');
      session.setBoard('user-1', [
        [8, 8, 0, 0],
        [4, 4, 0, 0],
        [0, 0, 0, 0],
        [0, 0, 0, 0],
      ]);

      const state = session.applyMove('user-1', 'left');
      expect(state).not.toBeNull();
      expect(state!.score).toBe(16 + 8); // 8+8=16, 4+4=8
    });

    it('increments move counter', () => {
      const session = new GameSession();
      session.addPlayer('user-1');
      session.setBoard('user-1', [
        [2, 2, 0, 0],
        [0, 0, 0, 0],
        [0, 0, 0, 0],
        [0, 0, 0, 0],
      ]);
      session.applyMove('user-1', 'left');
      expect(session.getState('user-1')!.moves).toBe(1);
    });

    it('returns null for unknown userId', () => {
      const session = new GameSession();
      expect(session.applyMove('nobody', 'left')).toBeNull();
    });
  });

  describe('isComplete', () => {
    it('returns false when players are still playing', () => {
      const session = new GameSession();
      session.addPlayer('user-1');
      session.addPlayer('user-2');
      expect(session.isComplete()).toBe(false);
    });

    it('returns true when all players are won or lost', () => {
      const session = new GameSession();
      session.addPlayer('user-1');
      session.addPlayer('user-2');

      session.setClientScore('user-1', 0, 'won');
      session.setClientScore('user-2', 0, 'lost');

      expect(session.isComplete()).toBe(true);
    });

    it('returns false when only some players are done', () => {
      const session = new GameSession();
      session.addPlayer('user-1');
      session.addPlayer('user-2');

      session.setClientScore('user-1', 0, 'won');

      expect(session.isComplete()).toBe(false);
    });

    it('returns false when there are no players', () => {
      const session = new GameSession();
      expect(session.isComplete()).toBe(false);
    });
  });

  describe('getFinalRankings', () => {
    it('orders players by score descending', () => {
      const session = new GameSession();
      session.addPlayer('user-1');
      session.addPlayer('user-2');
      session.addPlayer('user-3');

      session.setClientScore('user-1', 100, 'lost');
      session.setClientScore('user-2', 300, 'won');
      session.setClientScore('user-3', 200, 'lost');

      const rankings = session.getFinalRankings();
      expect(rankings[0]).toMatchObject({ userId: 'user-2', score: 300, rank: 1 });
      expect(rankings[1]).toMatchObject({ userId: 'user-3', score: 200, rank: 2 });
      expect(rankings[2]).toMatchObject({ userId: 'user-1', score: 100, rank: 3 });
    });

    it('prefers client-reported score over server simulation score', () => {
      const session = new GameSession();
      session.addPlayer('user-1');
      session.addPlayer('user-2');

      // Server simulation accumulates some score via applyMove
      session.setBoard('user-1', [
        [8, 8, 0, 0],
        [0, 0, 0, 0],
        [0, 0, 0, 0],
        [0, 0, 0, 0],
      ]);
      session.applyMove('user-1', 'left'); // server sim score = 16

      // Client reports a different (correct) score
      session.setClientScore('user-1', 512, 'lost');
      session.setClientScore('user-2', 256, 'lost');

      const rankings = session.getFinalRankings();
      // Must use client score (512), not server simulation score (16)
      expect(rankings[0]).toMatchObject({ userId: 'user-1', score: 512, rank: 1 });
      expect(rankings[1]).toMatchObject({ userId: 'user-2', score: 256, rank: 2 });
    });

    it('falls back to simulation score when no client score reported', () => {
      const session = new GameSession();
      session.addPlayer('user-1');
      session.setBoard('user-1', [
        [4, 4, 0, 0],
        [0, 0, 0, 0],
        [0, 0, 0, 0],
        [0, 0, 0, 0],
      ]);
      session.applyMove('user-1', 'left'); // server sim score = 8

      const rankings = session.getFinalRankings();
      expect(rankings[0].score).toBe(8);
    });

    it('returns empty array when no players', () => {
      const session = new GameSession();
      expect(session.getFinalRankings()).toEqual([]);
    });
  });

  describe('score sync — client score priority', () => {
    it('getClientScore returns undefined before any score-update', () => {
      const session = new GameSession();
      session.addPlayer('user-1');
      expect(session.getClientScore('user-1')).toBeUndefined();
    });

    it('setClientScore stores and overwrites score and status', () => {
      const session = new GameSession();
      session.addPlayer('user-1');

      session.setClientScore('user-1', 100, 'playing');
      expect(session.getClientScore('user-1')).toEqual({ score: 100, status: 'playing' });

      session.setClientScore('user-1', 500, 'won');
      expect(session.getClientScore('user-1')).toEqual({ score: 500, status: 'won' });
    });

    it('isComplete uses client status, ignoring server simulation status', () => {
      const session = new GameSession();
      session.addPlayer('user-1');
      session.addPlayer('user-2');

      // Server simulation shows user-1 as still playing
      // but client reported won
      session.setClientScore('user-1', 2048, 'won');
      // user-2 client not done yet
      expect(session.isComplete()).toBe(false);

      session.setClientScore('user-2', 512, 'lost');
      expect(session.isComplete()).toBe(true);
    });

    it('disconnect: preserves client score when marking player as lost', () => {
      const session = new GameSession();
      session.addPlayer('user-1');

      // Simulate server board diverging from client
      session.setBoard('user-1', [
        [8, 8, 0, 0],
        [0, 0, 0, 0],
        [0, 0, 0, 0],
        [0, 0, 0, 0],
      ]);
      session.applyMove('user-1', 'left'); // server sim score = 16

      // Client reported higher score before disconnect
      session.setClientScore('user-1', 1024, 'playing');

      // Simulate disconnect logic: preserve client score, mark lost
      const existingClientScore = session.getClientScore('user-1');
      const playerState = session.getState('user-1');
      const effectiveStatus = existingClientScore?.status ?? playerState?.status;
      expect(effectiveStatus).toBe('playing');

      session.setClientScore(
        'user-1',
        existingClientScore?.score ?? playerState?.score ?? 0,
        'lost',
      );

      // Must preserve the client score (1024), not the server sim score (16)
      expect(session.getClientScore('user-1')).toEqual({ score: 1024, status: 'lost' });
    });

    it('disconnect: does not re-mark a player who already won as lost', () => {
      const session = new GameSession();
      session.addPlayer('user-1');

      // Client already finished
      session.setClientScore('user-1', 4096, 'won');

      // Simulate disconnect logic
      const existingClientScore = session.getClientScore('user-1');
      const playerState = session.getState('user-1');
      const effectiveStatus = existingClientScore?.status ?? playerState?.status;

      // Should NOT mark as lost because effectiveStatus is 'won'
      expect(effectiveStatus).toBe('won');
    });
  });

  describe('getAllStates', () => {
    it('returns state for all players', () => {
      const session = new GameSession();
      session.addPlayer('user-1');
      session.addPlayer('user-2');

      const all = session.getAllStates();
      expect(all).toHaveLength(2);
      expect(all.map((s) => s.userId)).toEqual(expect.arrayContaining(['user-1', 'user-2']));
    });
  });
});
