import http from 'http';
import { WebSocket, WebSocketServer } from 'ws';
import { z } from 'zod';
import { verifyToken } from '../jwt';
import { db } from '../db';
import type { ServerMessage, AuthTokenPayload } from '../types';
import { RoomManager } from './RoomManager';
import { GameSession } from './GameSession';
import { logger } from '../logger';

const clientMessageSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('room:create'), maxPlayers: z.union([z.literal(2), z.literal(3), z.literal(4)]) }),
  z.object({ type: z.literal('room:join'), roomId: z.string().min(1).max(10) }),
  z.object({ type: z.literal('room:leave') }),
  z.object({ type: z.literal('room:ready') }),
  z.object({ type: z.literal('game:move'), direction: z.enum(['up', 'down', 'left', 'right']) }),
  z.object({ type: z.literal('game:score-update'), score: z.number().int().min(0).max(500000), status: z.enum(['playing', 'won', 'lost']), board: z.array(z.array(z.number())).optional() }),
  z.object({ type: z.literal('game:restart') }),
]);

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
  // Track concurrent WebSocket connections per IP to prevent connection exhaustion
  const ipConnectionCount = new Map<string, number>();
  const MAX_WS_CONNECTIONS_PER_IP = 20;

  const wss = new WebSocketServer({
    server: httpServer,
    maxPayload: 4096,
    verifyClient: ({ req }: { req: http.IncomingMessage }) => {
      const origin = req.headers.origin;
      if (origin) {
        const allowed = process.env.CORS_ORIGIN ?? 'http://localhost:3000';
        if (origin !== allowed) return false;
      }

      // Per-IP connection limit
      const ip = (req.headers['x-forwarded-for'] as string | undefined)?.split(',')[0].trim()
        ?? req.socket.remoteAddress
        ?? 'unknown';
      const count = ipConnectionCount.get(ip) ?? 0;
      if (count >= MAX_WS_CONNECTIONS_PER_IP) return false;
      ipConnectionCount.set(ip, count + 1);
      (req as { wsUser?: AuthTokenPayload; clientIp?: string }).clientIp = ip;

      // Try cookie auth — attach wsUser to req for immediate auth in connection handler
      const match = req.headers.cookie?.match(/(?:^|;\s*)token=([^;]+)/);
      if (match) {
        try {
          (req as { wsUser?: AuthTokenPayload; clientIp?: string }).wsUser = verifyToken(decodeURIComponent(match[1]));
        } catch {
          // Invalid/expired token — fall through to first-message auth
        }
      }
      return true;
    },
  });

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
      return db.upsertStats(state.userId, {
        won: state.status === 'won',
        score: state.score,
        moves: state.moves,
      });
    });
    Promise.allSettled(statsWrites).then((results) => {
      for (const r of results) {
        if (r.status === 'rejected') {
          logger.error({ reason: r.reason }, 'Failed to upsert stats');
        }
      }
    });

    const resetRoom = roomManager.resetRoom(roomId);
    if (resetRoom) {
      broadcastToRoom(roomId, { type: 'room:state', room: resetRoom });
    }
  };

  const SESSION_IDLE_TIMEOUT_MS = 10 * 60 * 1000; // 10 minutes

  const _idleCheckInterval = setInterval(() => {
    const now = Date.now();
    for (const [roomId, session] of sessions.entries()) {
      if (now - session.lastActivityAt > SESSION_IDLE_TIMEOUT_MS) {
        for (const state of session.getAllStates()) {
          if (state.status === 'playing') {
            session.markPlayerDone(state.userId, 'lost');
          }
        }
        handleGameEnd(roomId, session);
      }
    }
  }, 60 * 1000).unref();

  wss.on('connection', (ws: AuthenticatedSocket, req: http.IncomingMessage) => {
    let authenticated = false;

    // ── Per-connection rate limiting ───────────────────────────────────────
    let msgCount = 0;
    let rateLimitWindowStart = Date.now();
    const MSG_RATE_LIMIT = 50;
    const RATE_WINDOW_MS = 1000;

    // ── Cookie-based pre-authentication ───────────────────────────────────
    const wsUser = (req as { wsUser?: AuthTokenPayload }).wsUser;
    if (wsUser) {
      ws.userId = wsUser.sub;
      ws.username = wsUser.username;
      authenticated = true;
      const existingWs = connections.get(wsUser.sub);
      if (existingWs && existingWs !== ws && existingWs.readyState === WebSocket.OPEN) {
        existingWs.close(4000, 'Replaced by new connection');
      }
      connections.set(wsUser.sub, ws);
      send(ws, { type: 'hello', userId: wsUser.sub });
    }

    // ── Auth timeout (cleared immediately when cookie-authenticated) ───────
    const authTimer = setTimeout(() => {
      if (!authenticated) {
        ws.close(4001, 'Authentication timeout');
      }
    }, AUTH_TIMEOUT_MS);
    if (authenticated) clearTimeout(authTimer);

    ws.on('message', (raw: Buffer | string) => {
      const now = Date.now();
      if (now - rateLimitWindowStart >= RATE_WINDOW_MS) {
        msgCount = 0;
        rateLimitWindowStart = now;
      }
      msgCount += 1;
      if (msgCount > MSG_RATE_LIMIT) {
        ws.close(4029, 'Rate limit exceeded');
        return;
      }

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
          const existingWs = connections.get(payload.sub);
          if (existingWs && existingWs !== ws && existingWs.readyState === WebSocket.OPEN) {
            existingWs.close(4000, 'Replaced by new connection');
          }
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
      const parsed = clientMessageSchema.safeParse(msg);
      if (!parsed.success) return; // silently ignore invalid messages
      const clientMsg = parsed.data;

      switch (clientMsg.type) {
        case 'room:create': {
          const room = roomManager.createRoom(
            { userId, username, isReady: false, score: 0, status: 'waiting' },
            clientMsg.maxPlayers,
          );
          ws.roomId = room.id;
          broadcastToRoom(room.id, { type: 'room:state', room });
          break;
        }

        case 'room:join': {
          if (ws.roomId) {
            const prevRoomId = ws.roomId;
            const prev = roomManager.leaveRoom(prevRoomId, userId);
            ws.roomId = undefined;
            if (prev) {
              broadcastToRoom(prev.id, { type: 'room:state', room: prev });
            } else {
              sessions.delete(prevRoomId);
            }
          }
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
          ws.roomId = room.id;
          broadcastToRoom(room.id, { type: 'room:state', room });
          break;
        }

        case 'room:leave': {
          const roomId = ws.roomId;
          if (!roomId) break;
          const updated = roomManager.leaveRoom(roomId, userId);
          ws.roomId = undefined;
          if (updated) {
            broadcastToRoom(roomId, { type: 'room:state', room: updated });
          } else {
            // room dissolved — clean up any orphaned session
            sessions.delete(roomId);
          }
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

          // Use the last client-reported score/status so opponents always see accurate values.
          // The server simulation board diverges from the client (different random tiles), so
          // playerState.score would be wrong. Fall back to it only before the first score-update.
          const clientScore = session.getClientScore(userId);
          broadcastToRoom(roomId, {
            type: 'player:update',
            userId,
            score: clientScore?.score ?? playerState.score,
            status: clientScore?.status ?? (playerState.status === 'playing' ? 'playing' : playerState.status),
            boardSnapshot: playerState.board,
          });
          break;
        }

        case 'game:score-update': {
          const roomId = ws.roomId;
          if (!roomId) break;
          const session = sessions.get(roomId);
          if (!session) break;

          const { score, status, board: rawClientBoard } = clientMsg;

          // Validate the client-supplied board (if present)
          const VALID_TILES = new Set([0, 2, 4, 8, 16, 32, 64, 128, 256, 512, 1024, 2048, 4096]);
          const isValidBoard = (b: unknown): b is number[][] =>
            Array.isArray(b) &&
            b.length === 4 &&
            b.every(
              (row) =>
                Array.isArray(row) &&
                row.length === 4 &&
                row.every((cell) => typeof cell === 'number' && VALID_TILES.has(cell)),
            );

          const clientBoard = isValidBoard(rawClientBoard) ? rawClientBoard : undefined;

          // Store client-reported score for real-time display broadcasts only.
          session.setClientScore(userId, score, status);
          // Propagate terminal status into server-authoritative state.
          if (status === 'won' || status === 'lost') {
            session.markPlayerDone(userId, status);
          }

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
      // Decrement per-IP connection counter
      const ip = (req as { clientIp?: string }).clientIp;
      if (ip) {
        const count = ipConnectionCount.get(ip) ?? 0;
        if (count <= 1) ipConnectionCount.delete(ip);
        else ipConnectionCount.set(ip, count - 1);
      }
      if (ws.userId) {
        connections.delete(ws.userId);
        if (ws.roomId) {
          const roomId = ws.roomId;
          // If an active game session exists, mark the disconnecting player as lost
          const session = sessions.get(roomId);
          if (session) {
            const playerState = session.getState(ws.userId);
            if (playerState?.status === 'playing') {
              session.markPlayerDone(ws.userId, 'lost');
              if (session.isComplete()) {
                handleGameEnd(roomId, session);
              }
            }
          }
          // Remove player from room (no-op if room was already reset by handleGameEnd)
          const updated = roomManager.leaveRoom(roomId, ws.userId);
          if (updated) {
            broadcastToRoom(roomId, { type: 'room:state', room: updated });
          } else {
            // room dissolved — clean up any orphaned session
            sessions.delete(roomId);
          }
        }
      }
    });

    ws.on('error', (err) => {
      logger.error({ err }, 'WebSocket error');
    });
  });

  return wss;
};
