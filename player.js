'use strict';

import { gameState } from './state.js';
import * as Interactions from './interactions.js';
import * as Network from './network.js';
import * as UIMain from './ui/ui-main.js';
import * as UIPlayer from './ui/ui-player.js';

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
    
    (gameState.buffs || []).forEach(buff => {
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
        Network.emitPartyAction({
            type: action,
            payload: { inventoryIndex: index }
        });
    } else {
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
    if (gameState.currentZone && gameState.partyId) {
        if (gameState.isPartyLeader) {
            Network.emitPartyAction({ type: 'returnHome' });
        } else {
            UIMain.showInfoModal("Only the party leader can end the adventure.");
        }
    }
}

export function resetToHomeState() {
    UIMain.setTabsDisabled(false);
    gameState.currentZone = null;
    gameState.zoneCards = [];
    gameState.groundLoot = [];
    gameState.health = gameState.maxHealth;
    gameState.spellCooldowns = {};
    gameState.weaponCooldowns = {};
    gameState.buffs = [];
    gameState.debuffs = [];
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
    UIMain.hideModal();
    UIPlayer.showTab('home');
    UIMain.addToLog("Returned home safely. Health and cooldowns have been restored.");
    gameState.focus = 0;
    UIPlayer.renderSpells();
    UIPlayer.renderInventory();
    UIPlayer.updateDisplay();
}

export function resetPlayerCombatState() {
    gameState.actionPoints = 3;
    gameState.spellCooldowns = {};
    gameState.weaponCooldowns = {};
    gameState.itemCooldowns = {};
    
    const persistentBuffs = ['Well Fed (Agi)', 'Well Fed (Str)', 'Light Source'];
    
    const currentBuffs = gameState.buffs || [];
    const expiredBuffs = currentBuffs.filter(b => !persistentBuffs.includes(b.type));
    
    if (expiredBuffs.length > 0) {
        UIMain.addToLog(`Combat buffs worn off: ${expiredBuffs.map(b => b.type).join(', ')}.`, 'info');
    }
    gameState.buffs = currentBuffs.filter(b => persistentBuffs.includes(b.type));
    
    const currentDebuffs = gameState.debuffs || [];
    if (currentDebuffs.length > 0) {
        UIMain.addToLog("All debuffs have been cleared.", 'heal');
        gameState.debuffs = [];
    }
    
    gameState.shield = 0;
    gameState.focus = 0;

    UIMain.addToLog("Cooldowns and Action Points have been reset.", "success");
}