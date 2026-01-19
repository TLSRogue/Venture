// handlersConnection.js

/**
 * Manages the initial connection, authentication (login/register),
 * and disconnection events for a player's socket.
 * Now includes logic to save player data to a file on disconnect.
 */

import { players, parties, duels, pvpEncounters, createInitialCharacter } from './serverState.js';
import { broadcastOnlinePlayers, broadcastPartyUpdate, broadcastDuelUpdate, broadcastAdventureUpdate } from './utilsBroadcast.js';
import { endDuel } from './handlersDuel.js';
import { handlePvpPlayerDeath } from './adventure/pvp-state.js';
import fs from 'fs';
import { DUEL_DISCONNECT_MS } from './constants.js';
import { gameData } from './data/index.js';

/**
 * Refreshes player spells to match current definitions.
 * This ensures players get updated spell properties (like crossbow support for bow spells).
 */
function refreshPlayerSpells(character, characterName) {
    // List of spells that may need updates
    // Include all magic spells that have isMagic: true, so Silence can block them correctly
    const spellsToRefresh = [
        'Aim True', 'Split Shot', 'Evasive Shot', 'Dagger Throw', 'Ambush', 'Magic Barrier',
        // Magic spells (isMagic: true) - needed for Silence to work
        'Fireball', 'Flash Heal', 'Holy Shock', 'Flame Strike', 'Stealth', 'Silence', 'Revive', 'Cone of Cold', 'Entangling Roots', 'Cleanse'
    ];

    spellsToRefresh.forEach(spellName => {
        const currentDef = gameData.allSpells.find(s => s.name === spellName);
        if (!currentDef) return;

        // Update in equipped spells
        const equippedIdx = character.equippedSpells?.findIndex(s => s && s.name === spellName);
        if (equippedIdx !== undefined && equippedIdx !== -1) {
            character.equippedSpells[equippedIdx] = { ...currentDef };
            console.log(`[Spell Refresh] Updated ${spellName} for ${characterName} (equipped)`);
        }

        // Update in spellbook
        const spellbookIdx = character.spellbook?.findIndex(s => s && s.name === spellName);
        if (spellbookIdx !== undefined && spellbookIdx !== -1) {
            character.spellbook[spellbookIdx] = { ...currentDef };
            console.log(`[Spell Refresh] Updated ${spellName} for ${characterName} (spellbook)`);
        }
    });
}

/**
 * Refreshes player equipment to match current item definitions.
 * This ensures existing items get new properties (like gemSlots for Staff).
 */
function refreshPlayerEquipment(character, characterName) {
    // Items that need property updates
    const itemUpdates = {
        'Staff': { gemSlots: 1 }
    };

    // Update equipment slots
    if (character.equipment) {
        for (const slot in character.equipment) {
            const item = character.equipment[slot];
            if (item && itemUpdates[item.name]) {
                const updates = itemUpdates[item.name];
                let updated = false;
                for (const prop in updates) {
                    if (item[prop] === undefined) {
                        item[prop] = updates[prop];
                        updated = true;
                    }
                }
                if (updated) {
                    console.log(`[Equipment Refresh] Added properties to ${item.name} for ${characterName} (${slot})`);
                }
            }
        }
    }

    // Update inventory items
    if (character.inventory) {
        character.inventory.forEach((item, index) => {
            if (item && itemUpdates[item.name]) {
                const updates = itemUpdates[item.name];
                let updated = false;
                for (const prop in updates) {
                    if (item[prop] === undefined) {
                        item[prop] = updates[prop];
                        updated = true;
                    }
                }
                if (updated) {
                    console.log(`[Equipment Refresh] Added properties to ${item.name} for ${characterName} (inventory[${index}])`);
                }
            }
        });
    }
}

/**
 * Backfills T2 crafting recipes for players who completed quests before the recipe rewards were expanded.
 */
function backfillT2Recipes(character, characterName) {
    if (!character.quests || !character.knownRecipes) return;

    const backfillRules = [
        { questId: 'STEEL_ARMOR_QUEST', recipes: ['Steel Helm (T2)', 'Steel Boots (T2)'] },
        { questId: 'TAILOR_SILK_QUEST', recipes: ['Silk Wizard Robes (T2)', 'Silk Wizard Hat (T2)', 'Silk Wizard Boots (T2)'] },
        { questId: 'OLD_RECIPE_QUEST', recipes: ['Gem of Frost', 'Gem of Holy', 'Gem of Shadow'] },
        // Note: RANGER_SET_QUEST is new, so no backfill needed
    ];

    backfillRules.forEach(({ questId, recipes }) => {
        const completedQuest = character.quests.find(q => q.details?.id === questId && q.status === 'completed');
        if (completedQuest) {
            recipes.forEach(recipeName => {
                if (!character.knownRecipes.includes(recipeName)) {
                    character.knownRecipes.push(recipeName);
                    console.log(`[Recipe Backfill] Added ${recipeName} for ${characterName}`);
                }
            });
        }
    });
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

            // --- INVENTORY SIZE FIX: Extend old 24-slot inventories to 28 slots ---
            if (characterDataFromClient.inventory && characterDataFromClient.inventory.length < 28) {
                const originalLength = characterDataFromClient.inventory.length;
                while (characterDataFromClient.inventory.length < 28) {
                    characterDataFromClient.inventory.push(null);
                }
                console.log(`Extended inventory from ${originalLength} to 28 slots for ${name} on login.`);
            }
            // --- END INVENTORY SIZE FIX ---

            players[name] = { id: socket.id, character: characterDataFromClient };
            socket.characterName = name;
            characterToUpdate = characterDataFromClient;
        }

        // --- RUNTIME SPELL REFRESH ---
        // Always update spells to current definitions to ensure new properties are applied
        refreshPlayerSpells(characterToUpdate, name);

        // --- RUNTIME EQUIPMENT REFRESH ---
        // Update existing items with new properties (e.g., gem slots)
        refreshPlayerEquipment(characterToUpdate, name);

        // --- RUNTIME RECIPE BACKFILL ---
        // Add recipes for players who completed quests before reward expansion
        backfillT2Recipes(characterToUpdate, name);

        // Send the authoritative state to the client for this session
        if (characterToUpdate.duelId && duels[characterToUpdate.duelId]) {
            socket.emit('duel:start', duels[characterToUpdate.duelId]);
        } else {
            socket.emit('characterUpdate', characterToUpdate);
        }

        const partyId = characterToUpdate.partyId;
        if (partyId) {
            if (parties[partyId]) {
                broadcastPartyUpdate(io, partyId);
                if (parties[partyId].sharedState) {
                    socket.emit('party:adventureStarted', parties[partyId].sharedState);
                }
            } else {
                // Clear stale partyId if the party no longer exists
                console.log(`Clearing stale partyId ${partyId} for character ${name}.`);
                characterToUpdate.partyId = null;
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

            // --- PVP ENCOUNTER DISCONNECT HANDLING ---
            const partyId = character.partyId;
            if (partyId && parties[partyId] && parties[partyId].sharedState?.pvpEncounterId) {
                const party = parties[partyId];
                const encounter = pvpEncounters[party.sharedState.pvpEncounterId];

                if (encounter) {
                    const disconnectedPlayerState = encounter.playerStates.find(p => p.name === name);

                    if (disconnectedPlayerState && !disconnectedPlayerState.isDead) {
                        // Kill the disconnected player and drop their items
                        disconnectedPlayerState.isDead = true;
                        disconnectedPlayerState.health = 0;

                        const disconnectedPlayer = players[name];
                        if (disconnectedPlayer) {
                            handlePvpPlayerDeath(io, disconnectedPlayer, encounter);
                        }

                        encounter.log.push({ message: `${name} has disconnected and forfeits the battle!`, type: 'damage' });

                        // Check if the disconnected player's entire team is now dead
                        const team = disconnectedPlayerState.team;
                        const teammates = encounter.playerStates.filter(p => p.team === team);
                        const allTeamDead = teammates.every(p => p.isDead);

                        if (allTeamDead) {
                            // End the encounter - the other team wins
                            const winningTeam = team === 'A' ? 'B' : 'A';
                            const winningPartyId = winningTeam === 'A' ? encounter.partyAId : encounter.partyBId;
                            const losingPartyId = winningTeam === 'A' ? encounter.partyBId : encounter.partyAId;
                            const winningParty = parties[winningPartyId];
                            const losingParty = parties[losingPartyId];

                            encounter.log.push({ message: `All opponents have been defeated! You are victorious!`, type: 'success' });

                            if (encounter.turnTimerId) {
                                clearTimeout(encounter.turnTimerId);
                            }

                            // Clean up the losing party
                            if (losingParty) {
                                losingParty.members.forEach(memberName => {
                                    const memberPlayer = players[memberName];
                                    if (memberPlayer && memberPlayer.id) {
                                        io.to(memberPlayer.id).emit('party:adventureEnded');
                                    }
                                });

                                if (losingParty.isSoloParty) {
                                    if (players[losingParty.leaderId]?.character) {
                                        players[losingParty.leaderId].character.partyId = null;
                                    }
                                    delete parties[losingParty.id];
                                } else {
                                    losingParty.sharedState = null;
                                    broadcastPartyUpdate(io, losingParty.id);
                                }
                            }

                            // Clean up winning party's PVP state
                            if (winningParty && winningParty.sharedState) {
                                winningParty.sharedState.pvpEncounterId = null;
                                winningParty.sharedState.zoneCards = [];
                                winningParty.sharedState.groundLoot = encounter.groundLoot;
                                winningParty.sharedState.log = encounter.log;
                                winningParty.sharedState.partyMemberStates.forEach(p => {
                                    if (!p.isDead) {
                                        p.actionPoints = 3;
                                        p.turnEnded = false;
                                    }
                                });
                                broadcastAdventureUpdate(io, winningParty);
                            }

                            delete pvpEncounters[encounter.id];
                        } else {
                            // Just broadcast the update - the encounter continues
                            broadcastAdventureUpdate(io, party);
                        }
                    }
                }
            }
            // --- END PVP DISCONNECT HANDLING ---

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