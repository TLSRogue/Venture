// serverState.js

/**
 * This file holds the "in-memory database" for the server.
 * It now includes logic to load the state from a file on startup.
 */

import fs from 'fs';
import path from 'path';
import { gameData } from './data/index.js';

let players = {};
let dataWasMigrated = false;

try {
    const data = fs.readFileSync('players.json', 'utf8');
    const savedPlayers = JSON.parse(data);
    
    const newWarriorsMight = gameData.allSpells.find(s => s.name === "Warrior's Might");

    for (const characterName in savedPlayers) {
        if (savedPlayers.hasOwnProperty(characterName)) {
            const character = savedPlayers[characterName].character;
            
            if (character.hasOwnProperty('playerDebuffs')) {
                character.debuffs = character.playerDebuffs;
                delete character.playerDebuffs;
                console.log(`Migrated 'playerDebuffs' to 'debuffs' for ${characterName}.`);
                dataWasMigrated = true;
            }

            // --- BUG FIX START: Ensure buffs/debuffs arrays exist on all loaded characters ---
            if (!character.hasOwnProperty('buffs') || !Array.isArray(character.buffs)) {
                character.buffs = [];
                console.log(`Initialized missing 'buffs' array for ${characterName}.`);
                dataWasMigrated = true;
            }
            if (!character.hasOwnProperty('debuffs') || !Array.isArray(character.debuffs)) {
                character.debuffs = [];
                console.log(`Initialized missing 'debuffs' array for ${characterName}.`);
                dataWasMigrated = true;
            }
            // --- BUG FIX END ---

            if (newWarriorsMight) {
                const equippedIndex = character.equippedSpells.findIndex(s => s && s.name === "Warrior's Might" && s.bonusThreat === undefined);
                if (equippedIndex !== -1) {
                    character.equippedSpells[equippedIndex] = { ...newWarriorsMight };
                    console.log(`Updated Warrior's Might for ${characterName} in equipped spells.`);
                    dataWasMigrated = true;
                }
                const spellbookIndex = character.spellbook.findIndex(s => s && s.name === "Warrior's Might" && s.bonusThreat === undefined);
                if (spellbookIndex !== -1) {
                    character.spellbook[spellbookIndex] = { ...newWarriorsMight };
                    console.log(`Updated Warrior's Might for ${characterName} in spellbook.`);
                    dataWasMigrated = true;
                }
            }

            players[characterName] = {
                id: null,
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
        merchantStock: [],
        merchantLastStocked: null,
        cardDefeatTimes: {},
        partyId: null,
        duelId: null,
    };
}

export { players, createInitialCharacter };
export let parties = {};
export let duels = {};
export let pvpZoneQueues = {};