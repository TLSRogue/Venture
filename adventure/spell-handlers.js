// adventure/spell-handlers.js
import { getBonusStatsForPlayer } from '../utilsHelpers.js';

export const SpellHandlers = {
    'Monk\'s Training': (spell, character, actingPlayerState, log) => {
        const focusAmount = actingPlayerState.focus || 0;
        if (focusAmount > 0) {
            actingPlayerState.health = Math.min(actingPlayerState.maxHealth, actingPlayerState.health + focusAmount);
            const buff = { type: 'Focus', duration: 2, bonus: { rollBonus: focusAmount } };
            // Remove existing focus buff
            const existingIndex = actingPlayerState.buffs.findIndex(b => b.type === buff.type);
            if (existingIndex !== -1) actingPlayerState.buffs.splice(existingIndex, 1);

            actingPlayerState.buffs.push(buff);
            log.push({ message: `${character.characterName} spends ${focusAmount} Focus to heal for ${focusAmount} and gain +${focusAmount} to rolls this turn.`, type: 'heal' });
            actingPlayerState.focus = 0;
            return true; // Effect handled
        } else {
            log.push({ message: `${character.characterName} has no Focus to spend!`, type: 'info' });
            return true; // Handled, even if failed
        }
    },

    'Revive': (spell, character, actingPlayerState, log, targetState) => {
        if (!targetState || !targetState.isDead) { // targetState needs to be the raw state object here usually
            log.push({ message: `${character.characterName} casts ${spell.name}, but there is no valid target!`, type: 'info' });
            return true;
        }

        // Revive logic
        targetState.isDead = false;
        targetState.health = 1;
        targetState.turnEnded = true;
        targetState.buffs = [];
        targetState.debuffs = [];

        log.push({ message: `${character.characterName} casts ${spell.name}!`, type: 'heal' });
        log.push({ message: `${targetState.name} has been revived with 1 HP! [id:${targetState.playerId || targetState.id}]`, type: 'heal' });
        return true;
    },

    'Cleanse': (spell, character, actingPlayerState, log, targetState, bonuses) => {
        if (!targetState) {
            log.push({ message: `${character.characterName} casts ${spell.name}, but there is no valid target!`, type: 'info' });
            return { success: false };
        }

        // Calculate max debuffs to remove: 1 + Holy Power
        const holyPower = bonuses?.holyPower || 0;
        const maxDebuffsToRemove = 1 + holyPower;

        // Get target's debuffs
        const debuffs = targetState.debuffs || [];
        if (debuffs.length === 0) {
            log.push({ message: `${character.characterName} casts ${spell.name} on ${targetState.name}, but there are no debuffs to remove!`, type: 'info' });
            return { success: false };
        }

        // If only one debuff or can cleanse all, auto-cleanse
        if (debuffs.length <= maxDebuffsToRemove) {
            const removedNames = debuffs.map(d => d.type);
            targetState.debuffs = [];
            log.push({ message: `${character.characterName} casts ${spell.name} on ${targetState.name}! [id:${targetState.playerId || targetState.id}]`, type: 'heal' });
            log.push({ message: `Cleansed: ${removedNames.join(', ')}!`, type: 'heal' });
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
                casterName: character.characterName
            }
        };
    }
};

/**
 * Calculates raw damage for spells that have unique scaling or weapon-based logic.
 * This is the single source of truth for special spell damage calculations.
 * 
 * @param {object} spell - The spell being cast
 * @param {object} character - The caster's character data
 * @param {object} actingPlayerState - The caster's combat state
 * @param {object} bonuses - Pre-calculated stat bonuses (optional, will be computed if not provided)
 * @returns {number|null} The calculated base damage, or null for default spell.damage behavior
 */
export function getSpecialSpellDamage(spell, character, actingPlayerState, bonuses = null) {
    // Compute bonuses if not provided
    if (!bonuses) {
        bonuses = getBonusStatsForPlayer(character, actingPlayerState);
    }

    // --- Fire Spells: Base + Fire Power ---
    if (spell.name === 'Fireball' || spell.name === 'Flame Strike') {
        const fireBonus = bonuses.firePower || 0;
        return (spell.damage || 1) + fireBonus;
    }

    // --- Frost Spells: Base + Frost Power ---
    if (spell.name === 'Cone of Cold') {
        return (spell.damage || 0) + (bonuses.frostPower || 0);
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
        ['mainHand', 'offHand'].forEach(hand => {
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
        const hasMonkTraining = character.equippedSpells.some(s => s.name === "Monk's Training");
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

    // No special handling - return null to use default spell.damage
    return null;
}
