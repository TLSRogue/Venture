// adventure/adventure-actions.js

import { players, parties, pvpEncounters } from '../serverState.js';
import { gameData } from '../data/index.js';
import { getBonusStatsForPlayer, addItemToInventoryServer } from '../utilsHelpers.js';
import { checkAndEndTurnForPlayer, defeatEnemyInParty } from './adventure-state.js';
import { handleResolveReaction } from './reaction-handlers.js';
import { applyDamage, normalizeTarget, resolveAttackRoll, calculateWeaponDamage, getWeaponDebuff, checkVexorDodge, checkVampirePhaseTransition, checkEnemyReaction, applyChillStack, getCombatContext, getHostileTargets, getAvailablePlayerReactions } from './combat-core.js';
import { INVENTORY_SIZE } from '../constants.js';
import { SpellHandlers, getSpecialSpellDamage } from './spell-handlers.js';
import { rollD20 } from '../shared.js';
import { broadcastAdventureUpdate } from '../utilsBroadcast.js';
import { initSpellContext, validateSpellCast, resolveSpellTarget, validateAttackTarget, dispatchSpecialSpell, handleZoneEffectSpell, resolveSpellRollAndConsume, handleMonkFocusGain, checkSpellPvpReaction, applySpellHeal, applySpellBuff, applySpellDebuff, applySpellAttack, handleCooldownReset } from './spell-cast-helpers.js';

function handlePvpReactionCheck(io, encounter, attackerCharacter, defendingPlayerState, actionDetails) {
    const defendingPlayerObject = players[defendingPlayerState.name];
    const defendingCharacter = defendingPlayerObject.character;

    // --- Time Stop Logic ---
    // 1. Prevent reaction if defender is under Time Stop
    if ((defendingPlayerState.debuffs || []).some(d => d.type === 'Time Stop')) {
        return false;
    }

    // 2. Prevent reaction if attack is Time Stop and Caster has 5+ Arcane Power
    if (actionDetails.spellName === 'Time Stop') {
        const attackerState = encounter.playerStates.find(p => p.playerId === attackerCharacter.playerId);
        if (attackerState) {
            const bonuses = getBonusStatsForPlayer(attackerCharacter, attackerState);
            if ((bonuses.arcanePower || 0) >= 5) {
                return false;
            }
        }
    }

    // UNIFIED: Use shared reaction availability helper
    const availableReactions = getAvailablePlayerReactions(defendingCharacter, defendingPlayerState, actionDetails);

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
            attackMessage: actionDetails.message,
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

    // UNIFIED: Use shared combat context helper
    const { sharedState, encounter, isPvP, log, actingPlayerState } = getCombatContext(party, player.id);

    const weapon = character.equipment[weaponSlot];

    // Basic Validation
    if (!weapon || (weapon.type !== 'weapon' && weapon.type !== 'shield')) return;
    if (actingPlayerState.actionPoints < weapon.cost) return;
    if ((actingPlayerState.weaponCooldowns[weaponSlot] || 0) > 0) return;

    // Get Target (Unified)
    const target = normalizeTarget(sharedState, targetIndex, encounter);
    if (!target) return;

    // Log is already set from getCombatContext

    // PvP Reaction Check
    if (isPvP && target.isPlayer) {
        // Calculate total damage with bonuses for the reaction prompt
        const bonuses = getBonusStatsForPlayer(character, actingPlayerState);
        const powerKey = (weapon.damageType || 'Physical').toLowerCase() + 'Power';
        const powerBonus = bonuses[powerKey] || 0;
        const totalPotentialDamage = (weapon.weaponDamage || 0) + powerBonus;

        const actionDetails = {
            damage: totalPotentialDamage,
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
        // Calculate Damage - pass bonuses for gem power bonuses
        const bonuses = getBonusStatsForPlayer(character, actingPlayerState);
        const dmgResult = calculateWeaponDamage(weapon, target, bonuses);

        // Vexor Check (Zone-specific boss mechanic)
        if (checkVexorDodge(target, sharedState, log)) {
            broadcastAdventureUpdate(io, party);
            await checkAndEndTurnForPlayer(io, party, player);
            return;
        }

        // Darkness/Light Source Check
        if (target.state && target.state.darknessShrouded) {
            const hasLight = (actingPlayerState.buffs || []).some(b => b.type === 'Light Source');
            if (!hasLight) {
                log.push({ message: `${target.name} is shrouded in darkness! You cannot target them without a light source!`, type: 'info' });
                broadcastAdventureUpdate(io, party);
                await checkAndEndTurnForPlayer(io, party, player);
                return;
            }
        }

        // Flying Check - melee attacks cannot hit flying enemies
        if (weapon.range === 'melee' && target.state && (target.state.buffs || []).some(b => b.type === 'Flying')) {
            log.push({ message: `${target.name} is flying! Melee attacks cannot reach them!`, type: 'info' });
            broadcastAdventureUpdate(io, party);
            await checkAndEndTurnForPlayer(io, party, player);
            return;
        }

        // --- ENEMY REACTION CHECK ---
        // Check if the enemy can react to this attack (only for PVE attacks against enemies)
        if (!isPvP && !target.isPlayer && target.state) {
            // Build attack types array: staff weapons count as both ranged and magic
            const attackTypes = [weapon.range];
            if (weapon.weaponType && weapon.weaponType.includes('Staff')) {
                attackTypes.push('magic');
            }
            const reactionResult = checkEnemyReaction(target.state, attackTypes, actingPlayerState, log);

            if (reactionResult.negated) {
                // Full parry - attack is completely negated
                logMessage += ` But the attack was parried!`;
                log.push({ message: logMessage, type: 'info' });

                // Apply counter-damage to the player
                if (reactionResult.counterDamage > 0) {
                    const bonuses = getBonusStatsForPlayer(character, actingPlayerState);
                    const resistance = reactionResult.counterDamageType === 'Physical' ? (bonuses.physicalResistance || 0) : 0;
                    const counterDmg = Math.max(1, reactionResult.counterDamage - resistance);

                    applyDamage(actingPlayerState, counterDmg);
                    let counterMsg = `${actingPlayerState.name} takes ${counterDmg} ${reactionResult.counterDamageType} damage from the counter-attack!`;
                    if (resistance > 0) counterMsg += ` (${resistance} resisted)`;
                    log.push({ message: counterMsg, type: 'damage' });

                    // Check if player died from counter-attack
                    if (actingPlayerState.health <= 0) {
                        actingPlayerState.health = 0;
                        actingPlayerState.isDead = true;
                        if (player.character) {
                            actingPlayerState.lootableInventory = [...player.character.inventory.filter(Boolean)];
                            player.character.inventory = Array(INVENTORY_SIZE).fill(null);
                            if (player.id) io.to(player.id).emit('characterUpdate', player.character);
                        }
                        log.push({ message: `${actingPlayerState.name} has been defeated!`, type: 'damage' });
                    }
                }

                broadcastAdventureUpdate(io, party);
                await checkAndEndTurnForPlayer(io, party, player);
                return;
            } else if (reactionResult.blockAmount > 0) {
                // Block-style - reduce damage by blockAmount
                const blockedDmg = Math.min(reactionResult.blockAmount, dmgResult.finalDamage);
                dmgResult.finalDamage = Math.max(1, dmgResult.finalDamage - blockedDmg);
                logMessage += ` (${blockedDmg} blocked!)`;
            }
        }

        // Handle On-Hit Threshold Effects (Bonus Damage, Special Debuffs)
        if (weapon.onHit && attackResult.total >= (weapon.onHit.threshold || 20)) {
            if (weapon.onHit.damageBonus) {
                dmgResult.finalDamage += weapon.onHit.damageBonus;
                logMessage += ` (Bonus Damage Triggered!)`;
            }
        }

        // Apply Damage
        target.applyDamage(dmgResult.finalDamage);
        logMessage += ` Deals ${dmgResult.finalDamage} ${dmgResult.damageType} damage! [id:${target.id}]`;

        // Track weapon-hit quests (e.g., "Hit 5 times with Wooden Training Sword")
        character.quests.forEach(quest => {
            if (quest.status === 'active' && quest.details.requiredWeapon && quest.details.requiredWeapon === weapon.name) {
                quest.progress++;
                if (quest.progress >= quest.details.required) {
                    quest.status = 'readyToTurnIn';
                    io.to(player.id).emit('questObjectiveComplete', quest.details.title);
                }
            }
        });
        io.to(player.id).emit('characterUpdate', character);


        // Flame Shield burn-on-melee counter effect
        if (weapon.range === 'melee' || (!weapon.range && !['Staff', 'Two-Hand Bow', 'One-Hand Crossbow', 'Wand'].includes(weapon.weaponType))) {
            const flameShield = target.buffs?.find(b => b.type === 'Flame Shield');
            if (flameShield && flameShield.burnOnMelee) {
                // Apply burn to the attacker
                const burnDebuff = { ...flameShield.burnOnMelee };
                const existingBurn = actingPlayerState.debuffs.findIndex(d => d.type.toLowerCase() === 'burn');
                if (existingBurn !== -1) actingPlayerState.debuffs.splice(existingBurn, 1);
                actingPlayerState.debuffs.push(burnDebuff);
                log.push({ message: `${actingPlayerState.name} is burned by ${target.name}'s Flame Shield!`, type: 'damage' });
            }

            // Ice Barrier chill-on-melee counter effect
            const iceBarrier = target.buffs?.find(b => b.type === 'Ice Barrier');
            if (iceBarrier && iceBarrier.chillOnMelee) {
                // Apply chill to the attacker
                applyChillStack(actingPlayerState, iceBarrier.chillOnMelee, log);
                log.push({ message: `${actingPlayerState.name} is chilled by ${target.name}'s Ice Barrier!`, type: 'damage' });
            }
        }

        // Apply Debuffs (Unified)
        let debuff = getWeaponDebuff(weapon, attackResult.isCriticalHit);

        // Check for Threshold Debuffs (e.g. 15+ Daze/Bleed)
        if (weapon.onHit && weapon.onHit.debuff && attackResult.total >= (weapon.onHit.threshold || 20)) {
            debuff = weapon.onHit.debuff; // Prioritize threshold debuff or stack? Usually override or stack. 
            // For these weapons, it's the main effect.
            // If critical hit usually applies something else, we might need merging.
            // But valid assumption: specific threshold effect takes precedence or is the only one.
        }

        if (debuff) {
            target.applyDebuff(debuff);
            logMessage += attackResult.isCriticalHit ? ` CRIT! Applies ${debuff.type}!` : ` Applies ${debuff.type}!`;
        }

        log.push({ message: logMessage, type: 'damage' });

        // Vampire Phase Transition (spawn Vampire's Assistant at 60HP)
        checkVampirePhaseTransition(target, sharedState, gameData, log);

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
    // 1. Initialize context
    const ctx = initSpellContext(party, player, payload);
    if (!ctx) return;

    // 2. Validate (AP, cooldowns, silence, weapon requirements)
    if (!validateSpellCast(ctx)) {
        if ((ctx.actingPlayerState.debuffs || []).find(d => d.type.toLowerCase() === 'silence') && ctx.spell.isMagic) {
            broadcastAdventureUpdate(io, party);
        }
        return;
    }

    // 3. Resolve target
    ctx.target = resolveSpellTarget(ctx, player.id);

    // 4. Early validation for single-target attack spells
    if (!validateAttackTarget(ctx)) {
        broadcastAdventureUpdate(io, party);
        return;
    }

    // 5. Special spell handlers (Revive, Cleanse, Cauterize, Expend Heat, Spirit Call)
    if (await dispatchSpecialSpell(io, party, player, ctx)) return;

    // 6. Zone effect spells (Blizzard, etc.)
    if (await handleZoneEffectSpell(io, party, player, ctx)) return;

    // 7. Roll resolution + resource consumption
    const attackResult = resolveSpellRollAndConsume(ctx);
    if (!attackResult) {
        broadcastAdventureUpdate(io, party);
        await checkAndEndTurnForPlayer(io, party, player);
        return;
    }
    ctx.attackResult = attackResult;

    // 8. Monk focus gain (Punch/Kick)
    handleMonkFocusGain(ctx);

    // 9. PvP reaction check for attack spells
    if (checkSpellPvpReaction(io, party, ctx, handlePvpReactionCheck)) return;

    // 10. Apply spell effects by type
    const { spell } = ctx;
    if (spell.type === 'heal') {
        applySpellHeal(ctx);
    } else if (spell.type === 'buff') {
        applySpellBuff(ctx);
    } else if (spell.type === 'debuff') {
        if (!applySpellDebuff(ctx)) {
            broadcastAdventureUpdate(io, party);
            await checkAndEndTurnForPlayer(io, party, player);
            return;
        }
    } else if (spell.type === 'attack' || spell.type === 'aoe' || spell.type === 'versatile') {
        if (!await applySpellAttack(io, party, player, ctx)) {
            broadcastAdventureUpdate(io, party);
            await checkAndEndTurnForPlayer(io, party, player);
            return;
        }
    }

    // 11. Cooldown reset (Scorch)
    handleCooldownReset(ctx);

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

    // Recalculate derived stats (Max Health) for the active adventure state
    if (party.sharedState) {
        let actingPlayerState;
        if (party.sharedState.pvpEncounterId) {
            const encounter = pvpEncounters[party.sharedState.pvpEncounterId];
            actingPlayerState = encounter.playerStates.find(p => p.playerId === player.id);
        } else {
            actingPlayerState = party.sharedState.partyMemberStates.find(p => p.playerId === player.id);
        }

        if (actingPlayerState) {
            const bonuses = getBonusStatsForPlayer(character, actingPlayerState);
            const newMaxHealth = 10 + (bonuses.maxHealth || 0);

            // Log update if max health changed (Optional, good for clarity)
            // if (actingPlayerState.maxHealth !== newMaxHealth) {
            //    const diff = newMaxHealth - actingPlayerState.maxHealth;
            //    party.sharedState.log.push({ message: `${character.characterName}'s Max HP updated (${diff > 0 ? '+' : ''}${diff}).`, type: 'info' });
            // }

            actingPlayerState.maxHealth = newMaxHealth;

            // Clamp current health if it exceeds new max
            if (actingPlayerState.health > newMaxHealth) {
                actingPlayerState.health = newMaxHealth;
            }
        }
    }

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

        const roll = rollD20();
        const hitThreshold = item.hit || 10;
        const isHit = roll >= hitThreshold;
        const isCrit = roll === 20;

        if (isHit) {
            const rollColor = '#2ecc71';
            const rollDisplay = `<span style="color:${rollColor}">ðŸŽ²${roll}</span>`;
            // Apply damage
            if (item.damage) {
                const damage = item.damage;
                applyDamage(targetCard, damage);
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
            const rollDisplay = `<span style="color:${rollColor}">ðŸŽ²${roll}</span>`;
            logTarget.log.push({
                message: `${character.characterName} throws ${item.name} at ${targetCard.name}! ${rollDisplay} Miss!`,
                type: 'info'
            });
        }
    } else {
        // Check for material requirements (e.g., Tinderbox requires Wood)
        if (item.requiresMaterial) {
            const matIndex = character.inventory.findIndex(inv => inv && inv.name === item.requiresMaterial);
            if (matIndex === -1) {
                logTarget.log.push({ message: `You need ${item.requiresMaterial} to use ${item.name}!`, type: 'info' });
                actingPlayerState.actionPoints += cost;
                actingPlayerState.threat -= cost;
                return;
            }
            // Consume 1 material
            const mat = character.inventory[matIndex];
            if (mat.quantity && mat.quantity > 1) {
                mat.quantity--;
            } else {
                character.inventory[matIndex] = null;
            }
            logTarget.log.push({ message: `${character.characterName} uses 1 ${item.requiresMaterial}.`, type: 'info' });
        }

        // Create or refresh zone effect (e.g., Campfire)
        if (item.createsZoneEffect === 'campfire') {
            if (!sharedState.zoneEffects) sharedState.zoneEffects = [];
            const casterTeam = actingPlayerState.team || 'pve';
            const existingCampfire = sharedState.zoneEffects.find(
                e => e.type === 'campfire' && (e.casterTeam === casterTeam)
            );
            if (existingCampfire) {
                existingCampfire.duration = 5;
                logTarget.log.push({ message: `${character.characterName} stokes the Campfire! (Refreshed to 5 turns)`, type: 'success' });
            } else {
                sharedState.zoneEffects.push({
                    type: 'campfire',
                    name: 'Campfire',
                    icon: '🔥',
                    duration: 5,
                    description: 'A warm campfire. Click to cook!',
                    casterName: character.characterName,
                    casterTeam: casterTeam,
                });
                logTarget.log.push({ message: `${character.characterName} lights a Campfire! (5 turns)`, type: 'success' });
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
