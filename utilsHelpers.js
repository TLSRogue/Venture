// utilsHelpers.js

/**
 * This module contains helper functions that perform specific game logic operations,
 * such as deck building, inventory management, and calculating player stats.
 */

import { gameData, itemsByName } from './data/index.js';
import { shuffleArray, DEFAULT_BONUS_STATS } from './shared.js';
import {
  MERCHANT_ROTATION_MS,
  MERCHANT_STOCK_SIZE,
  MERCHANT_MAX_QUANTITY,
  LOOT_GOBLIN_SPAWN_CHANCE,
  BOSS_HP_SCALE_PER_PLAYER,
} from './constants.js';

export function createStateForClient(sharedState, encounterState = null) {
  if (!sharedState) return null;

  // Create a base client state from the party's shared state, removing server-only timer IDs.
  const safeSharedState = { ...sharedState };
  delete safeSharedState.turnTimerId;
  delete safeSharedState.reactionTimeout;

  const finalState = { ...safeSharedState };

  // If there is a PvP encounter, sanitize it and attach it to the payload.
  if (encounterState) {
    const safeEncounterState = { ...encounterState };
    delete safeEncounterState.turnTimerId;
    delete safeEncounterState.reactionTimeout;
    finalState.pvpEncounterState = safeEncounterState;
  } else if (finalState.zoneCards) {
    // For PvE, we still need to remove the (now unused in PvP) _playerStateRef just in case.
    finalState.zoneCards = finalState.zoneCards.map((card) => {
      if (card && card._playerStateRef) {
        const safeCard = { ...card };
        delete safeCard._playerStateRef;
        return safeCard;
      }
      return card;
    });
  }

  return finalState;
}

// --- MERCHANT LOGIC (UPDATED) ---

/**
 * Generates a new set of rotating wares for a character.
 * This function now uses the 'canBeInMerchantWares' item tag.
 * @param {object} character - The character object to generate stock for.
 */
function generateMerchantStock(character) {
  // Filter all items to find only those eligible for the merchant's rotating wares.
  const stockPool = gameData.allItems.filter((item) => item.canBeInMerchantWares === true && item.price > 0);

  // Shuffle the eligible items to ensure variety
  shuffleArray(stockPool);

  // Assign a random quantity to the selected stock
  character.merchantStock = stockPool.slice(0, MERCHANT_STOCK_SIZE).map((item) => ({
    ...item,
    quantity: Math.floor(Math.random() * MERCHANT_MAX_QUANTITY) + 1,
  }));
  character.merchantLastStocked = Date.now();
}

/**
 * Checks if a character's merchant stock needs to be rotated and does so if needed.
 * @param {object} character - The character object to check.
 */
export function checkAndRotateMerchantStock(character) {
  if (!character.merchantLastStocked || Date.now() - character.merchantLastStocked > MERCHANT_ROTATION_MS) {
    console.log(`Rotating merchant stock for ${character.characterName}`);
    generateMerchantStock(character);
  }
}

// --- EXISTING HELPER FUNCTIONS ---

export function buildZoneDeckForServer(zoneName, partySize = 1) {
  let npcs = [];
  let bottomHalfNPCs = [];
  let otherCards = [];
  let cardPool = gameData.cardPools[zoneName] ? [...gameData.cardPools[zoneName]] : [];

  cardPool.forEach((poolItem) => {
    for (let i = 0; i < poolItem.count; i++) {
      const card = { ...poolItem.card };
      if (card.type === 'npc') {
        if (card.deckPlacement === 'bottomHalf') {
          bottomHalfNPCs.push(card);
        } else {
          npcs.push(card);
        }
      } else if (card.deckPlacement === 'front') {
        npcs.push(card);
      } else {
        otherCards.push(card);
      }
    }
  });

  if (Math.random() < LOOT_GOBLIN_SPAWN_CHANCE) {
    // Randomly assign tier (1-3) and scale HP accordingly
    const tier = Math.floor(Math.random() * 3) + 1; // 1, 2, or 3
    const tierHP = { 1: 6, 2: 12, 3: 18 };
    const lootGoblin = {
      ...gameData.specialCards.lootGoblin,
      tier: tier,
      health: tierHP[tier],
      maxHealth: tierHP[tier],
      stolenGold: 0,
      debuffs: [],
    };
    otherCards.push(lootGoblin);
  }

  // Scale boss HP based on party size (percentage-based: 2 players +20%, 3 players +40%)
  if (partySize > 1) {
    const hpMultiplier = 1 + (partySize - 1) * BOSS_HP_SCALE_PER_PLAYER;
    otherCards.forEach((card) => {
      if (card.isBoss) {
        card.health = Math.ceil(card.health * hpMultiplier);
        card.maxHealth = Math.ceil(card.maxHealth * hpMultiplier);
      }
    });
  }

  // Separate bosses and treasure chests from regular cards
  const bosses = otherCards.filter((card) => card.isBoss);
  const treasureChests = otherCards.filter((card) => card.type === 'treasure');
  const regularCards = otherCards.filter((card) => !card.isBoss && card.type !== 'treasure');

  // Shuffle regular cards
  shuffleArray(regularCards);

  // Calculate the midpoint for placing bosses in the second half
  const totalNonSpecial = regularCards.length;
  const midpoint = Math.ceil(totalNonSpecial / 2);

  // Split regular cards into first half and second half
  const firstHalf = regularCards.slice(0, midpoint);
  const secondHalf = regularCards.slice(midpoint);

  // Insert bosses randomly into the second half
  shuffleArray(bosses);
  bosses.forEach((boss) => {
    const insertPos = Math.floor(Math.random() * (secondHalf.length + 1));
    secondHalf.splice(insertPos, 0, boss);
  });

  // Insert bottomHalfNPCs randomly into the second half
  shuffleArray(bottomHalfNPCs);
  bottomHalfNPCs.forEach((npc) => {
    const insertPos = Math.floor(Math.random() * (secondHalf.length + 1));
    secondHalf.splice(insertPos, 0, npc);
  });

  // Combine: NPCs first, then first half, then second half with bosses, then treasure chests at the end
  return [...npcs, ...firstHalf, ...secondHalf, ...treasureChests];
}

/**
 * Get zone-specific area card for filling empty slots
 */
export function getZoneAreaCard(zoneName, index = 0) {
  const zoneAreaCards = {
    farmlands: gameData.specialCards.farmlandsArea,
    sewers: gameData.specialCards.emptyCanal,
    goblinCaves: gameData.specialCards.goblinCavesTunnel,
    darkForest: gameData.specialCards.darkForestTrail,
    mansion: gameData.specialCards.mansionHall,
    arena: gameData.specialCards.arenaFloor,
  };
  const areaCard = zoneAreaCards[zoneName];
  // Add index to Date.now() to ensure unique IDs within the same call block
  return areaCard ? { ...areaCard, id: Date.now() + 1000 + index } : null;
}

export function drawCardsForServer(sharedState, amount) {
  for (let i = 0; i < amount; i++) {
    if (sharedState.zoneDeck.length === 0) {
      // Fill with area card if zone supports it
      const areaCard = getZoneAreaCard(sharedState.currentZone, i);
      if (areaCard) {
        sharedState.zoneCards.push(areaCard);
        continue;
      }
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
  const bonuses = { ...DEFAULT_BONUS_STATS };
  for (const slot in character.equipment) {
    const item = character.equipment[slot];
    if (item && item.hands === 2 && slot === 'offHand') continue;
    if (item && item.bonus) {
      for (const stat in item.bonus) {
        bonuses[stat] = (bonuses[stat] || 0) + item.bonus[stat];
      }
    }
    // Check for socketed gems
    if (item && item.socketedGem && item.socketedGem.gemBonus) {
      for (const stat in item.socketedGem.gemBonus) {
        bonuses[stat] = (bonuses[stat] || 0) + item.socketedGem.gemBonus[stat];
      }
    }
  }
  character.inventory.forEach((item) => {
    if (item && item.skillBonus) {
      for (const skill in item.skillBonus) {
        bonuses[skill] = (bonuses[skill] || 0) + item.skillBonus[skill];
      }
    }
  });
  if (playerState && playerState.buffs) {
    playerState.buffs.forEach((buff) => {
      if (buff.bonus) {
        for (const stat in buff.bonus) {
          bonuses[stat] = (bonuses[stat] || 0) + buff.bonus[stat];
        }
      }
    });
  }
  return bonuses;
}

export function addItemToInventoryServer(character, itemData, quantity = 1, groundLoot = null) {
  if (!itemData) return false;
  // Use itemsByName Map for O(1) lookup instead of array find
  const baseItem = itemsByName.get(itemData.name);
  if (!baseItem) return false;

  let remainingQuantity = quantity;
  let addedToInventory = false;

  if (baseItem.stackable) {
    for (const invItem of character.inventory) {
      // Prevent stacking if either item has a socketed gem (treat as unique)
      if (
        invItem &&
        invItem.name === itemData.name &&
        invItem.quantity < baseItem.stackable &&
        !itemData.socketedGem &&
        !invItem.socketedGem
      ) {
        const canAdd = baseItem.stackable - invItem.quantity;
        const toAdd = Math.min(remainingQuantity, canAdd);
        invItem.quantity += toAdd;
        remainingQuantity -= toAdd;
        addedToInventory = true;
        if (remainingQuantity <= 0) return true;
      }
    }
  }

  while (remainingQuantity > 0) {
    const emptySlotIndex = character.inventory.findIndex((slot) => !slot);
    if (emptySlotIndex === -1) {
      break;
    }

    const amountToAdd = baseItem.stackable ? Math.min(remainingQuantity, baseItem.stackable) : 1;
    // Important: Merge itemData to preserve custom properties like socketedGem
    character.inventory[emptySlotIndex] = { ...baseItem, ...itemData, quantity: amountToAdd };
    remainingQuantity -= amountToAdd;
    addedToInventory = true;
    if (!baseItem.stackable && remainingQuantity > 0) continue;
  }

  if (remainingQuantity > 0 && groundLoot !== null) {
    for (let i = 0; i < remainingQuantity; i++) {
      groundLoot.push({ ...baseItem, quantity: 1 });
    }
    return true;
  }

  return addedToInventory;
}

export function playerHasMaterials(character, materials) {
  for (const material in materials) {
    const requiredCount = materials[material];
    let currentCount = 0;
    character.inventory.forEach((item) => {
      if (item && item.name === material) currentCount += item.quantity || 1;
    });
    character.bank.forEach((item) => {
      if (item && item.name === material) currentCount += item.quantity || 1;
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
