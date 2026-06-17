// serverState.js

/**
 * This file holds the "in-memory database" for the server.
 * It includes logic to load the state from a file on startup.
 */

import fs from 'fs';
import path from 'path';
import { gameData } from './data/index.js';
import { DEFAULT_CHARACTER_STATS } from './shared.js';
import { INVENTORY_SIZE } from './constants.js';
import { runMigrations } from './migrations.js';

let players = {};

try {
  const data = fs.readFileSync('players.json', 'utf8');
  const savedPlayers = JSON.parse(data);
  let dataWasMigrated = false;

  for (const characterName in savedPlayers) {
    if (savedPlayers.hasOwnProperty(characterName)) {
      const character = savedPlayers[characterName].character;

      // Run all migrations/refreshes via the centralized module
      const wasMigrated = runMigrations(character, characterName);
      if (wasMigrated) dataWasMigrated = true;

      players[characterName] = {
        id: null,
        character: character,
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
    ...DEFAULT_CHARACTER_STATS,
    characterName: characterName,
    characterIcon: characterIcon,
    // Deep-clone arrays/objects so new characters don't share references
    inventory: Array(INVENTORY_SIZE).fill(null),
    unlockedTitles: [...DEFAULT_CHARACTER_STATS.unlockedTitles],
    bank: [],
    buffs: [],
    debuffs: [],
    spellbook: [],
    knownRecipes: [],
    quests: [],
    merchantStock: [],
    spellCooldowns: {},
    weaponCooldowns: {},
    itemCooldowns: {},
    cardDefeatTimes: {},
    equippedSpells: [
      gameData.allSpells.find((s) => s.name === 'Punch'),
      gameData.allSpells.find((s) => s.name === 'Kick'),
      gameData.allSpells.find((s) => s.name === 'Dodge'),
    ]
      .filter(Boolean)
      .map((s) => ({ ...s })),
    equipment: {
      ...DEFAULT_CHARACTER_STATS.equipment,
      mainHand: { ...gameData.allItems.find((i) => i.name === 'Wooden Training Sword') },
    },
  };
}

function savePlayersDatabaseSync() {
  try {
    fs.writeFileSync('players.json', JSON.stringify(players, null, 2));
    console.log('Successfully saved players database synchronously.');
  } catch (err) {
    console.error('Failed to save players database synchronously:', err);
  }
}

// Process shutdown signal handlers to prevent progress loss
function handleShutdown() {
  console.log('Process terminating. Saving players database synchronously...');
  savePlayersDatabaseSync();
  process.exit(0);
}

process.once('SIGINT', handleShutdown);
process.once('SIGTERM', handleShutdown);
process.once('SIGUSR2', () => {
  console.log('Nodemon restart signal received. Saving players database synchronously...');
  savePlayersDatabaseSync();
  process.kill(process.pid, 'SIGUSR2');
});

export { players, createInitialCharacter, savePlayersDatabaseSync };
export let parties = {};
export let duels = {};
export let pvpZoneQueues = {};
export let pvpEncounters = {};
export let globalChatHistory = [];
export let trades = {};
