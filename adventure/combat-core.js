// adventure/combat-core.js
/**
 * Shared combat resolution utilities for both PvE and PvP combat.
 * This module eliminates code duplication between the two modes.
 */

import { players, pvpEncounters } from '../serverState.js';
import { getBonusStatsForPlayer } from '../utilsHelpers.js';
import { rollD20 } from '../shared.js';
import { DEFAULT_HIT_TARGET } from '../constants.js';

// --- COMBAT CONTEXT HELPERS ---

/**
 * Get a unified combat context from a party and player.
 * Eliminates the repeated isPvP / encounter lookup boilerplate at the top of every function.
 *
 * @param {object} party - The party object
 * @param {string} playerId - The acting player's socket ID
 * @returns {object} { sharedState, encounter, isPvP, log, actingPlayerState }
 */
export function getCombatContext(party, playerId) {
    const { sharedState } = party;
    const encounter = sharedState.pvpEncounterId
        ? pvpEncounters[sharedState.pvpEncounterId]
        : null;
    const isPvP = !!encounter;
    const log = isPvP ? encounter.log : sharedState.log;
    const actingPlayerState = isPvP
        ? encounter.playerStates.find(p => p.playerId === playerId)
        : sharedState.partyMemberStates.find(p => p.playerId === playerId);

    return { sharedState, encounter, isPvP, log, actingPlayerState };
}

/**
 * Get all hostile targets, normalized.
 * In PVE: all living enemy cards. In PVP: all living enemy-team players.
 *
 * @param {object} sharedState - Party shared state
 * @param {object|null} encounter - PVP encounter (null for PVE)
 * @param {object} actingPlayerState - The acting player's combat state
 * @returns {object[]} Array of normalized targets
 */
export function getHostileTargets(sharedState, encounter, actingPlayerState) {
    if (encounter) {
        return encounter.playerStates
            .filter(p => p.team !== actingPlayerState.team && !p.isDead)
            .map(p => normalizeTarget(sharedState, p.playerId, encounter))
            .filter(Boolean);
    }
    return sharedState.zoneCards
        .map((c, i) => (c && c.type === 'enemy' && c.health > 0) ? normalizeTarget(sharedState, i, null) : null)
        .filter(Boolean);
}

/**
 * Check which reactions a defending player has available.
 * Unifies the duplicated Dodge/Block/Parry/Evasive Shot availability logic
 * from handlePvpReactionCheck, runEnemyPhaseForParty, and Vampire: From The Shadows.
 *
 * @param {object} defendingCharacter - The defending player's character data
 * @param {object} defendingPlayerState - The defending player's combat state
 * @param {object} attackDetails - { attackRange: 'melee'|'ranged', damageType, ... }
 * @param {Array} [log] - Optional log array for messages about prevented reactions
 * @returns {object[]} Array of { name: string } reaction objects
 */
export function getAvailablePlayerReactions(defendingCharacter, defendingPlayerState, attackDetails, log = null) {
    const availableReactions = [];

    // Check for heavy armor (prevents Dodge and Evasive Shot)
    let isWearingHeavy = false;
    if (defendingCharacter.equipment) {
        for (const slot in defendingCharacter.equipment) {
            const item = defendingCharacter.equipment[slot];
            if (item && item.traits && item.traits.includes('Heavy')) {
                isWearingHeavy = true;
                break;
            }
        }
    }

    // --- Dodge ---
    const dodgeSpell = defendingCharacter.equippedSpells?.find(s => s.name === "Dodge");
    if (dodgeSpell && (defendingPlayerState.spellCooldowns[dodgeSpell.name] || 0) <= 0) {
        if (isWearingHeavy) {
            if (log) log.push({ message: `${defendingPlayerState.name} could have Dodged, but their heavy gear prevented it!`, type: 'info' });
        } else {
            availableReactions.push({ name: 'Dodge' });
        }
    }

    // --- Block (Shield) ---
    const shield = defendingCharacter.equipment?.offHand;
    if (shield && shield.type === 'shield' && shield.reaction && (defendingPlayerState.itemCooldowns[shield.name] || 0) <= 0) {
        availableReactions.push({ name: 'Block' });
    }

    // --- Evasive Shot (requires ranged weapon, no heavy armor) ---
    const evasiveShotSpell = defendingCharacter.equippedSpells?.find(s => s.name === "Evasive Shot");
    if (evasiveShotSpell && (defendingPlayerState.spellCooldowns[evasiveShotSpell.name] || 0) <= 0) {
        const mainHand = defendingCharacter.equipment?.mainHand;
        const offHand = defendingCharacter.equipment?.offHand;
        const requiredTypes = evasiveShotSpell.requires?.weaponType || [];
        const hasRangedWeapon = (mainHand && requiredTypes.includes(mainHand.weaponType)) ||
            (offHand && requiredTypes.includes(offHand.weaponType));

        if (hasRangedWeapon) {
            if (isWearingHeavy) {
                if (log) log.push({ message: `${defendingPlayerState.name} could have used Evasive Shot, but their heavy gear prevented it!`, type: 'info' });
            } else {
                availableReactions.push({ name: 'Evasive Shot' });
            }
        }
    }

    // --- Parry (requires melee weapon, melee attack only) ---
    const parrySpell = defendingCharacter.equippedSpells?.find(s => s.name === "Parry");
    if (parrySpell && (defendingPlayerState.spellCooldowns[parrySpell.name] || 0) <= 0) {
        const isMeleeAttack = attackDetails.attackRange === 'melee';
        const mainHand = defendingCharacter.equipment?.mainHand;
        const rangedWeaponTypes = ['Two-Hand Bow', 'Two-Hand Staff'];
        const hasMeleeWeapon = mainHand && mainHand.type === 'weapon' &&
            (mainHand.range === 'melee' || (!mainHand.range && !rangedWeaponTypes.includes(mainHand.weaponType)));

        if (isMeleeAttack && hasMeleeWeapon) {
            availableReactions.push({ name: 'Parry' });
        } else if (isMeleeAttack && !hasMeleeWeapon) {
            if (log) log.push({ message: `${defendingPlayerState.name} could have Parried, but needs a melee weapon!`, type: 'info' });
        }
    }

    return availableReactions;
}

// --- TARGET NORMALIZATION ---

/**
 * Factory function to create a unified target wrapper with common methods.
 * This eliminates code duplication across PvP players, PvE players, and enemies.
 * 
 * @param {object} state - The underlying state object (player state or enemy card)
 * @param {object} options - Configuration for this target type
 * @returns {object} Normalized target with unified interface
 */
function createTargetWrapper(state, options) {
    const {
        isPvP = false,
        isPlayer = false,
        id,
        name,
        character = null,
        team = null,
        cardIndex = null,
        getResistanceImpl = () => 0
    } = options;

    // Ensure buffs/debuffs arrays exist
    if (!state.buffs) state.buffs = [];
    if (!state.debuffs) state.debuffs = [];

    return {
        isPvP,
        isPlayer,
        id,
        name,
        state,
        character,
        health: state.health,
        maxHealth: state.maxHealth || state.health,
        buffs: state.buffs,
        debuffs: state.debuffs,
        team,
        cardIndex,

        applyDamage: (amount) => {
            applyDamage(state, amount);
        },

        applyDebuff: (debuff) => {
            const existingIndex = state.debuffs.findIndex(d => d.type === debuff.type);
            if (existingIndex !== -1) state.debuffs.splice(existingIndex, 1);
            state.debuffs.push({ ...debuff });
        },

        applyBuff: (buff) => {
            const existingIndex = state.buffs.findIndex(b => b.type === buff.type);
            if (existingIndex !== -1) state.buffs.splice(existingIndex, 1);
            state.buffs.push({ ...buff });
        },

        heal: (amount) => {
            const max = state.maxHealth || state.health + amount;
            state.health = Math.min(max, state.health + amount);
        },

        isDead: () => state.health <= 0 || state.isDead,

        getResistance: getResistanceImpl
    };
}

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

        return createTargetWrapper(playerState, {
            isPvP: true,
            isPlayer: true,
            id: playerState.playerId,
            name: playerState.name,
            character,
            team: playerState.team,
            getResistanceImpl: (damageType) => {
                if (damageType === 'Physical' && character) {
                    const bonuses = getBonusStatsForPlayer(character, playerState);
                    return bonuses.physicalResistance || 0;
                }
                return 0;
            }
        });
    }

    // PvE: Check for Party Member (pX)
    if (typeof targetIndex === 'string' && targetIndex.startsWith('p')) {
        const idx = parseInt(targetIndex.substring(1));
        const memberState = sharedState.partyMemberStates[idx];

        if (memberState) {
            return createTargetWrapper(memberState, {
                isPvP: false,
                isPlayer: true,
                id: memberState.playerId,
                name: memberState.name,
                getResistanceImpl: (damageType) => {
                    if (damageType === 'Physical') {
                        const buff = memberState.buffs?.find(b => b.bonus?.physicalResistance);
                        return buff ? buff.bonus.physicalResistance : 0;
                    }
                    return 0;
                }
            });
        }
    }

    // PvE: target is an enemy card
    const enemy = sharedState.zoneCards[targetIndex];
    if (!enemy || enemy.type !== 'enemy') return null;

    return createTargetWrapper(enemy, {
        isPvP: false,
        isPlayer: false,
        id: enemy.id,
        name: enemy.name,
        cardIndex: targetIndex,
        getResistanceImpl: (damageType) => {
            if (damageType === 'Physical') {
                // Check for base resistance + buff resistance
                const baseResistance = enemy.physicalResistance || 0;
                const buffResistance = enemy.buffs?.find(b => b.bonus?.physicalResistance)?.bonus.physicalResistance || 0;
                return baseResistance + buffResistance;
            }
            return 0;
        }
    });
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

        return createTargetWrapper(playerState, {
            isPvP: true,
            isPlayer: true,
            id: playerState.playerId,
            name: playerState.name
        });
    }

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

    return createTargetWrapper(memberState, {
        isPvP: false,
        isPlayer: true,
        id: memberState.playerId,
        name: memberState.name
    });
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
export function resolveAttackRoll(actingPlayerState, character, target, stat, hitTarget = DEFAULT_HIT_TARGET) {
    const modifiers = calculateRollModifiers(actingPlayerState, character, target, stat);
    const roll = rollD20();
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
 * @param {object} weapon - The weapon being used
 * @param {object} target - The target of the attack
 * @param {object} bonuses - Optional player bonuses (for power bonuses from gems)
 */
export function calculateWeaponDamage(weapon, target, bonuses = {}) {
    let baseDamage = weapon.weaponDamage || 0;
    const damageType = weapon.damageType || 'Physical';

    // Add power bonus based on damage type
    const powerBonusKey = damageType.toLowerCase() + 'Power';
    const powerBonus = bonuses[powerBonusKey] || 0;
    baseDamage += powerBonus;

    const resistance = target.getResistance(damageType);
    const finalDamage = Math.max(0, baseDamage - resistance);

    return {
        baseDamage,
        damageType,
        powerBonus,
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
 * Returns object with applied damage and whether Flame Shield was triggered.
 */
export function applyDamage(targetState, amount, options = {}) {
    if (!targetState) return { applied: amount, flameShieldTriggered: false };
    if (!targetState.buffs) targetState.buffs = [];

    let flameShieldTriggered = false;
    let flameShieldBurn = null;

    // Handle Flame Shield (Fire Barrier)
    const flameShieldIndex = targetState.buffs.findIndex(b => b.type === 'Flame Shield');
    if (flameShieldIndex !== -1) {
        const barrier = targetState.buffs[flameShieldIndex];
        const absorbed = Math.min(amount, barrier.value || 0);

        // Update barrier value
        barrier.value = (barrier.value || 0) - absorbed;
        amount -= absorbed;

        // Mark that Flame Shield was triggered (for burn-on-melee)
        if (absorbed > 0) {
            flameShieldTriggered = true;
            flameShieldBurn = barrier.burnOnMelee;
        }

        // Remove barrier if depleted
        if (barrier.value <= 0) {
            targetState.buffs.splice(flameShieldIndex, 1);
        }
    }

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

    // Handle Ice Barrier
    const iceBarrierIndex = targetState.buffs.findIndex(b => b.type === 'Ice Barrier');
    if (iceBarrierIndex !== -1) {
        const barrier = targetState.buffs[iceBarrierIndex];
        const absorbed = Math.min(amount, barrier.value || 0);

        // Update barrier value
        barrier.value = (barrier.value || 0) - absorbed;
        amount -= absorbed;

        // Remove barrier if depleted
        if (barrier.value <= 0) {
            targetState.buffs.splice(iceBarrierIndex, 1);
        }
    }

    // Apply remaining damage to health
    if (amount > 0) {
        targetState.health -= amount;
    }

    return { applied: amount, flameShieldTriggered, flameShieldBurn };
}

// --- BOSS MECHANIC HELPERS ---

/**
 * Check if Vexor dodges behind a Stone Column.
 * Returns true if the attack was dodged, false otherwise.
 * @param {object} target - The normalized target
 * @param {object} sharedState - Party shared state
 * @param {Array} log - Log array to push messages to
 * @returns {boolean} True if attack was dodged
 */
export function checkVexorDodge(target, sharedState, log) {
    if (target.name !== 'Vexor, Lord of the Arena') return false;

    const columns = sharedState.zoneCards.filter(c => c && c.name === 'Stone Column');
    if (columns.length > 0 && rollD20() >= 10) {
        log.push({ message: `Vexor, Lord of the Arena's Dodge: Jumps behind a Stone Column! Avoided!`, type: 'reaction' });
        log.push({ message: `(Tip: Destroy the Stone Columns!)`, type: 'info' });
        return true;
    }
    return false;
}

/**
 * Check if Vampire should spawn the Vampire's Assistant at 60HP threshold.
 * @param {object} target - The normalized target  
 * @param {object} sharedState - Party shared state
 * @param {object} gameData - Game data containing special cards
 * @param {Array} log - Log array to push messages to
 */
export function checkVampirePhaseTransition(target, sharedState, gameData, log) {
    if (target.name !== 'Vampire') return;
    if (!target.state || target.state.health > 60 || target.state.health <= 0) return;
    if (target.state.phaseTriggered) return;

    target.state.phaseTriggered = true;

    // Find a slot for the assistant
    let emptySlotIndex = sharedState.zoneCards.findIndex(c => c === null);
    if (emptySlotIndex === -1) {
        // Try to overwrite an area card
        emptySlotIndex = sharedState.zoneCards.findIndex(c => c && (c.type === 'area' || c.name === 'Mansion Hall'));
    }

    if (emptySlotIndex !== -1) {
        const assistant = {
            ...gameData.specialCards.vampireAssistant,
            id: Date.now(),
            debuffs: [],
            buffs: []
        };
        sharedState.zoneCards[emptySlotIndex] = assistant;
        log.push({ message: `The Vampire hisses in fury! "Assist me, minion!" A Vampire's Assistant emerges from the shadows!`, type: 'reaction' });
    }
}

// --- DOT PROCESSING ---

/**
 * Apply damage-over-time effects to a state object (player or enemy).
 * Processes ALL matching debuffs of each type to support stacking.
 * 
 * @param {Object} state - The state object with health, debuffs, and name
 * @param {Array} log - The log array to push messages to
 * @returns {boolean} True if any damage was dealt
 */
export function applyDoTEffects(state, log) {
    if (state.isDead || state.health <= 0) return false;
    let tookDamage = false;

    const dotTypes = ['bleed', 'burn', 'poison', 'entangling roots'];

    dotTypes.forEach(type => {
        const matchingDebuffs = (state.debuffs || []).filter(d => d.type.toLowerCase() === type);
        matchingDebuffs.forEach(debuff => {
            applyDamage(state, debuff.damage);
            const typeName = type.charAt(0).toUpperCase() + type.slice(1);
            const dmgType = debuff.damageType || (type === 'burn' ? 'Fire' : (type === 'poison' ? 'Nature' : 'Physical'));
            log.push({ message: `${state.name} takes ${debuff.damage} ${dmgType} damage from ${typeName}.`, type: 'damage' });
            tookDamage = true;
        });
    });

    return tookDamage;
}

// --- CHILL/FROZEN SYSTEM ---

/**
 * Apply Chill stacks to a target. Chill stacks up - at 10 stacks, converts to Frozen.
 * @param {Object} targetState - Target state object with debuffs array
 * @param {number} amount - Number of Chill stacks to add
 * @param {Array} log - Log array to push messages to
 * @returns {string} 'frozen' if converted to Frozen, 'chill' otherwise
 */
export function applyChillStack(targetState, amount, log) {
    if (!targetState.debuffs) targetState.debuffs = [];

    // Check for existing Chill
    const existingChill = targetState.debuffs.find(d => d.type === 'chill');

    if (existingChill) {
        existingChill.stacks = (existingChill.stacks || 1) + amount;

        // Convert to Frozen at 10 stacks
        if (existingChill.stacks >= 10) {
            targetState.debuffs = targetState.debuffs.filter(d => d.type !== 'chill');
            targetState.debuffs.push({ type: 'frozen', duration: 1 });
            log.push({ message: `${targetState.name} is Frozen solid!`, type: 'damage' });
            return 'frozen';
        }
        log.push({ message: `${targetState.name}'s Chill increased to ${existingChill.stacks}!`, type: 'info' });
    } else {
        targetState.debuffs.push({ type: 'chill', stacks: amount, duration: 999 }); // Duration managed by stacks
        log.push({ message: `${targetState.name} is Chilled (${amount})!`, type: 'info' });
    }
    return 'chill';
}

/**
 * Process Chill reduction at end of turn. Chill reduces by 1 stack per turn.
 * @param {Object} state - State object with debuffs array
 * @param {Array} log - Log array to push messages to
 */
export function processChillReduction(state, log) {
    if (!state.debuffs) return;

    const chill = state.debuffs.find(d => d.type === 'chill');
    if (chill) {
        chill.stacks = Math.max(0, (chill.stacks || 1) - 1);
        if (chill.stacks <= 0) {
            state.debuffs = state.debuffs.filter(d => d.type !== 'chill');
            log.push({ message: `${state.name}'s Chill has worn off.`, type: 'info' });
        }
    }
}

// --- ENEMY REACTION SYSTEM ---

/**
 * Check if an enemy can use a reaction against an incoming attack.
 * If successful, the attack is either negated (with counter-damage) or blocked (damage reduced).
 * 
 * @param {object} enemy - The enemy card that might react
 * @param {string} attackType - 'melee', 'ranged', or 'magic' - the type of incoming attack
 * @param {object} attackerPlayerState - The attacking player's combat state
 * @param {Array} log - The log array to push messages to
 * @returns {object} { reacted: boolean, negated: boolean, blockAmount: number, counterDamage: number, counterDamageType: string }
 */
export function checkEnemyReaction(enemy, attackTypeInput, attackerPlayerState, log) {
    const result = { reacted: false, negated: false, blockAmount: 0, counterDamage: 0, counterDamageType: 'Physical' };

    // Check for Time Stop
    if (enemy.debuffs && enemy.debuffs.some(d => d.type === 'Time Stop')) {
        return result;
    }

    // Check if enemy has reactions defined
    if (!enemy.reactions || enemy.reactions.length === 0) {
        return result;
    }

    // Normalize incoming attack types to array
    const incomingTypes = Array.isArray(attackTypeInput) ? attackTypeInput : [attackTypeInput];

    // Initialize reaction cooldowns if not present
    if (!enemy.reactionCooldowns) {
        enemy.reactionCooldowns = {};
    }

    // Find an available reaction that matches the attack type
    for (const reaction of enemy.reactions) {
        // Check if the reaction triggers on any of the incoming types
        const reactionTriggers = Array.isArray(reaction.triggerOn) ? reaction.triggerOn : [reaction.triggerOn];

        // Check intersection: Does any incoming type match any reaction trigger?
        const hasMatch = incomingTypes.some(type => reactionTriggers.includes(type));

        if (!hasMatch) {
            continue;
        }

        // Check cooldown
        const cooldownRemaining = enemy.reactionCooldowns[reaction.name] || 0;
        if (cooldownRemaining > 0) {
            continue;
        }

        // Found a valid reaction - trigger it!
        result.reacted = true;

        // Set cooldown for this reaction
        enemy.reactionCooldowns[reaction.name] = reaction.cooldown;

        // Roll D20 for the reaction
        const roll = rollD20();
        const isSuccess = roll >= reaction.roll;

        const rollColor = isSuccess ? '#2ecc71' : '#e74c3c';
        const rollDisplay = `<span style="color:${rollColor}">🎲${roll}</span>`;

        if (isSuccess) {
            // Check if this is a block-style reaction (damage reduction) or negate-style (full parry)
            if (reaction.blockAmount) {
                // Block-style: reduces damage by blockAmount
                result.blockAmount = reaction.blockAmount;
                log.push({
                    message: `${enemy.name}'s ${reaction.name}: ${rollDisplay} ${reaction.message}`,
                    type: 'reaction'
                });
            } else {
                // Negate-style: full parry with counter-damage
                result.negated = true;
                result.counterDamage = reaction.damage || 0;
                result.counterDamageType = reaction.damageType || 'Physical';
                log.push({
                    message: `${enemy.name}'s ${reaction.name}: ${rollDisplay} ${reaction.message}`,
                    type: 'reaction'
                });
            }
        } else {
            log.push({
                message: `${enemy.name}'s ${reaction.name}: ${rollDisplay} Failed!`,
                type: 'info'
            });
        }

        // Only one reaction per attack, so break here
        break;
    }

    return result;
}

/**
 * Decrement enemy reaction cooldowns at end of turn.
 * Should be called during enemy end-of-turn processing.
 * 
 * @param {object} enemy - The enemy card
 */
export function decrementEnemyReactionCooldowns(enemy) {
    if (!enemy.reactionCooldowns) return;

    for (const reactionName in enemy.reactionCooldowns) {
        if (enemy.reactionCooldowns[reactionName] > 0) {
            enemy.reactionCooldowns[reactionName]--;
        }
    }
}

/**
 * Process shared end-of-turn effects for any combatant (player or enemy).
 * Handles: DoT damage → Chill reduction → Buff/Debuff duration decrement.
 * 
 * This unifies the duplicated logic from:
 * - processPvpPlayerEndTurn (pvp-state.js)
 * - processPlayerEndTurn (adventure-state.js)
 * 
 * Note: Death handling and context-specific effects (Rejuvenate, threat, etc.)
 * remain in the callers since they require different logic per context.
 * 
 * @param {object} state - The combatant state (player or enemy)
 * @param {Array} log - The log array for messages
 * @returns {boolean} True if DoT damage was dealt
 */
export function processEndOfTurnEffects(state, log) {
    // 1. Apply DoT damage
    const tookDamage = applyDoTEffects(state, log);

    // 2. Process Chill reduction
    processChillReduction(state, log);

    // 3. Decrement buff/debuff durations
    if (state.buffs) {
        state.buffs.forEach(b => b.duration--);
        state.buffs = state.buffs.filter(b => b.duration > 0);
    }
    if (state.debuffs) {
        state.debuffs.forEach(d => d.duration--);
        state.debuffs = state.debuffs.filter(d => d.duration > 0);
    }

    return tookDamage;
}
