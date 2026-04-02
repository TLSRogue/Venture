// adventure/spell-cast-helpers.js
// Extracted helper functions for processCastSpell decomposition.
// These are internal helpers - only imported by adventure-actions.js.

import { players, pvpEncounters } from '../serverState.js';
import { gameData } from '../data/index.js';
import { getBonusStatsForPlayer } from '../utilsHelpers.js';
import { checkAndEndTurnForPlayer, defeatEnemyInParty } from './adventure-state.js';
import { handleResolveReaction } from './reaction-handlers.js';
import { applyDamage, normalizeTarget, resolveAttackRoll, checkVexorDodge, checkVampirePhaseTransition, checkEnemyReaction, applyChillStack, getCombatContext, getHostileTargets, getAvailablePlayerReactions, getEffectiveResistance, modifyThreat } from './combat-core.js';
import { INVENTORY_SIZE } from '../constants.js';
import { SpellHandlers, getSpecialSpellDamage } from './spell-handlers.js';
import { broadcastAdventureUpdate } from '../utilsBroadcast.js';

// ---- Context Initialization ----

export function initSpellContext(party, player, payload) {
    const { spellIndex, targetIndex } = payload;
    const character = player.character;
    const spell = character.equippedSpells[spellIndex];
    if (!spell) return null;

    const cost = spell.cost || 0;
    const { sharedState, encounter, isPvP, log, actingPlayerState } = getCombatContext(party, player.id);
    const bonuses = getBonusStatsForPlayer(character, actingPlayerState);

    return { spell, character, cost, sharedState, encounter, isPvP, log, actingPlayerState, bonuses, targetIndex, target: null, attackResult: null };
}

// ---- Validation ----

export function validateSpellCast(ctx) {
    const { spell, character, cost, log, actingPlayerState } = ctx;

    if (actingPlayerState.actionPoints < cost) return false;
    if ((actingPlayerState.spellCooldowns[spell.name] || 0) > 0) return false;

    // Silence Check
    const silenceDebuff = (actingPlayerState.debuffs || []).find(d => d.type.toLowerCase() === 'silence');
    if (silenceDebuff && spell.isMagic) {
        log.push({ message: `${actingPlayerState.name} is Silenced and cannot use magic!`, type: 'info' });
        return false;
    }

    // Weapon Requirements Check
    if (spell.requires?.weaponType) {
        const mainHand = character.equipment.mainHand;
        const offHand = character.equipment.offHand;
        const hasRequiredWeapon = (hand) => {
            if (!hand) return false;
            return Array.isArray(spell.requires.weaponType) && spell.requires.weaponType.includes(hand.weaponType);
        };
        if (spell.requires.hand) {
            if (!hasRequiredWeapon(character.equipment[spell.requires.hand])) return false;
        } else {
            if (!hasRequiredWeapon(mainHand) && !hasRequiredWeapon(offHand)) return false;
        }
    }

    return true;
}

// ---- Target Resolution ----

export function resolveSpellTarget(ctx, playerId) {
    const { sharedState, encounter, isPvP, actingPlayerState, targetIndex } = ctx;

    let target = normalizeTarget(sharedState, targetIndex, encounter);

    // Self-target fallback
    if (!target && (targetIndex === 'player' || targetIndex === playerId)) {
        target = {
            isPvP: isPvP,
            isPlayer: true,
            id: actingPlayerState.playerId,
            name: actingPlayerState.name,
            state: actingPlayerState,
            health: actingPlayerState.health,
            maxHealth: actingPlayerState.maxHealth,
            buffs: actingPlayerState.buffs,
            debuffs: actingPlayerState.debuffs,
            team: actingPlayerState.team,
            applyBuff: (buff) => {
                const existingIndex = actingPlayerState.buffs.findIndex(b => b.type === buff.type);
                if (existingIndex !== -1) actingPlayerState.buffs.splice(existingIndex, 1);
                actingPlayerState.buffs.push({ ...buff });
            },
            heal: (amount) => {
                const current = Number(actingPlayerState.health || 0);
                const max = Number(actingPlayerState.maxHealth || 10);
                const healAmt = Number(amount || 0);
                actingPlayerState.health = Math.min(max, current + (isNaN(healAmt) ? 0 : healAmt));
            },
            isDead: () => actingPlayerState.isDead
        };
    }

    return target;
}

// ---- Attack Target Validation (single-target attack spells only) ----

export function validateAttackTarget(ctx) {
    const { spell, isPvP, actingPlayerState, sharedState, target } = ctx;

    if (spell.type === 'attack' && !spell.aoeTargeting) {
        const isHostileTarget = target && (
            (isPvP && target.isPlayer && target.team !== actingPlayerState.team) ||
            (!isPvP && !target.isPlayer && target.state?.type === 'enemy')
        );
        if (!isHostileTarget) {
            const targetLog = isPvP ? pvpEncounters[sharedState.pvpEncounterId].log : sharedState.log;
            targetLog.push({ message: "Invalid target!", type: 'info' });
            return false;
        }
    }
    return true;
}

// ---- Special Spell Dispatch (Revive, Cleanse, Cauterize, ExpendHeat, Spirit Call) ----

export async function dispatchSpecialSpell(io, party, player, ctx) {
    const { spell, character, cost, sharedState, encounter, isPvP, log, actingPlayerState, bonuses, targetIndex, target } = ctx;

    if (!SpellHandlers[spell.name] && spell.type !== 'revive' && spell.type !== 'cleanse' && spell.type !== 'cauterize' && spell.type !== 'expendHeat') {
        return false; // Not a special spell
    }

    const handler = SpellHandlers[spell.name] || SpellHandlers['Revive'];
    let handlerTarget = target ? target.state : null;

    // Revive targets dead party members
    if (spell.type === 'revive' && !handlerTarget && !isPvP && String(targetIndex).startsWith('p')) {
        const idx = parseInt(targetIndex.substring(1));
        if (sharedState.partyMemberStates[idx]) handlerTarget = sharedState.partyMemberStates[idx];
    }

    // Cleanse targets friendly party members (living)
    if (spell.type === 'cleanse' && String(targetIndex).startsWith('p')) {
        const idx = parseInt(targetIndex.substring(1));
        if (sharedState.partyMemberStates[idx] && !sharedState.partyMemberStates[idx].isDead) {
            handlerTarget = sharedState.partyMemberStates[idx];
        }
    }
    if (spell.type === 'cleanse' && !handlerTarget) {
        handlerTarget = actingPlayerState;
    }

    // Cauterize targets friendly party members (or self)
    if (spell.type === 'cauterize') {
        if (String(targetIndex).startsWith('p')) {
            const idx = parseInt(targetIndex.substring(1));
            if (sharedState.partyMemberStates[idx] && !sharedState.partyMemberStates[idx].isDead) {
                handlerTarget = sharedState.partyMemberStates[idx];
            }
        } else if (isPvP && target && target.team === actingPlayerState.team) {
            handlerTarget = target.state;
        }
        if (!handlerTarget) handlerTarget = actingPlayerState;
    }

    // Expend Heat can target any party member OR enemy
    if (spell.type === 'expendHeat') {
        if (String(targetIndex).startsWith('p')) {
            const idx = parseInt(targetIndex.substring(1));
            if (sharedState.partyMemberStates[idx] && !sharedState.partyMemberStates[idx].isDead) {
                handlerTarget = sharedState.partyMemberStates[idx];
            }
        } else if (target) {
            handlerTarget = target.state;
        }
        if (!handlerTarget) handlerTarget = actingPlayerState;
    }

    // Defensive check: ensure health is a number
    if (handlerTarget) handlerTarget.health = Number(handlerTarget.health || 0);

    const result = handler(spell, character, actingPlayerState, log, handlerTarget, bonuses);

    // Handle pending selections (Spirit Call / Cleanse)
    if (result && result.pendingSelection) {
        if (result.pendingSelection.type === 'spiritCall') {
            const bonus = result.pendingSelection.bonusAmount || 1;
            const spiritDialog = {
                text: "Call upon a Spirit Animal to aid you:",
                options: [
                    { text: `Panther Spirit (+${bonus} Agi)`, action: 'spiritCallBuff', buff: 'Panther', next: 'farewell' },
                    { text: `Bear Spirit (+${bonus} Str)`, action: 'spiritCallBuff', buff: 'Bear', next: 'farewell' },
                    { text: `Tree Spirit (+${bonus} Def)`, action: 'spiritCallBuff', buff: 'Tree', next: 'farewell' }
                ]
            };
            io.to(result.pendingSelection.casterPlayerId).emit('party:showDialogue', {
                npcName: "Spirit Call", node: spiritDialog, cardIndex: -1
            });
            log.push({ message: `${character.characterName} calls out to the spirits...`, type: 'info' });
            broadcastAdventureUpdate(io, party);
            return true;
        }

        // Cleanse selection
        sharedState.pendingCleanse = result.pendingSelection;
        io.to(result.pendingSelection.casterPlayerId).emit('party:requestDebuffSelection', {
            targetName: result.pendingSelection.targetName,
            debuffs: result.pendingSelection.debuffs,
            maxSelectable: result.pendingSelection.maxSelectable,
            casterName: result.pendingSelection.casterName
        });
        log.push({ message: `${character.characterName} prepares to cleanse ${result.pendingSelection.targetName}...`, type: 'info' });
        broadcastAdventureUpdate(io, party);
        return true;
    }

    // Consume resources
    actingPlayerState.actionPoints -= cost;
    actingPlayerState.spellCooldowns[spell.name] = spell.cooldown;

    // Handle Expend Heat AoE damage
    if (spell.type === 'expendHeat' && result && result.triggersAoe) {
        const aoeDamage = getSpecialSpellDamage(spell, character, actingPlayerState, bonuses);
        const hostileTargets = getHostileTargets(sharedState, encounter, actingPlayerState);

        for (const hostileTarget of hostileTargets) {
            const resistance = hostileTarget.getResistance ? hostileTarget.getResistance('Fire') : 0;
            const dmg = Math.max(1, aoeDamage - resistance);
            applyDamage(hostileTarget.state, dmg);
            const enemyId = hostileTarget.id;
            log.push({ message: `${hostileTarget.name} takes ${dmg} Fire damage from the released heat! [id:${enemyId}]`, type: 'damage' });

            if (hostileTarget.state.health <= 0) {
                if (hostileTarget.isPvP) {
                    defeatEnemyInParty(io, party, { playerId: enemyId }, null);
                } else {
                    const cardIndex = sharedState.zoneCards.findIndex(c => c && c.id === hostileTarget.state.id);
                    if (cardIndex !== -1) defeatEnemyInParty(io, party, hostileTarget.state, cardIndex);
                }
            }
        }
    }

    broadcastAdventureUpdate(io, party);
    await checkAndEndTurnForPlayer(io, party, player);
    return true;
}

// ---- Zone Effect Spells (Blizzard, etc.) ----

export async function handleZoneEffectSpell(io, party, player, ctx) {
    const { spell, character, cost, sharedState, log, actingPlayerState, bonuses } = ctx;
    if (spell.type !== 'zoneEffect' || !spell.zoneEffect) return false;

    const spellStat = spell.stat || 'wisdom';
    const attackResult = resolveAttackRoll(actingPlayerState, character, null, spellStat, spell.hit || 10);

    actingPlayerState.actionPoints -= cost;
    actingPlayerState.spellCooldowns[spell.name] = spell.cooldown;
    modifyThreat(actingPlayerState, spell.threat || 1);

    let description = `${character.characterName} casts ${spell.name}! ${attackResult.rollDisplay}`;

    if (!attackResult.isHit) {
        description += (attackResult.roll === 1) ? ` Critical Failure!` : ` Fizzle!`;
        log.push({ message: description, type: 'damage' });
        broadcastAdventureUpdate(io, party);
        await checkAndEndTurnForPlayer(io, party, player);
        return true;
    }

    log.push({ message: description, type: 'success' });

    const powerKey = spell.damageType ? spell.damageType.toLowerCase() + 'Power' : 'frostPower';
    const power = bonuses[powerKey] || 0;
    const damage = 1 + Math.floor(power / 2);

    if (!sharedState.zoneEffects) sharedState.zoneEffects = [];
    sharedState.zoneEffects.push({
        ...spell.zoneEffect,
        damage,
        casterName: character.characterName,
        casterTeam: actingPlayerState.team || null
    });

    log.push({
        message: `${spell.zoneEffect.icon || '🌀'} A ${spell.zoneEffect.name} engulfs the zone for ${spell.zoneEffect.duration} turns!`,
        type: 'success'
    });

    broadcastAdventureUpdate(io, party);
    await checkAndEndTurnForPlayer(io, party, player);
    return true;
}

// ---- Roll Resolution + Resource Consumption ----

export function resolveSpellRollAndConsume(ctx) {
    const { spell, character, cost, log, actingPlayerState, bonuses, target } = ctx;

    // Resolve best stat if array
    let spellStat = spell.stat || 'wisdom';
    if (Array.isArray(spellStat)) {
        let bestStat = spellStat[0];
        let maxVal = -Infinity;
        spellStat.forEach(stat => {
            const val = (character[stat] || 0) + (bonuses[stat] || 0);
            if (val > maxVal) { maxVal = val; bestStat = stat; }
        });
        spellStat = bestStat;
    }

    const attackResult = resolveAttackRoll(actingPlayerState, character, target ? target.state : null, spellStat, spell.hit || 15);

    // Consume Resources
    actingPlayerState.actionPoints -= cost;
    actingPlayerState.spellCooldowns[spell.name] = spell.cooldown;
    modifyThreat(actingPlayerState, spell.threat || 1);
    if (spell.bonusThreat) {
        modifyThreat(actingPlayerState, spell.bonusThreat);
        log.push({ message: `${character.characterName} generates ${spell.bonusThreat} bonus threat!`, type: 'reaction' });
    }

    // Log Modifiers
    if (attackResult.modifiers.dazeModifier !== 0) log.push({ message: `${character.characterName} is dazed! (-3 to spell roll)`, type: 'info' });
    if (attackResult.modifiers.stealthModifier !== 0 && target) log.push({ message: `${target.name} is hidden in shadows! (-5 to hit)`, type: 'info' });
    if (attackResult.modifiers.focusModifier !== 0) log.push({ message: `${character.characterName} is focused! (+${attackResult.modifiers.focusModifier} to spell roll)`, type: 'info' });

    let description = `${character.characterName} casts ${spell.name}! ${attackResult.rollDisplay}`;

    if (!attackResult.isHit) {
        description += (attackResult.roll === 1) ? ` Critical Failure!` : ` Fizzle!`;
        log.push({ message: description, type: 'damage' });
        return null; // Miss - caller handles broadcast + end turn
    }

    log.push({ message: description, type: spell.type === 'heal' || spell.type === 'buff' ? 'heal' : 'damage' });
    return attackResult;
}

// ---- Monk Focus Gain ----

export function handleMonkFocusGain(ctx) {
    const { spell, character, actingPlayerState, log } = ctx;
    if (spell.name !== 'Punch' && spell.name !== 'Kick') return;

    const hasMonkTraining = character.equippedSpells.some(s => s.name === "Monk's Training");
    const mainHand = character.equipment.mainHand;
    const offHand = character.equipment.offHand;
    const isUnarmed = (!mainHand || !mainHand.name) && (!offHand || !offHand.name);

    if (actingPlayerState.focus === undefined) actingPlayerState.focus = 0;
    if (hasMonkTraining && isUnarmed && actingPlayerState.focus < 3) {
        actingPlayerState.focus += 1;
        log.push({ message: `${character.characterName} gains 1 Focus.`, type: 'heal' });
    }
}

// ---- PvP Reaction Check for Spells ----

export function checkSpellPvpReaction(io, party, ctx, handlePvpReactionCheck) {
    const { spell, character, encounter, isPvP, log, actingPlayerState, bonuses, target } = ctx;

    if (!isPvP || !target) return false;
    if (spell.type !== 'attack' && !(spell.type === 'versatile' && target.team !== actingPlayerState.team)) return false;

    let specialResult = getSpecialSpellDamage(spell, character, actingPlayerState, bonuses, target);

    let baseDmg = 0;
    let debuffToUse = spell.debuff ? { ...spell.debuff } : null;

    if (specialResult !== null && typeof specialResult === 'object') {
        baseDmg = specialResult.damage;
        if (specialResult.debuff) debuffToUse = { ...specialResult.debuff };
        if (specialResult.logMessage) log.push({ message: specialResult.logMessage, type: 'reaction' });
    } else {
        baseDmg = specialResult !== null ? specialResult : (spell.damage || spell.baseEffect || 1);
    }

    // Scale debuff damage with power bonuses
    if (debuffToUse && debuffToUse.damageType) {
        const powerKey = debuffToUse.damageType.toLowerCase() + 'Power';
        const powerBonus = bonuses[powerKey] || 0;
        const debuffBaseDmg = debuffToUse.baseDamage ?? debuffToUse.damage ?? 0;
        debuffToUse.damage = debuffBaseDmg + powerBonus;
    }

    const actionDetails = {
        damage: baseDmg,
        damageType: spell.damageType || 'Magic',
        attackRange: spell.range,
        message: `is targeted by ${spell.name}.`,
        debuff: debuffToUse,
    };

    const reactionInitiated = handlePvpReactionCheck(io, encounter, actingPlayerState, target.state, actionDetails);
    if (reactionInitiated) {
        broadcastAdventureUpdate(io, party);
        return true;
    }
    return false;
}

// ---- Spell Effect: Heal ----

export function applySpellHeal(ctx) {
    const { spell, isPvP, log, actingPlayerState, target } = ctx;

    const validTarget = (target && (isPvP || target.isPlayer)) ? target : null;
    const healTarget = validTarget || {
        name: actingPlayerState.name,
        state: actingPlayerState,
        heal: (amt) => {
            const current = Number(actingPlayerState.health || 0);
            const max = Number(actingPlayerState.maxHealth || 10);
            const healAmt = Number(amt || 0);
            actingPlayerState.health = Math.min(max, current + (isNaN(healAmt) ? 0 : healAmt));
        },
        id: actingPlayerState.playerId,
        isPvP: isPvP
    };
    healTarget.heal(spell.heal);
    const tId = healTarget.isPvP ? healTarget.id : (healTarget.id || healTarget.state?.playerId);
    log.push({ message: `Healed ${healTarget.name} for ${spell.heal} HP. [id:${tId}]`, type: 'heal' });
}

// ---- Spell Effect: Buff ----

export function applySpellBuff(ctx) {
    const { spell, isPvP, log, actingPlayerState, bonuses, target } = ctx;

    const validTarget = (target && (isPvP || target.isPlayer)) ? target : null;
    const buffTarget = validTarget || {
        name: actingPlayerState.name,
        state: actingPlayerState,
        applyBuff: (b) => {
            const ex = actingPlayerState.buffs.findIndex(x => x.type === b.type);
            if (ex !== -1) actingPlayerState.buffs.splice(ex, 1);
            actingPlayerState.buffs.push(b);
        },
        id: actingPlayerState.playerId,
        isPvP: isPvP,
        buffs: actingPlayerState.buffs
    };
    const buff = { ...spell.buff };

    // Rejuvenate healing scales with caster's naturePower
    if (spell.name === 'Rejuvenate') {
        buff.healAmount = 1 + (bonuses.naturePower || 0);
    }

    // Barrier scaling
    if (buff.type === 'Magic Barrier' && buff.scaling === 'arcanePower') {
        buff.value = (buff.baseValue || 2) + (bonuses.arcanePower || 0);
        delete buff.baseValue; delete buff.scaling;
    }
    if (buff.type === 'Flame Shield' && buff.scaling === 'firePower') {
        buff.value = (buff.baseValue || 1) + (bonuses.firePower || 0);
        delete buff.baseValue; delete buff.scaling;
    }
    if (buff.type === 'Ice Barrier' && buff.scaling === 'frostPower') {
        buff.value = (buff.baseValue || 1) + (bonuses.frostPower || 0);
        delete buff.baseValue; delete buff.scaling;
    }

    if (buffTarget.applyBuff) {
        buffTarget.applyBuff(buff);
    } else {
        const existingIndex = buffTarget.buffs.findIndex(b => b.type === buff.type);
        if (existingIndex !== -1) {
            if (buff.stackDuration) {
                buffTarget.buffs[existingIndex].duration += buff.duration;
                log.push({ message: `${buffTarget.name}'s ${buff.type} duration extended by ${buff.duration} turns!`, type: 'heal' });
                return;
            } else {
                buffTarget.buffs.splice(existingIndex, 1);
                buffTarget.buffs.push(buff);
            }
        } else {
            buffTarget.buffs.push(buff);
        }
    }

    const tId = buffTarget.isPvP ? buffTarget.id : (buffTarget.id || buffTarget.state?.playerId);
    if (buff.type === 'Magic Barrier') {
        log.push({ message: `${buffTarget.name} gains Magic Barrier (${buff.value} Shield)! [id:${tId}]`, type: 'heal' });
    } else if (buff.type === 'Flame Shield') {
        log.push({ message: `${buffTarget.name} gains Flame Shield (${buff.value} Fire Barrier)! Melee attackers will burn! [id:${tId}]`, type: 'heal' });
    } else if (buff.type === 'Ice Barrier') {
        log.push({ message: `${buffTarget.name} gains Ice Barrier (${buff.value} Frost Barrier)! Melee attackers will be chilled! [id:${tId}]`, type: 'heal' });
    } else {
        log.push({ message: `${buffTarget.name} gains ${buff.type}${buff.value ? ` (${buff.value})` : ''}! [id:${tId}]`, type: 'heal' });
    }
}

// ---- Spell Effect: Debuff ----

export function applySpellDebuff(ctx) {
    const { spell, isPvP, log, actingPlayerState, target } = ctx;

    const isHostileTarget = target && (
        (isPvP && target.isPlayer && target.team !== actingPlayerState.team) ||
        (!isPvP && !target.isPlayer && target.state?.type === 'enemy')
    );
    if (!isHostileTarget) {
        log.push({ message: "Invalid target for debuff spell!", type: 'info' });
        return false; // Caller should broadcast + end turn
    }

    const debuff = { ...spell.debuff };
    if (!target.state.debuffs) target.state.debuffs = [];
    const existingIndex = target.state.debuffs.findIndex(d => d.type.toLowerCase() === debuff.type.toLowerCase());
    if (existingIndex !== -1) target.state.debuffs.splice(existingIndex, 1);
    target.state.debuffs.push(debuff);

    log.push({ message: `${target.name} is now ${debuff.type.charAt(0).toUpperCase() + debuff.type.slice(1)}ed!`, type: 'damage' });
    return true;
}

// ---- Spell Effect: Attack / AoE / Versatile ----

export async function applySpellAttack(io, party, player, ctx) {
    const { spell, character, sharedState, encounter, isPvP, log, actingPlayerState, bonuses, targetIndex, attackResult, target } = ctx;

    // Collect Targets
    let targets = [];
    if (spell.aoeTargeting === 'all') {
        targets = getHostileTargets(sharedState, encounter, actingPlayerState);
    } else if (spell.aoeTargeting === 'adjacent') {
        if (target) targets.push(target);
        if (!isPvP) {
            const enemyIdx = parseInt(targetIndex);
            [-1, 1].forEach(offset => {
                const adj = normalizeTarget(sharedState, enemyIdx + offset, null);
                if (adj) targets.push(adj);
            });
        }
    } else if (target) {
        const isHostile = (isPvP && target.isPlayer && target.team !== actingPlayerState.team) ||
            (!isPvP && target.state?.type === 'enemy');
        const isFriendly = (isPvP && target.team === actingPlayerState.team) ||
            (!isPvP && target.isPlayer);
        if (isHostile || (spell.type === 'versatile' && isFriendly)) {
            targets.push(target);
        } else {
            log.push({ message: "Invalid target!", type: 'info' });
            return false;
        }
    } else {
        log.push({ message: "Invalid target!", type: 'info' });
        return false;
    }

    const uniqueTargets = [...new Map(targets.map(t => [t.id, t])).values()];

    // Whirlwind Logic
    let numAttacks = 1;
    if (spell.name === 'Whirlwind') {
        numAttacks += actingPlayerState.actionPoints;
        actingPlayerState.actionPoints = 0;
        log.push({ message: `${character.characterName} spins into a Whirlwind! ${numAttacks} total attacks!`, type: 'info' });
    }

    // Damage Loop
    for (let attackNum = 0; attackNum < numAttacks; attackNum++) {
        let currentAttackResult = attackResult;
        if (spell.name === 'Whirlwind' && attackNum > 0) {
            currentAttackResult = resolveAttackRoll(actingPlayerState, character, null, spell.stat || 'strength', spell.hit || 10);
            const swingDescription = `Whirlwind Swing ${attackNum + 1}! ${currentAttackResult.rollDisplay}`;
            if (!currentAttackResult.isHit) {
                log.push({ message: swingDescription + (currentAttackResult.roll === 1 ? ' Critical Miss!' : ' Miss!'), type: 'info' });
                broadcastAdventureUpdate(io, party);
                await new Promise(resolve => setTimeout(resolve, 500));
                continue;
            }
            log.push({ message: swingDescription + ' Hit!', type: 'damage' });
        } else if (spell.name === 'Whirlwind' && attackNum === 0) {
            if (!currentAttackResult.isHit) {
                log.push({ message: `Whirlwind Swing 1! ${currentAttackResult.rollDisplay} Miss!`, type: 'info' });
                broadcastAdventureUpdate(io, party);
                await new Promise(resolve => setTimeout(resolve, 500));
                continue;
            }
        }

        if (spell.name === 'Whirlwind' && attackNum > 0) {
            await new Promise(resolve => setTimeout(resolve, 500));
        }

        for (const t of uniqueTargets) {
            if (t.state.health <= 0) continue;

            // Darkness/Light Source Check
            if (t.state && t.state.darknessShrouded) {
                const hasLight = (actingPlayerState.buffs || []).some(b => b.type === 'Light Source');
                if (!hasLight) {
                    log.push({ message: `${t.name} is hidden in darkness! Spell missed!`, type: 'info' });
                    continue;
                }
            }

            let baseDamage = spell.damage || 0;
            let isHeal = false;

            // Versatile Logic
            if (spell.type === 'versatile') {
                let effectVal = spell.baseEffect || 1;
                if (spell.school === 'Holy') {
                    effectVal += (bonuses.holyPower || 0);
                } else {
                    effectVal += currentAttackResult.modifiers.statValue;
                }

                const isFriendly = (isPvP && t.team === actingPlayerState.team) || (!isPvP && t.isPlayer);
                if (isFriendly) {
                    t.heal(effectVal);
                    log.push({ message: `Healed ${t.name} for ${effectVal} HP.`, type: 'heal' });
                    isHeal = true;
                } else {
                    baseDamage = effectVal;
                }
            }

            // Special spell damage calculations
            if (!isHeal) {
                const specialResult = getSpecialSpellDamage(spell, character, actingPlayerState, bonuses, t);
                if (specialResult !== null && typeof specialResult === 'object') {
                    baseDamage = specialResult.damage;
                    if (specialResult.debuff) spell.debuff = { ...specialResult.debuff };
                    if (specialResult.logMessage) log.push({ message: specialResult.logMessage, type: 'reaction' });
                } else if (specialResult !== null) {
                    baseDamage = specialResult;
                }

                if (spell.name === 'Ambush' && !spell.debuff) {
                    spell.debuff = { type: 'bleed', duration: 3, damage: 1, damageType: 'Physical' };
                }
            }

            // Apply resistance
            const resistance = t.getResistance(spell.damageType);
            let damageToDeal = baseDamage > 0 ? Math.max(1, baseDamage - resistance) : 0;

            // Flying check
            if (spell.range === 'melee' && (t.state.buffs || []).some(b => b.type === 'Flying')) {
                log.push({ message: `${t.name} is flying! Melee attacks cannot reach them!`, type: 'info' });
                continue;
            }

            // Enemy reaction check
            let triggeredBombDrop = false;
            if (!isPvP && !t.isPlayer && t.state) {
                const attackTypes = [];
                if (spell.range) attackTypes.push(spell.range);
                if (spell.isMagic) attackTypes.push('magic');

                const reactionResult = checkEnemyReaction(t.state, attackTypes, actingPlayerState, log);
                
                if (reactionResult.reactionName === 'Bomb Drop') {
                    triggeredBombDrop = true;
                }

                if (reactionResult.negated) {
                    const actionVerb = attackTypes.includes('magic') ? 'deflects' : 'parries';
                    log.push({ message: `${t.name} ${actionVerb} the ${spell.name}!`, type: 'info' });

                    // Apply counter-damage or reflection to the player
                    let counterDmg = 0;
                    let counterType = reactionResult.counterDamageType || 'Physical';

                    if (reactionResult.reflected) {
                        counterDmg = damageToDeal;
                        counterType = spell.damageType || 'Magic';
                    } else {
                        counterDmg = reactionResult.counterDamage || 0;
                    }

                    if (counterDmg > 0) {
                        const playerResistance = getEffectiveResistance(bonuses, counterType);
                        const finalCounterDmg = Math.max(1, counterDmg - playerResistance);

                        applyDamage(actingPlayerState, finalCounterDmg);
                        let counterMsg = `${actingPlayerState.name} takes ${finalCounterDmg} ${counterType} damage from the ${reactionResult.reflected ? 'reflected spell' : 'counter-attack'}!`;
                        if (playerResistance > 0) counterMsg += ` (${playerResistance} resisted)`;
                        log.push({ message: counterMsg, type: 'damage' });

                        if (actingPlayerState.health <= 0) {
                            actingPlayerState.health = 0;
                            actingPlayerState.isDead = true;
                            log.push({ message: `${actingPlayerState.name} has been defeated!`, type: 'damage' });
                        }
                    }
                    continue;
                } else if (reactionResult.blockAmount > 0) {
                    const blockedDmg = Math.min(reactionResult.blockAmount, baseDamage);
                    baseDamage = Math.max(1, baseDamage - blockedDmg);
                    damageToDeal = Math.max(1, damageToDeal - blockedDmg);
                }
            }

            // Vexor Dodge
            if (checkVexorDodge(t, sharedState, log)) continue;

            let hitDescription = '';
            if (baseDamage > 0) {
                applyDamage(t.state, damageToDeal);
                hitDescription = `Dealt ${damageToDeal} ${spell.damageType || 'Magic'} damage to ${t.name} [id:${t.id}].`;
                if (damageToDeal < baseDamage) hitDescription += ` (${baseDamage - damageToDeal} resisted)`;

                if (triggeredBombDrop && damageToDeal > 0) {
                    const emptySlotIndex = sharedState.zoneCards.findIndex(c => c === null || (c && (c.allowSpawnOver || c.type === 'area')));
                    if (emptySlotIndex !== -1) {
                        const kegCard = {
                            ...gameData.specialCards.powderKeg,
                            id: Date.now() + 500,
                            kegTimer: 2,
                            maxHealth: 6,
                            health: 6,
                            overlayedCard: sharedState.zoneCards[emptySlotIndex] !== null ? sharedState.zoneCards[emptySlotIndex] : null
                        };
                        sharedState.zoneCards[emptySlotIndex] = kegCard;
                    }
                }
            }

            // Apply debuffs
            if (spell.debuff) {
                if (!t.state.debuffs) t.state.debuffs = [];
                const existingIndex = t.state.debuffs.findIndex(d => d.type.toLowerCase() === spell.debuff.type.toLowerCase());
                if (existingIndex !== -1) t.state.debuffs.splice(existingIndex, 1);
                let debuffToApply = { ...spell.debuff };
                if (spell.debuff.damageType) {
                    const powerKey = spell.debuff.damageType.toLowerCase() + 'Power';
                    const powerBonus = bonuses[powerKey] || 0;
                    const baseDmg = spell.debuff.baseDamage ?? spell.debuff.damage ?? 0;
                    debuffToApply.damage = baseDmg + powerBonus;
                }
                t.state.debuffs.push(debuffToApply);
                hitDescription += ` ${t.name} is now ${spell.debuff.type}!`;
            }

            // On-hit threshold debuffs
            if (spell.onHit?.debuff && currentAttackResult.total >= (spell.onHit.threshold || spell.hit)) {
                if (!t.state.debuffs) t.state.debuffs = [];
                const existingIndex = t.state.debuffs.findIndex(d => d.type === spell.onHit.debuff.type);
                if (existingIndex !== -1) t.state.debuffs.splice(existingIndex, 1);
                t.state.debuffs.push({ ...spell.onHit.debuff });
                hitDescription += ` ${t.name} is now ${spell.onHit.debuff.type}!`;
            }

            // On-hit Chill (Cone of Cold etc.)
            if (spell.onHit?.chill && currentAttackResult.total >= (spell.onHit.threshold || spell.hit)) {
                const chillAmount = spell.onHit.chill;
                const chillResult = applyChillStack(t.state, chillAmount, log);
                hitDescription += ` ${t.name} gains ${chillAmount} Chill${chillAmount > 1 ? ' stacks' : ''}!`;
                if (chillResult === 'frozen') {
                    hitDescription += ` ${t.name} is FROZEN!`;
                }
            }

            log.push({ message: hitDescription.trim(), type: 'damage' });

            // Vampire Phase Transition
            checkVampirePhaseTransition(t, sharedState, gameData, log);

            // Check for death
            if (t.state.health <= 0) {
                if (t.isPvP) {
                    defeatEnemyInParty(io, party, { playerId: t.id }, null);
                } else {
                    defeatEnemyInParty(io, party, t.state, t.cardIndex);
                }
            }
        }
        // Broadcast after each swing for visual feedback
        broadcastAdventureUpdate(io, party);
    }

    return true;
}

// ---- Cooldown Reset (Scorch) ----

export function handleCooldownReset(ctx) {
    const { spell, character, log, actingPlayerState, attackResult } = ctx;
    if (spell.resetCooldownThreshold && attackResult && attackResult.total >= spell.resetCooldownThreshold && attackResult.isHit) {
        actingPlayerState.spellCooldowns[spell.name] = 0;
        log.push({ message: `${character.characterName}'s ${spell.name} cooldown resets!`, type: 'heal' });
    }
}
