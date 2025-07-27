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

// --- ITEM & INVENTORY MANAGEMENT ---

export function useItemFromInventory(index) {
    const item = gameState.inventory[index];
    if(!item) return;

    if (item.type === 'arrows') {
        if (gameState.equipment.accessory && gameState.equipment.accessory.grantsSlot === 'ammo') {
            equipItem(index, 'ammo');
        } else {
            UI.showInfoModal("You need a Quiver equipped to use arrows.");
        }
        return;
    }

    if (item.type === 'consumable') {
        const inCombat = gameState.currentZone !== null || gameState.inDuel;
        
        if ((gameState.partyId || gameState.inDuel) && inCombat) {
            const emitter = gameState.inDuel ? Network.emitDuelAction : Network.emitPartyAction;

            emitter({
                type: 'useConsumable',
                payload: {
                    inventoryIndex: index
                }
            });
            UI.hideModal();
            return;
        }

        // --- SOLO PLAY LOGIC ---
        if (inCombat && item.cost > 0) {
             if (gameState.actionPoints < item.cost) {
                UI.showInfoModal("Not enough action points!");
                return;
            }
            gameState.actionPoints -= item.cost;
        }
        
        if (item.heal) {
            gameState.health = Math.min(gameState.maxHealth, gameState.health + item.heal);
            UI.addToLog(`Used ${item.name}, healed for ${item.heal} HP.`, 'heal');
        }
        if (item.buff) {
            gameState.buffs.push({ ...item.buff });
            UI.addToLog(`You feel the effects of ${item.name}.`, 'heal');
        }
        if (item.name === "Powder Keg") {
            UI.addToLog("You light the Powder Keg...", "info");
            let damageDealt = false;
            gameState.zoneCards.forEach((enemy, index) => {
                if (enemy && enemy.type === 'enemy') {
                    const avoidRoll = Math.floor(Math.random() * 20) + 1;
                    if (avoidRoll >= 12) {
                        UI.addToLog(`${enemy.name} avoids the explosion! (${avoidRoll})`, 'reaction');
                    } else {
                        enemy.health -= 3;
                        UI.addToLog(`${enemy.name} is hit by the explosion for 3 fire damage! (${avoidRoll})`, 'damage');
                        damageDealt = true;
                        if (enemy.health <= 0) {
                            // This will require importing the combat module, a later step if desired
                        }
                    }
                }
            });
            if (!damageDealt) {
                UI.addToLog("The explosion hit nothing.", "info");
            }
            UI.renderAdventureScreen();
        }

        if (item.charges) {
            item.charges--;
            if (item.charges <= 0) {
                gameState.inventory[index] = null;
            }
        } else {
            item.quantity = (item.quantity || 1) - 1;
            if (item.quantity <= 0) {
                gameState.inventory[index] = null;
            }
        }

        UI.updateDisplay();
        UI.renderInventory();
        if (inCombat) {
            UI.renderPlayerActionBars();
        }
        UI.hideModal();
    } else if (item.type === 'weapon' || item.type === 'armor' || item.type === 'tool' || item.type === 'accessory' || item.type === 'shield') {
        const inCombat = gameState.zoneCards.some(c => c && c.type === 'enemy') || gameState.inDuel;
        
        if (gameState.partyId || gameState.inDuel) {
             const emitter = gameState.inDuel ? Network.emitDuelAction : Network.emitPartyAction;
             emitter({
                type: 'equipItem',
                payload: {
                    inventoryIndex: index
                }
            });
            UI.hideModal(); 
        } else {
            if (inCombat) {
                if (gameState.actionPoints < 1) {
                    UI.showInfoModal("Not enough action points to equip an item!");
                    return;
                }
                gameState.actionPoints--;
                UI.addToLog("You spend 1 AP to change your equipment.", "info");
                UI.updateDisplay();
                UI.renderPlayerActionBars();
            }

            if (Array.isArray(item.slot)) {
                let buttons = '';
                item.slot.forEach(slotOption => {
                    buttons += `<button class="btn btn-primary" data-equip-slot="${slotOption}" data-item-index="${index}">${slotOption === 'mainHand' ? 'Equip Main Hand' : 'Equip Off Hand'}</button>`;
                });
                const modalContent = `
                    <h2>Choose Slot</h2>
                    <p>Where would you like to equip the ${item.name}?</p>
                    <div class="action-buttons" id="equip-options-modal">${buttons}</div>
                `;
                UI.showModal(modalContent);
            } else {
                equipItem(index, item.slot);
                UI.hideModal();
            }
        }
    }
}

export function equipItem(itemIndex, chosenSlot) {
    const itemToEquip = gameState.inventory[itemIndex];
    if (!itemToEquip || !chosenSlot) return;

    let itemsToUnequip = [];
    if (itemToEquip.hands === 2) {
        if (gameState.equipment.mainHand) itemsToUnequip.push(gameState.equipment.mainHand);
        if (gameState.equipment.offHand && gameState.equipment.offHand !== gameState.equipment.mainHand) itemsToUnequip.push(gameState.equipment.offHand);
    } else {
        if (gameState.equipment.mainHand && gameState.equipment.mainHand.hands === 2) {
            itemsToUnequip.push(gameState.equipment.mainHand);
        } else if (gameState.equipment[chosenSlot]) {
            itemsToUnequip.push(gameState.equipment[chosenSlot]);
        }
    }

    const freeSlots = gameState.inventory.filter(i => !i).length;
    if (itemsToUnequip.length > freeSlots) {
        UI.showInfoModal("Not enough inventory space to unequip your current item!");
        return;
    }

    const { hands } = itemToEquip;

    if (hands === 2) {
        if (gameState.equipment.mainHand) addItemToInventory(gameState.equipment.mainHand);
        if (gameState.equipment.offHand && gameState.equipment.offHand !== gameState.equipment.mainHand) {
             addItemToInventory(gameState.equipment.offHand);
        }
        gameState.equipment.mainHand = null;
        gameState.equipment.offHand = null;
    }
    else if (chosenSlot === 'mainHand' || chosenSlot === 'offHand') {
        if (gameState.equipment.mainHand && gameState.equipment.mainHand.hands === 2) {
            addItemToInventory(gameState.equipment.mainHand);
            gameState.equipment.mainHand = null;
            gameState.equipment.offHand = null;
        }
    }

    if (gameState.equipment[chosenSlot]) {
        addItemToInventory(gameState.equipment[chosenSlot]);
    }

    if (hands === 2) {
        gameState.equipment.mainHand = itemToEquip;
        gameState.equipment.offHand = itemToEquip;
    } else {
        gameState.equipment[chosenSlot] = itemToEquip;
    }

    gameState.inventory[itemIndex] = null;
    
    UI.renderEquipment();
    UI.renderInventory();
    UI.updateDisplay();
    if(gameState.currentZone) {
        UI.renderPlayerActionBars();
    }
}

export function unequipItem(slot) {
    const item = gameState.equipment[slot];
    if (item) {
        if(addItemToInventory(item, item.quantity || 1)) {
            if (slot === 'accessory' && item.grantsSlot === 'ammo') {
                if (gameState.equipment.ammo) {
                    addItemToInventory(gameState.equipment.ammo, gameState.equipment.ammo.quantity);
                    gameState.equipment.ammo = null;
                    UI.addToLog("Your arrows have been returned to your inventory.", "info");
                }
            }

            if (item.hands === 2) {
                gameState.equipment.mainHand = null;
                gameState.equipment.offHand = null;
            } else {
                gameState.equipment[slot] = null;
            }
            UI.renderEquipment();
            UI.renderInventory();
            UI.updateDisplay();
             if(gameState.currentZone) {
                UI.renderPlayerActionBars();
            }
        }
    }
}

export function dropItem(index) {
    const item = gameState.inventory[index];
    if (item) {
        UI.addToLog(`You dropped ${item.name}.`, 'info');
        gameState.inventory[index] = null;
    }
    UI.showBackpack(); 
    UI.renderInventory(); 
    UI.updateDisplay();
}

export function unequipSpell(index) {
     if (gameState.currentZone !== null) return;
     const [spell] = gameState.equippedSpells.splice(index, 1);
     gameState.spellbook.push(spell);
     UI.renderSpells();
}

export function equipSpell(index) {
    if (gameState.currentZone !== null || gameState.equippedSpells.length >= 5) return;
    const [spell] = gameState.spellbook.splice(index, 1);
    gameState.equippedSpells.push(spell);
    UI.renderSpells();
}

export function depositItem(index) {
    const item = gameState.inventory[index];
    if (!item) return;
    gameState.inventory[index] = null;
    
    const baseItem = gameData.allItems.find(i => i.name === item.name);
    if (baseItem && baseItem.stackable) {
        let existingBankStack = gameState.bank.find(bItem => bItem && bItem.name === item.name);
        if (existingBankStack) {
            existingBankStack.quantity += item.quantity;
        } else {
            gameState.bank.push(item);
        }
    } else {
        gameState.bank.push(item);
    }

    UI.renderBankInterface();
    UI.renderInventory();
}

export function withdrawItem(index) {
    const item = gameState.bank[index];
    if (!item) return;

    if (addItemToInventory(item, item.quantity)) {
        gameState.bank.splice(index, 1);
        UI.renderBankInterface();
        UI.renderInventory();
    }
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
    // FIX: This logic is updated to check for an active adventure zone (`currentZone`),
    // not just whether the player is in a party. This correctly handles returning
    // from a duel while in a party.
    if (gameState.currentZone && gameState.partyId) {
        if (gameState.isPartyLeader) {
            // This handles returning from a party adventure.
            Network.emitPartyAction({ type: 'returnHome' });
        } else {
            UI.showInfoModal("Only the party leader can end the adventure.");
        }
    } else {
        // This block now correctly executes for players returning from a duel (winner or loser),
        // and for solo players returning from their temporary party adventure.
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