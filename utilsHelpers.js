// utilsHelpers.js

/**
 * This module contains helper functions that perform specific game logic operations,
 * such as deck building, inventory management, and calculating player stats.
 */

import { gameData } from './game-data.js';

export function buildZoneDeckForServer(zoneName) {
    let npcs = [];
    let otherCards = [];
    let cardPool = gameData.cardPools[zoneName] ? [...gameData.cardPools[zoneName]] : [];
    
    cardPool.forEach(poolItem => {
        for (let i = 0; i < poolItem.count; i++) {
            const card = { ...poolItem.card };
            if (card.type === 'npc') {
                npcs.push(card);
            } else {
                otherCards.push(card);
            }
        }
    });

    if (Math.random() < 0.33) {
        otherCards.push({ ...gameData.specialCards.lootGoblin, stolenGold: 0 });
    }
    
    // Shuffle only the non-NPC cards
    for (let i = otherCards.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [otherCards[i], otherCards[j]] = [otherCards[j], otherCards[i]];
    }
    
    return [...npcs, ...otherCards];
}

export function drawCardsForServer(sharedState, amount) {
    for(let i = 0; i < amount; i++) {
        if (sharedState.zoneDeck.length === 0) {
            sharedState.log.push({ message: "The zone's deck is empty!", type: 'info' });
            break;
        }
        
        const [card] = sharedState.zoneDeck.splice(0, 1);

        if (card.type === 'enemy') {
            card.id = Date.now() + i;
            card.health = card.maxHealth;
            card.debuffs = [];
        } else if (card.type === 'resource') {
            card.charges = 3;
        }
        sharedState.zoneCards.push(card);
    }
}

export function getBonusStatsForPlayer(character, playerState) {
    const bonuses = { strength: 0, wisdom: 0, agility: 0, defense: 0, luck: 0, maxHealth: 0, physicalResistance: 0, mining: 0, woodcutting: 0, fishing: 0, harvesting: 0, rollBonus: 0 };
    for (const slot in character.equipment) {
        const item = character.equipment[slot];
        if (item && item.hands === 2 && slot === 'offHand') continue;
        if (item && item.bonus) {
            for (const stat in item.bonus) {
                bonuses[stat] = (bonuses[stat] || 0) + item.bonus[stat];
            }
        }
    }
    character.inventory.forEach(item => {
        if (item && item.skillBonus) {
            for (const skill in item.skillBonus) {
                bonuses[skill] = (bonuses[skill] || 0) + item.skillBonus[skill];
            }
        }
    });
    if (playerState && playerState.buffs) {
        playerState.buffs.forEach(buff => {
            if (buff.bonus) {
                for (const stat in buff.bonus) {
                    bonuses[stat] = (bonuses[stat] || 0) + buff.bonus[stat];
                }
            }
        });
    }
    return bonuses;
}

export function addItemToInventoryServer(character, itemData, quantity = 1) {
    if (!itemData) return false;
    const baseItem = gameData.allItems.find(i => i.name === itemData.name);
    if (!baseItem) return false;

    let remainingQuantity = quantity;

    if (baseItem.stackable) {
        for (const invItem of character.inventory) {
            if (invItem && invItem.name === itemData.name && invItem.quantity < baseItem.stackable) {
                const canAdd = baseItem.stackable - invItem.quantity;
                const toAdd = Math.min(remainingQuantity, canAdd);
                invItem.quantity += toAdd;
                remainingQuantity -= toAdd;
                if (remainingQuantity <= 0) return true;
            }
        }
        while (remainingQuantity > 0) {
            const emptySlotIndex = character.inventory.findIndex(slot => !slot);
            if (emptySlotIndex === -1) return false;
            const newStackAmount = Math.min(remainingQuantity, baseItem.stackable);
            character.inventory[emptySlotIndex] = { ...baseItem, quantity: newStackAmount };
            remainingQuantity -= newStackAmount;
        }
    } else {
        for (let i = 0; i < quantity; i++) {
            const emptySlotIndex = character.inventory.findIndex(slot => !slot);
            if (emptySlotIndex === -1) return false;
            character.inventory[emptySlotIndex] = { ...baseItem, quantity: 1 };
        }
    }
    return true;
}

export function playerHasMaterials(character, materials) {
    for (const material in materials) {
        const requiredCount = materials[material];
        let currentCount = 0;
        character.inventory.forEach(item => {
            if (item && item.name === material) currentCount += (item.quantity || 1);
        });
        character.bank.forEach(item => {
            if (item && item.name === material) currentCount += (item.quantity || 1);
        });
        if (currentCount < requiredCount) return false;
    }
    return true;
}

export function consumeMaterials(character, materials) {
    for (const material in materials) {
        let requiredCount = materials[material];
        for (let i = 0; i < character.inventory.length && requiredCount > 0; i++) {
            const item = character.inventory[i];
            if (item && item.name === material) {
                const toConsume = Math.min(requiredCount, item.quantity || 1);
                item.quantity -= toConsume;
                requiredCount -= toConsume;
                if (item.quantity <= 0) character.inventory[i] = null;
            }
        }
        if (requiredCount > 0) {
             for (let i = character.bank.length - 1; i >= 0 && requiredCount > 0; i--) {
                const item = character.bank[i];
                if (item && item.name === material) {
                    const toConsume = Math.min(requiredCount, item.quantity || 1);
                    item.quantity -= toConsume;
                    requiredCount -= toConsume;
                    if (item.quantity <= 0) character.bank.splice(i, 1);
                }
            }
        }
    }
}