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

    it('returns true when all players are marked done via markPlayerDone', () => {
      const session = new GameSession();
      session.addPlayer('user-1');
      session.addPlayer('user-2');

      session.markPlayerDone('user-1', 'won');
      session.markPlayerDone('user-2', 'lost');

      expect(session.isComplete()).toBe(true);
    });

    it('returns false when only some players are done', () => {
      const session = new GameSession();
      session.addPlayer('user-1');
      session.addPlayer('user-2');

      session.markPlayerDone('user-1', 'won');

      expect(session.isComplete()).toBe(false);
    });

    it('returns false when there are no players', () => {
      const session = new GameSession();
      expect(session.isComplete()).toBe(false);
    });

    it('client-reported status alone does not complete the game (server state is authoritative)', () => {
      const session = new GameSession();
      session.addPlayer('user-1');
      session.addPlayer('user-2');

      session.setClientScore('user-1', 2048, 'won');
      session.setClientScore('user-2', 512, 'lost');

      expect(session.isComplete()).toBe(false);
    });
  });

  describe('getFinalRankings', () => {
    it('orders players by server-computed score descending', () => {
      const session = new GameSession();
      session.addPlayer('user-1');
      session.addPlayer('user-2');
      session.addPlayer('user-3');

      session.setBoard('user-1', [[4, 4, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]]);
      session.setBoard('user-2', [[64, 64, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]]);
      session.setBoard('user-3', [[16, 16, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]]);

      session.applyMove('user-1', 'left'); // score += 8
      session.applyMove('user-2', 'left'); // score += 128
      session.applyMove('user-3', 'left'); // score += 32

      const rankings = session.getFinalRankings();
      expect(rankings[0]).toMatchObject({ userId: 'user-2', score: 128, rank: 1 });
      expect(rankings[1]).toMatchObject({ userId: 'user-3', score: 32, rank: 2 });
      expect(rankings[2]).toMatchObject({ userId: 'user-1', score: 8, rank: 3 });
    });

    it('ignores client-reported score; always uses server-computed score', () => {
      const session = new GameSession();
      session.addPlayer('user-1');
      session.addPlayer('user-2');

      session.setBoard('user-1', [[8, 8, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]]);
      session.applyMove('user-1', 'left'); // server score = 16

      // Client tries to claim a fraudulent high score
      session.setClientScore('user-1', 500000, 'won');
      session.setClientScore('user-2', 500000, 'won');

      const rankings = session.getFinalRankings();
      expect(rankings[0]).toMatchObject({ userId: 'user-1', score: 16, rank: 1 });
      expect(rankings[1]).toMatchObject({ userId: 'user-2', score: 0, rank: 2 });
    });

    it('tiebreaks equal scores by status: won beats lost', () => {
      const session = new GameSession();
      session.addPlayer('user-1');
      session.addPlayer('user-2');

      session.markPlayerDone('user-1', 'lost');
      session.markPlayerDone('user-2', 'won');

      const rankings = session.getFinalRankings();
      expect(rankings[0]).toMatchObject({ userId: 'user-2', rank: 1 });
      expect(rankings[1]).toMatchObject({ userId: 'user-1', rank: 2 });
    });

    it('uses server simulation score', () => {
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

  describe('client score — display-only storage', () => {
    it('getClientScore returns undefined before any score-update', () => {
      const session = new GameSession();
      session.addPlayer('user-1');
      expect(session.getClientScore('user-1')).toBeUndefined();
    });

    it('setClientScore stores and overwrites score and status for display purposes', () => {
      const session = new GameSession();
      session.addPlayer('user-1');

      session.setClientScore('user-1', 100, 'playing');
      expect(session.getClientScore('user-1')).toEqual({ score: 100, status: 'playing' });

      session.setClientScore('user-1', 500, 'won');
      expect(session.getClientScore('user-1')).toEqual({ score: 500, status: 'won' });
    });
  });

  describe('markPlayerDone', () => {
    it('updates server state status to won', () => {
      const session = new GameSession();
      session.addPlayer('user-1');
      session.markPlayerDone('user-1', 'won');
      expect(session.getState('user-1')!.status).toBe('won');
    });

    it('updates server state status to lost', () => {
      const session = new GameSession();
      session.addPlayer('user-1');
      session.markPlayerDone('user-1', 'lost');
      expect(session.getState('user-1')!.status).toBe('lost');
    });

    it('does not re-mark a player who already won as lost', () => {
      const session = new GameSession();
      session.addPlayer('user-1');
      session.markPlayerDone('user-1', 'won');
      session.markPlayerDone('user-1', 'lost'); // should be a no-op
      expect(session.getState('user-1')!.status).toBe('won');
    });

    it('disconnect: markPlayerDone preserves server-computed score', () => {
      const session = new GameSession();
      session.addPlayer('user-1');

      session.setBoard('user-1', [
        [8, 8, 0, 0],
        [0, 0, 0, 0],
        [0, 0, 0, 0],
        [0, 0, 0, 0],
      ]);
      session.applyMove('user-1', 'left'); // server score = 16

      session.markPlayerDone('user-1', 'lost');

      const state = session.getState('user-1')!;
      expect(state.status).toBe('lost');
      expect(state.score).toBe(16);
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
