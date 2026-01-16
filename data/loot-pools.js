// data/loot-pools.js
// Utility functions for category-based loot drops

import { allItems } from './items.js';

// Equipment types that count as "Equipment" category
const EQUIPMENT_TYPES = ['armor', 'shield', 'accessory'];

/**
 * Get items matching a loot category like "T1 Material" or "T2 Weapon"
 * Parses category strings in format: "T{tier} {type}"
 * Supported types: Material, Weapon, Equipment, Consumable, Tool, Armor
 * 
 * @param {string} category - Category string like "T1 Material", "T2 Weapon", etc.
 * @returns {Array} Array of matching item objects
 */
export function getItemsByCategory(category) {
    // Parse category string: "T1 Material", "T2 Weapon", etc.
    const match = category.match(/^T(\d+)\s+(.+)$/i);
    if (!match) {
        console.warn(`[loot-pools] Invalid category format: "${category}". Expected format: "T1 Material"`);
        return [];
    }

    const tier = parseInt(match[1], 10);
    const typeStr = match[2].toLowerCase().trim();

    return allItems.filter(item => {
        // Must match tier
        if (item.tier !== tier) return false;

        // Match type
        switch (typeStr) {
            case 'material':
                return item.type === 'material';
            case 'weapon':
                return item.type === 'weapon';
            case 'equipment':
                return EQUIPMENT_TYPES.includes(item.type);
            case 'consumable':
                return item.type === 'consumable';
            case 'tool':
                return item.type === 'tool';
            case 'armor':
                return item.type === 'armor';
            case 'shield':
                return item.type === 'shield';
            case 'accessory':
                return item.type === 'accessory';
            case 'gem':
                return item.type === 'gem';
            default:
                console.warn(`[loot-pools] Unknown type in category: "${typeStr}"`);
                return false;
        }
    });
}

/**
 * Pick a random item from a single category
 * @param {string} category - Category like "T1 Material"
 * @returns {Object|null} Random item from category or null if empty
 */
export function getRandomFromCategory(category) {
    const items = getItemsByCategory(category);
    if (items.length === 0) {
        console.warn(`[loot-pools] No items found for category: "${category}"`);
        return null;
    }
    return items[Math.floor(Math.random() * items.length)];
}

/**
 * Pick random item from multiple categories (e.g., "T1 Weapon or T1 Equipment")
 * Combines all items from specified categories into one pool, then picks randomly.
 * 
 * @param {string[]} categories - Array of category strings
 * @returns {Object|null} Random item from combined pool
 */
export function getRandomFromCategories(categories) {
    const allCategoryItems = categories.flatMap(cat => getItemsByCategory(cat));
    if (allCategoryItems.length === 0) {
        console.warn(`[loot-pools] No items found for categories: ${categories.join(', ')}`);
        return null;
    }
    return allCategoryItems[Math.floor(Math.random() * allCategoryItems.length)];
}

/**
 * Debug utility: List all items in a category
 * @param {string} category - Category like "T1 Material"
 * @returns {string[]} Array of item names in the category
 */
export function listCategoryItems(category) {
    return getItemsByCategory(category).map(item => item.name);
}
