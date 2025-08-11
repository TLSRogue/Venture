// adventure/adventure-actions.js

import { players, parties } from '../serverState.js';
import { gameData } from '../data/index.js';
import { getBonusStatsForPlayer, addItemToInventoryServer } from '../utilsHelpers.js';

import { checkAndEndTurnForPlayer, defeatEnemyInParty, handleResolveReaction } from './adventure-state.js';

/**
 * Helper function to handle the logic for checking and initiating a PvP reaction.
 * @returns {boolean} - True if a reaction was initiated, false otherwise.
 */
function handlePvpReactionCheck(io, party, actingPlayerState, attackerCharacter, defendingPlayerState, actionDetails) {
    const opponentParty = parties[party.sharedState.pvpEncounter.opponentPartyId];
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
        const timeRemaining = party.sharedState.turnTimerEndsAt - Date.now();
        clearTimeout(party.sharedState.turnTimerId);
        party.sharedState.turnTimeRemaining = timeRemaining;
        opponentParty.sharedState.turnTimeRemaining = timeRemaining;

        const pendingReaction = {
            attackerName: attackerCharacter.characterName,
            attackerPartyId: party.id,
            targetName: defendingPlayerState.name,
            damage: actionDetails.damage,
            damageType: actionDetails.damageType,
            message: actionDetails.message,
            debuff: actionDetails.debuff || null, 
            isFleeing: false
        };
        party.sharedState.pendingReaction = pendingReaction;
        opponentParty.sharedState.pendingReaction = pendingReaction;

        const reactionPayload = {
            damage: actionDetails.damage,
            attacker: attackerCharacter.characterName,
            availableReactions: availableReactions,
            timer: 10000
        };

        io.to(defendingPlayerState.playerId).emit('party:requestReaction', reactionPayload);

        const reactionTimeout = setTimeout(() => {
            const playerSocket = io.sockets.sockets.get(defendingPlayerState.playerId);
            if (playerSocket) {
                handleResolveReaction(io, playerSocket, { reactionType: 'take_damage' });
            }
        }, 10000);
        
        party.reactionTimeout = reactionTimeout;
        opponentParty.reactionTimeout = reactionTimeout;
        
        return true; // Reaction was initiated
    }
    
    return false; // No reaction available
}


export async function processWeaponAttack(io, party, player, payload) {
    const { weaponSlot, targetIndex } = payload;
    const character = player.character;
    const { sharedState } = party;
    const actingPlayerState = sharedState.partyMemberStates.find(p => p.playerId === player.id);
    const weapon = character.equipment[weaponSlot];
    const target = sharedState.zoneCards[targetIndex];

    if (!weapon || weapon.type !== 'weapon' || !target || (target.type !== 'enemy' && target.type !== 'player') || actingPlayerState.actionPoints < weapon.cost || (actingPlayerState.weaponCooldowns[weapon.name] || 0) > 0) {
        return;
    }

    // --- REFACTORED PVP REACTION LOGIC ---
    if (target._playerStateRef) {
        const defendingPlayerState = target._playerStateRef;
        const actionDetails = {
            damage: weapon.weaponDamage,
            damageType: weapon.damageType,
            message: `attacks with ${weapon.name}.`,
            debuff: null,
        };
        
        const reactionInitiated = handlePvpReactionCheck(io, party, actingPlayerState, character, defendingPlayerState, actionDetails);

        if (reactionInitiated) {
            actingPlayerState.actionPoints -= weapon.cost;
            actingPlayerState.threat += weapon.cost;
            actingPlayerState.weaponCooldowns[weapon.name] = weapon.cooldown;
            return;
        }
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
        const realTarget = target._playerStateRef || target;
        realTarget.health -= weapon.weaponDamage;
        target.health = realTarget.health; 

        logMessage += ` Hit! Dealt ${weapon.weaponDamage} ${weapon.damageType} damage to ${target.name} [id:${target.id}].`;

        if (roll === 20 && weapon.onCrit && weapon.onCrit.debuff) {
            realTarget.debuffs.push({ ...weapon.onCrit.debuff });
            logMessage += ` CRITICAL HIT! ${target.name} is now ${weapon.onCrit.debuff.type}!`;
        }
        if (weapon.onHit && weapon.onHit.debuff) {
            realTarget.debuffs.push({ ...weapon.onHit.debuff });
            logMessage += ` ${target.name} is now ${weapon.onHit.debuff.type}!`;
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
    const actingPlayerState = sharedState.partyMemberStates.find(p => p.playerId === player.id);
    const spell = character.equippedSpells[spellIndex];
    const cost = spell.cost || 0;

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
    let targetIsPlayer = false;

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
            if(enemyTarget._playerStateRef) targetIsPlayer = true;
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

    // --- REFACTORED PVP REACTION LOGIC ---
    if ((spell.type === 'attack' || spell.type === 'versatile' || spell.type === 'aoe') && enemyTarget && targetIsPlayer) {
        const defendingPlayerState = enemyTarget._playerStateRef;
        let damage = spell.damage || 0;
        if (spell.type === 'versatile') {
            damage = spell.baseEffect + statValue;
        }

        const actionDetails = {
            damage: damage,
            damageType: spell.damageType || 'Physical',
            message: `casts ${spell.name}.`,
            debuff: spell.debuff || null
        };
        
        const reactionInitiated = handlePvpReactionCheck(io, party, actingPlayerState, character, defendingPlayerState, actionDetails);
        
        if (reactionInitiated) {
            actingPlayerState.threat += cost;
            return;
        }
    }

    actingPlayerState.threat += cost;
    if (spell.bonusThreat) {
        actingPlayerState.threat += spell.bonusThreat;
        sharedState.log.push({ message: `${character.characterName} generates ${spell.bonusThreat} bonus threat!`, type: 'reaction' });
    }

    if (spell.name === "Monk's Training") {
        const focusAmount = actingPlayerState.focus || 0;
        if (focusAmount > 0) {
            actingPlayerState.health = Math.min(actingPlayerState.maxHealth, actingPlayerState.health + focusAmount);
            actingPlayerState.buffs.push({ type: 'Focus', duration: 2, bonus: { rollBonus: focusAmount } });
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
                target.buffs.push({ ...spell.buff });
                sharedState.log.push({ message: `${target.name} gains ${spell.buff.type}!`, type: 'heal' });
            }
        }
    } else if (spell.type === 'versatile') {
        const effectValue = spell.baseEffect + statValue;
        const target = isSelfTarget ? actingPlayerState : friendlyTarget;
        if (target && !target.isDead) {
            target.health = Math.min(target.maxHealth, target.health + effectValue);
            sharedState.log.push({ message: `Healed ${target.name} for ${effectValue} HP.`, type: 'heal' });
        } else if (enemyTarget) {
            const realTarget = enemyTarget._playerStateRef || enemyTarget;
            realTarget.health -= effectValue;
            enemyTarget.health = realTarget.health;
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

                const realTarget = aoeTarget._playerStateRef || aoeTarget;
                realTarget.health -= damage;
                aoeTarget.health = realTarget.health;
                
                let hitDescription = `Dealt ${damage} damage to ${aoeTarget.name} [id:${aoeTarget.id}].`;

                if (spell.debuff) {
                    realTarget.debuffs.push({ ...spell.debuff });
                    hitDescription += ` ${aoeTarget.name} is now ${spell.debuff.type}!`;
                }
                if (spell.onHit && total >= (spell.onHit.threshold || hitTarget) && spell.onHit.debuff) {
                    realTarget.debuffs.push({ ...spell.onHit.debuff });
                    hitDescription += ` ${aoeTarget.name} is now ${spell.onHit.debuff.type}!`;
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
        const actingPlayerState = party.sharedState.partyMemberStates.find(p => p.playerId === player.id);
        if (actingPlayerState.actionPoints < 1) return;
        actingPlayerState.actionPoints--;
        actingPlayerState.threat += 1;
        party.sharedState.log.push({ message: `${character.characterName} spends 1 AP to change equipment.`, type: 'info' });
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
    const actingPlayerState = sharedState.partyMemberStates.find(p => p.playerId === player.id);
    const item = character.equipment[slot];
    
    if (!item || !item.activatedAbility || !actingPlayerState || actingPlayerState.actionPoints < item.activatedAbility.cost || (actingPlayerState.itemCooldowns[item.name] || 0) > 0) {
        return;
    }
    
    const ability = item.activatedAbility;
    actingPlayerState.actionPoints -= ability.cost;
    actingPlayerState.threat += ability.cost;
    actingPlayerState.itemCooldowns[item.name] = ability.cooldown;
    
    if (ability.buff) {
        actingPlayerState.buffs.push({ ...ability.buff });
        sharedState.log.push({ message: `${character.characterName} used ${ability.name} and gained the ${ability.buff.type} buff!`, type: 'heal' });
    }
    if (ability.effect === 'cleanse') {
        const bleedIndex = actingPlayerState.debuffs.findIndex(d => d.type === 'bleed');
        const poisonIndex = actingPlayerState.debuffs.findIndex(d => d.type === 'poison');
        if (poisonIndex !== -1) {
            const removed = actingPlayerState.debuffs.splice(poisonIndex, 1);
            sharedState.log.push({ message: `${character.characterName} cleansed ${removed[0].type}!`, type: 'heal' });
        } else if (bleedIndex !== -1) {
            const removed = actingPlayerState.debuffs.splice(bleedIndex, 1);
            sharedState.log.push({ message: `${character.characterName} cleansed ${removed[0].type}!`, type: 'heal' });
        } else {
            sharedState.log.push({ message: `${character.characterName} used ${ability.name}, but there was nothing to cleanse.`, type: 'info' });
        }
    }

    await checkAndEndTurnForPlayer(io, party, player);
}

export async function processUseConsumable(io, party, player, payload) {
    const { inventoryIndex } = payload;
    const character = player.character;
    const { sharedState } = party;
    const actingPlayerState = sharedState.partyMemberStates.find(p => p.playerId === player.id);
    const item = character.inventory[inventoryIndex];
    const cost = item.cost || 0;

    if (!item || item.type !== 'consumable' || actingPlayerState.actionPoints < cost) {
        return;
    }

    actingPlayerState.actionPoints -= cost;
    actingPlayerState.threat += cost;
    
    if (item.heal) {
        actingPlayerState.health = Math.min(actingPlayerState.maxHealth, actingPlayerState.health + item.heal);
        sharedState.log.push({ message: `${character.characterName} used ${item.name}, healing for ${item.heal} HP.`, type: 'heal' });

        // --- BUG FIX: Sync the opponent's view of the player's health ---
        if (party.sharedState.pvpEncounter) {
            const opponentParty = parties[party.sharedState.pvpEncounter.opponentPartyId];
            if (opponentParty) {
                const playerCardOnOpponentSide = opponentParty.sharedState.zoneCards.find(c => c.playerId === player.id);
                if (playerCardOnOpponentSide) {
                    playerCardOnOpponentSide.health = actingPlayerState.health;
                }
            }
        }
    }
    if (item.buff) {
        actingPlayerState.buffs.push({ ...item.buff });
        sharedState.log.push({ message: `${character.characterName} feels the effects of ${item.name}.`, type: 'heal' });
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