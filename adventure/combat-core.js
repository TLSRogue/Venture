// adventure/combat-core.js
/**
 * Shared combat resolution utilities for both PvE and PvP combat.
 * This module eliminates code duplication between the two modes.
 */

import { players, pvpEncounters } from '../serverState.js';
import { getBonusStatsForPlayer } from '../utilsHelpers.js';

// --- TARGET NORMALIZATION ---
// These functions create a unified interface for both enemy cards and player states

/**
 * Normalize a target (enemy or player) into a common interface.
 * @param {object} sharedState - The party's shared state
 * @param {string|number} targetIndex - The target identifier
 * @param {object} encounter - The PvP encounter (null for PvE)
 * @returns {object} Normalized target with unified interface
 */
export function normalizeTarget(sharedState, targetIndex, encounter) {
    if (encounter) {
        // PvP: target is a player state
        const playerState = encounter.playerStates.find(p => p.playerId === targetIndex);
        if (!playerState) return null;

        const playerObj = players[playerState.name];
        const character = playerObj?.character;

        return {
            isPvP: true,
            isPlayer: true,
            id: playerState.playerId,
            name: playerState.name,
            state: playerState,
            character: character,
            health: playerState.health,
            maxHealth: playerState.maxHealth,
            buffs: playerState.buffs,
            debuffs: playerState.debuffs,
            team: playerState.team,
            // Unified damage application
            applyDamage: (amount) => {
                applyDamage(playerState, amount);
            },
            applyDebuff: (debuff) => {
                const existingIndex = playerState.debuffs.findIndex(d => d.type === debuff.type);
                if (existingIndex !== -1) playerState.debuffs.splice(existingIndex, 1);
                playerState.debuffs.push({ ...debuff });
            },
            applyBuff: (buff) => {
                const existingIndex = playerState.buffs.findIndex(b => b.type === buff.type);
                if (existingIndex !== -1) playerState.buffs.splice(existingIndex, 1);
                playerState.buffs.push({ ...buff });
            },
            heal: (amount) => {
                playerState.health = Math.min(playerState.maxHealth, playerState.health + amount);
            },
            isDead: () => playerState.health <= 0,
            getResistance: (damageType) => {
                if (damageType === 'Physical' && character) {
                    const bonuses = getBonusStatsForPlayer(character, playerState);
                    return bonuses.physicalResistance || 0;
                }
                return 0;
            }
        };
    } else {
        // PvE
        // Check for Party Member (pX)
        if (typeof targetIndex === 'string' && targetIndex.startsWith('p')) {
            const idx = parseInt(targetIndex.substring(1));
            const memberState = sharedState.partyMemberStates[idx];

            if (memberState) {
                return {
                    isPvP: false,
                    isPlayer: true,
                    id: memberState.playerId,
                    name: memberState.name,
                    state: memberState,
                    character: null, // character data not always readily available in sharedState without lookup, but usually not needed for target reception
                    health: memberState.health,
                    maxHealth: memberState.maxHealth,
                    buffs: memberState.buffs,
                    debuffs: memberState.debuffs,
                    team: null,
                    applyDamage: (amount) => {
                        memberState.health = Math.max(0, memberState.health - amount);
                    },
                    applyDebuff: (debuff) => {
                        const existingIndex = memberState.debuffs.findIndex(d => d.type === debuff.type);
                        if (existingIndex !== -1) memberState.debuffs.splice(existingIndex, 1);
                        memberState.debuffs.push({ ...debuff });
                    },
                    applyBuff: (buff) => {
                        const existingIndex = memberState.buffs.findIndex(b => b.type === buff.type);
                        if (existingIndex !== -1) memberState.buffs.splice(existingIndex, 1);
                        memberState.buffs.push({ ...buff });
                    },
                    heal: (amount) => {
                        memberState.health = Math.min(memberState.maxHealth, memberState.health + amount);
                    },
                    isDead: () => memberState.health <= 0 || memberState.isDead,
                    getResistance: (damageType) => {
                        // PvE players might have resistance buffs
                        if (damageType === 'Physical') {
                            const buff = memberState.buffs?.find(b => b.bonus?.physicalResistance);
                            return buff ? buff.bonus.physicalResistance : 0;
                        }
                        return 0;
                    }
                };
            }
        }

        // PvE: target is an enemy card
        const enemy = sharedState.zoneCards[targetIndex];
        if (!enemy || enemy.type !== 'enemy') return null;

        return {
            isPvP: false,
            isPlayer: false,
            id: enemy.id,
            name: enemy.name,
            state: enemy,
            character: null,
            health: enemy.health,
            maxHealth: enemy.maxHealth || enemy.health,
            buffs: enemy.buffs || [],
            debuffs: enemy.debuffs || [],
            team: null,
            cardIndex: targetIndex,
            applyDamage: (amount) => {
                applyDamage(enemy, amount);
            },
            applyDebuff: (debuff) => {
                if (!enemy.debuffs) enemy.debuffs = [];
                const existingIndex = enemy.debuffs.findIndex(d => d.type === debuff.type);
                if (existingIndex !== -1) enemy.debuffs.splice(existingIndex, 1);
                enemy.debuffs.push({ ...debuff });
            },
            applyBuff: (buff) => {
                if (!enemy.buffs) enemy.buffs = [];
                const existingIndex = enemy.buffs.findIndex(b => b.type === buff.type);
                if (existingIndex !== -1) enemy.buffs.splice(existingIndex, 1);
                enemy.buffs.push({ ...buff });
            },
            heal: (amount) => {
                const max = enemy.maxHealth || enemy.health + amount;
                enemy.health = Math.min(max, enemy.health + amount);
            },
            isDead: () => enemy.health <= 0,
            getResistance: (damageType) => {
                if (damageType === 'Physical') {
                    return enemy.buffs?.find(b => b.bonus?.physicalResistance)?.bonus.physicalResistance || 0;
                }
                return 0;
            }
        };
    }
}

/**
 * Normalize a friendly target (party member or self).
 */
export function normalizeFriendlyTarget(sharedState, targetIndex, actingPlayerId, encounter) {
    if (encounter) {
        // PvP: Find player state
        let playerState;
        if (targetIndex === 'player' || targetIndex === actingPlayerId) {
            playerState = encounter.playerStates.find(p => p.playerId === actingPlayerId);
        } else {
            playerState = encounter.playerStates.find(p => p.playerId === targetIndex);
        }
        if (!playerState) return null;

        return {
            isPvP: true,
            isPlayer: true,
            id: playerState.playerId,
            name: playerState.name,
            state: playerState,
            health: playerState.health,
            maxHealth: playerState.maxHealth,
            buffs: playerState.buffs,
            debuffs: playerState.debuffs,
            heal: (amount) => {
                playerState.health = Math.min(playerState.maxHealth, playerState.health + amount);
            },
            applyBuff: (buff) => {
                const existingIndex = playerState.buffs.findIndex(b => b.type === buff.type);
                if (existingIndex !== -1) playerState.buffs.splice(existingIndex, 1);
                playerState.buffs.push({ ...buff });
            },
            isDead: () => playerState.isDead
        };
    } else {
        // PvE: Party member state
        let memberState;
        if (targetIndex === 'player') {
            memberState = sharedState.partyMemberStates.find(p => p.playerId === actingPlayerId);
        } else if (typeof targetIndex === 'string' && targetIndex.startsWith('p')) {
            const idx = parseInt(targetIndex.substring(1));
            memberState = sharedState.partyMemberStates[idx];
        } else {
            memberState = sharedState.partyMemberStates.find(p => p.playerId === targetIndex);
        }
        if (!memberState) return null;

        return {
            isPvP: false,
            isPlayer: true,
            id: memberState.playerId,
            name: memberState.name,
            state: memberState,
            health: memberState.health,
            maxHealth: memberState.maxHealth,
            buffs: memberState.buffs,
            debuffs: memberState.debuffs,
            heal: (amount) => {
                memberState.health = Math.min(memberState.maxHealth, memberState.health + amount);
            },
            applyBuff: (buff) => {
                const existingIndex = memberState.buffs.findIndex(b => b.type === buff.type);
                if (existingIndex !== -1) memberState.buffs.splice(existingIndex, 1);
                memberState.buffs.push({ ...buff });
            },
            isDead: () => memberState.isDead
        };
    }
}

// --- COMBAT ROLL RESOLUTION ---

/**
 * Calculate all modifiers for an attack roll.
 * @param {object} actingPlayerState - The attacking player's combat state
 * @param {object} character - The attacking player's character data
 * @param {object} target - Normalized target
 * @param {string} stat - The stat to use for the roll (e.g., 'strength')
 * @returns {object} Roll modifiers breakdown
 */
export function calculateRollModifiers(actingPlayerState, character, target, stat) {
    const bonuses = getBonusStatsForPlayer(character, actingPlayerState);
    const statValue = (character[stat] || 0) + (bonuses[stat] || 0);

    // Daze penalty
    const dazeDebuff = actingPlayerState.debuffs.find(d => d.type === 'daze');
    const dazeModifier = dazeDebuff ? -3 : 0;

    // Focus bonus
    const focusBuff = actingPlayerState.buffs.find(b => b.type === 'Focus');
    const focusModifier = focusBuff ? (focusBuff.bonus?.rollBonus || 0) : 0;

    // Stealth penalty (only applies when attacking a stealthed target)
    let stealthModifier = 0;
    if (target && target.buffs) {
        const stealthBuff = target.buffs.find(b => b.type === 'Stealth');
        stealthModifier = stealthBuff ? -5 : 0;
    }

    return {
        statValue,
        dazeModifier,
        focusModifier,
        stealthModifier,
        total: statValue + dazeModifier + focusModifier + stealthModifier
    };
}

/**
 * Perform an attack roll with all modifiers applied.
 * @returns {object} { roll, total, isHit, isCriticalHit, isCriticalFail, rollDisplay }
 */
export function resolveAttackRoll(actingPlayerState, character, target, stat, hitTarget = 15) {
    const modifiers = calculateRollModifiers(actingPlayerState, character, target, stat);
    const roll = Math.floor(Math.random() * 20) + 1;
    const total = roll + modifiers.total;

    const isCriticalFail = roll === 1;
    const isCriticalHit = roll === 20;
    const isHit = !isCriticalFail && total >= hitTarget;

    const rollColor = isHit ? '#2ecc71' : '#e74c3c';
    const rollDisplay = `<span style="color:${rollColor}">🎲${roll}</span>`;

    return {
        roll,
        total,
        isHit,
        isCriticalHit,
        isCriticalFail,
        rollDisplay,
        modifiers
    };
}

// --- DAMAGE CALCULATION ---

/**
 * Calculate weapon damage with resistance applied.
 */
export function calculateWeaponDamage(weapon, target) {
    let baseDamage = weapon.weaponDamage || 0;
    const damageType = weapon.damageType || 'Physical';
    const resistance = target.getResistance(damageType);
    const finalDamage = Math.max(0, baseDamage - resistance);

    return {
        baseDamage,
        damageType,
        resistance,
        finalDamage,
        resisted: baseDamage - finalDamage
    };
}

/**
 * Calculate spell damage with all special spell effects.
 */
export function calculateSpellDamage(spell, character, actingPlayerState, target) {
    let baseDamage = spell.damage || 0;
    const damageType = spell.damageType || 'Magic';

    // Special spell damage calculations
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
        const hasMonkTraining = character.equippedSpells.some(s => s.name === "Monk's Training");
        const isUnarmed = !character.equipment.mainHand && !character.equipment.offHand;
        if (hasMonkTraining && isUnarmed) {
            baseDamage += 1;
        }
    }
    else if (spell.name === 'Crushing Blow') {
        baseDamage = (character.equipment.mainHand?.weaponDamage || 0) + (spell.damageBonus || 0);
    }
    else if (spell.baseEffect) {
        // Versatile spells use baseEffect + stat
        const bonuses = getBonusStatsForPlayer(character, actingPlayerState);
        const stat = Array.isArray(spell.stat) ? spell.stat[0] : spell.stat;
        const statValue = (character[stat] || 0) + (bonuses[stat] || 0);
        baseDamage = spell.baseEffect + statValue;
    }

    const resistance = target.getResistance(damageType);
    const finalDamage = Math.max(0, baseDamage - resistance);

    return {
        baseDamage,
        damageType,
        resistance,
        finalDamage,
        resisted: baseDamage - finalDamage
    };
}

// --- DEBUFF/BUFF HANDLING ---

/**
 * Get the debuff to apply from a weapon (onHit or onCrit).
 */
export function getWeaponDebuff(weapon, isCriticalHit) {
    if (isCriticalHit && weapon.onCrit?.debuff) {
        return weapon.onCrit.debuff;
    }
    if (weapon.onHit?.debuff) {
        return weapon.onHit.debuff;
    }
    return null;
}

/**
 * Check if player gains focus from Monk abilities.
 */
export function checkMonkFocusGain(character, actingPlayerState, log) {
    const hasMonkTraining = character.equippedSpells.some(s => s.name === "Monk's Training");
    const isUnarmed = !character.equipment.mainHand && !character.equipment.offHand;

    if (hasMonkTraining && isUnarmed) {
        if ((actingPlayerState.focus || 0) < 3) {
            actingPlayerState.focus = (actingPlayerState.focus || 0) + 1;
            return true;
        }
    }
    return false;
}

// --- SPELL REQUIREMENT CHECKS ---

/**
 * Check if a spell's weapon requirements are met.
 */
export function checkSpellRequirements(spell, character) {
    if (!spell.requires?.weaponType) return true;

    const mainHand = character.equipment.mainHand;
    const offHand = character.equipment.offHand;

    const hasRequiredWeapon = (hand) => {
        if (!hand) return false;
        return Array.isArray(spell.requires.weaponType) &&
            spell.requires.weaponType.includes(hand.weaponType);
    };

    if (spell.requires.hand) {
        return hasRequiredWeapon(character.equipment[spell.requires.hand]);
    }

    return hasRequiredWeapon(mainHand) || hasRequiredWeapon(offHand);
}

// --- LOG HELPERS ---

/**
 * Get the log object for either PvP encounter or PvE shared state.
 */
export function getLog(sharedState, encounter) {
    return encounter ? encounter.log : sharedState.log;
}

/**
 * Push a message to the appropriate log.
 */
export function pushLog(sharedState, encounter, message, type = 'info') {
    const log = getLog(sharedState, encounter);
    log.push({ message, type });
}

/**
 * Apply damage to a target state, handling barriers/shields.
 */
export function applyDamage(targetState, amount) {
    if (!targetState) return amount;
    if (!targetState.buffs) targetState.buffs = [];

    // Handle Magic Barrier
    const barrierIndex = targetState.buffs.findIndex(b => b.type === 'Magic Barrier');
    if (barrierIndex !== -1) {
        const barrier = targetState.buffs[barrierIndex];
        const absorbed = Math.min(amount, barrier.value || 0);

        // Update barrier value
        barrier.value = (barrier.value || 0) - absorbed;
        amount -= absorbed;

        // Remove barrier if depleted
        if (barrier.value <= 0) {
            targetState.buffs.splice(barrierIndex, 1);
        }
    }

    // Apply remaining damage to health
    if (amount > 0) {
        targetState.health -= amount;
    }

    return amount; // Return remaining damage (if any) or amount applied
}
