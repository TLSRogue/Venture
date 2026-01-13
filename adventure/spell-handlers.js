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
    if (spell.name === 'Holy Shock') {
        return (spell.baseEffect || 0) + (bonuses.holyPower || 0);
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
    if (spell.name === 'Crushing Blow' || spell.name === 'Dagger Throw') {
        return (character.equipment.mainHand?.weaponDamage || 0) + (spell.damageBonus || 0);
    }

    // No special handling - return null to use default spell.damage
    return null;
}
