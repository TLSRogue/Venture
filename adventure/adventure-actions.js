// adventure/adventure-actions.js

import { players, parties, pvpEncounters } from '../serverState.js';
import { gameData } from '../data/index.js';
import { getBonusStatsForPlayer, addItemToInventoryServer } from '../utilsHelpers.js';
import { checkAndEndTurnForPlayer, defeatEnemyInParty, handleResolveReaction } from './adventure-state.js';
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
        clearTimeout(encounter.turnTimerId);
        encounter.turnTimeRemaining = timeRemaining;

        encounter.pendingReaction = {
            attackerName: attackerCharacter.characterName,
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
            attacker: attackerCharacter.characterName,
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

    // Determine if this is a PvP encounter
    const encounter = sharedState.pvpEncounterId ? pvpEncounters[sharedState.pvpEncounterId] : null;
    const isPvP = !!encounter;

    // Get acting player state (unified lookup)
    const actingPlayerState = isPvP
        ? encounter.playerStates.find(p => p.playerId === player.id)
        : sharedState.partyMemberStates.find(p => p.playerId === player.id);

    const weapon = character.equipment[weaponSlot];

    // Validate weapon and action points
    if (!weapon || weapon.type !== 'weapon') return;
    if (actingPlayerState.actionPoints < weapon.cost) return;
    if ((actingPlayerState.weaponCooldowns[weaponSlot] || 0) > 0) return;

    // Get target (unified for PvE/PvP)
    let target;
    if (isPvP) {
        const defendingPlayerState = encounter.playerStates.find(p => p.playerId === targetIndex);
        if (!defendingPlayerState) return;
        target = {
            isPvP: true,
            id: defendingPlayerState.playerId,
            name: defendingPlayerState.name,
            state: defendingPlayerState,
            buffs: defendingPlayerState.buffs,
            debuffs: defendingPlayerState.debuffs,
            getResistance: (damageType) => {
                if (damageType === 'Physical') {
                    const defChar = players[defendingPlayerState.name]?.character;
                    if (defChar) {
                        const defBonuses = getBonusStatsForPlayer(defChar, defendingPlayerState);
                        return defBonuses.physicalResistance || 0;
                    }
                }
                return 0;
            }
        };
    } else {
        const enemyCard = sharedState.zoneCards[targetIndex];
        if (!enemyCard || enemyCard.type !== 'enemy') return;
        target = {
            isPvP: false,
            id: enemyCard.id,
            name: enemyCard.name,
            state: enemyCard,
            buffs: enemyCard.buffs || [],
            debuffs: enemyCard.debuffs || [],
            cardIndex: targetIndex,
            getResistance: (damageType) => {
                const resistanceKey = damageType.toLowerCase() + 'Resistance';
                const innate = enemyCard.bonuses?.[resistanceKey] || 0;
                const buff = enemyCard.buffs?.find(b => b.bonus?.[resistanceKey])?.bonus[resistanceKey] || 0;
                return innate + buff;
            }
        };
    }

    // --- PvP Reaction Check (only for PvP) ---
    if (isPvP) {
        const actionDetails = {
            damage: weapon.weaponDamage,
            damageType: weapon.damageType,
            attackRange: weapon.range,
            message: `attacks with ${weapon.name}.`,
            debuff: null,
        };

        // Consume resources before reaction check
        actingPlayerState.actionPoints -= weapon.cost;
        actingPlayerState.threat += weapon.cost;
        actingPlayerState.weaponCooldowns[weaponSlot] = weapon.cooldown;

        const reactionInitiated = handlePvpReactionCheck(io, encounter, actingPlayerState, target.state, actionDetails);
        if (reactionInitiated) {
            broadcastAdventureUpdate(io, party);
            return;
        }
    } else {
        // Consume resources for PvE
        actingPlayerState.actionPoints -= weapon.cost;
        actingPlayerState.threat += weapon.cost;
        actingPlayerState.weaponCooldowns[weaponSlot] = weapon.cooldown;
    }

    // --- UNIFIED ROLL RESOLUTION ---
    const bonuses = getBonusStatsForPlayer(character, actingPlayerState);
    const stat = weapon.stat || 'strength';
    const statValue = (character[stat] || 0) + (bonuses[stat] || 0);

    // Modifiers (unified)
    const dazeDebuff = actingPlayerState.debuffs.find(d => d.type === 'daze');
    const dazeModifier = dazeDebuff ? -3 : 0;
    const focusBuff = actingPlayerState.buffs.find(b => b.type === 'Focus');
    const focusModifier = focusBuff ? (focusBuff.bonus?.rollBonus || 0) : 0;
    const stealthBuff = target.buffs.find(b => b.type === 'Stealth');
    const stealthModifier = stealthBuff ? -5 : 0;

    const roll = Math.floor(Math.random() * 20) + 1;
    const total = roll + statValue + dazeModifier + focusModifier + stealthModifier;
    const hitTarget = weapon.hit || 15;

    const isHit = roll !== 1 && total >= hitTarget;
    const isCriticalHit = roll === 20;
    const rollColor = isHit ? '#2ecc71' : '#e74c3c';
    const rollDisplay = `<span style="color:${rollColor}">🎲${roll}</span>`;

    // Get the appropriate log
    const log = isPvP ? encounter.log : sharedState.log;

    // Log modifier messages
    if (dazeModifier !== 0) {
        log.push({ message: `${character.characterName} is dazed! (-3 to attack roll)`, type: 'info' });
    }
    if (stealthModifier !== 0) {
        log.push({ message: `${target.name} is hidden in shadows! (-5 to hit)`, type: 'info' });
    }
    if (focusModifier !== 0) {
        log.push({ message: `${character.characterName} is focused! (+${focusModifier} to attack roll)`, type: 'info' });
    }

    let logMessage = `${character.characterName} attacks ${target.name} with ${weapon.name}! ${rollDisplay}`;

    if (roll === 1) {
        // Critical Failure
        logMessage += ` Critical Failure!`;
        log.push({ message: logMessage, type: 'damage' });
    } else if (isHit) {
        // --- UNIFIED DAMAGE CALCULATION ---
        let baseDamage = weapon.weaponDamage;
        const resistance = target.getResistance(weapon.damageType);
        const damageToDeal = Math.max(1, baseDamage - resistance);

        // --- VEXOR DODGE ---
        if (target.state.name === 'Vexor, Lord of the Arena') {
            const columns = sharedState.zoneCards.filter(c => c && c.name === 'Stone Column');
            if (columns.length > 0 && Math.floor(Math.random() * 20) + 1 >= 10) {
                log.push({ message: `Vexor, Lord of the Arena's Dodge: Jumps behind a Stone Column! Avoided!`, type: 'reaction' });
                log.push({ message: `(Tip: Destroy the Stone Columns!)`, type: 'info' });
                return;
            }
        }

        // Apply damage
        target.state.health -= damageToDeal;
        logMessage += ` Deals ${damageToDeal} ${weapon.damageType} damage! [id:${target.id}]`;

        // Apply debuffs (on-crit or on-hit)
        if ((isCriticalHit && weapon.onCrit?.debuff) || weapon.onHit?.debuff) {
            const debuff = (isCriticalHit && weapon.onCrit?.debuff) ? weapon.onCrit.debuff : weapon.onHit.debuff;
            if (!target.state.debuffs) target.state.debuffs = [];
            const existingIndex = target.state.debuffs.findIndex(d => d.type === debuff.type);
            if (existingIndex !== -1) target.state.debuffs.splice(existingIndex, 1);
            target.state.debuffs.push({ ...debuff });
            logMessage += isCriticalHit && weapon.onCrit?.debuff ? ` CRIT! Applies ${debuff.type}!` : ` Applies ${debuff.type}!`;
        }

        log.push({ message: logMessage, type: 'damage' });

        // Check for death
        if (target.state.health <= 0) {
            if (isPvP) {
                defeatEnemyInParty(io, party, { playerId: target.id }, null);
            } else {
                defeatEnemyInParty(io, party, target.state, target.cardIndex);
            }
        }
    } else {
        // Miss
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

    // --- UNIFIED: Determine encounter type ---
    const encounter = sharedState.pvpEncounterId ? pvpEncounters[sharedState.pvpEncounterId] : null;
    const isPvP = !!encounter;
    const log = isPvP ? encounter.log : sharedState.log;

    // --- UNIFIED: Get acting player state ---
    const actingPlayerState = isPvP
        ? encounter.playerStates.find(p => p.playerId === player.id)
        : sharedState.partyMemberStates.find(p => p.playerId === player.id);

    // Validate action points and cooldowns
    if (actingPlayerState.actionPoints < cost) return;
    if ((actingPlayerState.spellCooldowns[spell.name] || 0) > 0) return;

    // --- UNIFIED: Check weapon requirements ---
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

    // --- UNIFIED: Determine target ---
    let targetState = null;
    let enemyTarget = null;
    let isSelfTarget = false;

    if (isPvP) {
        if (targetIndex === 'player' || targetIndex === player.id) {
            targetState = actingPlayerState;
            isSelfTarget = true;
        } else {
            targetState = encounter.playerStates.find(p => p.playerId === targetIndex);
        }
        if (!targetState) return;
    } else {
        if (targetIndex === 'player') {
            targetState = actingPlayerState;
            isSelfTarget = true;
        } else if (String(targetIndex).startsWith('p')) {
            const playerIdx = parseInt(targetIndex.substring(1));
            if (!isNaN(playerIdx) && sharedState.partyMemberStates[playerIdx]) {
                targetState = sharedState.partyMemberStates[playerIdx];
                if (targetState.playerId === player.id) isSelfTarget = true;
            }
        } else {
            const enemyIdx = parseInt(targetIndex);
            if (!isNaN(enemyIdx) && sharedState.zoneCards[enemyIdx]) {
                enemyTarget = sharedState.zoneCards[enemyIdx];
            }
        }
    }

    // --- UNIFIED: Calculate roll modifiers ---
    const bonuses = getBonusStatsForPlayer(character, actingPlayerState);
    let statValue = 0;

    if (Array.isArray(spell.stat)) {
        let highestStatValue = -Infinity;
        spell.stat.forEach(statName => {
            const currentStatValue = (character[statName] || 0) + (bonuses[statName] || 0);
            if (currentStatValue > highestStatValue) {
                highestStatValue = currentStatValue;
            }
        });
        statValue = highestStatValue;
    } else if (spell.stat) {
        statValue = (character[spell.stat] || 0) + (bonuses[spell.stat] || 0);
    }

    // UNIFIED: All modifiers apply to both modes
    const dazeDebuff = actingPlayerState.debuffs.find(d => d.type === 'daze');
    const dazeModifier = dazeDebuff ? -3 : 0;
    const focusBuff = actingPlayerState.buffs.find(b => b.type === 'Focus');
    const focusModifier = focusBuff ? (focusBuff.bonus?.rollBonus || 0) : 0;

    // Stealth modifier (applies when targeting enemies/opposing players)
    let stealthModifier = 0;
    if (isPvP && targetState && targetState.team !== actingPlayerState.team) {
        const stealthBuff = targetState.buffs.find(b => b.type === 'Stealth');
        stealthModifier = stealthBuff ? -5 : 0;
    }

    // --- REVIVE SPELL: Guaranteed success, special targeting ---
    if (spell.type === 'revive') {
        // Consume resources
        actingPlayerState.actionPoints -= cost;
        actingPlayerState.spellCooldowns[spell.name] = spell.cooldown;

        // Find the dead party member target
        let reviveTarget = null;
        if (!isPvP && String(targetIndex).startsWith('p')) {
            const playerIdx = parseInt(targetIndex.substring(1));
            if (!isNaN(playerIdx) && sharedState.partyMemberStates[playerIdx]) {
                reviveTarget = sharedState.partyMemberStates[playerIdx];
            }
        }

        if (!reviveTarget || !reviveTarget.isDead) {
            log.push({ message: `${character.characterName} casts ${spell.name}, but there is no valid target!`, type: 'info' });
        } else {
            // Revive the target with 1 HP
            reviveTarget.isDead = false;
            reviveTarget.health = 1;
            reviveTarget.turnEnded = true; // They can't act this turn
            reviveTarget.buffs = [];
            reviveTarget.debuffs = [];

            log.push({ message: `${character.characterName} casts ${spell.name}!`, type: 'heal' });
            log.push({ message: `${reviveTarget.name} has been revived with 1 HP! [id:${reviveTarget.playerId}]`, type: 'heal' });
        }

        broadcastAdventureUpdate(io, party);
        await checkAndEndTurnForPlayer(io, party, player);
        return; // Exit early - revive spell is complete
    }

    const roll = Math.floor(Math.random() * 20) + 1;
    const total = roll + statValue + dazeModifier + focusModifier + stealthModifier;
    const hitTarget = spell.hit || 15;
    const isSuccess = roll !== 1 && total >= hitTarget;
    const rollColor = isSuccess ? '#2ecc71' : '#e74c3c';
    const rollDisplay = `<span style="color:${rollColor}">🎲${roll}</span>`;

    // Consume resources
    actingPlayerState.actionPoints -= cost;
    actingPlayerState.spellCooldowns[spell.name] = spell.cooldown;

    // Log modifier messages for spell casts
    if (dazeModifier !== 0) {
        log.push({ message: `${character.characterName} is dazed! (-3 to spell roll)`, type: 'info' });
    }
    if (stealthModifier !== 0 && targetState) {
        log.push({ message: `${targetState.name} is hidden in shadows! (-5 to hit)`, type: 'info' });
    }
    if (focusModifier !== 0) {
        log.push({ message: `${character.characterName} is focused! (+${focusModifier} to spell roll)`, type: 'info' });
    }

    let description = `${character.characterName} casts ${spell.name}! ${rollDisplay}`;

    if (!isSuccess) {
        description += (roll === 1) ? ` Critical Failure!` : ` Fizzle!`;
        log.push({ message: description, type: 'damage' });
    } else {
        log.push({ message: description, type: spell.type === 'heal' || spell.type === 'buff' || spell.type === 'revive' ? 'heal' : 'damage' });

        actingPlayerState.threat += cost;
        if (spell.bonusThreat) {
            actingPlayerState.threat += spell.bonusThreat;
            log.push({ message: `${character.characterName} generates ${spell.bonusThreat} bonus threat!`, type: 'reaction' });
        }

        // --- SPECIAL SPELL: Monk's Training ---
        if (spell.name === "Monk's Training") {
            const focusAmount = actingPlayerState.focus || 0;
            if (focusAmount > 0) {
                actingPlayerState.health = Math.min(actingPlayerState.maxHealth, actingPlayerState.health + focusAmount);
                const buff = { type: 'Focus', duration: 2, bonus: { rollBonus: focusAmount } };
                const existingIndex = actingPlayerState.buffs.findIndex(b => b.type === buff.type);
                if (existingIndex !== -1) actingPlayerState.buffs.splice(existingIndex, 1);
                actingPlayerState.buffs.push(buff);
                log.push({ message: `${character.characterName} spends ${focusAmount} Focus to heal for ${focusAmount} and gain +${focusAmount} to rolls this turn.`, type: 'heal' });
                actingPlayerState.focus = 0;
            } else {
                log.push({ message: `${character.characterName} has no Focus to spend!`, type: 'info' });
            }
        }
        // --- PvP REACTION CHECK for attack spells ---
        else if (isPvP && targetState && (spell.type === 'attack' || (spell.type === 'versatile' && targetState.team !== actingPlayerState.team))) {
            // Calculate damage using the same logic as the damage application
            let reactionDamage = spell.damage || 0;

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
                reactionDamage = 1 + highestFireWeaponDamage;
            }
            else if (spell.name === 'Split Shot' || spell.name === 'Aim True') {
                const mainHand = character.equipment.mainHand;
                if (mainHand?.weaponDamage && spell.requires?.weaponType?.includes(mainHand.weaponType)) {
                    reactionDamage = mainHand.weaponDamage;
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
                reactionDamage = totalDaggerDamage;
                // Set bleed debuff for Ambush
                if (!spell.debuff) {
                    spell.debuff = { type: 'bleed', duration: 3, damage: 1, damageType: 'Physical' };
                }
            }
            else if (spell.name === 'Punch' || spell.name === 'Kick') {
                reactionDamage = spell.damage || 1;
                const hasMonkTraining = character.equippedSpells.some(s => s.name === "Monk's Training");
                const isUnarmed = !character.equipment.mainHand && !character.equipment.offHand;
                if (hasMonkTraining && isUnarmed) {
                    reactionDamage += 1;
                }
            }
            else if (spell.name === 'Crushing Blow' || spell.name === 'Dagger Throw') {
                reactionDamage = (character.equipment.mainHand?.weaponDamage || 0) + (spell.damageBonus || 0);
            }
            else if (spell.baseEffect) {
                reactionDamage = spell.baseEffect + statValue;
            }

            const actionDetails = {
                damage: reactionDamage,
                damageType: spell.damageType,
                attackRange: spell.range,
                message: `is targeted by ${spell.name}.`,
                debuff: spell.debuff || null,
            };

            const reactionInitiated = handlePvpReactionCheck(io, encounter, actingPlayerState, targetState, actionDetails);

            if (reactionInitiated) {
                broadcastAdventureUpdate(io, party);
                return;
            }
        }

        // --- UNIFIED SPELL EFFECTS ---
        if (spell.type === 'heal') {
            const healTarget = targetState || actingPlayerState;
            healTarget.health = Math.min(healTarget.maxHealth, healTarget.health + spell.heal);
            const targetId = isPvP ? healTarget.playerId : (healTarget.playerId || healTarget.id);
            log.push({ message: `Healed ${healTarget.name} for ${spell.heal} HP. [id:${targetId}]`, type: 'heal' });
        }
        else if (spell.type === 'buff') {
            const buffTarget = targetState || actingPlayerState;
            const buff = spell.buff;
            const existingIndex = buffTarget.buffs.findIndex(b => b.type === buff.type);
            if (existingIndex !== -1) buffTarget.buffs.splice(existingIndex, 1);
            buffTarget.buffs.push({ ...buff });
            const targetId = isPvP ? buffTarget.playerId : (buffTarget.playerId || buffTarget.id);
            log.push({ message: `${buffTarget.name} gains ${buff.type}! [id:${targetId}]`, type: 'heal' });
        }
        else if (spell.type === 'versatile') {
            const effectValue = spell.baseEffect + statValue;
            if (targetState && !targetState.isDead) {
                targetState.health = Math.min(targetState.maxHealth, targetState.health + effectValue);
                log.push({ message: `Healed ${targetState.name} for ${effectValue} HP.`, type: 'heal' });
            } else if (enemyTarget) {
                // --- VEXOR DODGE ---
                if (enemyTarget.name === 'Vexor, Lord of the Arena') {
                    const columns = sharedState.zoneCards.filter(c => c && c.name === 'Stone Column');
                    if (columns.length > 0 && Math.floor(Math.random() * 20) + 1 >= 10) {
                        log.push({ message: `Vexor, Lord of the Arena's Dodge: Jumps behind a Stone Column! Avoided!`, type: 'reaction' });
                        log.push({ message: `(Tip: Destroy the Stone Columns!)`, type: 'info' });
                        return;
                    }
                }
                enemyTarget.health -= effectValue;
                log.push({ message: `Dealt ${effectValue} ${spell.damageType} damage to ${enemyTarget.name} [id:${enemyTarget.id}].`, type: 'damage' });
                if (enemyTarget.health <= 0) {
                    defeatEnemyInParty(io, party, enemyTarget, parseInt(targetIndex));
                }
            } else if (isPvP && targetState && targetState.team !== actingPlayerState.team) {
                targetState.health -= effectValue;
                log.push({ message: `Dealt ${effectValue} ${spell.damageType} damage to ${targetState.name} [id:${targetState.playerId}].`, type: 'damage' });
                if (targetState.health <= 0) {
                    defeatEnemyInParty(io, party, { playerId: targetState.playerId }, null);
                }
            }
        }
        else if (spell.type === 'attack' || spell.type === 'aoe') {
            // --- UNIFIED: Build target list ---
            let targets = [];

            if (isPvP && targetState) {
                targets.push({
                    state: targetState,
                    id: targetState.playerId,
                    name: targetState.name,
                    isPvP: true,
                    getResistance: (damageType) => {
                        if (damageType === 'Physical') {
                            const defChar = players[targetState.name]?.character;
                            if (defChar) {
                                const defBonuses = getBonusStatsForPlayer(defChar, targetState);
                                return defBonuses.physicalResistance || 0;
                            }
                        }
                        return 0;
                    }
                });
            } else if (!isPvP) {
                if (spell.aoeTargeting === 'all') {
                    sharedState.zoneCards.forEach((card, idx) => {
                        if (card && card.type === 'enemy') {
                            targets.push({
                                state: card,
                                id: card.id,
                                name: card.name,
                                index: idx,
                                isPvP: false,
                                getResistance: (damageType) => {
                                    const resistanceKey = damageType.toLowerCase() + 'Resistance';
                                    const innate = card.bonuses?.[resistanceKey] || 0;
                                    const buff = card.buffs?.find(b => b.bonus?.[resistanceKey])?.bonus[resistanceKey] || 0;
                                    return innate + buff;
                                }
                            });
                        }
                    });
                } else if (spell.aoeTargeting === 'adjacent' && enemyTarget) {
                    const enemyIdx = parseInt(targetIndex);
                    targets.push({
                        state: enemyTarget,
                        id: enemyTarget.id,
                        name: enemyTarget.name,
                        index: enemyIdx,
                        isPvP: false,
                        getResistance: (damageType) => {
                            if (damageType === 'Physical') {
                                return enemyTarget.buffs?.find(b => b.bonus?.physicalResistance)?.bonus.physicalResistance || 0;
                            }
                            return 0;
                        }
                    });
                    [-1, 1].forEach(offset => {
                        const adjIdx = enemyIdx + offset;
                        const adjCard = sharedState.zoneCards[adjIdx];
                        if (adjCard?.type === 'enemy') {
                            targets.push({
                                state: adjCard,
                                id: adjCard.id,
                                name: adjCard.name,
                                index: adjIdx,
                                isPvP: false,
                                getResistance: (damageType) => {
                                    if (damageType === 'Physical') {
                                        return adjCard.buffs?.find(b => b.bonus?.physicalResistance)?.bonus.physicalResistance || 0;
                                    }
                                    return 0;
                                }
                            });
                        }
                    });
                } else if (enemyTarget) {
                    targets.push({
                        state: enemyTarget,
                        id: enemyTarget.id,
                        name: enemyTarget.name,
                        index: parseInt(targetIndex),
                        isPvP: false,
                        getResistance: (damageType) => {
                            if (damageType === 'Physical') {
                                return enemyTarget.buffs?.find(b => b.bonus?.physicalResistance)?.bonus.physicalResistance || 0;
                            }
                            return 0;
                        }
                    });
                }
            }

            // Deduplicate targets
            const uniqueTargets = [...new Map(targets.map(t => [t.id, t])).values()];

            // --- UNIFIED: Calculate and apply damage to each target ---
            uniqueTargets.forEach(target => {
                if (target.state.health <= 0) return;

                let baseDamage = spell.damage || 0;

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
                else if (spell.name === 'Cone of Cold') {
                    if (total >= (spell.hit || 10)) {
                        baseDamage = (spell.damage || 0) + statValue;
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

                target.state.health -= damageToDeal;
                let hitDescription = `Dealt ${damageToDeal} ${spell.damageType || 'Magic'} damage to ${target.name} [id:${target.id}].`;
                if (damageToDeal < baseDamage) hitDescription += ` (${baseDamage - damageToDeal} resisted)`;

                // Apply debuffs
                if (spell.debuff) {
                    if (!target.state.debuffs) target.state.debuffs = [];
                    const existingIndex = target.state.debuffs.findIndex(d => d.type === spell.debuff.type);
                    if (existingIndex !== -1) target.state.debuffs.splice(existingIndex, 1);
                    target.state.debuffs.push({ ...spell.debuff });
                    hitDescription += ` ${target.name} is now ${spell.debuff.type}!`;
                }

                if (spell.onHit?.debuff && total >= (spell.onHit.threshold || hitTarget)) {
                    if (!target.state.debuffs) target.state.debuffs = [];
                    const existingIndex = target.state.debuffs.findIndex(d => d.type === spell.onHit.debuff.type);
                    if (existingIndex !== -1) target.state.debuffs.splice(existingIndex, 1);
                    target.state.debuffs.push({ ...spell.onHit.debuff });
                    hitDescription += ` ${target.name} is now ${spell.onHit.debuff.type}!`;
                }

                log.push({ message: hitDescription, type: 'damage' });

                // Monk Focus Gain
                if ((spell.name === 'Punch' || spell.name === 'Kick')) {
                    const hasMonkTraining = character.equippedSpells.some(s => s.name === "Monk's Training");
                    const isUnarmed = !character.equipment.mainHand && !character.equipment.offHand;
                    if (hasMonkTraining && isUnarmed && (actingPlayerState.focus || 0) < 3) {
                        actingPlayerState.focus = (actingPlayerState.focus || 0) + 1;
                        log.push({ message: `${character.characterName} gains 1 Focus.`, type: 'heal' });
                    }
                }

                // Check for death
                if (target.state.health <= 0) {
                    if (target.isPvP) {
                        defeatEnemyInParty(io, party, { playerId: target.id }, null);
                    } else {
                        defeatEnemyInParty(io, party, target.state, target.index);
                    }
                }
            });
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