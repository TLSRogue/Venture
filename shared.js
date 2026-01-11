// shared.js
/**
 * Shared utilities and constants used by both client and server.
 * This module helps eliminate code duplication across the codebase.
 */

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
    rollBonus: 0,
    firePower: 0,
    arcanePower: 0,
    naturePower: 0,
    physicalPower: 0,
    frostPower: 0,
    holyPower: 0
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

// --- LOOKUP UTILITIES ---

/**
 * Creates a Map for O(1) item lookups by name.
 * @param {Array} items - Array of item objects with 'name' property
 * @returns {Map<string, object>} Map of item name to item object
 */
export function createItemLookupMap(items) {
    return new Map(items.map(item => [item.name, item]));
}
