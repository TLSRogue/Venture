'use strict';

import { gameData } from './game-data.js';
import { gameState } from './state.js';
import * as UI from './ui.js';
import * as Player from './player.js';

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

// --- VENDOR ACTIONS ---

export function buyItem(identifier, isPermanent) {
    let stockItem = isPermanent ? null : gameState.merchantStock[identifier];
    const itemData = isPermanent ? gameData.allItems.find(i => i.name === identifier) : stockItem;
    
    if (!itemData) return;

    if (gameState.gold < itemData.price) {
        UI.showInfoModal("Not enough gold!");
    } else {
        const newItem = { ...itemData };
        if (Player.addItemToInventory(newItem)) {
            gameState.gold -= itemData.price;
            if (!isPermanent) {
                stockItem.quantity--;
            }
            UI.updateDisplay();
            UI.renderInventory();
            UI.renderMerchant();
            UI.renderSellableInventory();
        }
    }
}

export function sellItem(itemIndex) {
    const item = gameState.inventory[itemIndex];
    if (!item) return;
    const getSellPrice = (item) => {
        if (!item.price) return 1; 
        return Math.floor(item.price / 2) || 1;
    }
    const sellPrice = getSellPrice(item);
    gameState.gold += sellPrice;
    
    item.quantity = (item.quantity || 1) - 1;
    if (item.quantity <= 0) {
        gameState.inventory[itemIndex] = null;
    }

    UI.updateDisplay();
    UI.renderInventory();
    UI.renderSellableInventory();
    UI.renderMerchant();
}

export function buySpell(spellName) {
    const spell = gameData.allSpells.find(s => s.name === spellName && s.price > 0);
    if (!spell) return;

    if (gameState.gold >= spell.price) {
        gameState.gold -= spell.price;
        gameState.spellbook.push({...spell});
        UI.showInfoModal(`You learned ${spell.name}!`);
        UI.updateDisplay();
        UI.renderTrainer();
        UI.renderSpells();
    }
}

export function craftItem(recipeIndex) {
    const recipe = gameData.craftingRecipes[recipeIndex];
    
    const baseItem = gameData.allItems.find(i => i.name === recipe.result.name);
    if (!baseItem.stackable && gameState.inventory.filter(Boolean).length >= 24) {
         UI.showInfoModal("Inventory is full! Clear space to craft.");
         return;
    }
    if (baseItem.stackable && !gameState.inventory.some(i => (i && i.name === baseItem.name && i.quantity < baseItem.stackable) || !i)) {
         UI.showInfoModal("Inventory is full! No room for a new stack.");
         return;
    }

    if (Player.hasMaterials(recipe.materials)) {
        // --- THIS IS THE FIX ---
        // Consume materials from inventory and bank
        for (const material in recipe.materials) {
            let requiredCount = recipe.materials[material];
            
            // First, consume from inventory
            for (let i = 0; i < gameState.inventory.length && requiredCount > 0; i++) {
                const item = gameState.inventory[i];
                if (item && item.name === material) {
                    const toConsume = Math.min(requiredCount, item.quantity || 1);
                    item.quantity -= toConsume;
                    requiredCount -= toConsume;
                    if (item.quantity <= 0) {
                        gameState.inventory[i] = null;
                    }
                }
            }

            // Then, consume from bank if still needed
            if (requiredCount > 0) {
                 for (let i = gameState.bank.length - 1; i >= 0 && requiredCount > 0; i--) {
                    const item = gameState.bank[i];
                    if (item && item.name === material) {
                        const toConsume = Math.min(requiredCount, item.quantity || 1);
                        item.quantity -= toConsume;
                        requiredCount -= toConsume;
                        if (item.quantity <= 0) {
                            gameState.bank.splice(i, 1);
                        }
                    }
                }
            }
        }
        // -----------------------

        Player.addItemToInventory(baseItem, recipe.result.quantity || 1);
        UI.showInfoModal(`You crafted ${recipe.result.quantity || 1}x ${recipe.result.name}!`);
        UI.renderCrafting();
        UI.renderInventory();
        UI.renderBankInterface();
    } else {
        UI.showInfoModal("You don't have the required materials!");
    }
}