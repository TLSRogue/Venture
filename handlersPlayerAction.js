// handlersPlayerAction.js

/**
 * Manages the master 'playerAction' socket event for all non-adventure actions,
 * such as buying, selling, crafting, and equipping items/spells.
 */

import { players, parties, duels } from './serverState.js';
import { gameData } from './data/index.js';
import { addItemToInventoryServer, playerHasMaterials, consumeMaterials, checkAndRotateMerchantStock, getBonusStatsForPlayer } from './utilsHelpers.js';

export const registerPlayerActionHandlers = (io, socket) => {
    socket.on('playerAction', (action) => {
        const name = socket.characterName;
        const player = players[name];

        // Prevent actions if the player is missing, in an active adventure, or duel
        if (!player) {
            console.log(`[playerAction] Blocked: Player not found for socket ${socket.id}`);
            return;
        }

        const character = player.character;

        // Clear stale duelId if duel doesn't exist
        if (character.duelId && !duels[character.duelId]) {
            console.log(`[playerAction] Clearing stale duelId ${character.duelId} for ${name}`);
            character.duelId = null;
        }

        const party = character.partyId ? parties[character.partyId] : null;
        const isInActiveAdventure = party?.sharedState?.currentZone != null;

        if (isInActiveAdventure) {
            console.log(`[playerAction] Blocked: ${name} is in active adventure (zone: ${party.sharedState.currentZone})`);
            return;
        }
        // Note: duelId check removed - duels now use partyId with PvP encounters

        const { type, payload } = action;

        let success = false; // Flag to check if an action successfully changed the state

        switch (type) {
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

                        if (addItemToInventoryServer(character, itemToGive)) {
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
                    const { itemIndex, fromBank } = payload;
                    const item = fromBank ? character.bank[itemIndex] : character.inventory[itemIndex];
                    if (item) {
                        const sellPrice = Math.floor(item.price / 2) || 1;
                        character.gold += sellPrice;
                        item.quantity = (item.quantity || 1) - 1;
                        if (item.quantity <= 0) {
                            if (fromBank) {
                                character.bank.splice(itemIndex, 1);
                            } else {
                                character.inventory[itemIndex] = null;
                            }
                        }
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
                        character.spellbook.push({ ...spell });
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
                        // ** BUG FIX START ** // Only unequip a 2H weapon if equipping an item into a hand slot.
                        if (['mainHand', 'offHand'].includes(chosenSlot) && character.equipment.mainHand && character.equipment.mainHand.hands === 2) {
                            character.equipment.mainHand = null;
                            character.equipment.offHand = null;
                        }
                        // ** BUG FIX END **

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

                    // --- FIX: Prevent use of combat consumables outside of combat ---
                    if (item.cost > 0) {
                        console.log(`Action blocked: Attempted to use combat item '${item.name}' at home.`);
                        break;
                    }

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
                        const amountToDeposit = itemToDeposit.quantity || 1;

                        if (existingBankItem) {
                            existingBankItem.quantity += amountToDeposit;
                        } else {
                            const newItemForBank = { ...itemToDeposit };
                            if (!newItemForBank.quantity) {
                                newItemForBank.quantity = 1;
                            }
                            character.bank.push(newItemForBank);
                        }
                        character.inventory[index] = null;
                        success = true;
                    }
                }
                break;
            case 'withdrawItem':
                {
                    const { index } = payload;
                    const itemToWithdraw = character.bank[index];

                    if (itemToWithdraw) {
                        const baseItemData = gameData.allItems.find(i => i.name === itemToWithdraw.name);
                        let itemToAdd = { ...itemToWithdraw };

                        // If the base item is not naturally stackable (like armor), remove quantity before adding to inventory
                        if (!baseItemData.stackable) {
                            delete itemToAdd.quantity;
                        }

                        if (addItemToInventoryServer(character, itemToAdd, 1)) {
                            itemToWithdraw.quantity--;
                            if (itemToWithdraw.quantity <= 0) {
                                character.bank.splice(index, 1);
                            }
                            success = true;
                        }
                    }
                }
                break;
            case 'consolidateBank':
                {
                    const itemMap = new Map();
                    for (const item of character.bank) {
                        const quantity = item.quantity || 1;
                        if (itemMap.has(item.name)) {
                            const existing = itemMap.get(item.name);
                            existing.quantity += quantity;
                        } else {
                            // Create a fresh copy to avoid reference issues
                            const newItem = { ...item };
                            if (!newItem.quantity) {
                                newItem.quantity = 1;
                            }
                            itemMap.set(item.name, newItem);
                        }
                    }
                    character.bank = Array.from(itemMap.values());
                    success = true;
                }
                break;
            case 'depositAll':
                {
                    character.inventory.forEach((item, index) => {
                        if (item) {
                            const existingBankItem = character.bank.find(bankItem => bankItem.name === item.name);
                            const amountToDeposit = item.quantity || 1;

                            if (existingBankItem) {
                                existingBankItem.quantity += amountToDeposit;
                            } else {
                                const newItemForBank = { ...item };
                                if (!newItemForBank.quantity) {
                                    newItemForBank.quantity = 1;
                                }
                                character.bank.push(newItemForBank);
                            }
                            character.inventory[index] = null;
                        }
                    });
                    success = true;
                }
                break;
            case 'socketGem':
                {
                    const { equipmentSlot, gemInventoryIndex } = payload;
                    const equippedItem = character.equipment[equipmentSlot];
                    const gem = character.inventory[gemInventoryIndex];

                    // Validate the equipment has a gem slot
                    if (!equippedItem || !equippedItem.gemSlot) {
                        console.log(`[socketGem] Failed: Item in ${equipmentSlot} has no gem slot`);
                        break;
                    }

                    // Validate the gem
                    if (!gem || gem.type !== 'gem') {
                        console.log(`[socketGem] Failed: Item at index ${gemInventoryIndex} is not a gem`);
                        break;
                    }

                    // If there's already a socketed gem, return it to inventory
                    if (equippedItem.socketedGem) {
                        const oldGem = equippedItem.socketedGem;
                        if (!addItemToInventoryServer(character, oldGem)) {
                            console.log(`[socketGem] Failed: Inventory full, cannot unsocket existing gem`);
                            break;
                        }
                    }

                    // Socket the new gem
                    equippedItem.socketedGem = { ...gem };
                    character.inventory[gemInventoryIndex] = null;
                    console.log(`[socketGem] ${character.characterName} socketed ${gem.name} into ${equippedItem.name}`);
                    success = true;
                }
                break;
            case 'unsocketGem':
                {
                    const { equipmentSlot } = payload;
                    const equippedItem = character.equipment[equipmentSlot];

                    // Validate the equipment has a socketed gem
                    if (!equippedItem || !equippedItem.socketedGem) {
                        console.log(`[unsocketGem] Failed: Item in ${equipmentSlot} has no socketed gem`);
                        break;
                    }

                    const gem = equippedItem.socketedGem;
                    if (!addItemToInventoryServer(character, gem)) {
                        console.log(`[unsocketGem] Failed: Inventory full`);
                        break;
                    }

                    equippedItem.socketedGem = null;
                    console.log(`[unsocketGem] ${character.characterName} unsocketed ${gem.name} from ${equippedItem.name}`);
                    success = true;
                }
                break;
        }

        if (success) {
            socket.emit('characterUpdate', character);
        }
    });
};