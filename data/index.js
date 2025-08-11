// /data/index.js
import { allItems, genericTreasureLoot } from './items.js';
import { allSpells } from './spells.js';
import { cardPools, specialCards } from './cards.js';
import { craftingRecipes } from './recipes.js';

// Re-assemble the original gameData object
export const gameData = {
    allItems,
    allSpells,
    cardPools,
    specialCards,
    craftingRecipes,
    genericTreasureLoot
};