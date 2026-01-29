// adventure/adventure-actions.js

import { players, parties, pvpEncounters } from '../serverState.js';
import { gameData } from '../data/index.js';
import { getBonusStatsForPlayer, addItemToInventoryServer } from '../utilsHelpers.js';
import { checkAndEndTurnForPlayer, defeatEnemyInParty } from './adventure-state.js';
import { handleResolveReaction } from './reaction-handlers.js';
import { applyDamage, normalizeTarget, resolveAttackRoll, calculateWeaponDamage, getWeaponDebuff, checkVexorDodge, checkVampirePhaseTransition, checkEnemyReaction } from './combat-core.js';
import { SpellHandlers, getSpecialSpellDamage } from './spell-handlers.js';
import { broadcastAdventureUpdate } from '../utilsBroadcast.js';

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
        // We need attacker state to check bonuses
        const attackerState = encounter.playerStates.find(p => p.playerId === attackerCharacter.playerId);
        if (attackerState) {
            const bonuses = getBonusStatsForPlayer(attackerCharacter, attackerState);
            if ((bonuses.arcanePower || 0) >= 5) {
                return false;
            }
        }
    }

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
    if (!weapon || (weapon.type !== 'weapon' && weapon.type !== 'shield')) return;
    if (actingPlayerState.actionPoints < weapon.cost) return;
    if ((actingPlayerState.weaponCooldowns[weaponSlot] || 0) > 0) return;

    // Get Target (Unified)
    const target = normalizeTarget(sharedState, targetIndex, encounter);
    if (!target) return;

    // Log
    const log = isPvP ? encounter.log : sharedState.log;

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
            const reactionResult = checkEnemyReaction(target.state, weapon.range, actingPlayerState, log);

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
                            player.character.inventory = Array(28).fill(null);
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

    // Calculate bonuses early for spell scaling
    const bonuses = getBonusStatsForPlayer(character, actingPlayerState);

    // --- Validation ---
    if (actingPlayerState.actionPoints < cost) return;
    if ((actingPlayerState.spellCooldowns[spell.name] || 0) > 0) return;

    // Silence Check - silenced players cannot cast MAGIC spells
    const silenceDebuff = (actingPlayerState.debuffs || []).find(d => d.type.toLowerCase() === 'silence');
    if (silenceDebuff && spell.isMagic) {
        log.push({ message: `${actingPlayerState.name} is Silenced and cannot use magic!`, type: 'info' });
        broadcastAdventureUpdate(io, party);
        return;
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
                const current = Number(actingPlayerState.health || 0);
                const max = Number(actingPlayerState.maxHealth || 10);
                const healAmt = Number(amount || 0);
                actingPlayerState.health = Math.min(max, current + (isNaN(healAmt) ? 0 : healAmt));
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

    // --- EARLY VALIDATION FOR ATTACK SPELLS ---
    // Only validate single-target attack spells (not versatile or aoe which have their own targeting logic)
    if (spell.type === 'attack' && !spell.aoeTargeting) {
        // Single-target attack spell needs a valid hostile target
        // In PVP: enemy team player. In PVE: enemy card.
        const isHostileTarget = target && (
            (isPvP && target.isPlayer && target.team !== actingPlayerState.team) ||
            (!isPvP && !target.isPlayer && target.state?.type === 'enemy')
        );
        if (!isHostileTarget) {
            const log = isPvP ? pvpEncounters[sharedState.pvpEncounterId].log : sharedState.log;
            log.push({ message: "Invalid target!", type: 'info' });
            broadcastAdventureUpdate(io, party);
            return;
        }
    }

    if (SpellHandlers[spell.name] || spell.type === 'revive' || spell.type === 'cleanse') {
        const handler = SpellHandlers[spell.name] || SpellHandlers['Revive'];

        // Special Targeting Retrieval for friendly-target spells
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
        // Also allow casting Cleanse on self if no target specified
        if (spell.type === 'cleanse' && !handlerTarget) {
            handlerTarget = actingPlayerState;
        }

        // Check if handler can run (e.g. Revive needs dead target)
        // We'll run it, and if it returns true, we assume success.
        // Actually Revive handler logs "no valid target" and returns true even if failed? 
        // My `spell-handlers.js` code: returns true always.
        // So we consume resources. This matches "cast but fail" mechanic potentially, 
        // OR we should check before consuming. 
        // Original code: Consumed resources BEFORE checking target validity for Revive? 
        // Original: `actingPlayerState.actionPoints -= cost;` THEN `if (!reviveTarget) log...`. So yes, wasted AP.

        // Defensive check: ensure health is a number
        if (handlerTarget) {
            handlerTarget.health = Number(handlerTarget.health || 0);
        }

        // Pass bonuses for Cleanse (Holy Power scaling)
        const result = handler(spell, character, actingPlayerState, log, handlerTarget, bonuses);

        // Handle Clear/Spirit Call/Dialogue selections
        if (result && result.pendingSelection) {

            // --- Spirit Call Handling ---
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
                    npcName: "Spirit Call",
                    node: spiritDialog,
                    cardIndex: -1 // Special index for triggered events
                });

                log.push({ message: `${character.characterName} calls out to the spirits...`, type: 'info' });
                broadcastAdventureUpdate(io, party);
                return;
            }

            // --- Cleanse Handling ---
            // Store pending cleanse state on party
            sharedState.pendingCleanse = result.pendingSelection;

            // Emit selection request to the caster
            io.to(result.pendingSelection.casterPlayerId).emit('party:requestDebuffSelection', {
                targetName: result.pendingSelection.targetName,
                debuffs: result.pendingSelection.debuffs,
                maxSelectable: result.pendingSelection.maxSelectable,
                casterName: result.pendingSelection.casterName
            });

            log.push({ message: `${character.characterName} prepares to cleanse ${result.pendingSelection.targetName}...`, type: 'info' });
            broadcastAdventureUpdate(io, party);
            // Don't end turn - waiting for selection
            return;
        }

        // Apply Cost and Cooldown if NO pending selection (Instant cast success)
        actingPlayerState.actionPoints -= cost;
        actingPlayerState.spellCooldowns[spell.name] = spell.cooldown;

        // Always end turn after special spells?
        // Revive: Yes. Monk's Training: Yes. Cleanse: Yes (if no selection needed).
        broadcastAdventureUpdate(io, party);
        await checkAndEndTurnForPlayer(io, party, player);
        return;
    }

    // --- Roll Resolution ---
    let spellStat = spell.stat || 'wisdom';
    // Handle array of stats (highest one used)
    if (Array.isArray(spellStat)) {
        const bonuses = getBonusStatsForPlayer(character, actingPlayerState);
        let bestStat = spellStat[0];
        let maxVal = -Infinity;

        spellStat.forEach(stat => {
            const val = (character[stat] || 0) + (bonuses[stat] || 0);
            if (val > maxVal) {
                maxVal = val;
                bestStat = stat;
            }
        });
        spellStat = bestStat;
    }

    // If target is null (e.g. AoE or Self Buff), we pass null. `resolveAttackRoll` handles null target (stealth check won't run).
    const attackResult = resolveAttackRoll(actingPlayerState, character, target ? target.state : null, spellStat, spell.hit || 15);

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

        if (hasMonkTraining && isUnarmed && actingPlayerState.focus < 3) {
            actingPlayerState.focus += 1;
            log.push({ message: `${character.characterName} gains 1 Focus.`, type: 'heal' });
        }
    }

    // Check PvP Reaction for Attack Spells
    if (isPvP && target && (spell.type === 'attack' || (spell.type === 'versatile' && target.team !== actingPlayerState.team))) {
        // UNIFIED SPECIAL DAMAGE & EFFECTS (Backstab, etc.)
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

        // UNIFIED: Debuff damage scales with power bonuses based on damage type (same as PVE)
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

        // Handle Rejuvenate healing amount (scales with caster's naturePower)
        if (spell.name === 'Rejuvenate') {
            const naturePower = bonuses.naturePower || 0;
            buff.healAmount = 1 + naturePower;
        }

        // Handle Magic Barrier scaling with arcanePower
        if (buff.type === 'Magic Barrier' && buff.scaling === 'arcanePower') {
            const bonusStats = getBonusStatsForPlayer(character, actingPlayerState);
            const arcanePower = bonusStats.arcanePower || 0;
            buff.value = (buff.baseValue || 2) + arcanePower;
            delete buff.baseValue;
            delete buff.scaling;
        }

        // Use applyBuff if method exists, else manual push (fallback)
        if (buffTarget.applyBuff) {
            buffTarget.applyBuff(buff);
        } else {
            // Fallback for self wrapper if applyBuff missing
            const existingIndex = buffTarget.buffs.findIndex(b => b.type === buff.type);
            if (existingIndex !== -1) {
                if (buff.stackDuration) {
                    buffTarget.buffs[existingIndex].duration += buff.duration;
                    log.push({ message: `${buffTarget.name}'s ${buff.type} duration extended by ${buff.duration} turns!`, type: 'heal' });
                    // Skip the standard "gains buff" log since we extended it
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
        } else {
            log.push({ message: `${buffTarget.name} gains ${buff.type}${buff.value ? ` (${buff.value})` : ''}! [id:${tId}]`, type: 'heal' });
        }
    }
    else if (spell.type === 'debuff') {
        // Debuff spells (like Silence) apply debuffs to hostile targets (enemies or enemy players)
        // In PVP: valid target is enemy team player. In PVE: valid target is enemy card.
        const isHostileTarget = target && (
            (isPvP && target.isPlayer && target.team !== actingPlayerState.team) ||
            (!isPvP && !target.isPlayer && target.state?.type === 'enemy')
        );
        if (!isHostileTarget) {
            log.push({ message: "Invalid target for debuff spell!", type: 'info' });
            broadcastAdventureUpdate(io, party);
            await checkAndEndTurnForPlayer(io, party, player);
            return;
        }

        const debuff = { ...spell.debuff };
        if (!target.state.debuffs) target.state.debuffs = [];

        // Replace existing debuff of same type
        const existingIndex = target.state.debuffs.findIndex(d => d.type.toLowerCase() === debuff.type.toLowerCase());
        if (existingIndex !== -1) target.state.debuffs.splice(existingIndex, 1);
        target.state.debuffs.push(debuff);

        log.push({ message: `${target.name} is now ${debuff.type.charAt(0).toUpperCase() + debuff.type.slice(1)}ed!`, type: 'damage' });
    }
    else if (spell.type === 'attack' || spell.type === 'aoe' || spell.type === 'versatile') {
        // Collect Targets - UNIFIED: enemy players in PVP are treated the same as enemies in PVE
        let targets = [];
        if (spell.aoeTargeting === 'all') {
            if (isPvP) {
                // PVP: Target all enemy team players
                encounter.playerStates.forEach(p => {
                    if (p.team !== actingPlayerState.team && !p.isDead) {
                        targets.push(normalizeTarget(sharedState, p.playerId, encounter));
                    }
                });
            } else {
                // PVE: Target all enemies in zone
                sharedState.zoneCards.forEach((c, i) => {
                    if (c && c.type === 'enemy') targets.push(normalizeTarget(sharedState, i, null));
                });
            }
        } else if (spell.aoeTargeting === 'adjacent') {
            // Adjacent targeting - include primary target first
            if (target) targets.push(target);
            if (!isPvP) {
                // PVE: Include spatially adjacent enemies
                const enemyIdx = parseInt(targetIndex);
                [-1, 1].forEach(offset => {
                    const adj = normalizeTarget(sharedState, enemyIdx + offset, null);
                    if (adj) targets.push(adj);
                });
            }
            // In PVP, 'adjacent' just hits the single target (no spatial positions)
        } else if (target) {
            // Single target attack/versatile - validate it's a hostile target
            const isHostile = (isPvP && target.isPlayer && target.team !== actingPlayerState.team) ||
                (!isPvP && target.state?.type === 'enemy');
            // Versatile spells can also target friendlies for healing (handled later)
            const isFriendly = (isPvP && target.team === actingPlayerState.team) ||
                (!isPvP && target.isPlayer);
            if (isHostile || (spell.type === 'versatile' && isFriendly)) {
                targets.push(target);
            } else {
                log.push({ message: "Invalid target!", type: 'info' });
                broadcastAdventureUpdate(io, party);
                await checkAndEndTurnForPlayer(io, party, player);
                return;
            }
        } else {
            log.push({ message: "Invalid target!", type: 'info' });
            broadcastAdventureUpdate(io, party);
            await checkAndEndTurnForPlayer(io, party, player);
            return;
        }

        // Deduplicate targets
        const uniqueTargets = [...new Map(targets.map(t => [t.id, t])).values()];

        // Whirlwind Logic: Determine number of attacks
        let numAttacks = 1;
        if (spell.name === 'Whirlwind') {
            numAttacks += actingPlayerState.actionPoints;
            actingPlayerState.actionPoints = 0; // Consume all AP
            log.push({ message: `${character.characterName} spins into a Whirlwind! ${numAttacks} total attacks!`, type: 'info' });
        }

        // --- UNIFIED: Calculate and apply damage to each target ---
        // For Whirlwind: Re-roll attack for each swing
        for (let attackNum = 0; attackNum < numAttacks; attackNum++) {
            // Whirlwind: Re-roll attack for this swing
            let currentAttackResult = attackResult; // Default to initial roll for non-Whirlwind
            if (spell.name === 'Whirlwind' && attackNum > 0) {
                // Re-roll for subsequent attacks
                currentAttackResult = resolveAttackRoll(actingPlayerState, character, null, spell.stat || 'strength', spell.hit || 10);
                const swingDescription = `Whirlwind Swing ${attackNum + 1}! ${currentAttackResult.rollDisplay}`;
                if (!currentAttackResult.isHit) {
                    log.push({ message: swingDescription + (currentAttackResult.roll === 1 ? ' Critical Miss!' : ' Miss!'), type: 'info' });
                    broadcastAdventureUpdate(io, party);
                    // Add delay for visual feedback
                    await new Promise(resolve => setTimeout(resolve, 500));
                    continue; // Skip damage but continue attacks
                }
                log.push({ message: swingDescription + ' Hit!', type: 'damage' });
            } else if (spell.name === 'Whirlwind' && attackNum === 0) {
                // First attack already rolled above, log if miss
                if (!currentAttackResult.isHit) {
                    log.push({ message: `Whirlwind Swing 1! ${currentAttackResult.rollDisplay} Miss!`, type: 'info' });
                    broadcastAdventureUpdate(io, party);
                    await new Promise(resolve => setTimeout(resolve, 500));
                    continue;
                }
            }

            // Add delay between attacks for visual feedback (PvE)
            if (spell.name === 'Whirlwind' && attackNum > 0) {
                await new Promise(resolve => setTimeout(resolve, 500));
            }

            for (const target of uniqueTargets) {
                if (target.state.health <= 0) continue;

                // Darkness/Light Source Check
                if (target.state && target.state.darknessShrouded) {
                    const hasLight = (actingPlayerState.buffs || []).some(b => b.type === 'Light Source');
                    if (!hasLight) {
                        log.push({ message: `${target.name} is hidden in darkness! Spell missed!`, type: 'info' });
                        continue;
                    }
                }

                let baseDamage = spell.damage || 0;
                let isHeal = false;

                // Versatile Logic
                if (spell.type === 'versatile') {
                    // Use 1 as minimum for versatile spells (e.g., Holy Shock) in case baseEffect is missing
                    let effectVal = spell.baseEffect || 1;

                    // Holy Shock Scaling
                    if (spell.school === 'Holy') {
                        effectVal += (bonuses.holyPower || 0);
                    } else {
                        // Fallback for other versatile spells (if any)
                        effectVal += currentAttackResult.modifiers.statValue;
                    }

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

                // Special spell damage calculations - use unified handler
                if (!isHeal) {
                    const specialResult = getSpecialSpellDamage(spell, character, actingPlayerState, bonuses, target);

                    if (specialResult !== null && typeof specialResult === 'object') {
                        baseDamage = specialResult.damage;
                        // Warning: This modifies the spell object in place, which is how Ambush was handled.
                        // Ideally we should use a temporary debuff variable, but downstream logic uses spell.debuff
                        if (specialResult.debuff) spell.debuff = { ...specialResult.debuff };
                        if (specialResult.logMessage) log.push({ message: specialResult.logMessage, type: 'reaction' });
                    } else if (specialResult !== null) {
                        baseDamage = specialResult;
                    }

                    // Ambush applies bleed debuff if not already defined
                    if (spell.name === 'Ambush' && !spell.debuff) {
                        spell.debuff = { type: 'bleed', duration: 3, damage: 1, damageType: 'Physical' };
                    }
                }

                // Apply resistance
                const resistance = target.getResistance(spell.damageType);
                const damageToDeal = baseDamage > 0 ? Math.max(1, baseDamage - resistance) : 0;

                // --- FLYING CHECK (melee spells) ---
                if (spell.range === 'melee' && (target.state.buffs || []).some(b => b.type === 'Flying')) {
                    log.push({ message: `${target.name} is flying! Melee attacks cannot reach them!`, type: 'info' });
                    continue;
                }

                // --- ENEMY REACTION CHECK (melee, ranged, and magic spells) ---
                if (!isPvP && !target.isPlayer && target.state) {
                    // Determine attack types (can be multiple, e.g. ranged + magic)
                    const attackTypes = [];
                    if (spell.range) attackTypes.push(spell.range); // 'melee' or 'ranged'
                    if (spell.isMagic) attackTypes.push('magic');

                    const reactionResult = checkEnemyReaction(target.state, attackTypes, actingPlayerState, log);

                    if (reactionResult.negated) {
                        const actionVerb = attackTypes.includes('magic') ? 'deflects' : 'parries';
                        log.push({ message: `${target.name} ${actionVerb} the ${spell.name}!`, type: 'info' });

                        // Apply counter-damage to the player
                        if (reactionResult.counterDamage > 0) {
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
                                log.push({ message: `${actingPlayerState.name} has been defeated!`, type: 'damage' });
                            }
                        }
                        continue; // Skip this target's damage
                    } else if (reactionResult.blockAmount > 0) {
                        // Block-style - reduce damage by blockAmount
                        const blockedDmg = Math.min(reactionResult.blockAmount, baseDamage);
                        baseDamage = Math.max(1, baseDamage - blockedDmg);
                        damageToDeal = Math.max(1, damageToDeal - blockedDmg);
                    }
                }

                // --- VEXOR DODGE ---
                if (checkVexorDodge(target, sharedState, log)) {
                    continue;
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
                    // DoT damage scales with power bonuses, not stats
                    if (spell.debuff.damageType) {
                        const bonuses = getBonusStatsForPlayer(character, actingPlayerState);
                        const powerKey = spell.debuff.damageType.toLowerCase() + 'Power';
                        const powerBonus = bonuses[powerKey] || 0;
                        // Use baseDamage for scaling, fallback to existing damage value
                        const baseDmg = spell.debuff.baseDamage ?? spell.debuff.damage ?? 0;
                        debuffToApply.damage = baseDmg + powerBonus;
                    }
                    target.state.debuffs.push(debuffToApply);
                    hitDescription += ` ${target.name} is now ${spell.debuff.type}!`;
                }

                if (spell.onHit?.debuff && currentAttackResult.total >= (spell.onHit.threshold || spell.hit)) {
                    if (!target.state.debuffs) target.state.debuffs = [];
                    const existingIndex = target.state.debuffs.findIndex(d => d.type === spell.onHit.debuff.type);
                    if (existingIndex !== -1) target.state.debuffs.splice(existingIndex, 1);
                    target.state.debuffs.push({ ...spell.onHit.debuff });
                    hitDescription += ` ${target.name} is now ${spell.onHit.debuff.type}!`;
                }

                log.push({ message: hitDescription.trim(), type: 'damage' });

                // Vampire Phase Transition (spawn Vampire's Assistant at 60HP)
                checkVampirePhaseTransition(target, sharedState, gameData, log);

                // Check for death
                if (target.state.health <= 0) {
                    if (target.isPvP) {
                        defeatEnemyInParty(io, party, { playerId: target.id }, null);
                    } else {
                        defeatEnemyInParty(io, party, target.state, target.cardIndex);
                    }
                }
            }
            // Broadcast after each swing for visual feedback
            broadcastAdventureUpdate(io, party);
        }
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