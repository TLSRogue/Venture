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
 * Calculates raw damage for specific spells that have unique scaling logic.
 * Default behavior (base + stat) is handled in combat-core if this returns null.
 */
export function getSpecialSpellDamage(spell, character, actingPlayerState) {
    let baseDamage = null;

    if (spell.name === 'Fireball' || spell.name === 'Flame Strike') {
        const mainHand = character.equipment.mainHand;
        const offHand = character.equipment.offHand;
        let highestFireWeaponDamage = 0;
        if (mainHand?.weaponDamage && mainHand.damageType === 'Fire') {
            highestFireWeaponDamage = mainHand.weaponDamage;
        }
        if (offHand?.weaponDamage && offHand.damageType === 'Fire' && offHand !== mainHand) {
            highestFireWeaponDamage = Math.max(highestFireWeaponDamage, offHand.weaponDamage);
        }
        baseDamage = 1 + highestFireWeaponDamage;
    }
    else if (spell.name === 'Split Shot' || spell.name === 'Aim True') {
        const mainHand = character.equipment.mainHand;
        if (mainHand?.weaponDamage && spell.requires?.weaponType?.includes(mainHand.weaponType)) {
            baseDamage = mainHand.weaponDamage;
        }
    }
    else if (spell.name === 'Ambush') {
        let totalDaggerDamage = 0;
        ['mainHand', 'offHand'].forEach(hand => {
            const weapon = character.equipment[hand];
            if (weapon?.weaponType === 'Dagger') {
                totalDaggerDamage += weapon.weaponDamage || 0;
            }
        });
        baseDamage = totalDaggerDamage;
    }
    else if (spell.name === 'Punch' || spell.name === 'Kick') {
        baseDamage = spell.damage || 1;
        const hasMonkTraining = character.equippedSpells.some(s => s.name === "Monk's Training");
        const isUnarmed = !character.equipment.mainHand && !character.equipment.offHand;
        if (hasMonkTraining && isUnarmed) {
            baseDamage += 1;
        }
    }
    else if (spell.name === 'Crushing Blow' || spell.name === 'Dagger Throw') {
        baseDamage = (character.equipment.mainHand?.weaponDamage || 0) + (spell.damageBonus || 0);
    }

    return baseDamage;
}
