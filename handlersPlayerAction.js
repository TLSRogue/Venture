// handlersPlayerAction.js

/**
 * Manages the master 'playerAction' socket event for all non-adventure actions,
 * such as buying, selling, crafting, and equipping items/spells.
 */

import { players, parties, duels } from './serverState.js';
import { gameData, itemsByName } from './data/index.js';
import { addItemToInventoryServer, playerHasMaterials, consumeMaterials, checkAndRotateMerchantStock, getBonusStatsForPlayer } from './utilsHelpers.js';

// --- INDIVIDUAL ACTION HANDLERS ---
// Each handler receives (character, payload) and returns true if successful

function handleViewMerchant(character) {
    checkAndRotateMerchantStock(character);
    return true;
}

function handleBuyItem(character, payload) {
    checkAndRotateMerchantStock(character);
    const { identifier, isPermanent } = payload;
    const stockItem = isPermanent ? null : character.merchantStock[identifier];
    const itemData = isPermanent ? itemsByName.get(identifier) : stockItem;

    if (itemData && character.gold >= itemData.price) {
        const itemToGive = isPermanent ? { ...itemData } : (({ quantity, ...rest }) => rest)(itemData);
        if (addItemToInventoryServer(character, itemToGive)) {
            character.gold -= itemData.price;
            if (!isPermanent && stockItem && stockItem.quantity > 0) {
                stockItem.quantity--;
            }
            return true;
        }
    }
    return false;
}

function handleSellItem(character, payload) {
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
        return true;
    }
    return false;
}

function handleCraftItem(character, payload) {
    const { recipeIndex, quantity } = payload;
    const recipe = gameData.craftingRecipes[recipeIndex];
    if (recipe && quantity > 0) {
        let craftedCount = 0;
        for (let i = 0; i < quantity; i++) {
            if (playerHasMaterials(character, recipe.materials)) {
                consumeMaterials(character, recipe.materials);
                const baseItem = itemsByName.get(recipe.result.name);
                addItemToInventoryServer(character, baseItem, recipe.result.quantity || 1);
                craftedCount++;
            } else {
                break;
            }
        }
        return craftedCount > 0;
    }
    return false;
}

function handleBuySpell(character, payload) {
    const spell = gameData.allSpells.find(s => s.name === payload.spellName && s.scrollCost);
    if (spell) {
        // Find the scroll in inventory
        const scrollIndex = character.inventory.findIndex(i => i && i.name === spell.scrollCost);
        if (scrollIndex !== -1) {
            const scrollItem = character.inventory[scrollIndex];

            // Consume scroll
            scrollItem.quantity = (scrollItem.quantity || 1) - 1;
            if (scrollItem.quantity <= 0) {
                character.inventory[scrollIndex] = null;
            }

            // Learn spell
            character.spellbook.push({ ...spell });
            return true;
        }
    }
    return false;
}

function handleEquipItem(character, payload) {
    const { itemIndex, chosenSlot } = payload;
    const itemToEquip = character.inventory[itemIndex];
    if (!itemToEquip || !itemToEquip.slot) return false;

    const canEquipInSlot = Array.isArray(itemToEquip.slot) ? itemToEquip.slot.includes(chosenSlot) : itemToEquip.slot === chosenSlot;
    if (!canEquipInSlot) return false;

    const currentlyEquipped = character.equipment[chosenSlot];

    if (itemToEquip.hands === 2) {
        // Equipping a 2-hand weapon - need to clear both main and off hand
        const mainHandItem = character.equipment.mainHand;
        const offHandItem = character.equipment.offHand;
        const freeSlots = character.inventory.filter(i => !i).length;
        // Check if mainHand and offHand are the same item (another 2-hander)
        const isSameItem = mainHandItem && offHandItem && mainHandItem === offHandItem;
        const slotsToFree = (mainHandItem ? 1 : 0) + (offHandItem && !isSameItem ? 1 : 0);

        if (slotsToFree > freeSlots + 1) return false;

        character.inventory[itemIndex] = null;
        if (mainHandItem) addItemToInventoryServer(character, mainHandItem);
        // Only add offHand if it's different from mainHand (not a 2-hander)
        if (offHandItem && !isSameItem) addItemToInventoryServer(character, offHandItem);

        character.equipment.mainHand = itemToEquip;
        character.equipment.offHand = itemToEquip;
    } else {
        // Equipping a 1-hand weapon - check if currently have a 2-hander equipped
        const currentMainHand = character.equipment.mainHand;
        if (['mainHand', 'offHand'].includes(chosenSlot) && currentMainHand && currentMainHand.hands === 2) {
            // Replacing a 2-hand weapon with a 1-hand weapon
            // Return the 2-hander to inventory first
            character.inventory[itemIndex] = null;
            addItemToInventoryServer(character, currentMainHand);
            character.equipment.mainHand = null;
            character.equipment.offHand = null;
            character.equipment[chosenSlot] = itemToEquip;
        } else {
            // Normal 1-hand swap
            character.equipment[chosenSlot] = itemToEquip;
            character.inventory[itemIndex] = currentlyEquipped;
        }
    }
    return true;
}

function handleUnequipItem(character, payload) {
    const { slot } = payload;
    const itemToUnequip = character.equipment[slot];
    if (!itemToUnequip) return false;

    if (addItemToInventoryServer(character, itemToUnequip)) {
        character.equipment[slot] = null;
        if (itemToUnequip.hands === 2) {
            character.equipment.offHand = null;
        }
        return true;
    }
    return false;
}

function handleEquipSpell(character, payload) {
    const { index } = payload;
    if (character.equippedSpells.length >= 5) return false;
    const spellToEquip = character.spellbook[index];
    if (!spellToEquip) return false;

    character.equippedSpells.push(spellToEquip);
    character.spellbook.splice(index, 1);
    return true;
}

function handleUnequipSpell(character, payload) {
    const { index } = payload;
    const spellToUnequip = character.equippedSpells[index];
    if (!spellToUnequip) return false;

    character.spellbook.push(spellToUnequip);
    character.equippedSpells.splice(index, 1);
    return true;
}

function handleUseConsumable(character, payload) {
    const { index } = payload;
    const item = character.inventory[index];
    if (!item || item.type !== 'consumable') return false;
    if (item.cost > 0) return false; // Combat consumables blocked at home

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
    return true;
}

function handleDrop(character, payload) {
    const { index } = payload;
    if (character.inventory[index]) {
        character.inventory[index] = null;
        return true;
    }
    return false;
}

function handleDepositItem(character, payload) {
    const { index } = payload;
    const itemToDeposit = character.inventory[index];
    if (itemToDeposit) {
        const existingBankItem = character.bank.find(item => item.name === itemToDeposit.name && !item.socketedGem && !itemToDeposit.socketedGem);
        const amountToDeposit = itemToDeposit.quantity || 1;

        if (existingBankItem) {
            existingBankItem.quantity += amountToDeposit;
        } else {
            const newItemForBank = { ...itemToDeposit };
            if (!newItemForBank.quantity) newItemForBank.quantity = 1;
            character.bank.push(newItemForBank);
        }
        character.inventory[index] = null;
        return true;
    }
    return false;
}

function handleWithdrawItem(character, payload) {
    const { index } = payload;
    const itemToWithdraw = character.bank[index];

    if (itemToWithdraw) {
        const baseItemData = itemsByName.get(itemToWithdraw.name);
        let itemToAdd = { ...itemToWithdraw };

        if (baseItemData && !baseItemData.stackable) {
            delete itemToAdd.quantity;
        }

        if (addItemToInventoryServer(character, itemToAdd, 1)) {
            itemToWithdraw.quantity--;
            if (itemToWithdraw.quantity <= 0) {
                character.bank.splice(index, 1);
            }
            return true;
        }
    }
    return false;
}

function handleConsolidateBank(character) {
    const itemMap = new Map();
    for (const item of character.bank) {
        const quantity = item.quantity || 1;
        if (itemMap.has(item.name)) {
            const existing = itemMap.get(item.name);
            existing.quantity += quantity;
        } else {
            const newItem = { ...item };
            if (!newItem.quantity) newItem.quantity = 1;
            itemMap.set(item.name, newItem);
        }
    }
    character.bank = Array.from(itemMap.values());
    return true;
}

function handleDepositAll(character) {
    character.inventory.forEach((item, index) => {
        if (item) {
            const existingBankItem = character.bank.find(bankItem => bankItem.name === item.name);
            const amountToDeposit = item.quantity || 1;

            if (existingBankItem) {
                existingBankItem.quantity += amountToDeposit;
            } else {
                const newItemForBank = { ...item };
                if (!newItemForBank.quantity) newItemForBank.quantity = 1;
                character.bank.push(newItemForBank);
            }
            character.inventory[index] = null;
        }
    });
    return true;
}

function handleSocketGem(character, payload) {
    const { equipmentSlot, gemInventoryIndex } = payload;
    const equippedItem = character.equipment[equipmentSlot];
    const gem = character.inventory[gemInventoryIndex];

    if (!equippedItem || !equippedItem.gemSlot) return false;
    if (!gem || gem.type !== 'gem') return false;

    if (equippedItem.socketedGem) {
        if (!addItemToInventoryServer(character, equippedItem.socketedGem)) return false;
    }

    equippedItem.socketedGem = { ...gem };
    character.inventory[gemInventoryIndex] = null;
    return true;
}

function handleUnsocketGem(character, payload) {
    const { equipmentSlot } = payload;
    const equippedItem = character.equipment[equipmentSlot];

    if (!equippedItem || !equippedItem.socketedGem) return false;

    const gem = equippedItem.socketedGem;
    if (!addItemToInventoryServer(character, gem)) return false;

    equippedItem.socketedGem = null;
    return true;
}

function handleSellAllJunk(character) {
    let totalGold = 0;
    let itemsSold = 0;

    // Find and sell all "junk" items (common tier 1 materials)
    for (let i = 0; i < character.inventory.length; i++) {
        const item = character.inventory[i];
        if (item &&
            item.type === 'material' &&
            item.tier === 1 &&
            item.rarity === 'common' &&
            item.price) {
            const quantity = item.quantity || 1;
            const sellPrice = Math.floor(item.price / 2) || 1;
            totalGold += sellPrice * quantity;
            itemsSold += quantity;
            character.inventory[i] = null;
        }
    }

    if (itemsSold > 0) {
        character.gold += totalGold;
        console.log(`[SellAllJunk] ${character.characterName} sold ${itemsSold} junk items for ${totalGold}g`);
        return true;
    }
    return false;
}

// --- ACTION DISPATCH TABLE ---
const actionHandlers = {
    viewMerchant: handleViewMerchant,
    buyItem: handleBuyItem,
    sellItem: handleSellItem,
    craftItem: handleCraftItem,
    buySpell: handleBuySpell,
    equipItem: handleEquipItem,
    unequipItem: handleUnequipItem,
    equipSpell: handleEquipSpell,
    unequipSpell: handleUnequipSpell,
    useConsumable: handleUseConsumable,
    drop: handleDrop,
    depositItem: handleDepositItem,
    withdrawItem: handleWithdrawItem,
    consolidateBank: handleConsolidateBank,
    depositAll: handleDepositAll,
    socketGem: handleSocketGem,
    unsocketGem: handleUnsocketGem,
    sellAllJunk: handleSellAllJunk
};

// --- MAIN HANDLER REGISTRATION ---
export const registerPlayerActionHandlers = (io, socket) => {
    socket.on('playerAction', (action) => {
        const name = socket.characterName;
        const player = players[name];

        if (!player) return;

        const character = player.character;

        // Clear stale duelId if duel doesn't exist
        if (character.duelId && !duels[character.duelId]) {
            character.duelId = null;
        }

        const party = character.partyId ? parties[character.partyId] : null;
        const isInActiveAdventure = party?.sharedState?.currentZone != null;

        if (isInActiveAdventure) return;

        const { type, payload } = action;
        const handler = actionHandlers[type];

        if (handler && handler(character, payload)) {
            socket.emit('characterUpdate', character);
        }
    });
};
