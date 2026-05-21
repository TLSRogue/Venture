'use strict';

import { gameData } from './data/index.js';
import { DEFAULT_CHARACTER_STATS } from './shared.js';

/**
 * @file state.js
 * This module is responsible for managing the game's state. It serves as the
 * single source of truth for all dynamic data in the game, such as player stats,
 * inventory, and the current zone's status.
 */

export let gameState = {};

export function setGameState(newState) {
  gameState = newState;
}

export function getInitialGameState() {
  return {
    ...DEFAULT_CHARACTER_STATS,
    characterName: null,
    characterIcon: '🧑',
    // Deep-clone arrays/objects from template so instances don't share references
    inventory: [...DEFAULT_CHARACTER_STATS.inventory],
    unlockedTitles: [...DEFAULT_CHARACTER_STATS.unlockedTitles],
    bank: [],
    buffs: [],
    debuffs: [],
    spellbook: [],
    knownRecipes: [],
    quests: [],
    merchantStock: [],
    spellCooldowns: {},
    weaponCooldowns: {},
    itemCooldowns: {},
    cardDefeatTimes: {},
    equippedSpells: [
      gameData.allSpells.find((s) => s.name === 'Punch'),
      gameData.allSpells.find((s) => s.name === 'Kick'),
      gameData.allSpells.find((s) => s.name === 'Dodge'),
    ],
    equipment: {
      ...DEFAULT_CHARACTER_STATS.equipment,
      mainHand: {
        ...gameData.allItems.find((i) => i.name === 'Wooden Training Sword'),
      },
    },
    // Client-only fields
    currentZone: null,
    zoneDeck: [],
    zoneCards: [],
    turnState: {
      isPlayerTurn: true,
      pendingReaction: null,
      selectedAction: null,
      isProcessing: false,
    },
    inDuel: false,
    duelState: null,
  };
}
