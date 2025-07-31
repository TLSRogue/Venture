// serverState.js

/**
 * This file holds the "in-memory database" for the server.
 * It now includes logic to load the state from a file on startup.
 */

import fs from 'fs';
import path from 'path';

let players = {};

// Load players from a file on startup
try {
    const data = fs.readFileSync('players.json', 'utf8');
    const savedPlayers = JSON.parse(data);
    
    // We only want to load the character data, not the transient 'id' (socket id)
    for (const characterName in savedPlayers) {
        players[characterName] = {
            id: null, // Sockets are always null on startup
            character: savedPlayers[characterName].character
        };
    }
    console.log('Player data loaded successfully from players.json');
} catch (err) {
    console.log('No existing players.json file found. Starting with a clean state.');
    players = {};
}

export { players };
export let parties = {}; // Keyed by partyId
export let duels = {};   // Keyed by duelId