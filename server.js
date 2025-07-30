// server.js

// 1. SETUP
import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import path from 'path';
import { fileURLToPath } from 'url';

// Import all your new handler registration functions
import { registerConnectionHandlers } from './handlersConnection.js';
import { registerPartyHandlers } from './handlersParty.js';
import { registerAdventureHandlers } from './handlersAdventure.js';
import { registerDuelHandlers } from './handlersDuel.js';
import { registerPlayerActionHandlers } from './handlersPlayerAction.js';

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    pingTimeout: 20000,
    pingInterval: 25000,
});

const PORT = process.env.PORT || 3000;
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 2. SERVE THE GAME FILES
app.use(express.static(__dirname));
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// 3. HANDLE PLAYER CONNECTIONS
io.on('connection', (socket) => {
    console.log(`A player connected with ID: ${socket.id}`);

    // Delegate all event handling to the imported modules
    registerConnectionHandlers(io, socket);
    registerPartyHandlers(io, socket);
    registerAdventureHandlers(io, socket);
    registerDuelHandlers(io, socket);
    registerPlayerActionHandlers(io, socket);
});

// 4. START THE SERVER
server.listen(PORT, () => {
  console.log(`Server listening on http://localhost:${PORT}`);
});