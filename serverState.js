// serverState.js

/**
 * This file holds the "in-memory database" for the server.
 * It manages loading data on startup and saving data to disk.
 */

import fs from 'fs';
import path from 'path';
import { gameData } from './data/index.js';

let players = {};
let dataWasMigrated = false;

// --- LOAD DATA ON STARTUP ---
try {
    // Check if file exists before trying to read
    if (fs.existsSync('players.json')) {
        const data = fs.readFileSync('players.json', 'utf8');
        const savedPlayers = JSON.parse(data);
        
        const newWarriorsMight = gameData.allSpells.find(s => s.name === "Warrior's Might");

        for (const characterName in savedPlayers) {
            if (savedPlayers.hasOwnProperty(characterName)) {
                const character = savedPlayers[characterName].character;
                
                // --- MIGRATIONS & DATA FIXES ---
                if (character.hasOwnProperty('playerDebuffs')) {
                    character.debuffs = character.playerDebuffs;
                    delete character.playerDebuffs;
                    console.log(`Migrated 'playerDebuffs' to 'debuffs' for ${characterName}.`);
                    dataWasMigrated = true;
                }

                if (!character.hasOwnProperty('buffs') || !Array.isArray(character.buffs)) {
                    character.buffs = [];
                    dataWasMigrated = true;
                }
                
                if (!character.hasOwnProperty('debuffs') || !Array.isArray(character.debuffs)) {
                    character.debuffs = [];
                    dataWasMigrated = true;
                }

                if (!character.hasOwnProperty('unlockedTitles')) {
                    character.unlockedTitles = ["The Novice"];
                    dataWasMigrated = true;
                }

                if (!character.hasOwnProperty('focus')) {
                    character.focus = 0;
                    dataWasMigrated = true;
                }

                if (newWarriorsMight) {
                   const oldSpellIndex = character.equippedSpells.findIndex(s => s.name === "Warrior's Might" && s.type !== "utility");
                   if (oldSpellIndex !== -1) {
                       character.equippedSpells[oldSpellIndex] = {...newWarriorsMight};
                       console.log(`Updated Warrior's Might for ${characterName}`);
                       dataWasMigrated = true;
                   }
                }
                // -----------------------------

                // Reconstruct the full player object structure
                players[characterName] = {
                    id: null, // Socket ID is transient, reset to null
                    character: character
                };
            }
        }
        console.log(`Loaded data for ${Object.keys(players).length} players.`);
    } else {
        console.log("No players.json found. Starting with empty database.");
        // Create an empty file to prevent errors later
        fs.writeFileSync('players.json', JSON.stringify({}, null, 2));
    }

} catch (err) {
    console.error("Error loading players.json:", err);
    // If the file is corrupt, we start empty but don't overwrite the corrupt file immediately
    // to allow for manual recovery if needed.
    players = {}; 
}

// If we performed migrations on startup, save immediately to persist fixes.
if (dataWasMigrated) {
    try {
        fs.writeFileSync('players.json', JSON.stringify(players, null, 2));
        console.log("Migration changes saved to players.json.");
    } catch (err) {
        console.error("Failed to save migration changes:", err);
    }
}

// --- STATE CONTAINERS ---
export { players };
export const parties = {};
export const duels = {};
export const pvpEncounters = {};
export const pvpZoneQueues = {};

// --- PERSISTENCE HELPER ---
let isSaving = false;

export async function saveAllPlayers() {
    if (isSaving) return; // Prevent concurrent writes
    isSaving = true;

    try {
        // We use the promise version of writeFile to avoid blocking the game loop
        await fs.promises.writeFile('players.json', JSON.stringify(players, null, 2));
        // Uncomment the line below if you want to see every auto-save in the console
        // console.log(`[System] Game state auto-saved.`);
    } catch (err) {
        console.error('[System] Failed to save player data:', err);
    } finally {
        isSaving = false;
    }
}