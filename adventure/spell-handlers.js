// adventure/spell-handlers.js
import { getBonusStatsForPlayer } from '../utilsHelpers.js';

export const SpellHandlers = {
  "Monk's Training": (spell, character, actingPlayerState, log) => {
    const focusAmount = actingPlayerState.focus || 0;
    if (focusAmount > 0) {
      actingPlayerState.health = Math.min(actingPlayerState.maxHealth, actingPlayerState.health + focusAmount);
      const buff = { type: 'Focus', duration: 2, bonus: { rollBonus: focusAmount } };
      // Remove existing focus buff
      const existingIndex = actingPlayerState.buffs.findIndex((b) => b.type === buff.type);
      if (existingIndex !== -1) actingPlayerState.buffs.splice(existingIndex, 1);

      actingPlayerState.buffs.push(buff);
      log.push({
        message: `${character.characterName} spends ${focusAmount} Focus to heal for ${focusAmount} and gain +${focusAmount} to rolls this turn.`,
        type: 'heal',
      });
      actingPlayerState.focus = 0;
      return true; // Effect handled
    } else {
      log.push({ message: `${character.characterName} has no Focus to spend!`, type: 'info' });
      return true; // Handled, even if failed
    }
  },

  'Spirit Call': (spell, character, actingPlayerState, _log) => {
    // Return dialogue structure for the UI to render
    return {
      success: true,
      pendingSelection: {
        type: 'spiritCall',
        casterPlayerId: actingPlayerState.playerId,
        casterName: character.characterName,
        // Pre-calculate the bonus amount for display
        bonusAmount: Math.max(1, getBonusStatsForPlayer(character, actingPlayerState).naturePower || 0),
      },
    };
  },

  Revive: (spell, character, actingPlayerState, log, targetState) => {
    if (!targetState || !targetState.isDead) {
      // targetState needs to be the raw state object here usually
      log.push({
        message: `${character.characterName} casts ${spell.name}, but there is no valid target!`,
        type: 'info',
      });
      return true;
    }

    // Revive logic
    targetState.isDead = false;
    targetState.health = 1;
    targetState.turnEnded = true;
    targetState.buffs = [];
    targetState.debuffs = [];

    log.push({ message: `${character.characterName} casts ${spell.name}!`, type: 'heal' });
    log.push({
      message: `${targetState.name} has been revived with 1 HP! [id:${targetState.playerId || targetState.id}]`,
      type: 'heal',
    });
    return true;
  },

  Cleanse: (spell, character, actingPlayerState, log, targetState, bonuses) => {
    if (!targetState) {
      log.push({
        message: `${character.characterName} casts ${spell.name}, but there is no valid target!`,
        type: 'info',
      });
      return { success: false };
    }

    let didHeal = false;
    // Apply Healing if spell has it (Nature's Blessing)
    if (spell.heal) {
      // Calculate Heal Amount: Base + Nature Power (if Nature spell) or Holy Power (if Holy)
      // Default to matching power of school
      let powerBonus = 0;
      if (spell.school === 'Nature') powerBonus = bonuses?.naturePower || 0;
      if (spell.school === 'Holy') powerBonus = bonuses?.holyPower || 0;

      const healAmount = spell.heal + powerBonus;

      // Apply Heal
      const maxHealth = targetState.maxHealth || 10;
      const currentHealth = targetState.health || 0;
      targetState.health = Math.min(maxHealth, currentHealth + healAmount);

      log.push({ message: `${character.characterName} heals ${targetState.name} for ${healAmount} HP!`, type: 'heal' });
      didHeal = true;
    }

    // Calculate max debuffs to remove: Base (1) + Power
    let powerForCleanse = 0;
    if (spell.school === 'Nature') powerForCleanse = bonuses?.naturePower || 0;
    else powerForCleanse = bonuses?.holyPower || 0; // Default to Holy for Cleanse

    const baseCleanse = spell.cleanseAmount || 1;
    const maxDebuffsToRemove = baseCleanse + powerForCleanse;

    // Get target's debuffs
    const debuffs = targetState.debuffs || [];
    if (debuffs.length === 0) {
      if (didHeal) return { success: true }; // Successful if it healed, even if no debuffs
      log.push({
        message: `${character.characterName} casts ${spell.name} on ${targetState.name}, but there are no debuffs to remove!`,
        type: 'info',
      });
      return { success: false };
    }

    // If only one debuff or can cleanse all, auto-cleanse
    if (debuffs.length <= maxDebuffsToRemove) {
      const removedNames = debuffs.map((d) => d.type);
      targetState.debuffs = [];
      log.push({ message: `${didHeal ? 'Also cleansed' : 'Cleansed'}: ${removedNames.join(', ')}!`, type: 'heal' });
      return { success: true };
    }

    // Otherwise, return pending selection data for UI
    return {
      success: true,
      pendingSelection: {
        casterPlayerId: actingPlayerState.playerId,
        targetPlayerId: targetState.playerId || targetState.id,
        targetName: targetState.name,
        debuffs: debuffs.map((d, i) => ({ index: i, type: d.type, duration: d.duration })),
        maxSelectable: maxDebuffsToRemove,
        casterName: character.characterName,
      },
    };
  },
  "Nature's Blessing": (spell, character, actingPlayerState, log, targetState, bonuses) => {
    // Reuse Cleanse logic
    return SpellHandlers['Cleanse'](spell, character, actingPlayerState, log, targetState, bonuses);
  },
  Cauterize: (spell, character, actingPlayerState, log, targetState, bonuses) => {
    if (!targetState) {
      log.push({
        message: `${character.characterName} casts ${spell.name}, but there is no valid target!`,
        type: 'info',
      });
      return { success: false };
    }

    // Calculate heal amount: Base (1) + Fire Power
    const firePower = bonuses?.firePower || 0;
    const healAmount = (spell.heal || 1) + firePower;

    // Apply heal
    const maxHealth = targetState.maxHealth || 10;
    const currentHealth = targetState.health || 0;
    targetState.health = Math.min(maxHealth, currentHealth + healAmount);

    log.push({
      message: `${character.characterName} cauterizes ${targetState.name}'s wounds, healing for ${healAmount} HP!`,
      type: 'heal',
    });

    // Apply burn debuff to the healed target
    if (!targetState.debuffs) targetState.debuffs = [];
    const burnDebuff = { ...spell.debuff };
    const existingBurn = targetState.debuffs.findIndex((d) => d.type === 'burn');
    if (existingBurn !== -1) targetState.debuffs.splice(existingBurn, 1);
    targetState.debuffs.push(burnDebuff);

    log.push({ message: `${targetState.name} is now Burning from the cauterization!`, type: 'damage' });

    return { success: true };
  },
  'Expend Heat': (
    spell,
    character,
    actingPlayerState,
    log,
    targetState,
    _bonuses,
    _sharedState,
    _io,
    _party,
    _encounter
  ) => {
    if (!targetState) {
      log.push({
        message: `${character.characterName} casts ${spell.name}, but there is no valid target!`,
        type: 'info',
      });
      return { success: false, triggersAoe: false };
    }

    // Check if target has burn debuff
    if (!targetState.debuffs) targetState.debuffs = [];
    const burnIndex = targetState.debuffs.findIndex((d) => d.type.toLowerCase() === 'burn');

    if (burnIndex === -1) {
      log.push({
        message: `${character.characterName} casts ${spell.name} on ${targetState.name}, but they are not burning!`,
        type: 'info',
      });
      return { success: true, triggersAoe: false };
    }

    // Remove burn
    targetState.debuffs.splice(burnIndex, 1);
    log.push({
      message: `${character.characterName} expends the heat from ${targetState.name}, removing Burn!`,
      type: 'heal',
    });

    // Return that AoE should trigger - the actual damage is handled in adventure-actions.js
    return { success: true, triggersAoe: true };
  },
};

/**
 * Calculates raw damage for spells that have unique scaling or weapon-based logic.
 * This is the single source of truth for special spell damage calculations.
 *
 * @param {object} spell - The spell being cast
 * @param {object} character - The caster's character data
 * @param {object} actingPlayerState - The state of the player casting the spell.
 * @param {object} bonuses - Calculated bonuses for the player.
 * @param {object} target - The target of the spell (optional, for conditional damage).
 * @returns {number|object|null} - The calculated special damage, or null if no special handling.
 *                                 Can return object { damage, debuff, logMessage } for complex effects.
 */
export function getSpecialSpellDamage(spell, character, actingPlayerState, bonuses, target = null) {
  if (!spell) return null; // Compute bonuses if not provided
  if (!bonuses) {
    bonuses = getBonusStatsForPlayer(character, actingPlayerState);
  }

  // --- Fire Spells: Base + Fire Power ---
  if (spell.name === 'Fireball' || spell.name === 'Flame Strike') {
    const fireBonus = bonuses.firePower || 0;
    return (spell.damage || 1) + fireBonus;
  }

  // --- Fire Spells: Fire Blast, Scorch (Base + Fire Power / 2) ---
  if (spell.name === 'Fire Blast' || spell.name === 'Scorch') {
    const fireBonus = Math.floor((bonuses.firePower || 0) / 2);
    return 1 + fireBonus;
  }

  // --- Fire Spells: Expend Heat (Base + Fire Power) for AoE damage ---
  if (spell.name === 'Expend Heat') {
    return 1 + (bonuses.firePower || 0);
  }

  // --- Nature Spells: Moonbeam (Base + Nature Power / 2) ---
  if (spell.name === 'Moonbeam') {
    const natureBonus = Math.floor((bonuses.naturePower || 0) / 2);
    return (spell.damage || 1) + natureBonus;
  }

  // --- Nature Spells: Nature's Wrath (Base + Nature Power) ---
  if (spell.name === "Nature's Wrath") {
    return (spell.damage || 1) + (bonuses.naturePower || 0);
  }

  // --- Frost Spells: Base + Frost Power ---
  if (spell.name === 'Cone of Cold' || spell.name === 'Frost Bolt') {
    return (spell.damage || 0) + (bonuses.frostPower || 0);
  }

  // --- Frost Spells: Shatter (Base + Frost Power, double if Frozen) ---
  if (spell.name === 'Shatter') {
    let damage = (spell.damage || 1) + (bonuses.frostPower || 0);

    // Check if target is Frozen for double damage
    if (target && target.state) {
      const frozenDebuff = (target.state.debuffs || []).find((d) => d.type === 'frozen');
      if (frozenDebuff) {
        // Double damage and remove Frozen
        damage *= 2;
        target.state.debuffs = target.state.debuffs.filter((d) => d.type !== 'frozen');
        return {
          damage: damage,
          logMessage: `Shatter! The frozen target takes double damage!`,
        };
      }
    }

    return damage;
  }

  // --- Holy Shock (Versatile): Base + Holy Power ---
  // Always use at least 1 as base effect (in case old saved spells are missing baseEffect)
  if (spell.name === 'Holy Shock') {
    return (spell.baseEffect || 1) + (bonuses.holyPower || 0);
  }

  // --- Bow/Crossbow Spells: Weapon Damage ---
  if (spell.name === 'Split Shot' || spell.name === 'Aim True') {
    const mainHand = character.equipment.mainHand;
    const offHand = character.equipment.offHand;
    // Check mainHand first, then offHand (for one-handed crossbows)
    if (mainHand?.weaponDamage && spell.requires?.weaponType?.includes(mainHand.weaponType)) {
      return mainHand.weaponDamage;
    }
    if (offHand?.weaponDamage && spell.requires?.weaponType?.includes(offHand.weaponType)) {
      return offHand.weaponDamage;
    }
    return spell.damage || 0;
  }

  // --- Rogue Spells: Dagger Damage ---
  if (spell.name === 'Ambush') {
    let totalDaggerDamage = 0;
    ['mainHand', 'offHand'].forEach((hand) => {
      const weapon = character.equipment[hand];
      if (weapon?.weaponType === 'Dagger') {
        totalDaggerDamage += weapon.weaponDamage || 0;
      }
    });
    return totalDaggerDamage;
  }

  // --- Monk Spells: Unarmed Bonus ---
  if (spell.name === 'Punch' || spell.name === 'Kick') {
    let baseDamage = spell.damage || 1;
    const hasMonkTraining = character.equippedSpells.some((s) => s.name === "Monk's Training");
    const isUnarmed = !character.equipment.mainHand && !character.equipment.offHand;
    if (hasMonkTraining && isUnarmed) {
      baseDamage += 1;
    }
    return baseDamage;
  }

  // --- Weapon-Based Spells: MainHand Damage + Bonus ---
  if (spell.name === 'Crushing Blow') {
    return (character.equipment.mainHand?.weaponDamage || 0) + (spell.damageBonus || 0);
  }

  if (spell.name === 'Slash') {
    return character.equipment.mainHand?.weaponDamage || 0;
  }

  if (spell.name === 'Whirlwind') {
    return character.equipment.mainHand?.weaponDamage || 0;
  }

  // --- Dagger Throw: Use highest damage dagger from either hand ---
  if (spell.name === 'Dagger Throw') {
    const mainHand = character.equipment.mainHand;
    const offHand = character.equipment.offHand;
    let bestDaggerDamage = 0;

    if (mainHand?.weaponType === 'Dagger') {
      bestDaggerDamage = Math.max(bestDaggerDamage, mainHand.weaponDamage || 0);
    }
    if (offHand?.weaponType === 'Dagger') {
      bestDaggerDamage = Math.max(bestDaggerDamage, offHand.weaponDamage || 0);
    }

    return bestDaggerDamage + (spell.damageBonus || 0);
  }

  // --- Backstab: Dagger Damage (Double if Stealthed/Target Bleeding) ---
  if (spell.name === 'Backstab') {
    let daggerDamage = 0;
    ['mainHand', 'offHand'].forEach((hand) => {
      const weapon = character.equipment[hand];
      if (weapon?.weaponType === 'Dagger') {
        daggerDamage += weapon.weaponDamage || 0;
      }
    });

    const hasStealthBuff = (actingPlayerState.buffs || []).some((b) => b.type.toLowerCase() === 'stealth');
    let targetBleeding = false;

    // Check target bleed if target provided
    if (target && target.state) {
      targetBleeding = (target.state.debuffs || []).some((d) => d.type.toLowerCase() === 'bleed');
    }

    if (hasStealthBuff || targetBleeding) {
      return {
        damage: daggerDamage * 2,
        debuff: { type: 'bleed', duration: 3, damage: 2, damageType: 'Physical' },
        logMessage: `Backstab bonus! ${hasStealthBuff ? 'From the shadows!' : 'Targeting the wound!'}`,
      };
    }

    return daggerDamage;
  }

  // No special handling - return null to use default spell.damage
  return null;
}
