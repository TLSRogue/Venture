// serverState.js

/**
 * This file holds the "in-memory database" for the server.
 * It now includes logic to load the state from a file on startup.
 */

import fs from 'fs';
import path from 'path';
import { gameData } from './game-data.js'; // Import gameData to get the new spell version

let players = {};

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
                // Check equipped spells and replace if found
                const equippedIndex = character.equippedSpells.findIndex(s => s && s.name === "Warrior's Might");
                if (equippedIndex !== -1) {
                    character.equippedSpells[equippedIndex] = { ...newWarriorsMight };
                    console.log(`Updated Warrior's Might for ${characterName} in equipped spells.`);
                }

                // Check spellbook and replace if found
                const spellbookIndex = character.spellbook.findIndex(s => s && s.name === "Warrior's Might");
                if (spellbookIndex !== -1) {
                    character.spellbook[spellbookIndex] = { ...newWarriorsMight };
                    console.log(`Updated Warrior's Might for ${characterName} in spellbook.`);
                }
            }
            // --- END: One-Time Data Migration ---

            players[characterName] = {
                id: null, // Sockets are always null on startup
                character: character
            };
        }
    }
    console.log('Player data loaded successfully from players.json');
} catch (err) {
    console.log('No existing players.json file found. Starting with a clean state.');
    players = {};
}

export { players };
export let parties = {}; // Keyed by partyId
export let duels = {};   // Keyed by duelId