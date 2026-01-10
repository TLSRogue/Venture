// adventure/adventure-actions.js

import { players, parties, pvpEncounters } from '../serverState.js';
import { gameData } from '../data/index.js';
import { getBonusStatsForPlayer, addItemToInventoryServer } from '../utilsHelpers.js';
import { checkAndEndTurnForPlayer, defeatEnemyInParty, handleResolveReaction } from './adventure-state.js';
import { applyDamage, normalizeTarget, resolveAttackRoll, calculateWeaponDamage, calculateSpellDamage, getWeaponDebuff } from './combat-core.js';
import { SpellHandlers, getSpecialSpellDamage } from './spell-handlers.js';
import { broadcastAdventureUpdate } from '../utilsBroadcast.js';

function handlePvpReactionCheck(io, encounter, attackerCharacter, defendingPlayerState, actionDetails) {
    const defendingPlayerObject = players[defendingPlayerState.name];
    const defendingCharacter = defendingPlayerObject.character;

    const availableReactions = [];
    const dodgeSpell = defendingCharacter.equippedSpells.find(s => s.name === "Dodge");
    if (dodgeSpell && (defendingPlayerState.spellCooldowns[dodgeSpell.name] || 0) <= 0) {
        let isWearingHeavy = Object.values(defendingCharacter.equipment).some(item => item && item.traits && item.traits.includes('Heavy'));
        if (!isWearingHeavy) {
            availableReactions.push({ name: 'Dodge' });
        }
    }
    const shield = defendingCharacter.equipment.offHand;
    if (shield && shield.type === 'shield' && shield.reaction && (defendingPlayerState.itemCooldowns[shield.name] || 0) <= 0) {
        availableReactions.push({ name: 'Block' });
    }

    // Check for Evasive Shot reaction (requires bow, no heavy armor)
    const evasiveShotSpell = defendingCharacter.equippedSpells.find(s => s.name === "Evasive Shot");
    if (evasiveShotSpell && (defendingPlayerState.spellCooldowns[evasiveShotSpell.name] || 0) <= 0) {
        const mainHand = defendingCharacter.equipment.mainHand;
        const offHand = defendingCharacter.equipment.offHand;
        const requiredTypes = evasiveShotSpell.requires?.weaponType || [];
        const hasRangedWeapon = (mainHand && requiredTypes.includes(mainHand.weaponType)) ||
            (offHand && requiredTypes.includes(offHand.weaponType));

        if (hasRangedWeapon) {
            let isWearingHeavy = Object.values(defendingCharacter.equipment).some(
                item => item && item.traits && item.traits.includes('Heavy')
            );
            if (!isWearingHeavy) {
                availableReactions.push({ name: 'Evasive Shot' });
            }
        }
    }

    // Check for Parry reaction (requires melee weapon, melee attack only)
    const parrySpell = defendingCharacter.equippedSpells.find(s => s.name === "Parry");
    if (parrySpell && (defendingPlayerState.spellCooldowns[parrySpell.name] || 0) <= 0) {
        const isMeleeAttack = actionDetails.attackRange === 'melee';
        const mainHand = defendingCharacter.equipment.mainHand;
        const rangedWeaponTypes = ['Two-Hand Bow', 'Two-Hand Staff'];
        const hasMeleeWeapon = mainHand && mainHand.type === 'weapon' &&
            (mainHand.range === 'melee' || (!mainHand.range && !rangedWeaponTypes.includes(mainHand.weaponType)));

        if (isMeleeAttack && hasMeleeWeapon) {
            availableReactions.push({ name: 'Parry' });
        }
    }
    if (availableReactions.length > 0) {
        const timeRemaining = encounter.turnTimerEndsAt - Date.now();
        if (encounter.turnTimerId) clearTimeout(encounter.turnTimerId);
        encounter.turnTimeRemaining = timeRemaining;

        encounter.pendingReaction = {
            attackerName: attackerCharacter.characterName || attackerCharacter.name,
            attackerPlayerId: attackerCharacter.playerId,
            targetName: defendingPlayerState.name,
            damage: actionDetails.damage,
            damageType: actionDetails.damageType,
            attackRange: actionDetails.attackRange,
            message: actionDetails.message,
            debuff: actionDetails.debuff || null,
            isFleeing: false
        };

        const reactionPayload = {
            damage: actionDetails.damage,
            attacker: attackerCharacter.characterName || attackerCharacter.name,
            availableReactions: availableReactions,
            timer: 10000
        };

        io.to(defendingPlayerState.playerId).emit('party:requestReaction', reactionPayload);

        encounter.reactionTimeout = setTimeout(() => {
            const playerSocket = io.sockets.sockets.get(defendingPlayerState.playerId);
            if (playerSocket) {
                handleResolveReaction(io, playerSocket, { reactionType: 'take_damage' });
            }
        }, 10000);

        return true;
    }

    return false;
}

export async function processWeaponAttack(io, party, player, payload) {
    const { weaponSlot, targetIndex } = payload;
    const character = player.character;
    const { sharedState } = party;

    // Determine if PvP
    const encounter = sharedState.pvpEncounterId ? pvpEncounters[sharedState.pvpEncounterId] : null;
    const isPvP = !!encounter;

    // Acting Player State
    const actingPlayerState = isPvP
        ? encounter.playerStates.find(p => p.playerId === player.id)
        : sharedState.partyMemberStates.find(p => p.playerId === player.id);

    const weapon = character.equipment[weaponSlot];

    // Basic Validation
    if (!weapon || weapon.type !== 'weapon') return;
    if (actingPlayerState.actionPoints < weapon.cost) return;
    if ((actingPlayerState.weaponCooldowns[weaponSlot] || 0) > 0) return;

    // Get Target (Unified)
    const target = normalizeTarget(sharedState, targetIndex, encounter);
    if (!target) return;

    // Log
    const log = isPvP ? encounter.log : sharedState.log;

    // PvP Reaction Check
    if (isPvP && target.isPlayer) {
        const actionDetails = {
            damage: weapon.weaponDamage,
            damageType: weapon.damageType,
            attackRange: weapon.range,
            message: `attacks with ${weapon.name}.`,
            debuff: null,
        };

        // Pre-consume resources for PvP flow
        actingPlayerState.actionPoints -= weapon.cost;
        actingPlayerState.threat += weapon.cost;
        actingPlayerState.weaponCooldowns[weaponSlot] = weapon.cooldown;

        const reactionInitiated = handlePvpReactionCheck(io, encounter, actingPlayerState, target.state, actionDetails);
        if (reactionInitiated) {
            broadcastAdventureUpdate(io, party);
            return;
        }
    } else {
        // PVEm / Instant Consume
        actingPlayerState.actionPoints -= weapon.cost;
        actingPlayerState.threat += weapon.cost;
        actingPlayerState.weaponCooldowns[weaponSlot] = weapon.cooldown;
    }

    // Resolve Attack Roll
    const attackResult = resolveAttackRoll(actingPlayerState, character, target.state, weapon.stat || 'strength', weapon.hit || 15);

    // Log Modifiers
    if (attackResult.modifiers.dazeModifier !== 0) {
        log.push({ message: `${character.characterName} is dazed! (-3 to attack roll)`, type: 'info' });
    }
    if (attackResult.modifiers.stealthModifier !== 0) {
        log.push({ message: `${target.name} is hidden in shadows! (-5 to hit)`, type: 'info' });
    }
    if (attackResult.modifiers.focusModifier !== 0) {
        log.push({ message: `${character.characterName} is focused! (+${attackResult.modifiers.focusModifier} to attack roll)`, type: 'info' });
    }

    let logMessage = `${character.characterName} attacks ${target.name} with ${weapon.name}! ${attackResult.rollDisplay}`;

    if (attackResult.isCriticalFail) {
        logMessage += ` Critical Failure!`;
        log.push({ message: logMessage, type: 'damage' });
    } else if (attackResult.isHit) {
        // Calculate Damage
        const dmgResult = calculateWeaponDamage(weapon, target);

        // Vexor Check (Zone-specific boss mechanic)
        if (target.name === 'Vexor, Lord of the Arena') {
            const columns = sharedState.zoneCards.filter(c => c && c.name === 'Stone Column');
            if (columns.length > 0 && Math.floor(Math.random() * 20) + 1 >= 10) {
                log.push({ message: `Vexor, Lord of the Arena's Dodge: Jumps behind a Stone Column! Avoided!`, type: 'reaction' });
                log.push({ message: `(Tip: Destroy the Stone Columns!)`, type: 'info' });
                broadcastAdventureUpdate(io, party);
                await checkAndEndTurnForPlayer(io, party, player);
                return;
            }
        }

        // Apply Damage
        target.applyDamage(dmgResult.finalDamage);
        logMessage += ` Deals ${dmgResult.finalDamage} ${dmgResult.damageType} damage! [id:${target.id}]`;

        // Apply Debuffs (Unified)
        const debuff = getWeaponDebuff(weapon, attackResult.isCriticalHit);
        if (debuff) {
            target.applyDebuff(debuff);
            logMessage += attackResult.isCriticalHit ? ` CRIT! Applies ${debuff.type}!` : ` Applies ${debuff.type}!`;
        }

        log.push({ message: logMessage, type: 'damage' });

        // Kill Logic
        if (target.isDead()) {
            if (target.isPvP) {
                defeatEnemyInParty(io, party, { playerId: target.id }, null);
            } else {
                defeatEnemyInParty(io, party, target.state, target.cardIndex);
            }
        }

    } else {
        logMessage += ` Miss!`;
        log.push({ message: logMessage, type: 'info' });
    }

    broadcastAdventureUpdate(io, party);
    await checkAndEndTurnForPlayer(io, party, player);
}

export async function processCastSpell(io, party, player, payload) {
    const { spellIndex, targetIndex } = payload;
    const character = player.character;
    const { sharedState } = party;
    const spell = character.equippedSpells[spellIndex];

    if (!spell) return;
    const cost = spell.cost || 0;

    // --- Encounter Context ---
    const encounter = sharedState.pvpEncounterId ? pvpEncounters[sharedState.pvpEncounterId] : null;
    const isPvP = !!encounter;
    const log = isPvP ? encounter.log : sharedState.log;

    // --- Acting Player State ---
    const actingPlayerState = isPvP
        ? encounter.playerStates.find(p => p.playerId === player.id)
        : sharedState.partyMemberStates.find(p => p.playerId === player.id);

    // --- Validation ---
    if (actingPlayerState.actionPoints < cost) return;
    if ((actingPlayerState.spellCooldowns[spell.name] || 0) > 0) return;

    // Weapon Requirements Check
    if (spell.requires?.weaponType) {
        const mainHand = character.equipment.mainHand;
        const offHand = character.equipment.offHand;
        const hasRequiredWeapon = (hand) => {
            if (!hand) return false;
            return Array.isArray(spell.requires.weaponType) && spell.requires.weaponType.includes(hand.weaponType);
        };
        if (spell.requires.hand) {
            if (!hasRequiredWeapon(character.equipment[spell.requires.hand])) return;
        } else {
            if (!hasRequiredWeapon(mainHand) && !hasRequiredWeapon(offHand)) return;
        }
    }

    // --- Target Resolution ---
    // Resolve target using shared helper
    let target = normalizeTarget(sharedState, targetIndex, encounter);

    // FIX: Normalize explicit 'player' or self targets if normalizeTarget missed them (it shouldn't, but safe fallback)
    if (!target && (targetIndex === 'player' || targetIndex === player.id)) {
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
                actingPlayerState.health = Math.min(actingPlayerState.maxHealth, actingPlayerState.health + amount);
            },
            isDead: () => actingPlayerState.isDead
        };
    }

    // --- Special Handlers (Revive, Monk's Training) ---
    // Handlers return 'true' if they completely handle the action (including logging/AP). 
    // BUT our handlers currently just do the logic. We need to handle AP/Cooldowns consistently.
    // For Revive, we handle everything inside because of the early exit requirement.
    // For others, we might want consistent flow. 
    // Adaptation: The handler in `spell-handlers` currently does NOT handle costs. It returns true if logic applied.
    // Revive handler in my previous `write_to_file` DOES logging but NOT costs? 
    // Let's check `spell-handlers.js` content I wrote.
    // Revive handler: Logic + Logs. No AP deduction.
    // So I need to deduct AP here.

    if (SpellHandlers[spell.name] || spell.type === 'revive') {
        const handler = SpellHandlers[spell.name] || SpellHandlers['Revive'];

        // Revive Special Targeting Retrieval
        let handlerTarget = target ? target.state : null;
        if (spell.type === 'revive' && !handlerTarget && !isPvP && String(targetIndex).startsWith('p')) {
            const idx = parseInt(targetIndex.substring(1));
            if (sharedState.partyMemberStates[idx]) handlerTarget = sharedState.partyMemberStates[idx];
        }

        // Check if handler can run (e.g. Revive needs dead target)
        // We'll run it, and if it returns true, we assume success.
        // Actually Revive handler logs "no valid target" and returns true even if failed? 
        // My `spell-handlers.js` code: returns true always.
        // So we consume resources. This matches "cast but fail" mechanic potentially, 
        // OR we should check before consuming. 
        // Original code: Consumed resources BEFORE checking target validity for Revive? 
        // Original: `actingPlayerState.actionPoints -= cost;` THEN `if (!reviveTarget) log...`. So yes, wasted AP.

        actingPlayerState.actionPoints -= cost;
        actingPlayerState.spellCooldowns[spell.name] = spell.cooldown;

        handler(spell, character, actingPlayerState, log, handlerTarget);

        // Always end turn after special spells?
        // Revive: Yes. Monk's Training: Yes.
        broadcastAdventureUpdate(io, party);
        await checkAndEndTurnForPlayer(io, party, player);
        return;
    }

    // --- Roll Resolution ---
    // If target is null (e.g. AoE or Self Buff), we pass null. `resolveAttackRoll` handles null target (stealth check won't run).
    const attackResult = resolveAttackRoll(actingPlayerState, character, target ? target.state : null, spell.stat || 'wisdom', spell.hit || 15);

    // Consume Resources
    actingPlayerState.actionPoints -= cost;
    actingPlayerState.spellCooldowns[spell.name] = spell.cooldown;
    actingPlayerState.threat += cost;
    if (spell.bonusThreat) {
        actingPlayerState.threat += spell.bonusThreat;
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
        broadcastAdventureUpdate(io, party);
        await checkAndEndTurnForPlayer(io, party, player);
        return;
    }

    log.push({ message: description, type: spell.type === 'heal' || spell.type === 'buff' ? 'heal' : 'damage' });

    // --- Spell Effect Resolution ---

    // Monk Focus Gain (Pre-Reaction)
    // Monk Focus Gain (Pre-Reaction)
    if ((spell.name === 'Punch' || spell.name === 'Kick')) {
        const hasMonkTraining = character.equippedSpells.some(s => s.name === "Monk's Training");
        const mainHand = character.equipment.mainHand;
        const offHand = character.equipment.offHand;
        const isUnarmed = (!mainHand || !mainHand.name) && (!offHand || !offHand.name);

        // Ensure focus is initialized
        if (actingPlayerState.focus === undefined) actingPlayerState.focus = 0;

        // Debug Log (Temporary)
        // log.push({ message: `[Debug] Monk:${hasMonkTraining} Unarmed:${isUnarmed} Focus:${actingPlayerState.focus}`, type: 'info' });

        if (hasMonkTraining && isUnarmed && actingPlayerState.focus < 3) {
            actingPlayerState.focus += 1;
            log.push({ message: `${character.characterName} gains 1 Focus.`, type: 'heal' });
        }
    }

    // Check PvP Reaction for Attack Spells
    if (isPvP && target && (spell.type === 'attack' || (spell.type === 'versatile' && target.team !== actingPlayerState.team))) {
        let specialBase = getSpecialSpellDamage(spell, character, actingPlayerState);
        let baseDmg = specialBase !== null ? specialBase : (spell.damage || (spell.baseEffect + attackResult.modifiers.statValue));

        let debuffToUse = spell.debuff ? { ...spell.debuff } : null;
        // Debuff scaling logic
        if (debuffToUse && debuffToUse.scaling === 'wisdom') {
            const bonuses = getBonusStatsForPlayer(character, actingPlayerState);
            const wis = (character.wisdom || 0) + (bonuses.wisdom || 0);
            debuffToUse.damage = Math.max(1, (debuffToUse.baseDamage || 0) + wis);
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
            return;
        }
    }

    // Apply Effects
    if (spell.type === 'heal') {
        // Enforce friendly/self targeting for Heals to match PvE parity
        const validTarget = (target && (isPvP || target.isPlayer)) ? target : null;
        const healTarget = validTarget || {
            name: actingPlayerState.name,
            state: actingPlayerState,
            heal: (amt) => actingPlayerState.health = Math.min(actingPlayerState.maxHealth, actingPlayerState.health + amt),
            id: actingPlayerState.playerId,
            isPvP: isPvP
        };
        healTarget.heal(spell.heal);
        const tId = healTarget.isPvP ? healTarget.id : (healTarget.id || healTarget.state?.playerId);
        log.push({ message: `Healed ${healTarget.name} for ${spell.heal} HP. [id:${tId}]`, type: 'heal' });
    }
    else if (spell.type === 'buff') {
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

        // Scaling logic
        const scalingStat = buff.scaling || buff.shield;
        if (scalingStat) {
            const bonuses = getBonusStatsForPlayer(character, actingPlayerState);
            const statVal = (character[scalingStat] || 0) + (bonuses[scalingStat] || 0);
            buff.value = (buff.value || 0) + statVal;
            delete buff.scaling;
            delete buff.shield;
        }

        // Use applyBuff if method exists, else manual push (fallback)
        if (buffTarget.applyBuff) {
            buffTarget.applyBuff(buff);
        } else {
            // Fallback for self wrapper if applyBuff missing
            const existingIndex = buffTarget.buffs.findIndex(b => b.type === buff.type);
            if (existingIndex !== -1) buffTarget.buffs.splice(existingIndex, 1);
            buffTarget.buffs.push(buff);
        }

        const tId = buffTarget.isPvP ? buffTarget.id : (buffTarget.id || buffTarget.state?.playerId);
        if (buff.type === 'Magic Barrier') {
            log.push({ message: `${buffTarget.name} gains Magic Barrier (${buff.value} Shield)! [id:${tId}]`, type: 'heal' });
        } else {
            log.push({ message: `${buffTarget.name} gains ${buff.type}${buff.value ? ` (${buff.value})` : ''}! [id:${tId}]`, type: 'heal' });
        }
    }
    else if (spell.type === 'attack' || spell.type === 'aoe' || spell.type === 'versatile') {
        // Collect Targets
        // Collect Targets
        let targets = [];
        if (spell.aoeTargeting === 'all' && !isPvP) {
            sharedState.zoneCards.forEach((c, i) => {
                if (c && c.type === 'enemy') targets.push(normalizeTarget(sharedState, i, null));
            });
        } else if (spell.aoeTargeting === 'adjacent' && !isPvP && target) {
            targets.push(target);
            const enemyIdx = parseInt(targetIndex);
            [-1, 1].forEach(offset => {
                const adj = normalizeTarget(sharedState, enemyIdx + offset, null);
                if (adj) targets.push(adj);
            });
        } else if (target) {
            if ((target.isPlayer) || (target.state && target.state.type === 'enemy')) {
                targets.push(target);
            } else {
                if (target.state && target.state.type !== 'enemy') {
                    log.push({ message: "Invalid target!", type: 'info' });
                    broadcastAdventureUpdate(io, party);
                    await checkAndEndTurnForPlayer(io, party, player);
                    return;
                }
            }
        } else {
            log.push({ message: "Invalid target!", type: 'info' });
            broadcastAdventureUpdate(io, party);
            await checkAndEndTurnForPlayer(io, party, player);
            return;
        }

        // Deduplicate targets
        const uniqueTargets = [...new Map(targets.map(t => [t.id, t])).values()];

        // --- UNIFIED: Calculate and apply damage to each target ---
        uniqueTargets.forEach(target => {
            if (target.state.health <= 0) return;

            let baseDamage = spell.damage || 0;
            let isHeal = false;

            // Versatile Logic
            if (spell.type === 'versatile') {
                const effectVal = spell.baseEffect + attackResult.modifiers.statValue;
                // Check if target is friendly
                const isFriendly = (isPvP && target.team === actingPlayerState.team) || (!isPvP && target.isPlayer);

                if (isFriendly) {
                    // Heal Friendly
                    target.heal(effectVal);
                    log.push({ message: `Healed ${target.name} for ${effectVal} HP.`, type: 'heal' });
                    isHeal = true;
                } else {
                    baseDamage = effectVal;
                }
            }

            // Special spell damage calculations
            if (!isHeal) {
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
                else if (spell.name === 'Cone of Cold') {
                    if (attackResult.total >= (spell.hit || 10)) {
                        baseDamage = (spell.damage || 0) + attackResult.modifiers.statValue;
                    } else {
                        baseDamage = 0;
                    }
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
                    if (!spell.debuff) {
                        spell.debuff = { type: 'bleed', duration: 3, damage: 1, damageType: 'Physical' };
                    }
                }
                else if (spell.name === 'Punch' || spell.name === 'Kick') {
                    const hasMonkTraining = character.equippedSpells.some(s => s.name === "Monk's Training");
                    const isUnarmed = !character.equipment.mainHand && !character.equipment.offHand;
                    if (hasMonkTraining && isUnarmed) {
                        baseDamage += 1;
                    }
                }
                else if (spell.name === 'Crushing Blow' || spell.name === 'Dagger Throw') {
                    baseDamage = (character.equipment.mainHand?.weaponDamage || 0) + (spell.damageBonus || 0);
                }
            }

            // Apply resistance
            const resistance = target.getResistance(spell.damageType);
            const damageToDeal = baseDamage > 0 ? Math.max(1, baseDamage - resistance) : 0;

            // --- VEXOR DODGE ---
            if (target.name === 'Vexor, Lord of the Arena') {
                const columns = sharedState.zoneCards.filter(c => c && c.name === 'Stone Column');
                if (columns.length > 0 && Math.floor(Math.random() * 20) + 1 >= 10) {
                    log.push({ message: `Vexor, Lord of the Arena's Dodge: Jumps behind a Stone Column! Avoided!`, type: 'reaction' });
                    log.push({ message: `(Tip: Destroy the Stone Columns!)`, type: 'info' });
                    return;
                }
            }

            let hitDescription = '';
            if (baseDamage > 0) {
                applyDamage(target.state, damageToDeal);
                hitDescription = `Dealt ${damageToDeal} ${spell.damageType || 'Magic'} damage to ${target.name} [id:${target.id}].`;
                if (damageToDeal < baseDamage) hitDescription += ` (${baseDamage - damageToDeal} resisted)`;
            }

            // Apply debuffs
            if (spell.debuff) {
                if (!target.state.debuffs) target.state.debuffs = [];
                const existingIndex = target.state.debuffs.findIndex(d => d.type.toLowerCase() === spell.debuff.type.toLowerCase());
                if (existingIndex !== -1) target.state.debuffs.splice(existingIndex, 1);
                let debuffToApply = { ...spell.debuff };
                if (spell.debuff.scaling === 'wisdom') {
                    const bonuses = getBonusStatsForPlayer(character, actingPlayerState);
                    const wis = (character.wisdom || 0) + (bonuses.wisdom || 0);
                    debuffToApply.damage = Math.max(1, (spell.debuff.baseDamage || 0) + wis);
                }
                target.state.debuffs.push(debuffToApply);
                hitDescription += ` ${target.name} is now ${spell.debuff.type}!`;
            }

            if (spell.onHit?.debuff && attackResult.total >= (spell.onHit.threshold || spell.hit)) { // Fixed 'total' and 'hitTarget' reference
                if (!target.state.debuffs) target.state.debuffs = [];
                const existingIndex = target.state.debuffs.findIndex(d => d.type === spell.onHit.debuff.type);
                if (existingIndex !== -1) target.state.debuffs.splice(existingIndex, 1);
                target.state.debuffs.push({ ...spell.onHit.debuff });
                hitDescription += ` ${target.name} is now ${spell.onHit.debuff.type}!`;
            }

            log.push({ message: hitDescription.trim(), type: 'damage' });

            // Check for death
            if (target.state.health <= 0) {
                if (target.isPvP) {
                    defeatEnemyInParty(io, party, { playerId: target.id }, null);
                } else {
                    defeatEnemyInParty(io, party, target.state, target.cardIndex);
                }
            }
        });
    }

    broadcastAdventureUpdate(io, party);
    await checkAndEndTurnForPlayer(io, party, player);
}

export async function processEquipItem(io, party, player, payload) {
    const { inventoryIndex } = payload;
    const { character } = player;

    const itemToEquip = character.inventory[inventoryIndex];
    if (!itemToEquip) return;

    const chosenSlot = Array.isArray(itemToEquip.slot) ? itemToEquip.slot[0] : itemToEquip.slot;
    if (!chosenSlot) return;

    if (party.sharedState) {
        let actingPlayerState;
        if (party.sharedState.pvpEncounterId) {
            const encounter = pvpEncounters[party.sharedState.pvpEncounterId];
            actingPlayerState = encounter.playerStates.find(p => p.playerId === player.id);
        } else {
            actingPlayerState = party.sharedState.partyMemberStates.find(p => p.playerId === player.id);
        }

        if (actingPlayerState.actionPoints < 1) return;
        actingPlayerState.actionPoints--;
        actingPlayerState.threat += 1;

        const logTarget = party.sharedState.pvpEncounterId ? pvpEncounters[party.sharedState.pvpEncounterId] : party.sharedState;
        logTarget.log.push({ message: `${character.characterName} spends 1 AP to change equipment.`, type: 'info' });
    }

    let itemsToUnequip = [];
    if (itemToEquip.hands === 2) {
        if (character.equipment.mainHand) itemsToUnequip.push(character.equipment.mainHand);
        if (character.equipment.offHand && character.equipment.offHand !== character.equipment.mainHand) itemsToUnequip.push(character.equipment.offHand);
    } else {
        if (['mainHand', 'offHand'].includes(chosenSlot) && character.equipment.mainHand && character.equipment.mainHand.hands === 2) {
            itemsToUnequip.push(character.equipment.mainHand);
        } else if (character.equipment[chosenSlot]) {
            itemsToUnequip.push(character.equipment[chosenSlot]);
        }
    }

    const freeSlots = character.inventory.filter(i => !i).length;
    if (itemsToUnequip.length > freeSlots) return;

    const { hands } = itemToEquip;
    if (hands === 2) {
        if (character.equipment.mainHand) addItemToInventoryServer(character, character.equipment.mainHand);
        if (character.equipment.offHand && character.equipment.offHand !== character.equipment.mainHand) {
            addItemToInventoryServer(character, character.equipment.offHand);
        }
        character.equipment.mainHand = null;
        character.equipment.offHand = null;
    } else if (['mainHand', 'offHand'].includes(chosenSlot)) {
        if (character.equipment.mainHand && character.equipment.mainHand.hands === 2) {
            addItemToInventoryServer(character, character.equipment.mainHand);
            character.equipment.mainHand = null;
            character.equipment.offHand = null;
        }
    }

    if (character.equipment[chosenSlot]) {
        addItemToInventoryServer(character, character.equipment[chosenSlot]);
    }

    if (hands === 2) {
        character.equipment.mainHand = itemToEquip;
        character.equipment.offHand = itemToEquip;
    } else {
        character.equipment[chosenSlot] = itemToEquip;
    }

    character.inventory[inventoryIndex] = null;

    io.to(player.id).emit('characterUpdate', character);

    broadcastAdventureUpdate(io, party);
    await checkAndEndTurnForPlayer(io, party, player);
}

export async function processUseItemAbility(io, party, player, payload) {
    const { slot } = payload;
    const character = player.character;
    const { sharedState } = party;
    const item = character.equipment[slot];

    let actingPlayerState;
    let logTarget;
    if (sharedState.pvpEncounterId) {
        const encounter = pvpEncounters[sharedState.pvpEncounterId];
        actingPlayerState = encounter.playerStates.find(p => p.playerId === player.id);
        logTarget = encounter;
    } else {
        actingPlayerState = sharedState.partyMemberStates.find(p => p.playerId === player.id);
        logTarget = sharedState;
    }

    if (!item || !item.activatedAbility || !actingPlayerState || actingPlayerState.actionPoints < item.activatedAbility.cost || (actingPlayerState.itemCooldowns[item.name] || 0) > 0) {
        return;
    }

    const ability = item.activatedAbility;
    actingPlayerState.actionPoints -= ability.cost;
    actingPlayerState.threat += ability.cost;
    actingPlayerState.itemCooldowns[item.name] = ability.cooldown;

    if (ability.buff) {
        const buff = ability.buff;
        const existingIndex = actingPlayerState.buffs.findIndex(b => b.type === buff.type);
        if (existingIndex !== -1) actingPlayerState.buffs.splice(existingIndex, 1);
        actingPlayerState.buffs.push({ ...buff });
        logTarget.log.push({ message: `${character.characterName} used ${ability.name} and gained the ${buff.type} buff!`, type: 'heal' });
    }
    if (ability.effect === 'cleanse') {
        const bleedIndex = actingPlayerState.debuffs.findIndex(d => d.type === 'bleed');
        const poisonIndex = actingPlayerState.debuffs.findIndex(d => d.type === 'poison');
        if (poisonIndex !== -1) {
            const removed = actingPlayerState.debuffs.splice(poisonIndex, 1);
            logTarget.log.push({ message: `${character.characterName} cleansed ${removed[0].type}!`, type: 'heal' });
        } else if (bleedIndex !== -1) {
            const removed = actingPlayerState.debuffs.splice(bleedIndex, 1);
            logTarget.log.push({ message: `${character.characterName} cleansed ${removed[0].type}!`, type: 'heal' });
        } else {
            logTarget.log.push({ message: `${character.characterName} used ${ability.name}, but there was nothing to cleanse.`, type: 'info' });
        }
    }

    broadcastAdventureUpdate(io, party);
    await checkAndEndTurnForPlayer(io, party, player);
}

export async function processUseConsumable(io, party, player, payload) {
    const { inventoryIndex, targetIndex } = payload;
    const character = player.character;
    const { sharedState } = party;
    const item = character.inventory[inventoryIndex];

    let actingPlayerState;
    let logTarget;
    if (sharedState.pvpEncounterId) {
        const encounter = pvpEncounters[sharedState.pvpEncounterId];
        actingPlayerState = encounter.playerStates.find(p => p.playerId === player.id);
        logTarget = encounter;
    } else {
        actingPlayerState = sharedState.partyMemberStates.find(p => p.playerId === player.id);
        if (!actingPlayerState) {
            actingPlayerState = sharedState.partyMemberStates.find(p => p.name === character.characterName);
        }
        logTarget = sharedState;
    }

    if (!actingPlayerState) return;

    const cost = item.cost || 0;
    if (!item || item.type !== 'consumable' || actingPlayerState.actionPoints < cost) {
        return;
    }

    actingPlayerState.actionPoints -= cost;
    actingPlayerState.threat += cost;

    // Handle enemy-targeted consumables
    if (item.targetEnemy) {
        const targetCard = sharedState.zoneCards[targetIndex];
        if (!targetCard || targetCard.type !== 'enemy' || targetCard.isDead) {
            // Refund AP if no valid target
            actingPlayerState.actionPoints += cost;
            actingPlayerState.threat -= cost;
            return;
        }

        const roll = Math.floor(Math.random() * 20) + 1;
        const hitThreshold = item.hit || 10;
        const isHit = roll >= hitThreshold;
        const isCrit = roll === 20;

        if (isHit) {
            const rollColor = '#2ecc71';
            const rollDisplay = `<span style="color:${rollColor}">🎲${roll}</span>`;
            // Apply damage
            if (item.damage) {
                const damage = item.damage;
                targetCard.health -= damage;
                logTarget.log.push({
                    message: `${character.characterName} throws ${item.name} at ${targetCard.name}! ${rollDisplay} Deals ${damage} damage! [id:${targetCard.id}]`,
                    type: 'damage'
                });
            }

            // Apply onHit debuffs
            if (item.onHit?.debuff) {
                const debuffToApply = { ...item.onHit.debuff };
                const existingIndex = (targetCard.debuffs || []).findIndex(d => d.type === debuffToApply.type);
                if (existingIndex !== -1) {
                    targetCard.debuffs[existingIndex] = debuffToApply;
                } else {
                    targetCard.debuffs = targetCard.debuffs || [];
                    targetCard.debuffs.push(debuffToApply);
                }
                logTarget.log.push({ message: `${targetCard.name} is affected by ${debuffToApply.type}!`, type: 'damage' });
            }

            // Check if target died
            if (targetCard.health <= 0) {
                defeatEnemyInParty(io, party, targetCard, targetIndex);
            }
        } else {
            const rollColor = '#e74c3c';
            const rollDisplay = `<span style="color:${rollColor}">🎲${roll}</span>`;
            logTarget.log.push({
                message: `${character.characterName} throws ${item.name} at ${targetCard.name}! ${rollDisplay} Miss!`,
                type: 'info'
            });
        }
    } else {
        // Self-targeting consumables (potions, food, etc.)
        if (item.heal) {
            actingPlayerState.health = Math.min(actingPlayerState.maxHealth, actingPlayerState.health + item.heal);
            logTarget.log.push({ message: `${character.characterName} used ${item.name}, healing for ${item.heal} HP.`, type: 'heal' });
        }
        if (item.buff) {
            const buff = item.buff;
            const existingIndex = actingPlayerState.buffs.findIndex(b => b.type === buff.type);
            if (existingIndex !== -1) actingPlayerState.buffs.splice(existingIndex, 1);
            actingPlayerState.buffs.push({ ...buff });
            logTarget.log.push({ message: `${character.characterName} feels the effects of ${item.name}.`, type: 'heal' });
        }
    }

    // Consume the item
    if (item.charges) {
        item.charges--;
        if (item.charges <= 0) character.inventory[inventoryIndex] = null;
    } else {
        item.quantity = (item.quantity || 1) - 1;
        if (item.quantity <= 0) character.inventory[inventoryIndex] = null;
    }
    io.to(player.id).emit('characterUpdate', character);

    broadcastAdventureUpdate(io, party);
    await checkAndEndTurnForPlayer(io, party, player);
}

export async function processUnequipItem(io, party, player, payload) {
    const { slot } = payload;
    const { character } = player;

    const itemToUnequip = character.equipment[slot];
    if (!itemToUnequip) return;

    // Check if there's room in inventory
    const freeSlots = character.inventory.filter(i => !i).length;
    if (freeSlots === 0) return;

    if (party.sharedState) {
        let actingPlayerState;
        if (party.sharedState.pvpEncounterId) {
            const encounter = pvpEncounters[party.sharedState.pvpEncounterId];
            actingPlayerState = encounter.playerStates.find(p => p.playerId === player.id);
        } else {
            actingPlayerState = party.sharedState.partyMemberStates.find(p => p.playerId === player.id);
        }

        if (actingPlayerState.actionPoints < 1) return;
        actingPlayerState.actionPoints--;
        actingPlayerState.threat += 1;

        const logTarget = party.sharedState.pvpEncounterId ? pvpEncounters[party.sharedState.pvpEncounterId] : party.sharedState;
        logTarget.log.push({ message: `${character.characterName} spends 1 AP to unequip ${itemToUnequip.name}.`, type: 'info' });
    }

    // Move item to inventory
    addItemToInventoryServer(character, itemToUnequip);
    character.equipment[slot] = null;

    // Handle 2-handed weapons
    if (itemToUnequip.hands === 2) {
        character.equipment.offHand = null;
    }

    io.to(player.id).emit('characterUpdate', character);

    broadcastAdventureUpdate(io, party);
    await checkAndEndTurnForPlayer(io, party, player);
}