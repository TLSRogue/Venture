'use strict';

import { gameData } from './game-data.js';
import { gameState } from './state.js';
import * as UI from './ui.js';
import * as Network from './network.js';

// --- MERCHANT STOCK LOGIC ---

export function generateMerchantStock() {
    const uniqueItemNames = ["Rat Tail Cloak", "Mugger's Knife", "Bull Horn", "Magna Clavis"];
    const stockPool = gameData.allItems.filter(item => 
        item.price > 0 && 
        item.type !== 'tool' && 
        item.name !== 'Spices' &&
        !uniqueItemNames.includes(item.name)
    );
    
    for (let i = stockPool.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [stockPool[i], stockPool[j]] = [stockPool[j], stockPool[i]];
    }

    gameState.merchantStock = stockPool.slice(0, 5).map(item => ({
        ...item,
        quantity: Math.floor(Math.random() * 10) + 1
    }));
    gameState.merchantLastStocked = Date.now();
}

export function checkAndRotateMerchantStock() {
    const TEN_MINUTES = 10 * 60 * 1000;
    if (!gameState.merchantLastStocked || (Date.now() - gameState.merchantLastStocked > TEN_MINUTES)) {
        generateMerchantStock();
    }
}

// --- VENDOR ACTIONS (NOW EMIT TO SERVER) ---

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