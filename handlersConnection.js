// handlersConnection.js

/**
 * Manages the initial connection, authentication (login/register),
 * and disconnection events for a player's socket.
 */

import { players, parties, duels } from './serverState.js';
import { gameData } from './game-data.js';
import { broadcastOnlinePlayers, broadcastPartyUpdate, broadcastDuelUpdate } from './utilsBroadcast.js';
import { endDuel } from './handlersDuel.js';

/**
 * Creates a new character object with default stats and items.
 * This is the server's template for any new player.
 * @param {string} characterName - The name for the new character.
 * @param {string} characterIcon - The icon for the new character.
 * @returns {object} The initial character state object.
 */
function createInitialCharacter(characterName, characterIcon) {
    return {
        characterName: characterName,
        characterIcon: characterIcon,
        title: "The Novice",
        unlockedTitles: ["The Novice"],
        health: 10,
        maxHealth: 10,
        shield: 0,
        wisdom: 0,
        strength: 0,
        agility: 0,
        defense: 0,
        luck: 0,
        physicalResistance: 0,
        mining: 0,
        fishing: 0,
        woodcutting: 0,
        harvesting: 0,
        gold: 200,
        questPoints: 0,
        actionPoints: 3,
        focus: 0,
        inventory: Array(24).fill(null),
        bank: [],
        buffs: [],
        playerDebuffs: [],
        equippedSpells: [
            gameData.allSpells.find(s => s.name === 'Punch'),
            gameData.allSpells.find(s => s.name === 'Kick'),
            gameData.allSpells.find(s => s.name === 'Dodge')
        ].filter(Boolean).map(s => ({...s})), // Ensure we get copies
        spellbook: [],
        knownRecipes: [],
        equipment: {
            mainHand: {...gameData.allItems.find(i => i.name === "Wooden Training Sword")},
            offHand: null,
            helmet: null,
            armor: null,
            boots: null,
            accessory: null,
            ammo: null
        },
        quests: [],
        spellCooldowns: {},
        weaponCooldowns: {},
        itemCooldowns: {},
        merchantStock: [],
        merchantLastStocked: null,
        cardDefeatTimes: {},
        partyId: null,
        duelId: null,
    };
}


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
        
        // --- REFACTORED LOGIC ---
        let characterToUpdate;

        if (players[name]) {
            // Player is RECONNECTING. Use existing server data.
            console.log(`Character ${name} is reconnecting with new socket ${socket.id}.`);
            players[name].id = socket.id;
            socket.characterName = name;
            characterToUpdate = players[name].character; // Use the authoritative character from the server
            
            const duelId = characterToUpdate.duelId;
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
        } else {
            // Player is REGISTERING for the first time. Create a new character on the server.
            console.log(`Character ${name} is connecting for the first time.`);
            const newCharacter = createInitialCharacter(name, characterDataFromClient.characterIcon);
            players[name] = { id: socket.id, character: newCharacter };
            socket.characterName = name;
            characterToUpdate = newCharacter;
        }

        // Send the authoritative state to the client
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

    socket.on('registerPlayer', handlePlayerLogin);
    socket.on('loadCharacter', handlePlayerLogin);

    // This event should be used sparingly. The server should control the character object.
    socket.on('updateCharacter', (characterData) => {
        const name = socket.characterName;
        if (name && players[name]) {
            // Only update specific, safe fields if necessary, or preferably,
            // have specific events for actions instead of this generic update.
            players[name].character = characterData;
        }
    });

    socket.on('disconnect', () => {
        const name = socket.characterName;
        console.log(`Socket ${socket.id} for character ${name} disconnected.`);
        if (name && players[name]) {
            const character = players[name].character;
            if (!character) return; // Character might not be fully loaded

            const duelId = character.duelId;
            if (duelId && duels[duelId] && !duels[duelId].ended) {
                const duel = duels[duelId];
                const opponent = duel.player1.name === name ? duel.player2 : duel.player1;

                duel.log.push({ message: `${name} has disconnected. The duel will end in 20 seconds if they do not reconnect.`, type: 'damage' });
                broadcastDuelUpdate(io, duelId);

                duel.disconnectTimeout = setTimeout(() => {
                    console.log(`Disconnect timer for ${name} in duel ${duelId} has expired.`);
                    if(duels[duelId] && !duels[duelId].ended) {
                       endDuel(io, duelId, opponent.name, name);
                    }
                }, 20000);
            }

            players[name].id = null;
            broadcastOnlinePlayers(io);
        }
    });
};