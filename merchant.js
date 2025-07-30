'use strict';

import { gameData } from './game-data.js';
import { gameState } from './state.js';
import * as UI from './ui.js';
import * as Network from './network.js';

// --- VENDOR ACTIONS (EMIT TO SERVER) ---

export function buyItem(identifier, isPermanent) {
    Network.emitPlayerAction('buyItem', { identifier, isPermanent });
}

export function sellItem(itemIndex) {
    Network.emitPlayerAction('sellItem', { itemIndex });
}

export function buySpell(spellName) {
    Network.emitPlayerAction('buySpell', { spellName });
}

export function craftItem(recipeIndex) {
    Network.emitPlayerAction('craftItem', { recipeIndex });
}

// NOTE: The following functions have been REMOVED as they are now handled by the server:
// - generateMerchantStock()
// - checkAndRotateMerchantStock()