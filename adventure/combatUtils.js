// adventure/combatUtils.js

import { getBonusStatsForPlayer } from '../utilsHelpers.js';

/**
 * Calculates the final damage after applying resistances.
 * Works for both Player targets (checking equipment/stats) and NPC targets (checking buffs).
 * * @param {number} baseDamage - The raw damage amount.
 * @param {string} damageType - The type of damage (e.g., 'Physical', 'Fire').
 * @param {object} defenderState - The state object of the defender (PlayerState or ZoneCard/Enemy).
 * @param {object} playersLookup - The global 'players' object from serverState (needed to find player equipment).
 * @returns {object} { finalDamage, resistedAmount, resistance }
 */
export function calculateFinalDamage(baseDamage, damageType, defenderState, playersLookup) {
    let resistance = 0;

    // Determine if the defender is a player.
    // Players in state usually have a 'playerId' property. 
    // In PvP contexts, we might look them up by name if playerId isn't readily on the state object, 
    // but standard PartyMemberStates have playerId.
    const isPlayer = defenderState.playerId || (defenderState.team && playersLookup && playersLookup[defenderState.name]);

    if (damageType === 'Physical') {
        if (isPlayer && playersLookup) {
            // It's a player: Calculate stats from gear + buffs
            const playerObj = playersLookup[defenderState.name];
            // If the player object exists, use it to get full stats (including gear)
            if (playerObj && playerObj.character) {
                const bonuses = getBonusStatsForPlayer(playerObj.character, defenderState);
                resistance = bonuses.physicalResistance || 0;
            }
        } else {
            // It's an NPC/Monster: Check buffs for resistance
            // (e.g. Raging Bull's "Thick Hide")
            if (defenderState.buffs) {
                 const buff = defenderState.buffs.find(b => b.bonus && b.bonus.physicalResistance);
                 if (buff) {
                     resistance = (resistance || 0) + (buff.bonus.physicalResistance || 0);
                 }
            }
        }
    }

    // Future proofing: Add Elemental Resistance logic here later if needed.

    const finalDamage = Math.max(0, baseDamage - resistance);
    const resistedAmount = baseDamage - finalDamage;

    return {
        finalDamage,
        resistedAmount,
        resistance
    };
}