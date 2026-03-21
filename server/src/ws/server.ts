import http from 'http';
import { WebSocket, WebSocketServer } from 'ws';
import { verifyToken } from '../jwt';
import { db } from '../db';
import type { ClientMessage, ServerMessage } from '../types';
import { RoomManager } from './RoomManager';
import { GameSession } from './GameSession';

const AUTH_TIMEOUT_MS = 5000;

interface AuthenticatedSocket extends WebSocket {
  userId?: string;
  username?: string;
  roomId?: string;
}

const send = (ws: WebSocket, msg: ServerMessage): void => {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(msg));
  }
};

export const attachWebSocketServer = (
  httpServer: http.Server,
  roomManager: RoomManager,
): WebSocketServer => {
  const wss = new WebSocketServer({ server: httpServer });

  // userId → socket
  const connections = new Map<string, AuthenticatedSocket>();
  // roomId → GameSession
  const sessions = new Map<string, GameSession>();

  const broadcastToRoom = (roomId: string, msg: ServerMessage): void => {
    const room = roomManager.getRoom(roomId);
    if (!room) return;
    for (const player of room.players) {
      const ws = connections.get(player.userId);
      if (ws) send(ws, msg);
    }
  };

  const handleGameEnd = (roomId: string, session: GameSession): void => {
    sessions.delete(roomId);
    const room = roomManager.getRoom(roomId);
    const rankings = session.getFinalRankings().map((r) => {
      const p = room?.players.find((pl) => pl.userId === r.userId);
      return { userId: r.userId, username: p?.username ?? r.userId, score: r.score, rank: r.rank };
    });

    broadcastToRoom(roomId, { type: 'game:end', rankings });

    const statsWrites = session.getAllStates().map((state) => {
      const clientScore = session.getClientScore(state.userId);
      return db.upsertStats(state.userId, {
        won: (clientScore?.status ?? state.status) === 'won',
        score: clientScore?.score ?? state.score,
        moves: state.moves,
      });
    });
    Promise.allSettled(statsWrites).then((results) => {
      for (const r of results) {
        if (r.status === 'rejected') {
          console.error('Failed to upsert stats:', r.reason);
        }
      }
    });

    const resetRoom = roomManager.resetRoom(roomId);
    if (resetRoom) {
      broadcastToRoom(roomId, { type: 'room:state', room: resetRoom });
    }
  };

  wss.on('connection', (ws: AuthenticatedSocket) => {
    let authenticated = false;

    // ── Step 1: authenticate within 5 seconds ─────────────────────────────
    const authTimer = setTimeout(() => {
      if (!authenticated) {
        ws.close(4001, 'Authentication timeout');
      }
    }, AUTH_TIMEOUT_MS);

    ws.on('message', (raw: Buffer | string) => {
      let msg: unknown;
      try {
        msg = JSON.parse(raw.toString());
      } catch {
        return;
      }

      if (!authenticated) {
        // Expect { type: 'auth', token: string }
        if (
          typeof msg !== 'object' ||
          msg === null ||
          (msg as Record<string, unknown>)['type'] !== 'auth' ||
          typeof (msg as Record<string, unknown>)['token'] !== 'string'
        ) {
          ws.close(4001, 'First message must be auth');
          return;
        }

        const token = (msg as Record<string, unknown>)['token'] as string;
        try {
          const payload = verifyToken(token);
          ws.userId = payload.sub;
          ws.username = payload.username;
          authenticated = true;
          clearTimeout(authTimer);
          connections.set(payload.sub, ws);
        } catch {
          ws.close(4001, 'Invalid token');
          return;
        }
        return;
      }

      // ── Authenticated message routing ──────────────────────────────────
      const userId = ws.userId!;
      const username = ws.username!;
      const clientMsg = msg as ClientMessage;

      switch (clientMsg.type) {
        case 'room:create': {
          const room = roomManager.createRoom(
            { userId, username, isReady: false, score: 0, status: 'waiting' },
            clientMsg.maxPlayers,
          );
          ws.roomId = room.roomId;
          broadcastToRoom(room.roomId, { type: 'room:state', room });
          break;
        }

        case 'room:join': {
          const room = roomManager.joinRoom(clientMsg.roomId, {
            userId,
            username,
            isReady: false,
            score: 0,
            status: 'waiting',
          });
          if (!room) {
            send(ws, {
              type: 'room:error',
              code: 'JOIN_FAILED',
              message: 'Room not found, full, or already started',
            });
            break;
          }
          ws.roomId = room.roomId;
          broadcastToRoom(room.roomId, { type: 'room:state', room });
          break;
        }

        case 'room:leave': {
          const roomId = ws.roomId;
          if (!roomId) break;
          const updated = roomManager.leaveRoom(roomId, userId);
          ws.roomId = undefined;
          if (updated) {
            broadcastToRoom(roomId, { type: 'room:state', room: updated });
          }
          // else: room dissolved — no broadcast needed
          break;
        }

        case 'room:ready': {
          const roomId = ws.roomId;
          if (!roomId) break;
          const room = roomManager.setReady(roomId, userId);
          if (!room) break;

          broadcastToRoom(roomId, { type: 'room:state', room });

          // Auto-start if all players ready and >= 2
          if (
            room.players.length >= 2 &&
            room.players.every((p) => p.isReady)
          ) {
            const started = roomManager.startGame(roomId);
            if (!started) break;

            // Create game session
            const session = new GameSession();
            for (const p of started.players) {
              session.addPlayer(p.userId);
            }
            sessions.set(roomId, session);

            const startsAt = new Date(Date.now() + 3000).toISOString();
            broadcastToRoom(roomId, { type: 'game:start', startsAt });
            broadcastToRoom(roomId, { type: 'room:state', room: started });
          }
          break;
        }

        case 'game:move': {
          const roomId = ws.roomId;
          if (!roomId) break;
          const session = sessions.get(roomId);
          if (!session) break;

          // Apply move to server simulation for board snapshot only
          const playerState = session.applyMove(userId, clientMsg.direction);
          if (!playerState) break;

          // Broadcast board snapshot to opponents (score comes from game:score-update)
          broadcastToRoom(roomId, {
            type: 'player:update',
            userId,
            score: playerState.score,
            status: playerState.status === 'playing' ? 'playing' : playerState.status,
            boardSnapshot: playerState.board,
          });
          break;
        }

        case 'game:score-update': {
          const roomId = ws.roomId;
          if (!roomId) break;
          const session = sessions.get(roomId);
          if (!session) break;

          const { score, status, board: clientBoard } = clientMsg;

          // Record client-reported score (authoritative for rankings)
          session.setClientScore(userId, score, status);

          const room = roomManager.getRoom(roomId);
          if (!room) break;

          // Keep room player score in sync for leaderboard display
          const roomPlayer = room.players.find((p) => p.userId === userId);
          if (roomPlayer) {
            roomPlayer.score = score;
            roomPlayer.status = status;
          }

          // Broadcast accurate score + real board to all players
          broadcastToRoom(roomId, {
            type: 'player:update',
            userId,
            score,
            status,
            boardSnapshot: clientBoard ?? session.getState(userId)?.board ?? [],
          });

          if (session.isComplete()) {
            handleGameEnd(roomId, session);
          }
          break;
        }

        case 'game:restart': {
          // No-op for now — multiplayer restart requires all players to agree (Task #7)
          break;
        }

        default:
          break;
      }
    });

    ws.on('close', () => {
      clearTimeout(authTimer);
      if (ws.userId) {
        connections.delete(ws.userId);
        if (ws.roomId) {
          const roomId = ws.roomId;
          // If an active game session exists, mark the disconnecting player as lost
          const session = sessions.get(roomId);
          if (session) {
            const playerState = session.getState(ws.userId);
            if (playerState?.status === 'playing') {
              session.setClientScore(ws.userId, playerState.score, 'lost');
              if (session.isComplete()) {
                handleGameEnd(roomId, session);
              }
            }
          }
          // Remove player from room (no-op if room was already reset by handleGameEnd)
          const updated = roomManager.leaveRoom(roomId, ws.userId);
          if (updated) {
            broadcastToRoom(roomId, { type: 'room:state', room: updated });
          }
        }
      }
    });

    ws.on('error', (err) => {
      console.error('WebSocket error:', err);
    });
  });

  return wss;
};
