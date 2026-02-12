// adventure/reaction-handlers.js
/**
 * Handles player reaction resolution (Dodge, Block, Parry, Evasive Shot).
 * Called when a player responds to an enemy attack prompt.
 */

import { players, parties, pvpEncounters } from '../serverState.js';
import { broadcastAdventureUpdate } from '../utilsBroadcast.js';
import { getBonusStatsForPlayer } from '../utilsHelpers.js';
import { applyDamage } from './combat-core.js';
import {
    handlePvpPlayerDeath,
    checkPvpWinCondition,
    endPvpEncounter,
    startNextPvpTeamTurn
} from './pvp-state.js';
import { INVENTORY_SIZE } from '../constants.js';

// Forward declaration - will be set by adventure-state.js to avoid circular dependency
let defeatEnemyInPartyFn = null;
let runEnemyPhaseForPartyFn = null;

/**
 * Set the functions that handle enemy defeat and phase processing.
 * Called by adventure-state.js to avoid circular imports.
 */
export function setReactionDependencies(defeatFn, runPhaseFn) {
    defeatEnemyInPartyFn = defeatFn;
    runEnemyPhaseForPartyFn = runPhaseFn;
}

/**
 * Handle reaction resolution when a player responds to an attack.
 */
export async function handleResolveReaction(io, socket, payload) {
    const name = socket.characterName;
    const player = players[name];
    if (!player) return;
    let party = parties[player.character.partyId];
    if (!party || !party.sharedState) return;
    const isPvp = !!party.sharedState.pvpEncounterId;
    const encounter = isPvp ? pvpEncounters[party.sharedState.pvpEncounterId] : null;
    const stateObject = isPvp ? encounter : party.sharedState;
    if (!stateObject || !stateObject.pendingReaction) return;
    const reaction = stateObject.pendingReaction;
    if (reaction.targetName !== name) return;
    if (stateObject.reactionTimeout) {
        clearTimeout(stateObject.reactionTimeout);
        stateObject.reactionTimeout = null;
    }
    const { reactionType } = payload;
    const reactingPlayerState = isPvp ? encounter.playerStates.find(p => p.name === name) : party.sharedState.partyMemberStates.find(p => p.name === name);
    const reactingPlayer = players[name];
    let finalDamage = reaction.damage;
    let dodged = false;
    let blocked = false;
    let logMessage = '';

    if (reactionType === 'Dodge') {
        const dodgeSpell = reactingPlayer.character.equippedSpells.find(s => s.name === "Dodge");
        if (dodgeSpell && (reactingPlayerState.spellCooldowns[dodgeSpell.name] || 0) <= 0) {
            reactingPlayerState.spellCooldowns[dodgeSpell.name] = dodgeSpell.cooldown;
            const bonuses = getBonusStatsForPlayer(reactingPlayer.character, reactingPlayerState);
            const statValue = reactingPlayer.character.agility + bonuses.agility;
            const roll = Math.floor(Math.random() * 20) + 1;
            const total = roll + statValue;
            const isSuccess = roll !== 1 && total >= dodgeSpell.hit;
            const rollColor = isSuccess ? '#2ecc71' : '#e74c3c';
            const rollDisplay = `<span style="color:${rollColor}">🎲${roll}</span>`;
            if (roll === 1) {
                logMessage = `${name}'s Dodge: ${rollDisplay} Critical Failure!`;
            } else if (isSuccess) {
                finalDamage = 0;
                dodged = true;
                logMessage = `${name}'s Dodge: ${rollDisplay} Avoided!`;
            } else {
                logMessage = `${name}'s Dodge: ${rollDisplay} Failed!`;
            }
        } else {
            logMessage = `${name} tries to Dodge, but fails!`;
        }
    } else if (reactionType === 'Block') {
        const shield = reactingPlayer.character.equipment.offHand;
        if (shield && shield.reaction && (reactingPlayerState.itemCooldowns[shield.name] || 0) <= 0) {
            reactingPlayerState.itemCooldowns[shield.name] = shield.cooldown;
            const bonuses = getBonusStatsForPlayer(reactingPlayer.character, reactingPlayerState);
            const statValue = reactingPlayer.character.defense + bonuses.defense;
            const roll = Math.floor(Math.random() * 20) + 1;
            const total = roll + statValue;
            const isSuccess = roll !== 1 && total >= shield.reaction.hit;
            const rollColor = isSuccess ? '#2ecc71' : '#e74c3c';
            const rollDisplay = `<span style="color:${rollColor}">🎲${roll}</span>`;
            if (roll === 1) {
                logMessage = `${name}'s Block: ${rollDisplay} Critical Failure!`;
            } else if (isSuccess) {
                const damageReduction = shield.reaction.value;
                finalDamage = Math.max(0, finalDamage - damageReduction);
                blocked = true;
                logMessage = `${name}'s Block: ${rollDisplay} Blocked ${damageReduction} damage!`;
            } else {
                logMessage = `${name}'s Block: ${rollDisplay} Failed!`;
            }
        } else {
            logMessage = `${name} tries to Block, but fails!`;
        }
    }
    // --- EVASIVE SHOT REACTION ---
    else if (reactionType === 'Evasive Shot') {
        const evasiveShotSpell = reactingPlayer.character.equippedSpells.find(s => s.name === "Evasive Shot");
        const mainHand = reactingPlayer.character.equipment.mainHand;
        const offHand = reactingPlayer.character.equipment.offHand;
        const requiredTypes = evasiveShotSpell?.requires?.weaponType || [];
        // Find the ranged weapon (check mainHand first, then offHand for crossbows)
        const rangedWeapon = (mainHand && requiredTypes.includes(mainHand.weaponType)) ? mainHand :
            (offHand && requiredTypes.includes(offHand.weaponType)) ? offHand : null;

        if (evasiveShotSpell && rangedWeapon && (reactingPlayerState.spellCooldowns[evasiveShotSpell.name] || 0) <= 0) {
            reactingPlayerState.spellCooldowns[evasiveShotSpell.name] = evasiveShotSpell.cooldown;
            const bonuses = getBonusStatsForPlayer(reactingPlayer.character, reactingPlayerState);
            const statValue = reactingPlayer.character.agility + bonuses.agility;
            const roll = Math.floor(Math.random() * 20) + 1;
            const total = roll + statValue;
            const { avoidHit, counterHit } = evasiveShotSpell.reactionDetails;

            const isSuccess = roll !== 1 && total >= avoidHit;
            const rollColor = isSuccess ? '#2ecc71' : '#e74c3c';
            const rollDisplay = `<span style="color:${rollColor}">🎲${roll}</span>`;

            if (roll === 1) {
                logMessage = `${name}'s Evasive Shot: ${rollDisplay} Critical Failure!`;
            } else if (isSuccess) {
                finalDamage = 0;
                dodged = true;
                logMessage = `${name}'s Evasive Shot: ${rollDisplay} Avoided!`;

                if (total >= counterHit) {
                    let counterDamage = rangedWeapon.weaponDamage;

                    if (isPvp) {
                        // PVP counter-attack - target is another player
                        const attackerPlayerState = encounter.playerStates.find(p => p.playerId === reaction.attackerPlayerId);
                        if (attackerPlayerState && !attackerPlayerState.isDead) {
                            const attackerCharacter = players[attackerPlayerState.name]?.character;
                            let damageToDeal = counterDamage;

                            if (attackerCharacter) {
                                const attackerBonuses = getBonusStatsForPlayer(attackerCharacter, attackerPlayerState);
                                const resistance = attackerBonuses.physicalResistance || 0;
                                damageToDeal = Math.max(1, counterDamage - resistance);
                            }

                            applyDamage(attackerPlayerState, damageToDeal);

                            let counterLog = ` They counter-attack, dealing ${damageToDeal} damage to ${attackerPlayerState.name}!`;
                            if (damageToDeal < counterDamage) counterLog += ` (${counterDamage - damageToDeal} resisted)`;
                            stateObject.log.push({ message: logMessage + counterLog, type: 'success' });

                            if (attackerPlayerState.health <= 0) {
                                defeatEnemyInPartyFn(io, party, { playerId: attackerPlayerState.playerId }, null);
                            }
                            logMessage = ''; // Clear message to prevent double logging
                        }
                    } else {
                        // PVE counter-attack - target is an enemy card
                        const attackerEnemy = stateObject.zoneCards[reaction.attackerIndex];
                        if (attackerEnemy && attackerEnemy.health > 0) {
                            const resistance = attackerEnemy.buffs?.find(b => b.bonus && b.bonus.physicalResistance)?.bonus.physicalResistance || 0;
                            let damageToDeal = Math.max(1, counterDamage - resistance);

                            applyDamage(attackerEnemy, damageToDeal);

                            let counterLog = ` They counter-attack, dealing ${damageToDeal} damage to ${attackerEnemy.name}!`;
                            stateObject.log.push({ message: logMessage + counterLog, type: 'success' });

                            if (attackerEnemy.health <= 0) {
                                defeatEnemyInPartyFn(io, party, attackerEnemy, reaction.attackerIndex);
                            }
                            logMessage = ''; // Clear message to prevent double logging
                        }
                    }
                }
            } else {
                logMessage = `${name}'s Evasive Shot: ${rollDisplay} Failed!`;
            }
        } else {
            logMessage = `${name} tries to use Evasive Shot, but fails!`;
        }
    }
    // --- PARRY REACTION ---
    else if (reactionType === 'Parry') {
        const parrySpell = reactingPlayer.character.equippedSpells.find(s => s.name === "Parry");
        const mainHand = reactingPlayer.character.equipment.mainHand;
        const rangedWeaponTypes = ['Two-Hand Bow', 'Two-Hand Staff'];
        const hasMeleeWeapon = mainHand && mainHand.type === 'weapon' &&
            (mainHand.range === 'melee' || (!mainHand.range && !rangedWeaponTypes.includes(mainHand.weaponType)));

        if (parrySpell && hasMeleeWeapon && (reactingPlayerState.spellCooldowns[parrySpell.name] || 0) <= 0) {
            reactingPlayerState.spellCooldowns[parrySpell.name] = parrySpell.cooldown;
            const bonuses = getBonusStatsForPlayer(reactingPlayer.character, reactingPlayerState);

            // Use defense stat
            const statValue = reactingPlayer.character.defense + (bonuses.defense || 0);

            const roll = Math.floor(Math.random() * 20) + 1;
            const total = roll + statValue;
            const { avoidHit, counterHit } = parrySpell.reactionDetails;

            const isSuccess = roll !== 1 && total >= avoidHit;
            const rollColor = isSuccess ? '#2ecc71' : '#e74c3c';
            const rollDisplay = `<span style="color:${rollColor}">🎲${roll}</span>`;

            if (roll === 1) {
                logMessage = `${name}'s Parry: ${rollDisplay} Critical Failure!`;
            } else if (isSuccess) {
                finalDamage = 0;
                dodged = true;
                logMessage = `${name}'s Parry: ${rollDisplay} Deflected!`;

                if (total >= counterHit) {
                    let counterDamage = mainHand.weaponDamage;

                    if (isPvp) {
                        // PVP counter-attack - target is another player
                        const attackerPlayerState = encounter.playerStates.find(p => p.playerId === reaction.attackerPlayerId);
                        if (attackerPlayerState && !attackerPlayerState.isDead) {
                            const attackerCharacter = players[attackerPlayerState.name]?.character;
                            let damageToDeal = counterDamage;

                            if (attackerCharacter) {
                                const attackerBonuses = getBonusStatsForPlayer(attackerCharacter, attackerPlayerState);
                                const resistance = attackerBonuses.physicalResistance || 0;
                                damageToDeal = Math.max(1, counterDamage - resistance);
                            }

                            applyDamage(attackerPlayerState, damageToDeal);

                            let counterLog = ` They riposte, dealing ${damageToDeal} damage to ${attackerPlayerState.name}!`;
                            if (damageToDeal < counterDamage) counterLog += ` (${counterDamage - damageToDeal} resisted)`;
                            stateObject.log.push({ message: logMessage + counterLog, type: 'success' });

                            if (attackerPlayerState.health <= 0) {
                                defeatEnemyInPartyFn(io, party, { playerId: attackerPlayerState.playerId }, null);
                            }
                            logMessage = ''; // Clear message to prevent double logging
                        }
                    } else {
                        // PVE counter-attack - target is an enemy card
                        const attackerEnemy = stateObject.zoneCards[reaction.attackerIndex];
                        if (attackerEnemy && attackerEnemy.health > 0) {
                            const resistance = attackerEnemy.buffs?.find(b => b.bonus && b.bonus.physicalResistance)?.bonus.physicalResistance || 0;
                            let damageToDeal = Math.max(1, counterDamage - resistance);

                            applyDamage(attackerEnemy, damageToDeal);

                            let counterLog = ` They riposte, dealing ${damageToDeal} damage to ${attackerEnemy.name}!`;
                            stateObject.log.push({ message: logMessage + counterLog, type: 'success' });

                            if (attackerEnemy.health <= 0) {
                                defeatEnemyInPartyFn(io, party, attackerEnemy, reaction.attackerIndex);
                            }
                            logMessage = ''; // Clear message to prevent double logging
                        }
                    }
                }
            } else {
                logMessage = `${name}'s Parry: ${rollDisplay} Failed!`;
            }
        } else {
            logMessage = `${name} tries to Parry, but fails!`;
        }
    }
    // --- DEFAULT: TAKE DAMAGE ---
    else {
        logMessage = `${name} braces for the attack!`;
    }

    if (logMessage) stateObject.log.push({ message: logMessage, type: dodged || blocked ? 'success' : 'reaction' });

    // For special attacks, we want to inform the special handler if the attack was avoided
    if ((dodged || (blocked && finalDamage <= 0)) && reaction.isSpecial) {
        reactingPlayerState.skipDamage = true;
    }

    if ((finalDamage > 0 || (reaction.debuff && !dodged))) {
        let damageToDeal = 0;
        let damageMessage = `${reaction.attackerName} ${reaction.message}`;

        if (finalDamage > 0) {
            damageToDeal = finalDamage;
            if (reaction.damageType === 'Physical') {
                const bonuses = getBonusStatsForPlayer(reactingPlayer.character, reactingPlayerState);
                const resistance = bonuses.physicalResistance || 0;
                damageToDeal = Math.max(1, finalDamage - resistance);
            }
            applyDamage(reactingPlayerState, damageToDeal);
            damageMessage += ` It hits ${name} for ${damageToDeal} damage! [id:${reactingPlayerState.playerId}]`;
            if (damageToDeal < finalDamage) {
                damageMessage += ` (${finalDamage - damageToDeal} resisted)`;
            }
        }

        if (reaction.debuff && !dodged) {
            const debuff = reaction.debuff;
            const existingIndex = reactingPlayerState.debuffs.findIndex(d => d.type.toLowerCase() === debuff.type.toLowerCase());
            if (existingIndex !== -1) reactingPlayerState.debuffs.splice(existingIndex, 1);
            reactingPlayerState.debuffs.push({ ...debuff });
            damageMessage += ` ${name} is now ${debuff.type}!`;
        }
        stateObject.log.push({ message: damageMessage, type: 'damage' });
    }
    if (reactingPlayerState.health <= 0) {
        reactingPlayerState.health = 0;
        reactingPlayerState.isDead = true;
        if (isPvp) {
            handlePvpPlayerDeath(io, reactingPlayer, encounter);
        } else {
            if (reactingPlayer.character) {
                reactingPlayerState.lootableInventory = [...reactingPlayer.character.inventory.filter(Boolean)];
                reactingPlayer.character.inventory = Array(INVENTORY_SIZE).fill(null);
                if (reactingPlayer.id) io.to(reactingPlayer.id).emit('characterUpdate', reactingPlayer.character);
            }
        }
        stateObject.log.push({ message: `${name} has been defeated!`, type: 'damage' });
    }
    const wasFleeing = reaction.isFleeing || false;
    stateObject.pendingReaction = null;
    if (isPvp) {
        const duration = encounter.turnTimeRemaining;
        if (duration > 0) {
            const timerEndsAt = Date.now() + duration;
            encounter.turnTimerId = setTimeout(() => {
                const currentEncounter = pvpEncounters[encounter.id];
                if (currentEncounter) {
                    currentEncounter.log.push({ message: `Team ${currentEncounter.activeTeam}'s time expired! Turn ends.`, type: 'damage' });
                    currentEncounter.playerStates.forEach(p => {
                        if (p.team === currentEncounter.activeTeam && !p.isDead) p.turnEnded = true;
                    });
                    startNextPvpTeamTurn(io, currentEncounter.id);
                }
            }, duration);
            encounter.turnTimerEndsAt = timerEndsAt;
        }
        const defendingTeam = reactingPlayerState.team;
        const allDefendersDead = encounter.playerStates.filter(p => p.team === defendingTeam).every(p => p.isDead);
        if (allDefendersDead) {
            const winningTeam = defendingTeam === 'A' ? 'B' : 'A';
            const winningParty = (winningTeam === 'A') ? parties[encounter.partyAId] : parties[encounter.partyBId];
            const losingParty = (winningTeam === 'A') ? parties[encounter.partyBId] : parties[encounter.partyAId];
            endPvpEncounter(io, winningParty, losingParty);
        } else {
            broadcastAdventureUpdate(io, party);
        }
        return;
    }
    const lastAttackerIndex = reaction.attackerIndex;
    const enemies = party.sharedState.zoneCards.map((c, i) => ({ card: c, index: i })).filter(e => e.card && e.card.type === 'enemy');
    const lastEnemyListIndex = enemies.findIndex(e => e.index === lastAttackerIndex);
    await runEnemyPhaseForPartyFn(io, party.id, wasFleeing, lastEnemyListIndex + 1);
}
