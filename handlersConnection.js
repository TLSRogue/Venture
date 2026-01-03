// handlersConnection.js

/**
 * Manages the initial connection, authentication (login/register),
 * and disconnection events for a player's socket.
 * Now includes STRICT INPUT VALIDATION to prevent XSS.
 */

import { players, parties, duels, saveAllPlayers } from './serverState.js';
import { gameData } from './data/index.js';
import { broadcastOnlinePlayers, broadcastPartyUpdate, broadcastDuelUpdate } from './utilsBroadcast.js';
import { endDuel } from './handlersDuel.js';
import { DUEL_DISCONNECT_MS } from './constants.js';

// --- SECURITY: Input Validation ---
const NAME_REGEX = /^[a-zA-Z0-9 ]{3,12}$/;

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
        debuffs: [],
        equippedSpells: [
            gameData.allSpells.find(s => s.name === 'Punch'),
            gameData.allSpells.find(s => s.name === 'Kick'),
            gameData.allSpells.find(s => s.name === 'Dodge')
        ].filter(Boolean).map(s => ({...s})),
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
        partyId: null,
        duelId: null
    };
}

export const registerConnectionHandlers = (io, socket) => {
    socket.on('registerPlayer', ({ characterName, characterIcon }) => {
        // 1. Validate String content
        if (!characterName || typeof characterName !== 'string') {
            return socket.emit('loadError', 'Invalid name format.');
        }

        const trimmedName = characterName.trim();

        // 2. Validate Regex (Alphanumeric only, 3-12 chars)
        if (!NAME_REGEX.test(trimmedName)) {
            return socket.emit('loadError', 'Name must be 3-12 characters and use letters/numbers only.');
        }
        
        // 3. Check for duplicates
        if (players[trimmedName]) {
            return socket.emit('loadError', 'Character name already exists.');
        }

        const newCharacter = createInitialCharacter(trimmedName, characterIcon);
        players[trimmedName] = {
            id: socket.id,
            character: newCharacter
        };
        
        // Attach identity to socket
        socket.characterName = trimmedName;

        socket.emit('characterUpdate', newCharacter);
        broadcastOnlinePlayers(io);
        
        saveAllPlayers();
    });

    socket.on('loadCharacter', ({ characterName }) => {
        if (!characterName || typeof characterName !== 'string') return;
        
        const player = players[characterName];

        if (player) {
            if (player.id && player.id !== socket.id) {
                const oldSocket = io.sockets.sockets.get(player.id);
                if (oldSocket) {
                    oldSocket.emit('loadError', 'You have logged in from another location.');
                    oldSocket.disconnect();
                }
            }

            player.id = socket.id;
            socket.characterName = characterName;
            socket.emit('characterUpdate', player.character);
            
            if (player.character.partyId) {
                const party = parties[player.character.partyId];
                if (party) {
                    socket.join(player.character.partyId);
                    socket.emit('partyUpdate', party);
                } else {
                    player.character.partyId = null;
                }
            }

            broadcastOnlinePlayers(io);
        } else {
            socket.emit('loadError', 'Character not found.');
        }
    });

    socket.on('disconnect', () => {
        const name = socket.characterName;
        if (name && players[name]) {
            console.log(`Player ${name} disconnected.`);
            
            const character = players[name].character;
            const duelId = character.duelId;

            if (duelId && duels[duelId] && !duels[duelId].ended) {
                const duel = duels[duelId];
                const opponent = duel.player1.name === name ? duel.player2 : duel.player1;
                duel.log.push({ message: `${name} has disconnected. The duel will end in 20 seconds...`, type: 'damage' });
                broadcastDuelUpdate(io, duelId);
                duel.disconnectTimeout = setTimeout(() => {
                    if(duels[duelId] && !duels[duelId].ended) {
                       endDuel(io, duelId, opponent.name, name);
                    }
                }, DUEL_DISCONNECT_MS);
            }

            players[name].id = null;
            broadcastOnlinePlayers(io);
            saveAllPlayers();
        }
    });
};