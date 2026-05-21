// migrations.js

/**
 * Centralized migration and refresh logic for player characters.
 * Called both at server startup (for saved players.json) and at login time.
 * This consolidates what was previously spread across serverState.js and handlersConnection.js.
 */

import { gameData } from './data/index.js';
import { INVENTORY_SIZE } from './constants.js';

// --- SPELL REFRESH ---
// Spells that should always be updated to the current definition.
// Add new spells here when their definition changes.
const SPELLS_TO_REFRESH = [
  'Aim True',
  'Split Shot',
  'Evasive Shot',
  'Dagger Throw',
  'Ambush',
  'Magic Barrier',
  'Slash',
  'Fireball',
  'Flash Heal',
  'Holy Shock',
  'Flame Strike',
  'Stealth',
  'Silence',
  'Revive',
  'Cone of Cold',
  'Entangling Roots',
  'Cleanse',
  'Moonbeam',
  'Rejuvenate',
  'Spirit Call',
  'Tree Form',
  "Nature's Wrath",
  "Nature's Blessing",
  "Warrior's Might",
];

// --- EQUIPMENT PROPERTY UPDATES ---
// Items that have gained new properties since their initial release.
// Key = item name, Value = properties to add if missing.
const EQUIPMENT_PROPERTY_UPDATES = {
  Staff: { gemSlot: 1 },
};

// --- RECIPE BACKFILL RULES ---
// Players who completed these quests before recipe rewards were expanded
// should retroactively learn these recipes.
const RECIPE_BACKFILL_RULES = [
  { questId: 'STEEL_ARMOR_QUEST', recipes: ['Steel Helm (T2)', 'Steel Boots (T2)'] },
  {
    questId: 'TAILOR_SILK_QUEST',
    recipes: ['Silk Wizard Robes (T2)', 'Silk Wizard Hat (T2)', 'Silk Wizard Boots (T2)'],
  },
  { questId: 'OLD_RECIPE_QUEST', recipes: ['Gem of Frost', 'Gem of Holy', 'Gem of Shadow'] },
];

/**
 * Runs all migrations/refreshes on a character. Safe to call multiple times.
 * Returns true if any data was changed (for save purposes).
 * @param {object} character - The character data object
 * @param {string} characterName - The character's name (for logging)
 * @returns {boolean} True if any data was migrated/updated
 */
export function runMigrations(character, characterName) {
  let changed = false;

  // --- Legacy field rename: playerDebuffs -> debuffs ---
  if (character.hasOwnProperty('playerDebuffs')) {
    character.debuffs = character.playerDebuffs;
    delete character.playerDebuffs;
    console.log(`Migrated 'playerDebuffs' to 'debuffs' for ${characterName}.`);
    changed = true;
  }

  // --- Ensure buffs/debuffs arrays exist ---
  if (!character.hasOwnProperty('buffs') || !Array.isArray(character.buffs)) {
    character.buffs = [];
    console.log(`Initialized missing 'buffs' array for ${characterName}.`);
    changed = true;
  }
  if (!character.hasOwnProperty('debuffs') || !Array.isArray(character.debuffs)) {
    character.debuffs = [];
    console.log(`Initialized missing 'debuffs' array for ${characterName}.`);
    changed = true;
  }

  // --- Fix null/NaN health ---
  if (character.health === null || isNaN(character.health)) {
    character.health = character.maxHealth || 10;
    console.log(`Fixed null/NaN health for ${characterName}.`);
    changed = true;
  }

  // --- Inventory size migration ---
  if (character.inventory && character.inventory.length < INVENTORY_SIZE) {
    const originalLength = character.inventory.length;
    while (character.inventory.length < INVENTORY_SIZE) {
      character.inventory.push(null);
    }
    console.log(`Extended inventory from ${originalLength} to ${INVENTORY_SIZE} slots for ${characterName}.`);
    changed = true;
  }

  // --- Training Zone fields ---
  if (character.spellsLearnedFromTraining === undefined) {
    character.spellsLearnedFromTraining = 0;
    character.trainingRefreshCount = 0;
    character.trainingOfferings = [];
    character.totalQuestPointsEarned = character.questPoints || 0;
    console.log(`Initialized training zone fields for ${characterName}.`);
    changed = true;
  }

  // --- Spell refresh: update all spells to current definitions ---
  changed = refreshSpells(character, characterName) || changed;

  // --- Equipment property refresh ---
  changed = refreshEquipment(character, characterName) || changed;

  // --- Recipe backfill ---
  changed = backfillRecipes(character, characterName) || changed;

  return changed;
}

/**
 * Updates all spells in equipped/spellbook to match current definitions.
 */
function refreshSpells(character, characterName) {
  let changed = false;

  SPELLS_TO_REFRESH.forEach((spellName) => {
    const currentDef = gameData.allSpells.find((s) => s.name === spellName);
    if (!currentDef) return;

    const equippedIdx = character.equippedSpells?.findIndex((s) => s && s.name === spellName);
    if (equippedIdx !== undefined && equippedIdx !== -1) {
      character.equippedSpells[equippedIdx] = { ...currentDef };
      changed = true;
    }

    const spellbookIdx = character.spellbook?.findIndex((s) => s && s.name === spellName);
    if (spellbookIdx !== undefined && spellbookIdx !== -1) {
      character.spellbook[spellbookIdx] = { ...currentDef };
      changed = true;
    }
  });

  return changed;
}

/**
 * Adds missing properties to equipment and inventory items.
 */
function refreshEquipment(character, characterName) {
  let changed = false;

  // Update equipment slots
  if (character.equipment) {
    for (const slot in character.equipment) {
      const item = character.equipment[slot];
      if (item && EQUIPMENT_PROPERTY_UPDATES[item.name]) {
        const updates = EQUIPMENT_PROPERTY_UPDATES[item.name];
        for (const prop in updates) {
          if (item[prop] === undefined) {
            item[prop] = updates[prop];
            changed = true;
            console.log(`[Equipment Refresh] Added ${prop} to ${item.name} for ${characterName} (${slot})`);
          }
        }
      }
    }
  }

  // Update inventory items
  if (character.inventory) {
    character.inventory.forEach((item, index) => {
      if (item && EQUIPMENT_PROPERTY_UPDATES[item.name]) {
        const updates = EQUIPMENT_PROPERTY_UPDATES[item.name];
        for (const prop in updates) {
          if (item[prop] === undefined) {
            item[prop] = updates[prop];
            changed = true;
            console.log(`[Equipment Refresh] Added ${prop} to ${item.name} for ${characterName} (inventory[${index}])`);
          }
        }
      }
    });
  }

  return changed;
}

/**
 * Backfills recipes for players who completed quests before rewards were expanded.
 */
function backfillRecipes(character, characterName) {
  if (!character.quests || !character.knownRecipes) return false;
  let changed = false;

  RECIPE_BACKFILL_RULES.forEach(({ questId, recipes }) => {
    const completedQuest = character.quests.find((q) => q.details?.id === questId && q.status === 'completed');
    if (completedQuest) {
      recipes.forEach((recipeName) => {
        if (!character.knownRecipes.includes(recipeName)) {
          character.knownRecipes.push(recipeName);
          console.log(`[Recipe Backfill] Added ${recipeName} for ${characterName}`);
          changed = true;
        }
      });
    }
  });

  return changed;
}
