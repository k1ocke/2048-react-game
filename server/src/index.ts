import 'dotenv/config';

if (!process.env.DATABASE_URL) {
  console.error('FATAL: DATABASE_URL env var is required');
  process.exit(1);
}
if (!process.env.JWT_SECRET) {
  console.error('FATAL: JWT_SECRET env var is required');
  process.exit(1);
}
if (process.env.JWT_SECRET === 'dev-secret-change-in-production') {
  console.warn('WARNING: Using default JWT_SECRET. Set a strong random secret for production.');
}

import http from 'http';
import { createApp } from './app';
import { attachWebSocketServer } from './ws/server';
import { RoomManager } from './ws/RoomManager';
import { pool } from './db';
import { runMigrations } from './migrate';

const PORT = parseInt(process.env.PORT ?? '4000', 10);
const ROOM_CLEANUP_INTERVAL_MS = 60 * 60 * 1000; // 1 hour

const httpServer = http.createServer(createApp());
const roomManager = new RoomManager();
const wss = attachWebSocketServer(httpServer, roomManager);

setInterval(() => roomManager.cleanupStaleRooms(), ROOM_CLEANUP_INTERVAL_MS).unref();

const shutdown = async (signal: string) => {
  console.log(`${signal} received — shutting down gracefully`);
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
  console.error('Uncaught exception:', err);
  void shutdown('uncaughtException');
});
process.on('unhandledRejection', (reason) => {
  console.error('Unhandled rejection:', reason);
  void shutdown('unhandledRejection');
});

runMigrations()
  .then(() => {
    httpServer.listen(PORT, () => {
      console.log(`2048 server listening on http://localhost:${PORT}`);
    });
  })
  .catch((err) => {
    console.error('Migration failed:', err);
    process.exit(1);
  });
