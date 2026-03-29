// shared.js
/**
 * Shared utilities and constants used by both client and server.
 * This module helps eliminate code duplication across the codebase.
 */

import { INVENTORY_SIZE, DEFAULT_ACTION_POINTS, STARTING_HEALTH, STARTING_GOLD } from './constants.js';

// --- SHARED CONSTANTS ---

/**
 * Default bonus stats object - single source of truth for stat initialization.
 * Used by both client getBonusStats() and server getBonusStatsForPlayer().
 */
export const DEFAULT_BONUS_STATS = {
    strength: 0,
    wisdom: 0,
    agility: 0,
    defense: 0,
    luck: 0,
    maxHealth: 0,
    mining: 0,
    fishing: 0,
    woodcutting: 0,
    harvesting: 0,
    physicalResistance: 0,
    magicalResistance: 0,
    rollBonus: 0,
    firePower: 0,
    arcanePower: 0,
    naturePower: 0,
    physicalPower: 0,
    frostPower: 0,
    holyPower: 0,
    fireResistance: 0,
    frostResistance: 0,
    natureResistance: 0,
    arcaneResistance: 0,
    holyResistance: 0
};

/**
 * Spell types that can target friendly players (allies or self).
 * Single source of truth — used by client-side interactions.js targeting logic.
 */
export const FRIENDLY_SPELL_TYPES = new Set([
    'heal', 'buff', 'versatile', 'revive', 'cleanse', 'cauterize', 'expendHeat'
]);

/**
 * Default character stats template — single source of truth for new character creation.
 * Used by both server (createInitialCharacter) and client (getInitialGameState).
 * NOTE: equippedSpells and equipment require gameData lookups and must be set by the caller.
 */
export const DEFAULT_CHARACTER_STATS = {
    title: "The Novice",
    unlockedTitles: ["The Novice"],
    health: STARTING_HEALTH,
    maxHealth: STARTING_HEALTH,
    shield: 0,
    wisdom: 0,
    strength: 0,
    agility: 0,
    defense: 0,
    luck: 0,
    physicalResistance: 0,
    magicalResistance: 0,
    fireResistance: 0,
    frostResistance: 0,
    natureResistance: 0,
    arcaneResistance: 0,
    holyResistance: 0,
    firePower: 0,
    frostPower: 0,
    naturePower: 0,
    arcanePower: 0,
    holyPower: 0,
    physicalPower: 0,
    mining: 0,
    fishing: 0,
    woodcutting: 0,
    harvesting: 0,
    gold: STARTING_GOLD,
    questPoints: 0,
    totalQuestPointsEarned: 0,
    spellsLearnedFromTraining: 0,
    trainingRefreshCount: 0,
    trainingOfferings: [],
    actionPoints: DEFAULT_ACTION_POINTS,
    focus: 0,
    inventory: Array(INVENTORY_SIZE).fill(null),
    bank: [],
    buffs: [],
    debuffs: [],
    spellbook: [],
    knownRecipes: [],
    equipment: {
        mainHand: null,
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

// --- ARRAY UTILITIES ---

/**
 * Fisher-Yates shuffle algorithm - shuffles array in place.
 * @param {Array} arr - The array to shuffle
 * @returns {Array} The same array, shuffled
 */
export function shuffleArray(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
}

// --- DICE ROLL HELPERS ---

/**
 * Roll a D20 (1-20).
 * @returns {number} A random integer from 1 to 20
 */
export function rollD20() {
    return Math.floor(Math.random() * 20) + 1;
}

/**
 * Generate a random integer between min and max (inclusive).
 * @param {number} min - Minimum value
 * @param {number} max - Maximum value
 * @returns {number} A random integer in [min, max]
 */
export function randomInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

// --- LOOKUP UTILITIES ---

/**
 * Creates a Map for O(1) item lookups by name.
 * @param {Array} items - Array of item objects with 'name' property
 * @returns {Map<string, object>} Map of item name to item object
 */
export function createItemLookupMap(items) {
    return new Map(items.map(item => [item.name, item]));
}
