// handlersConnection.js

/**
 * Manages the initial connection, authentication (login/register),
 * and disconnection events for a player's socket.
 */

import { players, parties, duels } from './serverState.js';
import { broadcastOnlinePlayers, broadcastPartyUpdate, broadcastDuelUpdate } from './utilsBroadcast.js';
import { endDuel } from './handlersDuel.js';


export const registerConnectionHandlers = (io, socket) => {
    
    const handlePlayerLogin = (characterData) => {
        const name = characterData.characterName;

        if (players[name] && players[name].id) {
            io.to(players[name].id).emit('loadError', 'Character is already online on another session.');
            socket.disconnect();
            return;
        }
        
        if (players[name]) {
            console.log(`Character ${name} is reconnecting with new socket ${socket.id}.`);
            players[name].id = socket.id;
            const serverCharacter = players[name].character;
            players[name].character = { ...serverCharacter, ...characterData };
            socket.characterName = name;
            
            const duelId = players[name].character.duelId;
            if (duelId && duels[duelId] && duels[duelId].disconnectTimeout) {
                console.log(`Player ${name} reconnected, cancelling duel termination for ${duelId}`);
                clearTimeout(duels[duelId].disconnectTimeout);
                duels[duelId].disconnectTimeout = null;
                const opponentState = duels[duelId].player1.name === name ? duels[duelId].player2 : duels[duelId].player1;
                const opponent = players[opponentState.name];
                if (opponent && opponent.id) {
                    io.to(opponent.id).emit('duel:update', duels[duelId]);
                    io.to(opponent.id).emit('info', `${name} has reconnected to the duel.`);
                }
            }

            if (duelId && duels[duelId]) {
                 socket.emit('duel:start', duels[duelId]);
            } else {
                 socket.emit('characterUpdate', players[name].character);
            }
            
            const partyId = players[name].character.partyId;
            if (partyId && parties[partyId]) {
                broadcastPartyUpdate(io, partyId);
                if (parties[partyId].sharedState) {
                    socket.emit('party:adventureStarted', parties[partyId].sharedState);
                }
            }
        } else {
            console.log(`Character ${name} is connecting for the first time.`);
            characterData.partyId = null;
            players[name] = { id: socket.id, character: characterData };
            socket.characterName = name;
            socket.emit('characterUpdate', players[name].character);
        }
        broadcastOnlinePlayers(io);
    };

    socket.on('registerPlayer', handlePlayerLogin);
    socket.on('loadCharacter', handlePlayerLogin);

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
            const duelId = players[name].character.duelId;
            if (duelId && duels[duelId] && !duels[duelId].ended) {
                const duel = duels[duelId];
                const opponent = duel.player1.name === name ? duel.player2 : duel.player1;

                duel.log.push({ message: `${name} has disconnected. The duel will end in 20 seconds if they do not reconnect.`, type: 'damage' });
                broadcastDuelUpdate(io, duelId);

                duel.disconnectTimeout = setTimeout(() => {
                    console.log(`Disconnect timer for ${name} in duel ${duelId} has expired.`);
                    endDuel(io, duelId, opponent.name, name);
                }, 20000);
            }

            players[name].id = null;
            broadcastOnlinePlayers(io);
        }
    });
};