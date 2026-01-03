// server.js

// 1. SETUP
import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import path from 'path';
import { fileURLToPath } from 'url';

// Import all handler registration functions
import { registerConnectionHandlers } from './handlersConnection.js';
import { registerPartyHandlers } from './handlersParty.js';
import { registerAdventureHandlers } from './handlersAdventure.js';
import { registerDuelHandlers } from './handlersDuel.js';
import { registerPlayerActionHandlers } from './handlersPlayerAction.js';

// Import the save function
import { saveAllPlayers } from './serverState.js';

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

    socket.on('disconnect', () => {
        console.log(`Player disconnected: ${socket.id}`);
    });
});

// 4. AUTO-SAVE SYSTEM
const AUTO_SAVE_INTERVAL_MS = 60 * 1000; // Save every 1 minute
setInterval(() => {
    saveAllPlayers();
}, AUTO_SAVE_INTERVAL_MS);

// 5. GRACEFUL SHUTDOWN (Save on server stop)
const handleShutdown = async (signal) => {
    console.log(`Received ${signal}. Saving data before exit...`);
    await saveAllPlayers();
    console.log('Data saved. Exiting.');
    process.exit(0);
};

process.on('SIGINT', () => handleShutdown('SIGINT'));
process.on('SIGTERM', () => handleShutdown('SIGTERM'));

// 6. START SERVER
server.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
    console.log(`Auto-save enabled: Running every ${AUTO_SAVE_INTERVAL_MS / 1000} seconds.`);
});