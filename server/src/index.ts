import 'dotenv/config';
import http from 'http';
import { createApp } from './app';
import { attachWebSocketServer } from './ws/server';
import { RoomManager } from './ws/RoomManager';

const PORT = parseInt(process.env.PORT ?? '4000', 10);
const ROOM_CLEANUP_INTERVAL_MS = 60 * 60 * 1000; // 1 hour

const httpServer = http.createServer(createApp());
const roomManager = new RoomManager();
attachWebSocketServer(httpServer, roomManager);

setInterval(() => roomManager.cleanupStaleRooms(), ROOM_CLEANUP_INTERVAL_MS).unref();

httpServer.listen(PORT, () => {
  console.log(`2048 server listening on http://localhost:${PORT}`);
});
