'use strict';

import { gameData } from './game-data.js';
import { gameState } from './state.js';
import * as UI from './ui.js';
import * as Interactions from './interactions.js';
import * as Network from './network.js';

// --- CORE PLAYER STATS ---

export function getBonusStats() {
    const bonuses = { strength: 0, wisdom: 0, agility: 0, defense: 0, luck: 0, maxHealth: 0, mining: 0, fishing: 0, woodcutting: 0, harvesting: 0, physicalResistance: 0, rollBonus: 0 };
    for (const slot in gameState.equipment) {
        const item = gameState.equipment[slot];
        if (item && item.hands === 2 && slot === 'offHand') continue;
        if (item && item.bonus) {
            for (const stat in item.bonus) {
                bonuses[stat] = (bonuses[stat] || 0) + item.bonus[stat];
            }
        }
    }
    gameState.inventory.forEach(item => {
        if (item && item.skillBonus) {
            for (const skill in item.skillBonus) {
                bonuses[skill] = (bonuses[skill] || 0) + item.skillBonus[skill];
            }
        }
    });
    gameState.buffs.forEach(buff => {
        if (buff.bonus) {
            for (const stat in buff.bonus) {
                bonuses[stat] = (bonuses[stat] || 0) + buff.bonus[stat];
            }
        }
    });
    return bonuses;
}

// --- ITEM & INVENTORY MANAGEMENT (NOW EMITS TO SERVER) ---

export function handleItemAction(action, index) {
    // Note: 'use' is for consumables only now. Equipping is handled by the server.
    Network.emitPlayerAction(action, { index });
}

// The equip/unequip logic is now server-side, but these functions
// can be kept for client-side interactions that are not yet networked.
// For a fully server-authoritative model, these would also become emitters.
export function equipItem(itemIndex, chosenSlot) {
    Network.emitPlayerAction('equipItem', { itemIndex, chosenSlot });
}

export function unequipItem(slot) {
    Network.emitPlayerAction('unequipItem', { slot });
}

export function unequipSpell(index) {
     if (gameState.currentZone !== null) return;
     Network.emitPlayerAction('unequipSpell', { index });
}

export function equipSpell(index) {
    if (gameState.currentZone !== null || gameState.equippedSpells.length >= 5) return;
    Network.emitPlayerAction('equipSpell', { index });
}

export function depositItem(index) {
    Network.emitPlayerAction('depositItem', { index });
}

export function withdrawItem(index) {
    Network.emitPlayerAction('withdrawItem', { index });
}


export function addItemToInventory(itemData, quantity = 1) {
    const baseItem = gameData.allItems.find(i => i.name === itemData.name);
    if (!baseItem) {
        console.error(`Item ${itemData.name} not found in allItems`);
        return false;
    }
    let remainingQuantity = quantity;

    if (baseItem.stackable) {
        for (const invItem of gameState.inventory) {
            if (invItem && invItem.name === itemData.name && invItem.quantity < baseItem.stackable) {
                const canAdd = baseItem.stackable - invItem.quantity;
                const toAdd = Math.min(remainingQuantity, canAdd);
                invItem.quantity += toAdd;
                remainingQuantity -= toAdd;
                if (remainingQuantity <= 0) return true;
            }
        }
        while (remainingQuantity > 0) {
            const emptySlotIndex = gameState.inventory.findIndex(slot => !slot);
            if (emptySlotIndex === -1) {
                UI.addToLog(`Inventory full. Could not pick up ${remainingQuantity}x ${itemData.name}.`, 'damage');
                return false;
            }
            const newStackAmount = Math.min(remainingQuantity, baseItem.stackable);
            gameState.inventory[emptySlotIndex] = { ...baseItem, quantity: newStackAmount };
            remainingQuantity -= newStackAmount;
        }
    } else {
        for (let i = 0; i < quantity; i++) {
            const emptySlotIndex = gameState.inventory.findIndex(slot => !slot);
            if (emptySlotIndex === -1) {
                UI.addToLog(`Inventory full. Could not pick up ${itemData.name}.`, 'damage');
                return false;
            }
            gameState.inventory[emptySlotIndex] = { ...baseItem, quantity: 1 };
        }
    }
    return true;
}

export function hasMaterials(materials, checkBank = true) {
    for (const material in materials) {
        const requiredCount = materials[material];
        let currentCount = 0;
        gameState.inventory.forEach(item => {
            if (item && item.name === material) currentCount += (item.quantity || 1);
        });
        if (checkBank) {
            gameState.bank.forEach(item => {
                if (item && item.name === material) currentCount += (item.quantity || 1);
            });
        }
        if (currentCount < requiredCount) return false;
    }
    return true;
}

// --- PLAYER STATE ---

export function handleDefeat() {
    const combatLogHtml = document.getElementById('adventure-log').innerHTML;
    UI.showModal(`
        <h2>You Have Been Defeated</h2>
        <p>Your journey ends here... for now. You lose all items in your inventory.</p>
        <div class="log" style="text-align: left; margin-top: 20px; max-height: 200px;">${combatLogHtml}</div>
        <button class="btn btn-danger" id="defeat-continue-btn">Return Home</button>
    `);
    document.getElementById('defeat-continue-btn').onclick = handleDefeatCleanup;
}

function handleDefeatCleanup() {
    UI.addToLog("Your inventory has been lost!", "damage");
    gameState.inventory = Array(24).fill(null);
    resetToHomeState();
}

export function returnToHome() {
    if (gameState.currentZone && gameState.partyId) {
        if (gameState.isPartyLeader) {
            Network.emitPartyAction({ type: 'returnHome' });
        } else {
            UI.showInfoModal("Only the party leader can end the adventure.");
        }
    } else {
        resetToHomeState();
    }
}

export function resetToHomeState() {
    UI.setTabsDisabled(false);
    gameState.currentZone = null;
    gameState.zoneCards = [];
    gameState.health = gameState.maxHealth;
    gameState.spellCooldowns = {};
    gameState.weaponCooldowns = {};
    gameState.buffs = [];
    gameState.playerDebuffs = [];
    gameState.turnState.isPlayerTurn = true;
    gameState.inDuel = false;
    gameState.duelState = null;

    if (gameState.partyId && gameState.partyId.startsWith('SOLO-')) {
        gameState.partyId = null;
        gameState.isPartyLeader = false;
        gameState.partyMembers = [];
    }
    
    Interactions.clearSelection();
    document.getElementById('end-turn-btn').disabled = false;
    UI.hideModal();
    UI.showTab('home');
    UI.addToLog("Returned home safely. Health and cooldowns have been restored.");
    gameState.focus = 0;
    UI.renderSpells();
    UI.renderInventory();
    UI.updateDisplay();
}

export function resetPlayerCombatState() {
    gameState.actionPoints = 3;
    gameState.spellCooldowns = {};
    gameState.weaponCooldowns = {};
    gameState.itemCooldowns = {};
    
    const persistentBuffs = ['Well Fed (Agi)', 'Well Fed (Str)', 'Light Source'];
    const expiredBuffs = gameState.buffs.filter(b => !persistentBuffs.includes(b.type));
    if (expiredBuffs.length > 0) {
        UI.addToLog(`Combat buffs worn off: ${expiredBuffs.map(b => b.type).join(', ')}.`, 'info');
    }
    gameState.buffs = gameState.buffs.filter(b => persistentBuffs.includes(b.type));
    
    if (gameState.playerDebuffs.length > 0) {
        UI.addToLog("All debuffs have been cleared.", 'heal');
        gameState.playerDebuffs = [];
    }
    
    gameState.shield = 0;
    gameState.focus = 0;

    UI.addToLog("Cooldowns and Action Points have been reset.", "success");
}