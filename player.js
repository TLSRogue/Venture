'use strict';

import { gameState } from './state.js';
import * as UI from './ui.js';
import * as Interactions from './interactions.js';
import * as Network from './network.js';

// --- CORE PLAYER STATS ---

// NOTE: This function is now DEPRECATED. The client UI should ideally display stats
// as they are received from the server, not calculate them itself. This is left
// in for now to prevent breaking the UI. A future cleanup step would be to have the
// server send calculated stats and remove this function.
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

// --- ITEM & INVENTORY MANAGEMENT (EMITS TO SERVER) ---

export function handleItemAction(action, index) {
    if (gameState.currentZone || gameState.inDuel) {
        // Actions during an adventure must be sent to the party/adventure handler
        Network.emitPartyAction({
            type: action,
            payload: { inventoryIndex: index }
        });
    } else {
        // Actions outside an adventure are sent to the general player handler
        Network.emitPlayerAction(action, { index });
    }
}

export function takeGroundLoot(index) {
    Network.emitPartyAction({
        type: 'takeGroundLoot',
        payload: { groundLootIndex: index }
    });
}

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

// --- PLAYER STATE ---

export function returnToHome() {
    // Ask the server to end the adventure. The server will handle cleanup
    // and notify the client when to reset the UI via 'party:adventureEnded'.
    if (gameState.currentZone && gameState.partyId) {
        if (gameState.isPartyLeader) {
            Network.emitPartyAction({ type: 'returnHome' });
        } else {
            UI.showInfoModal("Only the party leader can end the adventure.");
        }
    }
}

export function resetToHomeState() {
    // This function is now called by a server event ('party:adventureEnded')
    // to clean up the client's UI and return to the home screen.
    UI.setTabsDisabled(false);
    gameState.currentZone = null;
    gameState.zoneCards = [];
    gameState.groundLoot = [];
    gameState.health = gameState.maxHealth;
    gameState.spellCooldowns = {};
    gameState.weaponCooldowns = {};
    gameState.buffs = [];
    gameState.playerDebuffs = [];
    gameState.turnState.isPlayerTurn = true;
    gameState.inDuel = false;
    gameState.duelState = null;

    if (gameState.partyId && gameState.partyId.startsWith('SOLO-')) {
        Network.emitLeaveParty();
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
    // Resets transient combat state at the start of an adventure.
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

// NOTE: The following functions have been REMOVED as they are now handled by the server:
// - addItemToInventory()
// - hasMaterials()
// - handleDefeat()
// - handleDefeatCleanup()