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
            // --- BUG FIX: Ensure health is never null or NaN ---
            if (character.health === null || isNaN(character.health)) {
                character.health = character.maxHealth || 10;
                console.log(`Fixed null/NaN health for ${characterName}.`);
                dataWasMigrated = true;
            }
            // --- BUG FIX END ---

            // --- INVENTORY SIZE UPGRADE: Extend 24-slot inventories to 28 slots ---
            if (character.inventory && character.inventory.length < 28) {
                const originalLength = character.inventory.length;
                while (character.inventory.length < 28) {
                    character.inventory.push(null);
                }
                console.log(`Extended inventory from ${originalLength} to 28 slots for ${characterName}.`);
                dataWasMigrated = true;
            }
            // --- END INVENTORY SIZE UPGRADE ---

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

            // --- SPELL MIGRATION (V2) ---
            // Force update spells to current definitions to ensure any balance changes are applied to existing saves.
            const spellsToMigrate = [
                'Aim True', 'Split Shot', 'Evasive Shot', 'Slash',
                'Moonbeam', 'Rejuvenate', 'Spirit Call', 'Entangling Roots', 'Tree Form'
            ];
            spellsToMigrate.forEach(spellName => {
                const currentSpellDef = gameData.allSpells.find(s => s.name === spellName);
                if (!currentSpellDef) return;

                // Update ALL instances in equipped spells
                character.equippedSpells.forEach((s, idx) => {
                    if (s && s.name === spellName) {
                        // Force update to ensure synchronization
                        character.equippedSpells[idx] = { ...currentSpellDef };
                        console.log(`[Migration] Updated ${spellName} (Equipped) for ${characterName}`);
                        dataWasMigrated = true;
                    }
                });

                // Update ALL instances in spellbook
                character.spellbook.forEach((s, idx) => {
                    if (s && s.name === spellName) {
                        character.spellbook[idx] = { ...currentSpellDef };
                        console.log(`[Migration] Updated ${spellName} (Spellbook) for ${characterName}`);
                        dataWasMigrated = true;
                    }
                });
            });
            // --- END SPELL MIGRATION ---

            // --- T2 RECIPE BACKFILL MIGRATION ---
            // Debug: Log quests for this character
            const completedQuests = (character.quests || []).filter(q => q.status === 'completed').map(q => q.details?.id || q.id || 'unknown');
            if (completedQuests.length > 0) {
                console.log(`[Migration] ${characterName} has completed quests: ${completedQuests.join(', ')}`);
            }

            const steelQuest = character.quests.find(q => q.details?.id === 'STEEL_ARMOR_QUEST' && q.status === 'completed');
            if (steelQuest) {
                const newSteelRecipes = ['Steel Helm (T2)', 'Steel Boots (T2)'];
                newSteelRecipes.forEach(recipeName => {
                    if (!character.knownRecipes.includes(recipeName)) {
                        character.knownRecipes.push(recipeName);
                        console.log(`Backfilled recipe ${recipeName} for ${characterName}.`);
                        dataWasMigrated = true;
                    }
                });
            }

            const silkQuest = character.quests.find(q => q.details?.id === 'TAILOR_SILK_QUEST' && q.status === 'completed');
            if (silkQuest) {
                const newSilkRecipes = ['Silk Wizard Robes (T2)', 'Silk Wizard Hat (T2)', 'Silk Wizard Boots (T2)'];
                newSilkRecipes.forEach(recipeName => {
                    if (!character.knownRecipes.includes(recipeName)) {
                        character.knownRecipes.push(recipeName);
                        console.log(`Backfilled recipe ${recipeName} for ${characterName}.`);
                        dataWasMigrated = true;
                    }
                });
            }

            // --- GEM RECIPE BACKFILL MIGRATION ---
            const gemQuest = character.quests.find(q => q.details?.id === 'OLD_RECIPE_QUEST' && q.status === 'completed');
            if (gemQuest) {
                const newGemRecipes = ['Gem of Frost', 'Gem of Holy', 'Gem of Shadow'];
                newGemRecipes.forEach(recipeName => {
                    if (!character.knownRecipes.includes(recipeName)) {
                        character.knownRecipes.push(recipeName);
                        console.log(`Backfilled recipe ${recipeName} for ${characterName}.`);
                        dataWasMigrated = true;
                    }
                });
            }
            // --- END GEM RECIPE BACKFILL MIGRATION ---
            // --- END T2 RECIPE BACKFILL MIGRATION ---

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
        gold: 300,
        questPoints: 0,
        actionPoints: 3,
        focus: 0,
        inventory: Array(28).fill(null),
        bank: [],
        buffs: [],
        debuffs: [],
        equippedSpells: [
            gameData.allSpells.find(s => s.name === 'Punch'),
            gameData.allSpells.find(s => s.name === 'Kick'),
            gameData.allSpells.find(s => s.name === 'Dodge')
        ].filter(Boolean).map(s => ({ ...s })),
        spellbook: [],
        knownRecipes: [],
        equipment: {
            mainHand: { ...gameData.allItems.find(i => i.name === "Wooden Training Sword") },
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
export let pvpEncounters = {};
export let globalChatHistory = [];
export let trades = {};