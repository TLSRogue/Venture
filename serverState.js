// serverState.js

/**
 * This file holds the "in-memory database" for the server.
 * It now includes logic to load the state from a file on startup.
 */

import fs from 'fs';
import path from 'path';
import { gameData } from './game-data.js'; // Import gameData to get the new spell version

let players = {};
let dataWasMigrated = false; // Flag to check if we need to save the file

// Load players from a file on startup
try {
    const data = fs.readFileSync('players.json', 'utf8');
    const savedPlayers = JSON.parse(data);
    
    // Get the correct, new version of the spell
    const newWarriorsMight = gameData.allSpells.find(s => s.name === "Warrior's Might");

    for (const characterName in savedPlayers) {
        if (savedPlayers.hasOwnProperty(characterName)) {
            const character = savedPlayers[characterName].character;
            
            // --- START: One-Time Data Migration for Warrior's Might ---
            if (newWarriorsMight) {
                // Check equipped spells and replace if it's the old version
                const equippedIndex = character.equippedSpells.findIndex(s => s && s.name === "Warrior's Might" && s.bonusThreat === undefined);
                if (equippedIndex !== -1) {
                    character.equippedSpells[equippedIndex] = { ...newWarriorsMight };
                    console.log(`Updated Warrior's Might for ${characterName} in equipped spells.`);
                    dataWasMigrated = true;
                }

                // Check spellbook and replace if it's the old version
                const spellbookIndex = character.spellbook.findIndex(s => s && s.name === "Warrior's Might" && s.bonusThreat === undefined);
                if (spellbookIndex !== -1) {
                    character.spellbook[spellbookIndex] = { ...newWarriorsMight };
                    console.log(`Updated Warrior's Might for ${characterName} in spellbook.`);
                    dataWasMigrated = true;
                }
            }
            // --- END: One-Time Data Migration ---

            players[characterName] = {
                id: null, // Sockets are always null on startup
                character: character
            };
        }
    }
    
    if (dataWasMigrated) {
        fs.writeFileSync('players.json', JSON.stringify(players, null, 2));
        console.log('Successfully saved migrated player data to players.json.');
    }

    console.log('Player data loaded successfully from players.json');
} catch (err) {
    console.log('No existing players.json file found. Starting with a clean state.');
    players = {};
}

export { players };
export let parties = {}; // Keyed by partyId
export let duels = {};   // Keyed by duelId
export let pvpZoneQueues = {}; // Keyed by zoneName, Value: Array of { partyId, timerId }