import type { GameRoom, RoomPlayer } from '../types';

export interface RoomState extends GameRoom {
  finishedAt?: number; // unix ms — set when status transitions to 'finished'
}

const ROOM_ID_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
const ROOM_ID_LENGTH = 6;
const STALE_ROOM_TTL_MS = 60 * 60 * 1000; // 1 hour

const generateRoomId = (): string => {
  let id = '';
  for (let i = 0; i < ROOM_ID_LENGTH; i++) {
    id += ROOM_ID_CHARS[Math.floor(Math.random() * ROOM_ID_CHARS.length)];
  }
  return id;
};

export class RoomManager {
  private rooms: Map<string, RoomState> = new Map();

  createRoom(host: RoomPlayer, maxPlayers: 2 | 3 | 4): RoomState {
    let roomId: string;
    do {
      roomId = generateRoomId();
    } while (this.rooms.has(roomId));

    const room: RoomState = {
      roomId,
      hostId: host.userId,
      maxPlayers,
      players: [{ ...host, isReady: false, status: 'waiting', score: 0 }],
      status: 'waiting',
      createdAt: Date.now(),
    };

    this.rooms.set(roomId, room);
    return room;
  }

  joinRoom(roomId: string, player: RoomPlayer): RoomState | null {
    const room = this.rooms.get(roomId);
    if (!room) return null;
    if (room.status !== 'waiting') return null;
    if (room.players.length >= room.maxPlayers) return null;
    // Already in room — idempotent
    if (room.players.some((p) => p.userId === player.userId)) return room;

    room.players.push({ ...player, isReady: false, status: 'waiting', score: 0 });
    return room;
  }

  leaveRoom(roomId: string, userId: string): RoomState | null {
    const room = this.rooms.get(roomId);
    if (!room) return null;

    const remaining = room.players.filter((p) => p.userId !== userId);

    if (remaining.length === 0) {
      // Room is now empty — dissolve it
      this.rooms.delete(roomId);
      return null;
    }

    room.players = remaining;

    // Transfer host if the host left
    if (room.hostId === userId) {
      room.hostId = remaining[0].userId;
    }

    return room;
  }

  setReady(roomId: string, userId: string): RoomState | null {
    const room = this.rooms.get(roomId);
    if (!room) return null;

    const player = room.players.find((p) => p.userId === userId);
    if (!player) return null;

    player.isReady = true;
    return room;
  }

  startGame(roomId: string): RoomState | null {
    const room = this.rooms.get(roomId);
    if (!room) return null;
    if (room.players.length < 2) return null;
    if (!room.players.every((p) => p.isReady)) return null;

    room.status = 'playing';
    room.players = room.players.map((p) => ({ ...p, status: 'playing' as const }));
    return room;
  }

  finishRoom(roomId: string): RoomState | null {
    const room = this.rooms.get(roomId);
    if (!room) return null;

    room.status = 'finished';
    room.finishedAt = Date.now();
    return room;
  }

  /** Reset a finished/playing room back to waiting so players can play again. */
  resetRoom(roomId: string): RoomState | null {
    const room = this.rooms.get(roomId);
    if (!room) return null;

    room.status = 'waiting';
    room.finishedAt = undefined;
    room.players = room.players.map((p) => ({
      ...p,
      isReady: false,
      score: 0,
      status: 'waiting' as const,
    }));
    return room;
  }

  getRoom(roomId: string): RoomState | undefined {
    return this.rooms.get(roomId);
  }

  getRoomByUserId(userId: string): RoomState | undefined {
    for (const room of this.rooms.values()) {
      if (room.players.some((p) => p.userId === userId)) {
        return room;
      }
    }
    return undefined;
  }

  cleanupStaleRooms(): void {
    const now = Date.now();
    for (const [roomId, room] of this.rooms.entries()) {
      if (room.status === 'finished' && room.finishedAt !== undefined) {
        if (now - room.finishedAt > STALE_ROOM_TTL_MS) {
          this.rooms.delete(roomId);
        }
      }
    }
  }
}
