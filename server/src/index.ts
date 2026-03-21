import 'dotenv/config';
import http from 'http';
import { createApp } from './app';
import { attachWebSocketServer } from './ws/server';
import { RoomManager } from './ws/RoomManager';

const PORT = parseInt(process.env.PORT ?? '4000', 10);

const httpServer = http.createServer(createApp());
const roomManager = new RoomManager();
attachWebSocketServer(httpServer, roomManager);

httpServer.listen(PORT, () => {
  console.log(`2048 server listening on http://localhost:${PORT}`);
});
