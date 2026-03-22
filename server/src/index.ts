import 'dotenv/config';

if (!process.env.DATABASE_URL) {
  process.stderr.write('FATAL: DATABASE_URL env var is required\n');
  process.exit(1);
}
if (!process.env.JWT_SECRET) {
  process.stderr.write('FATAL: JWT_SECRET env var is required\n');
  process.exit(1);
}
if (process.env.JWT_SECRET === 'dev-secret-change-in-production') {
  process.stderr.write('WARNING: Using default JWT_SECRET. Set a strong random secret for production.\n');
}

import http from 'http';
import { createApp } from './app';
import { attachWebSocketServer } from './ws/server';
import { RoomManager } from './ws/RoomManager';
import { pool } from './db';
import { runMigrations } from './migrate';
import { initBlocklist } from './blocklist';
import { logger } from './logger';

const PORT = parseInt(process.env.PORT ?? '4000', 10);
const ROOM_CLEANUP_INTERVAL_MS = 60 * 60 * 1000; // 1 hour

const httpServer = http.createServer(createApp());
const roomManager = new RoomManager();
const wss = attachWebSocketServer(httpServer, roomManager);

setInterval(() => roomManager.cleanupStaleRooms(), ROOM_CLEANUP_INTERVAL_MS).unref();

const shutdown = async (signal: string) => {
  logger.info({ signal }, 'Shutting down gracefully');
  wss.close();
  httpServer.close(async () => {
    await pool.end();
    process.exit(0);
  });
  // Force exit after 10 seconds
  setTimeout(() => process.exit(1), 10_000).unref();
};
process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));

process.on('uncaughtException', (err) => {
  logger.error({ err }, 'Uncaught exception');
  void shutdown('uncaughtException');
});
process.on('unhandledRejection', (reason) => {
  logger.error({ reason }, 'Unhandled rejection');
  void shutdown('unhandledRejection');
});

runMigrations()
  .then(() => initBlocklist())
  .then(() => {
    httpServer.listen(PORT, () => {
      logger.info({ port: PORT }, '2048 server listening');
    });
  })
  .catch((err) => {
    logger.error({ err }, 'Migration failed');
    process.exit(1);
  });
