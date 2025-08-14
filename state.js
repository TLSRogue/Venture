'use strict';

import { gameData } from './data/index.js';

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
        characterName: null,
        characterIcon: '🧑',
        title: "The Novice",
        unlockedTitles: ["The Novice"],
        health: 10,
        maxHealth: 10,
        shield: 0,
        wisdom: 0,
        strength: 0,
        agility: 0,
        defense: 0,
        luck: 0,
        physicalResistance: 0,
        mining: 0,
        fishing: 0,
        woodcutting: 0,
        harvesting: 0,
        gold: 200,
        questPoints: 0,
        actionPoints: 3,
        focus: 0,
        currentZone: null,
        zoneDeck: [],
        inventory: Array(24).fill(null),
        bank: [],
        buffs: [],
        debuffs: [],
        equippedSpells: [
            gameData.allSpells.find(s => s.name === 'Punch'),
            gameData.allSpells.find(s => s.name === 'Kick'),
            gameData.allSpells.find(s => s.name === 'Dodge')
        ],
        spellbook: [],
        knownRecipes: [],
        equipment: {
            mainHand: {...gameData.allItems.find(i => i.name === "Wooden Training Sword")
            },
            offHand: null,
            helmet: null,
            armor: null,
            boots: null,
            accessory: null,
            ammo: null
        },
        zoneCards: [],
        quests: [],
        spellCooldowns: {},
        weaponCooldowns: {},
        itemCooldowns: {},
        merchantStock: [],
        merchantLastStocked: null,
        cardDefeatTimes: {},
        turnState: {
            isPlayerTurn: true,
            pendingReaction: null,
            selectedAction: null,
            isProcessing: false,
        },
        partyId: null,
        inDuel: false,
        duelState: null,
    };
}