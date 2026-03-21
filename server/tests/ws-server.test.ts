import http from 'http';
import { WebSocket } from 'ws';
import { attachWebSocketServer } from '../src/ws/server';
import { RoomManager } from '../src/ws/RoomManager';
import { signToken } from '../src/jwt';

// Mock the db module to avoid needing a real database
jest.mock('../src/db', () => ({
  db: {
    upsertStats: jest.fn().mockResolvedValue(undefined),
    findByUsername: jest.fn().mockResolvedValue(null),
    findById: jest.fn().mockResolvedValue(null),
    isUsernameTaken: jest.fn().mockResolvedValue(false),
    isUsernameTakenByOther: jest.fn().mockResolvedValue(false),
    createUser: jest.fn().mockResolvedValue(null),
    updateUser: jest.fn().mockResolvedValue(null),
    upgradeGuest: jest.fn().mockResolvedValue(null),
    getTopScores: jest.fn().mockResolvedValue([]),
    getUserRank: jest.fn().mockResolvedValue(null),
  },
  pool: {
    query: jest.fn().mockResolvedValue({ rows: [{ ok: 1 }] }),
    connect: jest.fn().mockResolvedValue({
      query: jest.fn().mockResolvedValue({ rows: [] }),
      release: jest.fn(),
    }),
    on: jest.fn(),
  },
}));

// ─── Test JWT secret ──────────────────────────────────────────────────────────

beforeAll(() => {
  process.env.JWT_SECRET = 'test-secret';
  // Allow WS connections from test clients (no origin header → passes verifyClient)
  delete process.env.CORS_ORIGIN;
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Creates a valid JWT for a test user */
const createTestToken = (userId: string, username: string): string =>
  signToken({ sub: userId, username });

/**
 * A simple message collector that buffers all incoming messages on a socket.
 * Allows tests to `pop` the next message of a given type without race conditions.
 */
class MessageCollector {
  private buffer: Record<string, unknown>[] = [];
  private waiters: Array<{
    type: string | undefined;
    resolve: (msg: Record<string, unknown>) => void;
    reject: (err: Error) => void;
  }> = [];

  constructor(public ws: WebSocket) {
    ws.on('message', (raw: Buffer | string) => {
      let msg: Record<string, unknown>;
      try {
        msg = JSON.parse(raw.toString()) as Record<string, unknown>;
      } catch {
        return;
      }
      // Try to satisfy a waiter first
      const idx = this.waiters.findIndex(
        (w) => w.type === undefined || w.type === msg['type'],
      );
      if (idx !== -1) {
        const waiter = this.waiters.splice(idx, 1)[0];
        waiter.resolve(msg);
      } else {
        this.buffer.push(msg);
      }
    });

    ws.on('close', (code, reason) => {
      const err = new Error(`Socket closed: ${code} ${reason.toString()}`);
      for (const w of this.waiters) {
        w.reject(err);
      }
      this.waiters = [];
    });
  }

  /** Returns the first buffered message of the given type, or waits for it. */
  next(type?: string): Promise<Record<string, unknown>> {
    // Check buffer first
    const idx =
      type === undefined
        ? 0
        : this.buffer.findIndex((m) => m['type'] === type);
    if (idx !== -1) {
      return Promise.resolve(this.buffer.splice(idx, 1)[0]);
    }
    return new Promise((resolve, reject) => {
      this.waiters.push({ type, resolve, reject });
    });
  }

  /** Drain (discard) all buffered messages, optionally filtering by type. */
  drain(type?: string): void {
    if (type === undefined) {
      this.buffer = [];
    } else {
      this.buffer = this.buffer.filter((m) => m['type'] !== type);
    }
  }
}

/** Opens a raw WebSocket connection and wraps it in a MessageCollector. */
const openClient = (serverAddress: string): Promise<MessageCollector> =>
  new Promise((resolve, reject) => {
    const ws = new WebSocket(serverAddress);
    ws.on('error', reject);
    ws.on('open', () => resolve(new MessageCollector(ws)));
  });

/** Returns a promise that resolves when the socket closes, with { code, reason }. */
const waitForClose = (ws: WebSocket): Promise<{ code: number; reason: string }> =>
  new Promise((resolve) => {
    if (
      ws.readyState === WebSocket.CLOSING ||
      ws.readyState === WebSocket.CLOSED
    ) {
      resolve({ code: 0, reason: '' });
      return;
    }
    ws.on('close', (code, reason) => resolve({ code, reason: reason.toString() }));
  });

/** Send an auth message and wait a tick for the server to process it. */
const authenticate = async (
  mc: MessageCollector,
  token: string,
): Promise<void> => {
  mc.ws.send(JSON.stringify({ type: 'auth', token }));
  await new Promise((r) => setTimeout(r, 50));
};

/** Send a JSON message on the socket. */
const send = (mc: MessageCollector, msg: Record<string, unknown>): void => {
  mc.ws.send(JSON.stringify(msg));
};

// ─── Test server setup ────────────────────────────────────────────────────────

let httpServer: http.Server;
let serverAddress: string;
let roomManager: RoomManager;

const openClients: MessageCollector[] = [];

/** Track a client so it's cleaned up after each test. */
const track = (mc: MessageCollector): MessageCollector => {
  openClients.push(mc);
  return mc;
};

beforeEach((done) => {
  roomManager = new RoomManager();
  httpServer = http.createServer();
  attachWebSocketServer(httpServer, roomManager);
  httpServer.listen(0, '127.0.0.1', () => {
    const addr = httpServer.address() as { port: number };
    serverAddress = `ws://127.0.0.1:${addr.port}`;
    done();
  });
});

afterEach(async () => {
  for (const mc of openClients) {
    if (
      mc.ws.readyState === WebSocket.OPEN ||
      mc.ws.readyState === WebSocket.CONNECTING
    ) {
      mc.ws.close();
    }
  }
  openClients.length = 0;
  await new Promise<void>((resolve) => httpServer.close(() => resolve()));
});

// ─────────────────────────────────────────────────────────────────────────────
// 1. Authentication flow
// ─────────────────────────────────────────────────────────────────────────────

describe('Authentication flow', () => {
  it('closes with 4001 if the first message is not auth', async () => {
    const mc = track(await openClient(serverAddress));
    const closeP = waitForClose(mc.ws);
    // Send a non-auth message as the very first message
    send(mc, { type: 'room:create', maxPlayers: 2 });
    const { code } = await closeP;
    expect(code).toBe(4001);
  }, 10_000);

  it('closes with 4001 when auth token is invalid', async () => {
    const mc = track(await openClient(serverAddress));
    const closeP = waitForClose(mc.ws);
    send(mc, { type: 'auth', token: 'not.a.valid.token' });
    const { code } = await closeP;
    expect(code).toBe(4001);
  });

  it('authenticates successfully with a valid token — socket stays open', async () => {
    const token = createTestToken('user-auth-ok', 'Alice');
    const mc = track(await openClient(serverAddress));
    await authenticate(mc, token);
    expect(mc.ws.readyState).toBe(WebSocket.OPEN);
  });

  it('closes the first connection (4000) when the same userId reconnects', async () => {
    const token = createTestToken('user-dup', 'Dup');

    const mc1 = track(await openClient(serverAddress));
    await authenticate(mc1, token);

    const closeP = waitForClose(mc1.ws);

    const mc2 = track(await openClient(serverAddress));
    await authenticate(mc2, token);

    const { code } = await closeP;
    expect(code).toBe(4000);
    expect(mc2.ws.readyState).toBe(WebSocket.OPEN);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. Rate limiting
// ─────────────────────────────────────────────────────────────────────────────

describe('Rate limiting', () => {
  it('closes the connection with 4029 after >50 messages in one second', async () => {
    const token = createTestToken('user-rl', 'RateLimited');
    const mc = track(await openClient(serverAddress));

    // Auth counts as message #1
    mc.ws.send(JSON.stringify({ type: 'auth', token }));
    await new Promise((r) => setTimeout(r, 50));

    const closeP = waitForClose(mc.ws);

    // Send 51 more messages burst — total will exceed 50 in the 1 s window
    for (let i = 0; i < 51; i++) {
      mc.ws.send(JSON.stringify({ type: 'room:leave' }));
    }

    const { code } = await closeP;
    expect(code).toBe(4029);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. Room lifecycle
// ─────────────────────────────────────────────────────────────────────────────

describe('Room lifecycle', () => {
  it('room:create — creates a room and sends back room:state', async () => {
    const token = createTestToken('user-c1', 'Creator');
    const mc = track(await openClient(serverAddress));
    await authenticate(mc, token);

    send(mc, { type: 'room:create', maxPlayers: 2 });
    const msg = await mc.next('room:state');

    expect(msg['type']).toBe('room:state');
    const room = msg['room'] as Record<string, unknown>;
    expect(room['hostId']).toBe('user-c1');
    expect(room['maxPlayers']).toBe(2);
    expect(room['status']).toBe('waiting');
    const players = room['players'] as Array<Record<string, unknown>>;
    expect(players).toHaveLength(1);
    expect(players[0]['userId']).toBe('user-c1');
  });

  it('room:join — second player joins and both receive room:state', async () => {
    const token1 = createTestToken('user-j1', 'Player1');
    const token2 = createTestToken('user-j2', 'Player2');

    const mc1 = track(await openClient(serverAddress));
    await authenticate(mc1, token1);

    // Player 1 creates room
    send(mc1, { type: 'room:create', maxPlayers: 2 });
    const createMsg = await mc1.next('room:state');
    const roomId = (createMsg['room'] as Record<string, unknown>)['roomId'] as string;

    // Player 2 joins
    const mc2 = track(await openClient(serverAddress));
    await authenticate(mc2, token2);

    send(mc2, { type: 'room:join', roomId });

    // Both should receive room:state with 2 players
    const [s1, s2] = await Promise.all([mc1.next('room:state'), mc2.next('room:state')]);

    for (const state of [s1, s2]) {
      const room = state['room'] as Record<string, unknown>;
      expect((room['players'] as unknown[]).length).toBe(2);
      expect(room['roomId']).toBe(roomId);
    }
  });

  it('room:leave — removes player and broadcasts updated state to remaining players', async () => {
    const token1 = createTestToken('user-l1', 'LeaveHost');
    const token2 = createTestToken('user-l2', 'LeaveGuest');

    const mc1 = track(await openClient(serverAddress));
    await authenticate(mc1, token1);
    send(mc1, { type: 'room:create', maxPlayers: 2 });
    const createMsg = await mc1.next('room:state');
    const roomId = (createMsg['room'] as Record<string, unknown>)['roomId'] as string;

    const mc2 = track(await openClient(serverAddress));
    await authenticate(mc2, token2);
    send(mc2, { type: 'room:join', roomId });

    // Both get join broadcast; drain it
    await Promise.all([mc1.next('room:state'), mc2.next('room:state')]);

    // mc2 leaves
    send(mc2, { type: 'room:leave' });
    const leaveState = await mc1.next('room:state');
    const room = leaveState['room'] as Record<string, unknown>;
    expect((room['players'] as unknown[]).length).toBe(1);
  });

  it('room:join — joining a non-existent room sends room:error', async () => {
    const token = createTestToken('user-je1', 'JoinErr');
    const mc = track(await openClient(serverAddress));
    await authenticate(mc, token);

    send(mc, { type: 'room:join', roomId: 'XXXXXX' });
    const msg = await mc.next('room:error');

    expect(msg['type']).toBe('room:error');
    expect(msg['code']).toBe('JOIN_FAILED');
  });

  it('room:ready — when all 2 players are ready, game:start and room:state(playing) are broadcast to both', async () => {
    const token1 = createTestToken('user-r1', 'ReadyHost');
    const token2 = createTestToken('user-r2', 'ReadyGuest');

    const mc1 = track(await openClient(serverAddress));
    await authenticate(mc1, token1);
    send(mc1, { type: 'room:create', maxPlayers: 2 });
    const createMsg = await mc1.next('room:state');
    const roomId = (createMsg['room'] as Record<string, unknown>)['roomId'] as string;

    const mc2 = track(await openClient(serverAddress));
    await authenticate(mc2, token2);
    send(mc2, { type: 'room:join', roomId });
    // Both receive join broadcast
    await Promise.all([mc1.next('room:state'), mc2.next('room:state')]);

    // Player 1 ready → both get room:state (only p1 ready)
    send(mc1, { type: 'room:ready' });
    await Promise.all([mc1.next('room:state'), mc2.next('room:state')]);

    // Player 2 ready → triggers: room:state (both ready) + game:start + room:state (playing)
    send(mc2, { type: 'room:ready' });

    // Both should receive room:state (both ready), game:start, and room:state (playing)
    // We collect them independently per socket
    const [gameStart1, gameStart2] = await Promise.all([
      mc1.next('game:start'),
      mc2.next('game:start'),
    ]);

    expect(gameStart1['type']).toBe('game:start');
    expect(gameStart2['type']).toBe('game:start');
    expect(typeof (gameStart1['startsAt'])).toBe('string');

    // Drain room:state messages until we receive the one with status 'playing'
    // (the server sends room:state(both-ready/waiting) before game:start, then room:state(playing) after)
    const getPlayingState = async (mc: MessageCollector): Promise<Record<string, unknown>> => {
      let state = await mc.next('room:state');
      while ((state['room'] as Record<string, unknown>)['status'] !== 'playing') {
        state = await mc.next('room:state');
      }
      return state;
    };

    const [playingState1, playingState2] = await Promise.all([
      getPlayingState(mc1),
      getPlayingState(mc2),
    ]);

    for (const state of [playingState1, playingState2]) {
      const room = state['room'] as Record<string, unknown>;
      expect(room['status']).toBe('playing');
    }
  }, 15_000);
});

// ─────────────────────────────────────────────────────────────────────────────
// Shared helpers for game tests
// ─────────────────────────────────────────────────────────────────────────────

/** Sets up two authenticated players in a running game. */
const setupPlayingGame = async (
  p1Id: string,
  p2Id: string,
): Promise<{ mc1: MessageCollector; mc2: MessageCollector; roomId: string }> => {
  const token1 = createTestToken(p1Id, `User-${p1Id}`);
  const token2 = createTestToken(p2Id, `User-${p2Id}`);

  const mc1 = track(await openClient(serverAddress));
  await authenticate(mc1, token1);
  send(mc1, { type: 'room:create', maxPlayers: 2 });
  const createMsg = await mc1.next('room:state');
  const roomId = (createMsg['room'] as Record<string, unknown>)['roomId'] as string;

  const mc2 = track(await openClient(serverAddress));
  await authenticate(mc2, token2);
  send(mc2, { type: 'room:join', roomId });
  // Drain join broadcasts
  await Promise.all([mc1.next('room:state'), mc2.next('room:state')]);

  // Both ready
  send(mc1, { type: 'room:ready' });
  await Promise.all([mc1.next('room:state'), mc2.next('room:state')]); // p1-ready broadcast

  send(mc2, { type: 'room:ready' });
  // p2-ready triggers: room:state (both ready) + game:start + room:state (playing)
  // Wait for game:start on both, then drain room:state(playing)
  await Promise.all([mc1.next('game:start'), mc2.next('game:start')]);
  // Drain room:state(playing) — there may also be the "both ready" room:state ahead of it
  // Drain until we get the 'playing' status
  const drainToPlaying = async (mc: MessageCollector) => {
    let roomState = await mc.next('room:state');
    while ((roomState['room'] as Record<string, unknown>)['status'] !== 'playing') {
      roomState = await mc.next('room:state');
    }
  };
  await Promise.all([drainToPlaying(mc1), drainToPlaying(mc2)]);

  return { mc1, mc2, roomId };
};

// ─────────────────────────────────────────────────────────────────────────────
// 4. Game flow
// ─────────────────────────────────────────────────────────────────────────────

describe('Game flow', () => {
  it('game:move broadcasts player:update to all room members', async () => {
    const { mc1, mc2 } = await setupPlayingGame('gm-p1', 'gm-p2');

    send(mc1, { type: 'game:move', direction: 'left' });

    const [u1, u2] = await Promise.all([mc1.next('player:update'), mc2.next('player:update')]);

    expect(u1['type']).toBe('player:update');
    expect(u2['type']).toBe('player:update');
    expect(u1['userId']).toBe('gm-p1');
    expect(u2['userId']).toBe('gm-p1');
  }, 15_000);

  it('game:score-update broadcasts player:update with client score to all', async () => {
    const { mc1, mc2 } = await setupPlayingGame('gsu-p1', 'gsu-p2');

    const clientScore = 999;
    send(mc1, { type: 'game:score-update', score: clientScore, status: 'playing' });

    const [u1, u2] = await Promise.all([mc1.next('player:update'), mc2.next('player:update')]);

    expect(u1['score']).toBe(clientScore);
    expect(u2['score']).toBe(clientScore);
  }, 15_000);

  it('game:score-update uses client score (not server sim score) in the broadcast', async () => {
    const { mc1, mc2 } = await setupPlayingGame('gss-p1', 'gss-p2');

    // Send a move first to advance server sim score
    send(mc1, { type: 'game:move', direction: 'left' });
    await Promise.all([mc1.next('player:update'), mc2.next('player:update')]);

    // Now report a distinctly different client score
    const trueClientScore = 12345;
    send(mc1, { type: 'game:score-update', score: trueClientScore, status: 'playing' });

    const [u1, u2] = await Promise.all([mc1.next('player:update'), mc2.next('player:update')]);

    expect(u1['score']).toBe(trueClientScore);
    expect(u2['score']).toBe(trueClientScore);
  }, 15_000);

  it('game:end is broadcast with correct rankings when all players send terminal status', async () => {
    const { mc1, mc2 } = await setupPlayingGame('ge-p1', 'ge-p2');

    // p1 finishes first
    send(mc1, { type: 'game:score-update', score: 500, status: 'lost' });
    await Promise.all([mc1.next('player:update'), mc2.next('player:update')]);

    // p2 finishes → game:end triggered
    send(mc2, { type: 'game:score-update', score: 1000, status: 'won' });

    const [end1, end2] = await Promise.all([mc1.next('game:end'), mc2.next('game:end')]);

    for (const end of [end1, end2]) {
      expect(end['type']).toBe('game:end');
      const rankings = end['rankings'] as Array<Record<string, unknown>>;
      expect(rankings).toHaveLength(2);
      const winner = rankings.find((r) => r['userId'] === 'ge-p2');
      const loser = rankings.find((r) => r['userId'] === 'ge-p1');
      expect(winner!['rank']).toBe(1);
      expect(winner!['score']).toBe(1000);
      expect(loser!['rank']).toBe(2);
      expect(loser!['score']).toBe(500);
    }
  }, 15_000);

  it('game:move broadcast uses last-known client score after a prior game:score-update', async () => {
    const { mc1, mc2 } = await setupPlayingGame('gmcs-p1', 'gmcs-p2');

    const knownClientScore = 777;

    // Report client score first
    send(mc1, { type: 'game:score-update', score: knownClientScore, status: 'playing' });
    await Promise.all([mc1.next('player:update'), mc2.next('player:update')]);

    // Now send a move — broadcast should carry the previously reported client score
    send(mc1, { type: 'game:move', direction: 'right' });
    const [u1, u2] = await Promise.all([mc1.next('player:update'), mc2.next('player:update')]);

    expect(u1['score']).toBe(knownClientScore);
    expect(u2['score']).toBe(knownClientScore);
  }, 15_000);

  it('before any game:score-update, game:move falls back to server simulation score', async () => {
    const { mc1, mc2 } = await setupPlayingGame('gmfb-p1', 'gmfb-p2');

    // No game:score-update sent yet
    send(mc1, { type: 'game:move', direction: 'left' });
    const [u1, u2] = await Promise.all([mc1.next('player:update'), mc2.next('player:update')]);

    // Server simulation score starts at 0 and can only grow from merges
    // The important thing is it's a valid non-negative number, not an arbitrary client value
    expect(typeof u1['score']).toBe('number');
    expect(typeof u2['score']).toBe('number');
    expect(u1['score'] as number).toBeGreaterThanOrEqual(0);
    // Sim score after one move on a random 2-tile board is bounded (two 2-tiles can merge → 4)
    expect(u1['score'] as number).toBeLessThan(1000);
  }, 15_000);
});

// ─────────────────────────────────────────────────────────────────────────────
// 5. Disconnection during game
// ─────────────────────────────────────────────────────────────────────────────

describe('Disconnection during game', () => {
  it('player disconnecting during a game is marked as lost', async () => {
    const { mc1, mc2 } = await setupPlayingGame('dc-lost-p1', 'dc-lost-p2');

    // p2 finishes
    send(mc2, { type: 'game:score-update', score: 200, status: 'won' });
    await Promise.all([mc1.next('player:update'), mc2.next('player:update')]);

    // p1 disconnects while still playing → game:end triggered
    const endP = mc2.next('game:end');
    mc1.ws.close();

    const end = await endP;
    expect(end['type']).toBe('game:end');
    const rankings = end['rankings'] as Array<Record<string, unknown>>;
    expect(rankings).toHaveLength(2);

    // Disconnected p1 should be ranked below the winner
    const dcPlayer = rankings.find((r) => r['userId'] === 'dc-lost-p1');
    const winner = rankings.find((r) => r['userId'] === 'dc-lost-p2');
    expect(dcPlayer).toBeDefined();
    expect(winner!['rank']).toBe(1);
  }, 15_000);

  it('if disconnect completes the game (last player), game:end is broadcast', async () => {
    const { mc1, mc2 } = await setupPlayingGame('dc-last-p1', 'dc-last-p2');

    // p2 finishes first
    send(mc2, { type: 'game:score-update', score: 500, status: 'won' });
    await Promise.all([mc1.next('player:update'), mc2.next('player:update')]);

    // p1 still playing → disconnect completes the game
    const endP = mc2.next('game:end');
    mc1.ws.close();

    const end = await endP;
    expect(end['type']).toBe('game:end');
    const rankings = end['rankings'] as Array<Record<string, unknown>>;
    expect(rankings).toHaveLength(2);
  }, 15_000);

  it("disconnected player's client-reported score is preserved in rankings", async () => {
    const { mc1, mc2 } = await setupPlayingGame('dc-score-p1', 'dc-score-p2');

    const clientScoreBeforeDisconnect = 9999;

    // p1 reports score before disconnecting
    send(mc1, {
      type: 'game:score-update',
      score: clientScoreBeforeDisconnect,
      status: 'playing',
    });
    await Promise.all([mc1.next('player:update'), mc2.next('player:update')]);

    // p2 finishes
    send(mc2, { type: 'game:score-update', score: 100, status: 'won' });
    await Promise.all([mc1.next('player:update'), mc2.next('player:update')]);

    // p1 disconnects while still playing
    const endP = mc2.next('game:end');
    mc1.ws.close();

    const end = await endP;
    const rankings = end['rankings'] as Array<Record<string, unknown>>;

    const dcEntry = rankings.find((r) => r['userId'] === 'dc-score-p1');
    expect(dcEntry).toBeDefined();
    // Must preserve the client-reported score, not the server simulation score
    expect(dcEntry!['score']).toBe(clientScoreBeforeDisconnect);
  }, 15_000);
});

// ─────────────────────────────────────────────────────────────────────────────
// 6. Score accuracy
// ─────────────────────────────────────────────────────────────────────────────

describe('Score accuracy', () => {
  it('game:move broadcast uses last-known client score (from prior game:score-update), not server sim score', async () => {
    const { mc1, mc2 } = await setupPlayingGame('sa-muc-p1', 'sa-muc-p2');

    const expectedClientScore = 4321;

    // Report a client score
    send(mc1, { type: 'game:score-update', score: expectedClientScore, status: 'playing' });
    await Promise.all([mc1.next('player:update'), mc2.next('player:update')]);

    // Send a move — broadcast should use the last client-reported score
    send(mc1, { type: 'game:move', direction: 'up' });
    const [u1, u2] = await Promise.all([mc1.next('player:update'), mc2.next('player:update')]);

    expect(u1['score']).toBe(expectedClientScore);
    expect(u2['score']).toBe(expectedClientScore);
    expect(u1['userId']).toBe('sa-muc-p1');
  }, 15_000);

  it('before any game:score-update, game:move falls back to server simulation score (0 initially)', async () => {
    const { mc1, mc2 } = await setupPlayingGame('sa-fb-p1', 'sa-fb-p2');

    // No game:score-update sent for p1 yet
    send(mc1, { type: 'game:move', direction: 'left' });
    const [u1, u2] = await Promise.all([mc1.next('player:update'), mc2.next('player:update')]);

    // Server sim score begins at 0 and grows only with tile merges
    expect(typeof u1['score']).toBe('number');
    expect(typeof u2['score']).toBe('number');
    expect(u1['score'] as number).toBeGreaterThanOrEqual(0);
    // A fresh board with 2 tiles cannot produce a score > a few merges
    expect(u1['score'] as number).toBeLessThan(1000);
  }, 15_000);
});
