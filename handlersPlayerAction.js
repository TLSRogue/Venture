// handlersPlayerAction.js

/**
 * Manages the master 'playerAction' socket event for all non-adventure actions,
 * such as buying, selling, crafting, and equipping items/spells.
 */

import { players, parties } from './serverState.js';
import { gameData } from './game-data.js';
import { addItemToInventoryServer, playerHasMaterials, consumeMaterials, checkAndRotateMerchantStock } from './utilsHelpers.js';

export const registerPlayerActionHandlers = (io, socket) => {
    socket.on('playerAction', (action) => {
        const name = socket.characterName;
        const player = players[name];
        
        // Prevent actions if the player is in an active adventure or duel
        if (!player || (player.character.partyId && parties[player.character.partyId]?.sharedState) || player.character.duelId) {
            return;
        }

        const character = player.character;
        const { type, payload } = action;

        let success = false; // Flag to check if an action successfully changed the state

        switch(type) {
            case 'viewMerchant':
                {
                    checkAndRotateMerchantStock(character);
                    success = true; // Set to true to ensure an update is sent to the client
                }
                break;
            case 'buyItem':
                {
                    checkAndRotateMerchantStock(character);

                    const { identifier, isPermanent } = payload;
                    const stockItem = isPermanent ? null : character.merchantStock[identifier];
                    const itemData = isPermanent ? gameData.allItems.find(i => i.name === identifier) : stockItem;
                    
                    if (itemData && character.gold >= itemData.price) {
                        const itemToGive = isPermanent ? { ...itemData } : (({ quantity, ...rest }) => rest)(itemData);

                        if(addItemToInventoryServer(character, itemToGive)) {
                            character.gold -= itemData.price;
                            if (!isPermanent && stockItem && stockItem.quantity > 0) {
                                stockItem.quantity--;
                            }
                            success = true;
                        }
                    }
                }
                break;
            case 'sellItem':
                {
                    const item = character.inventory[payload.itemIndex];
                    if(item) {
                        const sellPrice = Math.floor(item.price / 2) || 1;
                        character.gold += sellPrice;
                        item.quantity = (item.quantity || 1) - 1;
                        if (item.quantity <= 0) character.inventory[payload.itemIndex] = null;
                        success = true;
                    }
                }
                break;
            case 'craftItem':
                {
                    const { recipeIndex, quantity } = payload;
                    const recipe = gameData.craftingRecipes[recipeIndex];
                    if (recipe && quantity > 0) {
                        let craftedCount = 0;
                        for (let i = 0; i < quantity; i++) {
                            if (playerHasMaterials(character, recipe.materials)) {
                                consumeMaterials(character, recipe.materials);
                                const baseItem = gameData.allItems.find(i => i.name === recipe.result.name);
                                addItemToInventoryServer(character, baseItem, recipe.result.quantity || 1);
                                craftedCount++;
                            } else {
                                // Stop crafting if materials run out
                                break;
                            }
                        }
                        if (craftedCount > 0) {
                            success = true;
                        }
                    }
                }
                break;
            case 'buySpell':
                {
                    const spell = gameData.allSpells.find(s => s.name === payload.spellName && s.price > 0);
                    if (spell && character.gold >= spell.price) {
                        character.gold -= spell.price;
                        character.spellbook.push({...spell});
                        success = true;
                    }
                }
                break;
            case 'equipItem':
                {
                    const { itemIndex, chosenSlot } = payload;
                    const itemToEquip = character.inventory[itemIndex];
                    if (!itemToEquip || !itemToEquip.slot) break;
            
                    const canEquipInSlot = Array.isArray(itemToEquip.slot) ? itemToEquip.slot.includes(chosenSlot) : itemToEquip.slot === chosenSlot;
                    if (!canEquipInSlot) break;
            
                    const currentlyEquipped = character.equipment[chosenSlot];
            
                    if (itemToEquip.hands === 2) {
                        const mainHandItem = character.equipment.mainHand;
                        const offHandItem = character.equipment.offHand;
                        const freeSlots = character.inventory.filter(i => !i).length;
                        const slotsToFree = (mainHandItem ? 1 : 0) + (offHandItem && offHandItem !== mainHandItem ? 1 : 0);
                        
                        if (slotsToFree > freeSlots + 1) break;
            
                        character.inventory[itemIndex] = null;
                        if (mainHandItem) addItemToInventoryServer(character, mainHandItem);
                        if (offHandItem && offHandItem !== mainHandItem) addItemToInventoryServer(character, offHandItem);
                        
                        character.equipment.mainHand = itemToEquip;
                        character.equipment.offHand = itemToEquip;
            
                    } else {
                        if (character.equipment.mainHand && character.equipment.mainHand.hands === 2) {
                            const twoHandedWeapon = character.equipment.mainHand;
                            character.equipment.mainHand = null;
                            character.equipment.offHand = null;
                            addItemToInventoryServer(character, twoHandedWeapon);
                        }
                        
                        character.equipment[chosenSlot] = itemToEquip;
                        character.inventory[itemIndex] = currentlyEquipped;
                    }
                    success = true;
                }
                break;
            case 'unequipItem':
                {
                    const { slot } = payload;
                    const itemToUnequip = character.equipment[slot];
                    if (!itemToUnequip) break;
                    
                    if (addItemToInventoryServer(character, itemToUnequip)) {
                        character.equipment[slot] = null;
                        if (itemToUnequip.hands === 2) {
                            character.equipment.offHand = null;
                        }
                        success = true;
                    }
                }
                break;
            case 'equipSpell':
                {
                    const { index } = payload;
                    if (character.equippedSpells.length >= 5) break;
                    const spellToEquip = character.spellbook[index];
                    if (!spellToEquip) break;
            
                    character.equippedSpells.push(spellToEquip);
                    character.spellbook.splice(index, 1);
                    success = true;
                }
                break;
            case 'unequipSpell':
                {
                    const { index } = payload;
                    const spellToUnequip = character.equippedSpells[index];
                    if (!spellToUnequip) break;
            
                    character.spellbook.push(spellToUnequip);
                    character.equippedSpells.splice(index, 1);
                    success = true;
                }
                break;
            case 'useConsumable':
                {
                    const { index } = payload;
                    const item = character.inventory[index];
                    if (!item || item.type !== 'consumable') break;

                    if (item.heal) {
                        const bonuses = getBonusStatsForPlayer(character, null);
                        const maxHealth = 10 + bonuses.maxHealth;
                        character.health = Math.min(maxHealth, character.health + item.heal);
                    }
                    if (item.buff) {
                        character.buffs.push({ ...item.buff });
                    }
    
                    if (item.charges) {
                        item.charges--;
                        if (item.charges <= 0) character.inventory[index] = null;
                    } else {
                        item.quantity = (item.quantity || 1) - 1;
                        if (item.quantity <= 0) character.inventory[index] = null;
                    }
                    success = true;
                }
                break;
            case 'drop':
                {
                    const { index } = payload;
                    if (character.inventory[index]) {
                        character.inventory[index] = null;
                        success = true;
                    }
                }
                break;
            case 'depositItem':
                {
                    const { index } = payload;
                    const itemToDeposit = character.inventory[index];
                    if (itemToDeposit) {
                        const existingBankItem = character.bank.find(item => item.name === itemToDeposit.name);
                        if (existingBankItem) {
                            existingBankItem.quantity = (existingBankItem.quantity || 1) + 1;
                        } else {
                            // Create a copy to avoid reference issues and add quantity
                            const newItemForBank = { ...itemToDeposit, quantity: 1 };
                            character.bank.push(newItemForBank);
                        }
                        character.inventory[index] = null;
                        success = true;
                    }
                }
                break;
            case 'withdrawItem':
                {
                    const { index } = payload; // This is the index in the sorted bank array from the client
                    const itemToWithdraw = character.bank[index];
                    
                    if (itemToWithdraw) {
                        // Create a fresh instance of the item for the inventory, stripping quantity.
                         const { quantity, ...itemWithoutQuantity } = itemToWithdraw;
                         const baseItem = { ...itemWithoutQuantity };

                        if (addItemToInventoryServer(character, baseItem)) {
                            itemToWithdraw.quantity--;
                            if (itemToWithdraw.quantity <= 0) {
                                character.bank.splice(index, 1);
                            }
                            success = true;
                        }
                    }
                }
                break;
        }

        if (success) {
            socket.emit('characterUpdate', character);
        }
    });
};