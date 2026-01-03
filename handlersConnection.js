// handlersConnection.js

/**
 * Manages the initial connection, authentication (login/register),
 * and disconnection events for a player's socket.
 * Now includes logic to save player data to a file on disconnect.
 */

import { players, parties, duels, createInitialCharacter } from './serverState.js';
import { broadcastOnlinePlayers, broadcastPartyUpdate, broadcastDuelUpdate } from './utilsBroadcast.js';
import { endDuel } from './handlersDuel.js';
import fs from 'fs';
import { DUEL_DISCONNECT_MS } from './constants.js';

export const registerConnectionHandlers = (io, socket) => {

    const handlePlayerLogin = (characterDataFromClient) => {
        const name = characterDataFromClient.characterName;

        if (!name) {
            socket.emit('loadError', 'Invalid character name provided.');
            socket.disconnect();
            return;
        }

        if (players[name] && players[name].id) {
            io.to(players[name].id).emit('loadError', 'Character is already online on another session.');
            socket.disconnect();
            return;
        }

        let characterToUpdate;

        if (players[name]) {
            // Player is RECONNECTING to an active session. Use existing server data.
            console.log(`Character ${name} is reconnecting with new socket ${socket.id}.`);
            players[name].id = socket.id;
            socket.characterName = name;
            characterToUpdate = players[name].character;

            const duelId = characterToUpdate.duelId;
            if (duelId && duels[duelId] && duels[duelId].disconnectTimeout) {
                console.log(`Player ${name} reconnected, cancelling duel termination for ${duelId}`);
                clearTimeout(duels[duelId].disconnectTimeout);
                duels[duelId].disconnectTimeout = null;
            }
        } else {
            // Player is LOADING from localStorage or REGISTERING for the first time.
            // Trust the client's data to establish the session state.
            console.log(`Character ${name} is connecting for the first time or loading from save.`);
            players[name] = { id: socket.id, character: characterDataFromClient };
            socket.characterName = name;
            characterToUpdate = characterDataFromClient;
        }

        // Send the authoritative state to the client for this session
        if (characterToUpdate.duelId && duels[characterToUpdate.duelId]) {
            socket.emit('duel:start', duels[characterToUpdate.duelId]);
        } else {
            socket.emit('characterUpdate', characterToUpdate);
        }

        const partyId = characterToUpdate.partyId;
        if (partyId && parties[partyId]) {
            broadcastPartyUpdate(io, partyId);
            if (parties[partyId].sharedState) {
                socket.emit('party:adventureStarted', parties[partyId].sharedState);
            }
        }

        broadcastOnlinePlayers(io);
    };

    socket.on('registerPlayer', (characterData) => {
        // When registering, we create a fresh character to ensure no modified data is sent.
        const newCharacter = createInitialCharacter(characterData.characterName, characterData.characterIcon);
        handlePlayerLogin(newCharacter);
    });

    socket.on('loadCharacter', (characterData) => {
        // When loading, we trust the data from localStorage.
        handlePlayerLogin(characterData);
    });

    socket.on('updateCharacter', (characterData) => {
        const name = socket.characterName;
        if (name && players[name]) {
            players[name].character = characterData;
        }
    });

    socket.on('disconnect', () => {
        const name = socket.characterName;
        console.log(`Socket ${socket.id} for character ${name} disconnected.`);
        if (name && players[name]) {
            const character = players[name].character;
            if (!character) return;

            // BUG FIX: The logic to clean up solo parties was too aggressive.
            // It deleted the party immediately on disconnect, causing a state issue on quick reconnects.
            // This logic is now removed. A more robust timeout system could be added later if abandoned
            // solo parties become a memory issue, but for now, simply not deleting them fixes the bug.
            /*
            const partyId = character.partyId;
            if (partyId && parties[partyId] && parties[partyId].isSoloParty) {
                console.log(`Cleaning up solo party ${partyId} for disconnected player ${name}.`);
                character.partyId = null;
                delete parties[partyId];
            }
            */

            const duelId = character.duelId;
            if (duelId && duels[duelId] && !duels[duelId].ended) {
                const duel = duels[duelId];
                const opponent = duel.player1.name === name ? duel.player2 : duel.player1;
                duel.log.push({ message: `${name} has disconnected. The duel will end in 20 seconds...`, type: 'damage' });
                broadcastDuelUpdate(io, duelId);
                duel.disconnectTimeout = setTimeout(() => {
                    if (duels[duelId] && !duels[duelId].ended) {
                        endDuel(io, duelId, opponent.name, name);
                    }
                }, DUEL_DISCONNECT_MS);
            }

            // --- SAVE PROGRESS TO FILE ---
            try {
                fs.writeFileSync('players.json', JSON.stringify(players, null, 2));
                console.log(`Progress for ${name} saved to players.json.`);
            } catch (err) {
                console.error('Failed to save player data:', err);
            }
            // ---------------------------

            players[name].id = null;
            broadcastOnlinePlayers(io);
        }
    });
};