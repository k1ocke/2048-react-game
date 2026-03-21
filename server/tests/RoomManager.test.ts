import { RoomManager } from '../src/ws/RoomManager';
import type { RoomPlayer } from '../src/types';

const makePlayer = (overrides: Partial<RoomPlayer> = {}): RoomPlayer => ({
  userId: 'user-1',
  username: 'Alice',
  isReady: false,
  score: 0,
  status: 'waiting',
  ...overrides,
});

describe('RoomManager', () => {
  let manager: RoomManager;

  beforeEach(() => {
    manager = new RoomManager();
  });

  describe('createRoom', () => {
    it('returns a room with correct hostId and status waiting', () => {
      const host = makePlayer({ userId: 'host-1', username: 'Alice' });
      const room = manager.createRoom(host, 2);

      expect(room.hostId).toBe('host-1');
      expect(room.status).toBe('waiting');
      expect(room.maxPlayers).toBe(2);
      expect(room.players).toHaveLength(1);
      expect(room.players[0].userId).toBe('host-1');
      expect(room.roomId).toMatch(/^[A-Z0-9]{6}$/);
    });

    it('generates a unique room ID stored in the manager', () => {
      const room = manager.createRoom(makePlayer(), 2);
      expect(manager.getRoom(room.roomId)).toBeDefined();
    });
  });

  describe('joinRoom', () => {
    it('adds a second player to an existing room', () => {
      const host = makePlayer({ userId: 'host-1', username: 'Alice' });
      const room = manager.createRoom(host, 3);

      const player2 = makePlayer({ userId: 'user-2', username: 'Bob' });
      const updated = manager.joinRoom(room.roomId, player2);

      expect(updated).not.toBeNull();
      expect(updated!.players).toHaveLength(2);
      expect(updated!.players[1].userId).toBe('user-2');
    });

    it('returns null when room does not exist', () => {
      const result = manager.joinRoom('XXXXXX', makePlayer({ userId: 'u2' }));
      expect(result).toBeNull();
    });

    it('returns null when room is full', () => {
      const host = makePlayer({ userId: 'host-1' });
      const room = manager.createRoom(host, 2);
      manager.joinRoom(room.roomId, makePlayer({ userId: 'user-2' }));

      // Third player — should fail
      const result = manager.joinRoom(room.roomId, makePlayer({ userId: 'user-3' }));
      expect(result).toBeNull();
    });

    it('returns null when room has already started', () => {
      const host = makePlayer({ userId: 'host-1' });
      const room = manager.createRoom(host, 2);
      manager.joinRoom(room.roomId, makePlayer({ userId: 'user-2' }));
      manager.setReady(room.roomId, 'host-1');
      manager.setReady(room.roomId, 'user-2');
      manager.startGame(room.roomId);

      const result = manager.joinRoom(room.roomId, makePlayer({ userId: 'user-3' }));
      expect(result).toBeNull();
    });
  });

  describe('leaveRoom', () => {
    it('dissolves room when the last player leaves (returns null)', () => {
      const host = makePlayer({ userId: 'host-1' });
      const room = manager.createRoom(host, 2);

      const result = manager.leaveRoom(room.roomId, 'host-1');
      expect(result).toBeNull();
      expect(manager.getRoom(room.roomId)).toBeUndefined();
    });

    it('transfers host when the host leaves', () => {
      const host = makePlayer({ userId: 'host-1' });
      const room = manager.createRoom(host, 3);
      manager.joinRoom(room.roomId, makePlayer({ userId: 'user-2', username: 'Bob' }));

      const updated = manager.leaveRoom(room.roomId, 'host-1');
      expect(updated).not.toBeNull();
      expect(updated!.hostId).toBe('user-2');
      expect(updated!.players).toHaveLength(1);
    });

    it('removes a non-host player without changing host', () => {
      const host = makePlayer({ userId: 'host-1' });
      const room = manager.createRoom(host, 3);
      manager.joinRoom(room.roomId, makePlayer({ userId: 'user-2' }));

      const updated = manager.leaveRoom(room.roomId, 'user-2');
      expect(updated).not.toBeNull();
      expect(updated!.hostId).toBe('host-1');
      expect(updated!.players).toHaveLength(1);
    });

    it('returns null when room does not exist', () => {
      expect(manager.leaveRoom('XXXXXX', 'user-1')).toBeNull();
    });
  });

  describe('setReady', () => {
    it('marks the player as ready', () => {
      const host = makePlayer({ userId: 'host-1' });
      const room = manager.createRoom(host, 2);

      const updated = manager.setReady(room.roomId, 'host-1');
      expect(updated).not.toBeNull();
      expect(updated!.players[0].isReady).toBe(true);
    });

    it('returns null when room does not exist', () => {
      expect(manager.setReady('XXXXXX', 'user-1')).toBeNull();
    });
  });

  describe('startGame', () => {
    it('transitions status to playing when all players are ready', () => {
      const host = makePlayer({ userId: 'host-1' });
      const room = manager.createRoom(host, 2);
      manager.joinRoom(room.roomId, makePlayer({ userId: 'user-2' }));
      manager.setReady(room.roomId, 'host-1');
      manager.setReady(room.roomId, 'user-2');

      const started = manager.startGame(room.roomId);
      expect(started).not.toBeNull();
      expect(started!.status).toBe('playing');
    });

    it('returns null if not all players are ready', () => {
      const host = makePlayer({ userId: 'host-1' });
      const room = manager.createRoom(host, 2);
      manager.joinRoom(room.roomId, makePlayer({ userId: 'user-2' }));
      manager.setReady(room.roomId, 'host-1');
      // user-2 not ready

      expect(manager.startGame(room.roomId)).toBeNull();
    });

    it('returns null with only one player', () => {
      const host = makePlayer({ userId: 'host-1' });
      const room = manager.createRoom(host, 2);
      manager.setReady(room.roomId, 'host-1');

      expect(manager.startGame(room.roomId)).toBeNull();
    });
  });

  describe('cleanupStaleRooms', () => {
    it('removes finished rooms older than 1 hour', () => {
      const host = makePlayer({ userId: 'host-1' });
      const room = manager.createRoom(host, 2);
      manager.joinRoom(room.roomId, makePlayer({ userId: 'user-2' }));
      manager.setReady(room.roomId, 'host-1');
      manager.setReady(room.roomId, 'user-2');
      manager.startGame(room.roomId);
      manager.finishRoom(room.roomId);

      // Manually age the room
      const roomState = manager.getRoom(room.roomId)!;
      roomState.finishedAt = Date.now() - 2 * 60 * 60 * 1000; // 2 hours ago

      manager.cleanupStaleRooms();
      expect(manager.getRoom(room.roomId)).toBeUndefined();
    });

    it('keeps finished rooms younger than 1 hour', () => {
      const host = makePlayer({ userId: 'host-1' });
      const room = manager.createRoom(host, 2);
      manager.joinRoom(room.roomId, makePlayer({ userId: 'user-2' }));
      manager.setReady(room.roomId, 'host-1');
      manager.setReady(room.roomId, 'user-2');
      manager.startGame(room.roomId);
      manager.finishRoom(room.roomId);

      manager.cleanupStaleRooms();
      expect(manager.getRoom(room.roomId)).toBeDefined();
    });
  });
});
