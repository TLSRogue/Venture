// adventure/adventure-actions.js

import { players, parties, pvpEncounters } from '../serverState.js';
import { gameData } from '../data/index.js';
import { getBonusStatsForPlayer, addItemToInventoryServer } from '../utilsHelpers.js';

import { checkAndEndTurnForPlayer, defeatEnemyInParty, handleResolveReaction } from './adventure-state.js';

/**
 * Helper function to handle the logic for checking and initiating a PvP reaction.
 * This is now refactored to use the single, shared encounter state.
 * @returns {boolean} - True if a reaction was initiated, false otherwise.
 */
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

    if (availableReactions.length > 0) {
        // Pause the main turn timer
        const timeRemaining = encounter.turnTimerEndsAt - Date.now();
        clearTimeout(encounter.turnTimerId);
        encounter.turnTimeRemaining = timeRemaining;

        // Set the pending reaction on the single encounter object
        encounter.pendingReaction = {
            attackerName: attackerCharacter.characterName,
            attackerPlayerId: attackerCharacter.playerId, // Store attacker's ID for resuming the timer
            targetName: defendingPlayerState.name,
            damage: actionDetails.damage,
            damageType: actionDetails.damageType,
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
        
        return true; // Reaction was initiated
    }
    
    return false; // No reaction available
}


export async function processWeaponAttack(io, party, player, payload) {
    const { weaponSlot, targetIndex } = payload;
    const character = player.character;
    const { sharedState } = party;
    
    // --- NEW PVP LOGIC PATH ---
    if (sharedState.pvpEncounterId) {
        const encounter = pvpEncounters[sharedState.pvpEncounterId];
        if (!encounter) return;

        const actingPlayerState = encounter.playerStates.find(p => p.playerId === player.id);
        const weapon = character.equipment[weaponSlot];
        // In PvP, targetIndex is the playerId of the target
        const defendingPlayerState = encounter.playerStates.find(p => p.playerId === targetIndex);

        if (!weapon || weapon.type !== 'weapon' || !defendingPlayerState || actingPlayerState.actionPoints < weapon.cost || (actingPlayerState.weaponCooldowns[weapon.name] || 0) > 0) {
            return;
        }
        
        // Use helper to check for and start a reaction
        const actionDetails = {
            damage: weapon.weaponDamage,
            damageType: weapon.damageType,
            message: `attacks with ${weapon.name}.`,
            debuff: null, // Add logic for onHit/onCrit debuffs if needed here
        };
        
        const reactionInitiated = handlePvpReactionCheck(io, encounter, actingPlayerState, defendingPlayerState, actionDetails);

        actingPlayerState.actionPoints -= weapon.cost;
        actingPlayerState.threat += weapon.cost;
        actingPlayerState.weaponCooldowns[weapon.name] = weapon.cooldown;

        if (reactionInitiated) {
            return; // Stop execution here; wait for reaction to be resolved
        }

        // --- If no reaction, resolve the attack immediately ---
        const bonuses = getBonusStatsForPlayer(character, actingPlayerState);
        const stat = weapon.stat || 'strength';
        const statValue = (character[stat] || 0) + (bonuses[stat] || 0);
        const dazeDebuff = actingPlayerState.debuffs.find(d => d.type === 'daze');
        const dazeModifier = dazeDebuff ? -3 : 0;

        const roll = Math.floor(Math.random() * 20) + 1;
        const total = roll + statValue + dazeModifier;
        const hitTarget = weapon.hit || 15;

        let logMessage = `${character.characterName} attacks ${defendingPlayerState.name} with ${weapon.name}: ${roll}(d20) + ${statValue} ${dazeModifier < 0 ? dazeModifier : ''} = ${total}. (Target: ${hitTarget}+)`;

        if (roll === 1) {
            logMessage += ` Critical Failure! They miss!`;
            encounter.log.push({ message: logMessage, type: 'damage' });
        } else if (total >= hitTarget) {
            defendingPlayerState.health -= weapon.weaponDamage;
            logMessage += ` Hit! Dealt ${weapon.weaponDamage} ${weapon.damageType} damage to ${defendingPlayerState.name}.`;
            
            // Handle onCrit/onHit debuffs
            if ((roll === 20 && weapon.onCrit?.debuff) || weapon.onHit?.debuff) {
                const debuff = (roll === 20 && weapon.onCrit?.debuff) ? weapon.onCrit.debuff : weapon.onHit.debuff;
                const existingIndex = defendingPlayerState.debuffs.findIndex(d => d.type === debuff.type);
                if (existingIndex !== -1) defendingPlayerState.debuffs.splice(existingIndex, 1);
                defendingPlayerState.debuffs.push({ ...debuff });
                logMessage += ` ${defendingPlayerState.name} is now ${debuff.type}!`;
            }

            encounter.log.push({ message: logMessage, type: 'damage' });

            if (defendingPlayerState.health <= 0) {
                // In new model, defeatEnemyInParty needs the party object to determine which party won
                defeatEnemyInParty(io, party, { playerId: defendingPlayerState.playerId }, null);
            }
        } else {
            logMessage += ` Miss!`;
            encounter.log.push({ message: logMessage, type: 'info' });
        }

        await checkAndEndTurnForPlayer(io, party, player);
        return;
    }
    
    // --- ORIGINAL PVE LOGIC ---
    const actingPlayerState = sharedState.partyMemberStates.find(p => p.playerId === player.id);
    const target = sharedState.zoneCards[targetIndex];
    const weapon = character.equipment[weaponSlot];

    if (!weapon || weapon.type !== 'weapon' || !target || target.type !== 'enemy' || actingPlayerState.actionPoints < weapon.cost || (actingPlayerState.weaponCooldowns[weapon.name] || 0) > 0) {
        return;
    }

    actingPlayerState.actionPoints -= weapon.cost;
    actingPlayerState.threat += weapon.cost;
    actingPlayerState.weaponCooldowns[weapon.name] = weapon.cooldown;

    const bonuses = getBonusStatsForPlayer(character, actingPlayerState);
    const stat = weapon.stat || 'strength';
    const statValue = (character[stat] || 0) + (bonuses[stat] || 0);
    const dazeDebuff = actingPlayerState.debuffs.find(d => d.type === 'daze');
    const dazeModifier = dazeDebuff ? -3 : 0;

    const roll = Math.floor(Math.random() * 20) + 1;
    const total = roll + statValue + dazeModifier;
    const hitTarget = weapon.hit || 15;

    let logMessage = `${character.characterName} attacks ${target.name} with ${weapon.name}: ${roll}(d20) + ${statValue} ${dazeModifier < 0 ? dazeModifier : ''} = ${total}. (Target: ${hitTarget}+)`;

    if (roll === 1) {
        logMessage += ` Critical Failure! They miss!`;
        sharedState.log.push({ message: logMessage, type: 'damage' });
    } else if (total >= hitTarget) {
        target.health -= weapon.weaponDamage;
        logMessage += ` Hit! Dealt ${weapon.weaponDamage} ${weapon.damageType} damage to ${target.name} [id:${target.id}].`;

        if (roll === 20 && weapon.onCrit && weapon.onCrit.debuff) {
            const debuff = weapon.onCrit.debuff;
            const existingIndex = target.debuffs.findIndex(d => d.type === debuff.type);
            if (existingIndex !== -1) target.debuffs.splice(existingIndex, 1);
            target.debuffs.push({ ...debuff });
            logMessage += ` CRITICAL HIT! ${target.name} is now ${debuff.type}!`;
        }
        if (weapon.onHit && weapon.onHit.debuff) {
            const debuff = weapon.onHit.debuff;
            const existingIndex = target.debuffs.findIndex(d => d.type === debuff.type);
            if (existingIndex !== -1) target.debuffs.splice(existingIndex, 1);
            target.debuffs.push({ ...debuff });
            logMessage += ` ${target.name} is now ${debuff.type}!`;
        }

        sharedState.log.push({ message: logMessage, type: 'damage' });

        if (target.health <= 0) {
            defeatEnemyInParty(io, party, target, targetIndex);
        }
    } else {
        logMessage += ` Miss!`;
        sharedState.log.push({ message: logMessage, type: 'info' });
    }

    await checkAndEndTurnForPlayer(io, party, player);
}

export async function processCastSpell(io, party, player, payload) {
    const { spellIndex, targetIndex } = payload;
    const character = player.character;
    const { sharedState } = party;
    const spell = character.equippedSpells[spellIndex];
    const cost = spell.cost || 0;

    // --- NEW PVP LOGIC PATH ---
    if (sharedState.pvpEncounterId) {
        const encounter = pvpEncounters[sharedState.pvpEncounterId];
        if (!encounter) return;
        const actingPlayerState = encounter.playerStates.find(p => p.playerId === player.id);

        if (!spell || actingPlayerState.actionPoints < cost || (actingPlayerState.spellCooldowns[spell.name] || 0) > 0) {
            return;
        }
        // ... (Add spell requirement checks here if necessary) ...
        
        let targetPlayerState = encounter.playerStates.find(p => p.playerId === targetIndex);
        if(!targetPlayerState) return;

        // Roll calculation logic (can be shared)
        const bonuses = getBonusStatsForPlayer(character, actingPlayerState);
        let statValue = 0;
        let rollDescription = "";
        if (spell.name === "Warrior's Might") {
            const strength = (character.strength || 0) + (bonuses.strength || 0);
            const defense = (character.defense || 0) + (bonuses.defense || 0);
            statValue = Math.max(strength, defense);
            rollDescription = strength > defense ? `(Str)` : `(Def)`;
        } else {
            const statName = Array.isArray(spell.stat) ? spell.stat[0] : spell.stat;
            statValue = (character[statName] || 0) + (bonuses[statName] || 0);
            rollDescription = `(${statName.slice(0, 3)})`;
        }
        const dazeDebuff = actingPlayerState.debuffs.find(d => d.type === 'daze');
        const dazeModifier = dazeDebuff ? -3 : 0;
        const roll = Math.floor(Math.random() * 20) + 1;
        const total = roll + statValue + dazeModifier;
        const hitTarget = spell.hit || 15;
        let description = `${character.characterName} casting ${spell.name}: ${roll}(d20) + ${statValue}${rollDescription}${dazeModifier !== 0 ? dazeModifier : ''} = ${total}. (Target: ${hitTarget}+)`;

        actingPlayerState.actionPoints -= cost;
        actingPlayerState.spellCooldowns[spell.name] = spell.cooldown;

        if (roll === 1 || total < hitTarget) {
            description += (roll === 1) ? ` Critical Failure! The spell fizzles!` : ` The spell fizzles!`;
            encounter.log.push({ message: description, type: 'damage' });
            await checkAndEndTurnForPlayer(io, party, player);
            return;
        }

        description += ` Success!`;
        encounter.log.push({ message: description, type: spell.type === 'heal' || spell.type === 'buff' ? 'heal' : 'damage' });
        
        // --- Simplified state modification on the single encounter object ---
        if (spell.type === 'heal') {
            targetPlayerState.health = Math.min(targetPlayerState.maxHealth, targetPlayerState.health + spell.heal);
        } else if (spell.type === 'buff') {
            const buff = spell.buff;
            const existingIndex = targetPlayerState.buffs.findIndex(b => b.type === buff.type);
            if (existingIndex !== -1) targetPlayerState.buffs.splice(existingIndex, 1);
            targetPlayerState.buffs.push({ ...buff });
        } else if (spell.type === 'attack') {
            targetPlayerState.health -= spell.damage;
            if (spell.debuff) {
                const debuff = spell.debuff;
                const existingIndex = targetPlayerState.debuffs.findIndex(d => d.type === debuff.type);
                if (existingIndex !== -1) targetPlayerState.debuffs.splice(existingIndex, 1);
                targetPlayerState.debuffs.push({ ...debuff });
            }
        }
        
        if(targetPlayerState.health <= 0) {
            defeatEnemyInParty(io, party, { playerId: targetPlayerState.playerId }, null);
        }

        await checkAndEndTurnForPlayer(io, party, player);
        return;
    }
    
    // --- ORIGINAL PVE LOGIC ---
    const actingPlayerState = sharedState.partyMemberStates.find(p => p.playerId === player.id);
    if (!spell || actingPlayerState.actionPoints < cost || (actingPlayerState.spellCooldowns[spell.name] || 0) > 0) {
        return;
    }

    if (spell.requires) {
        if (spell.requires.weaponType) {
            const mainHand = character.equipment.mainHand;
            const offHand = character.equipment.offHand;
            const requiredHand = spell.requires.hand;

            if (requiredHand) {
                if (!character.equipment[requiredHand] || !spell.requires.weaponType.includes(character.equipment[requiredHand].weaponType)) {
                    return;
                }
            } else {
                if ((!mainHand || !spell.requires.weaponType.includes(mainHand.weaponType)) &&
                    (!offHand || !spell.requires.weaponType.includes(offHand.weaponType))) {
                    return;
                }
            }
        }
    }

    let isSelfTarget = false;
    let friendlyTarget = null;
    let enemyTarget = null;

    if (targetIndex === 'player' || (String(targetIndex).startsWith('p') && sharedState.partyMemberStates[parseInt(targetIndex.slice(1))].playerId === player.id)) {
        isSelfTarget = true;
        friendlyTarget = actingPlayerState;
    } else if (String(targetIndex).startsWith('p')) {
        const playerIdx = parseInt(targetIndex.substring(1));
        if (!isNaN(playerIdx) && sharedState.partyMemberStates[playerIdx]) {
            friendlyTarget = sharedState.partyMemberStates[playerIdx];
        }
    } else {
        const enemyIdx = parseInt(targetIndex);
        if (!isNaN(enemyIdx) && sharedState.zoneCards[enemyIdx]) {
            enemyTarget = sharedState.zoneCards[enemyIdx];
        }
    }

    const bonuses = getBonusStatsForPlayer(character, actingPlayerState);
    let statValue = 0;
    let rollDescription = "";

    if (spell.name === "Warrior's Might") {
        const strength = (character.strength || 0) + (bonuses.strength || 0);
        const defense = (character.defense || 0) + (bonuses.defense || 0);
        statValue = Math.max(strength, defense);
        rollDescription = strength > defense ? `(Str)` : `(Def)`;
    } else {
        const statName = Array.isArray(spell.stat) ? spell.stat[0] : spell.stat;
        statValue = (character[statName] || 0) + (bonuses[statName] || 0);
        rollDescription = `(${statName.slice(0, 3)})`;
    }

    const dazeDebuff = actingPlayerState.debuffs.find(d => d.type === 'daze');
    const dazeModifier = dazeDebuff ? -3 : 0;
    const focusBuff = actingPlayerState.buffs.find(b => b.type === 'Focus');
    const focusModifier = focusBuff ? focusBuff.bonus.rollBonus : 0;

    const roll = Math.floor(Math.random() * 20) + 1;
    const total = roll + statValue + dazeModifier + focusModifier;
    const hitTarget = spell.hit || 15;
    let description = `${character.characterName} casting ${spell.name}: ${roll}(d20) + ${statValue}${rollDescription}${dazeModifier !== 0 ? dazeModifier : ''}${focusModifier > 0 ? `+${focusModifier}` : ''} = ${total}. (Target: ${hitTarget}+)`;

    actingPlayerState.actionPoints -= cost;
    actingPlayerState.spellCooldowns[spell.name] = spell.cooldown;

    if (roll === 1 || total < hitTarget) {
        description += (roll === 1) ? ` Critical Failure! The spell fizzles!` : ` The spell fizzles!`;
        sharedState.log.push({ message: description, type: 'damage' });
        await checkAndEndTurnForPlayer(io, party, player);
        return;
    }
    
    description += ` Success!`;
    sharedState.log.push({ message: description, type: spell.type === 'heal' || spell.type === 'buff' ? 'heal' : 'damage' });

    actingPlayerState.threat += cost;
    if (spell.bonusThreat) {
        actingPlayerState.threat += spell.bonusThreat;
        sharedState.log.push({ message: `${character.characterName} generates ${spell.bonusThreat} bonus threat!`, type: 'reaction' });
    }

    if (spell.name === "Monk's Training") {
        const focusAmount = actingPlayerState.focus || 0;
        if (focusAmount > 0) {
            actingPlayerState.health = Math.min(actingPlayerState.maxHealth, actingPlayerState.health + focusAmount);
            const buff = { type: 'Focus', duration: 2, bonus: { rollBonus: focusAmount } };
            const existingIndex = actingPlayerState.buffs.findIndex(b => b.type === buff.type);
            if (existingIndex !== -1) actingPlayerState.buffs.splice(existingIndex, 1);
            actingPlayerState.buffs.push(buff);
            sharedState.log.push({ message: `${character.characterName} spends ${focusAmount} Focus to heal for ${focusAmount} and gain +${focusAmount} to rolls this turn.`, type: 'heal' });
            actingPlayerState.focus = 0;
        } else {
            sharedState.log.push({ message: `${character.characterName} has no Focus to spend!`, type: 'info' });
        }
        await checkAndEndTurnForPlayer(io, party, player);
        return;
    }

    if (spell.type === 'heal' || spell.type === 'buff') {
        const target = isSelfTarget ? actingPlayerState : friendlyTarget;
        if (target && !target.isDead) {
            if (spell.heal) {
                target.health = Math.min(target.maxHealth, target.health + spell.heal);
                sharedState.log.push({ message: `Healed ${target.name} for ${spell.heal} HP.`, type: 'heal' });
            }
            if (spell.buff) {
                const buff = spell.buff;
                const existingIndex = target.buffs.findIndex(b => b.type === buff.type);
                if (existingIndex !== -1) target.buffs.splice(existingIndex, 1);
                target.buffs.push({ ...buff });
                sharedState.log.push({ message: `${target.name} gains ${buff.type}!`, type: 'heal' });
            }
        }
    } else if (spell.type === 'versatile') {
        const effectValue = spell.baseEffect + statValue;
        const target = isSelfTarget ? actingPlayerState : friendlyTarget;
        if (target && !target.isDead) {
            target.health = Math.min(target.maxHealth, target.health + effectValue);
            sharedState.log.push({ message: `Healed ${target.name} for ${effectValue} HP.`, type: 'heal' });
        } else if (enemyTarget) {
            enemyTarget.health -= effectValue;
            sharedState.log.push({ message: `Dealt ${effectValue} ${spell.damageType} damage to ${enemyTarget.name} [id:${enemyTarget.id}].`, type: 'damage' });
            if (enemyTarget.health <= 0) {
                defeatEnemyInParty(io, party, enemyTarget, parseInt(targetIndex));
            }
        }
    } else if (spell.type === 'attack' || spell.type === 'aoe') {
        let targets = [];
        if (spell.aoeTargeting === 'all') {
            sharedState.zoneCards.forEach((card, idx) => {
                if (card && card.type === 'enemy') targets.push({ card, index: idx });
            });
        } else if (spell.type === 'aoe') {
            const enemyIdx = parseInt(targetIndex);
            if (enemyTarget) targets.push({ card: enemyTarget, index: enemyIdx });
            if (enemyIdx > 0 && sharedState.zoneCards[enemyIdx - 1]?.type === 'enemy') targets.push({ card: sharedState.zoneCards[enemyIdx - 1], index: enemyIdx - 1 });
            if (enemyIdx < sharedState.zoneCards.length - 1 && sharedState.zoneCards[enemyIdx + 1]?.type === 'enemy') targets.push({ card: sharedState.zoneCards[enemyIdx + 1], index: enemyIdx + 1 });
        } else {
            if (enemyTarget) targets.push({ card: enemyTarget, index: parseInt(targetIndex) });
        }

        const uniqueTargets = [...new Map(targets.map(item => [item.card.id, item])).values()];
        
        uniqueTargets.forEach(({ card: aoeTarget, index: aoeIndex }) => {
            if (aoeTarget && aoeTarget.health > 0) {
                let damage = spell.damage || 0;
                if (spell.name === 'Split Shot') {
                    const mainHand = character.equipment.mainHand;
                    if (mainHand && mainHand.weaponType === 'Two-Hand Bow') damage = mainHand.weaponDamage;
                } else if (spell.name === 'Punch' || spell.name === 'Kick') {
                    if (character.equippedSpells.some(s => s.name === "Monk's Training") && !character.equipment.mainHand && !character.equipment.offHand) {
                        damage += 1;
                    }
                } else if (spell.name === 'Crushing Blow') {
                    damage = character.equipment.mainHand.weaponDamage + (spell.damageBonus || 0);
                }

                aoeTarget.health -= damage;
                
                let hitDescription = `Dealt ${damage} damage to ${aoeTarget.name} [id:${aoeTarget.id}].`;

                if (spell.debuff) {
                    const debuff = spell.debuff;
                    const existingIndex = aoeTarget.debuffs.findIndex(d => d.type === debuff.type);
                    if (existingIndex !== -1) aoeTarget.debuffs.splice(existingIndex, 1);
                    aoeTarget.debuffs.push({ ...debuff });
                    hitDescription += ` ${aoeTarget.name} is now ${debuff.type}!`;
                }
                if (spell.onHit && total >= (spell.onHit.threshold || hitTarget) && spell.onHit.debuff) {
                    const debuff = spell.onHit.debuff;
                    const existingIndex = aoeTarget.debuffs.findIndex(d => d.type === debuff.type);
                    if (existingIndex !== -1) aoeTarget.debuffs.splice(existingIndex, 1);
                    aoeTarget.debuffs.push({ ...debuff });
                    hitDescription += ` ${aoeTarget.name} is now ${debuff.type}!`;
                }
                sharedState.log.push({ message: hitDescription, type: 'damage' });

                if ((spell.name === 'Punch' || spell.name === 'Kick') && character.equippedSpells.some(s => s.name === "Monk's Training") && !character.equipment.mainHand && !character.equipment.offHand) {
                    if ((actingPlayerState.focus || 0) < 3) {
                        actingPlayerState.focus = (actingPlayerState.focus || 0) + 1;
                        sharedState.log.push({ message: `${character.characterName} gains 1 Focus.`, type: 'heal' });
                    }
                }

                if (aoeTarget.health <= 0) {
                    defeatEnemyInParty(io, party, aoeTarget, aoeIndex);
                }
            }
        });
    }

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
    await checkAndEndTurnForPlayer(io, party, player);
}

export async function processUseItemAbility(io, party, player, payload) {
    const { slot } = payload;
    const character = player.character;
    const { sharedState } = party;
    const item = character.equipment[slot];
    
    let actingPlayerState;
    let logTarget;
    if(sharedState.pvpEncounterId) {
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

    await checkAndEndTurnForPlayer(io, party, player);
}

export async function processUseConsumable(io, party, player, payload) {
    const { inventoryIndex } = payload;
    const character = player.character;
    const { sharedState } = party;
    const item = character.inventory[inventoryIndex];
    
    let actingPlayerState;
    let logTarget;
    if(sharedState.pvpEncounterId) {
        const encounter = pvpEncounters[sharedState.pvpEncounterId];
        actingPlayerState = encounter.playerStates.find(p => p.playerId === player.id);
        logTarget = encounter;
    } else {
        actingPlayerState = sharedState.partyMemberStates.find(p => p.playerId === player.id);
        logTarget = sharedState;
    }

    const cost = item.cost || 0;
    if (!item || item.type !== 'consumable' || actingPlayerState.actionPoints < cost) {
        return;
    }

    actingPlayerState.actionPoints -= cost;
    actingPlayerState.threat += cost;
    
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

    if (item.charges) {
        item.charges--;
        if (item.charges <= 0) character.inventory[inventoryIndex] = null;
    } else {
        item.quantity = (item.quantity || 1) - 1;
        if (item.quantity <= 0) character.inventory[inventoryIndex] = null;
    }
    io.to(player.id).emit('characterUpdate', character);

    await checkAndEndTurnForPlayer(io, party, player);
}