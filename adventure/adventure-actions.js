// adventure/adventure-actions.js

import { players } from '../serverState.js';
import { gameData } from '../game-data.js';
import { getBonusStatsForPlayer, addItemToInventoryServer } from '../utilsHelpers.js';

// --- MODIFICATION START ---
// Import handlePvpPlayerDeath, as we now need to handle player deaths directly from this file.
import { checkAndEndTurnForPlayer, defeatEnemyInParty, handlePvpPlayerDeath } from './adventure-state.js';
// --- MODIFICATION END ---

export async function processWeaponAttack(io, party, player, payload) {
    const { weaponSlot, targetIndex } = payload;
    const character = player.character;
    const { sharedState } = party;
    const actingPlayerState = sharedState.partyMemberStates.find(p => p.playerId === player.id);
    const weapon = character.equipment[weaponSlot];

    // --- MODIFICATION START ---
    // Make the target selection PvP-aware.
    let target;
    if (sharedState.pvpEncounter) {
        // In PvP, the target is another player from the combined party list.
        target = sharedState.partyMemberStates[targetIndex];
    } else {
        // In PvE, the target is an enemy card from the zone cards.
        target = sharedState.zoneCards[targetIndex];
    }
    // --- MODIFICATION END ---

    if (!weapon || weapon.type !== 'weapon' || !target || (target.type && target.type !== 'enemy') || actingPlayerState.actionPoints < weapon.cost || (actingPlayerState.weaponCooldowns[weapon.name] || 0) > 0) {
        return;
    }

    actingPlayerState.actionPoints -= weapon.cost;
    actingPlayerState.threat += weapon.cost; // Add threat equal to AP cost
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
        logMessage += ` Hit! Dealt ${weapon.weaponDamage} ${weapon.damageType} damage.`;

        // Debuffs in PvP need to go into the correct debuffs array
        const debuffsArray = target.debuffs || target.playerDebuffs;

        if (roll === 20 && weapon.onCrit && weapon.onCrit.debuff) {
            debuffsArray.push({ ...weapon.onCrit.debuff });
            logMessage += ` CRITICAL HIT! ${target.name} is now ${weapon.onCrit.debuff.type}!`;
        }
        if (weapon.onHit && weapon.onHit.debuff) {
            debuffsArray.push({ ...weapon.onHit.debuff });
            logMessage += ` ${target.name} is now ${weapon.onHit.debuff.type}!`;
        }

        sharedState.log.push({ message: logMessage, type: 'damage' });

        // --- MODIFICATION START ---
        // Make the defeat logic PvP-aware.
        if (target.health <= 0) {
            if (sharedState.pvpEncounter) {
                target.health = 0;
                target.isDead = true;
                const defeatedPlayerObject = players[target.name];
                handlePvpPlayerDeath(io, defeatedPlayerObject, party);
            } else {
                defeatEnemyInParty(io, party, target, targetIndex);
            }
        }
        // --- MODIFICATION END ---

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

    actingPlayerState.actionPoints -= cost;
    actingPlayerState.threat += cost;
    actingPlayerState.spellCooldowns[spell.name] = spell.cooldown;

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

    if (roll === 1) {
        description += ` Critical Failure! The spell fizzles!`;
        sharedState.log.push({ message: description, type: 'damage' });
        await checkAndEndTurnForPlayer(io, party, player);
        return;
    }

    if (total < hitTarget) {
        description += ` The spell fizzles!`;
        sharedState.log.push({ message: description, type: 'info' });
        await checkAndEndTurnForPlayer(io, party, player);
        return;
    }

    description += ` Success!`;
    sharedState.log.push({ message: description, type: spell.type === 'heal' || spell.type === 'buff' ? 'heal' : 'damage' });

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
        // --- MODIFICATION START ---
        // Make enemy target selection PvP-aware.
        const idx = parseInt(targetIndex);
        if (!isNaN(idx)) {
            if (sharedState.pvpEncounter) {
                const potentialTarget = sharedState.partyMemberStates[idx];
                if (potentialTarget && potentialTarget.team !== actingPlayerState.team) {
                    enemyTarget = potentialTarget;
                }
            } else {
                if (sharedState.zoneCards[idx] && sharedState.zoneCards[idx].type === 'enemy') {
                    enemyTarget = sharedState.zoneCards[idx];
                }
            }
        }
        // --- MODIFICATION END ---
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
            enemyTarget.health -= effectValue;
            sharedState.log.push({ message: `Dealt ${effectValue} ${spell.damageType} damage to ${enemyTarget.name}.`, type: 'damage' });
            
            // --- MODIFICATION START ---
            // PvP-aware defeat logic for versatile spells.
            if (enemyTarget.health <= 0) {
                 if (sharedState.pvpEncounter) {
                    enemyTarget.health = 0;
                    enemyTarget.isDead = true;
                    const defeatedPlayerObject = players[enemyTarget.name];
                    handlePvpPlayerDeath(io, defeatedPlayerObject, party);
                } else {
                    defeatEnemyInParty(io, party, enemyTarget, parseInt(targetIndex));
                }
            }
            // --- MODIFICATION END ---
        }
    } else if (spell.type === 'attack' || spell.type === 'aoe') {
        let targets = [];
        // --- MODIFICATION START ---
        // Make AOE targeting PvP-aware.
        if (sharedState.pvpEncounter) {
            if (spell.aoeTargeting === 'all') {
                sharedState.partyMemberStates.forEach((p, idx) => {
                    if (p.team !== actingPlayerState.team && !p.isDead) targets.push({ card: p, index: idx });
                });
            } else {
                if (enemyTarget) targets.push({ card: enemyTarget, index: parseInt(targetIndex) });
            }
        } else {
        // --- End of new PvP block, original PvE logic follows ---
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
        }

        const uniqueTargets = [...new Map(targets.map(item => [item.card.id || item.card.name, item])).values()];
        
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
                let hitDescription = `Dealt ${damage} damage to ${aoeTarget.name}.`;

                const debuffsArray = aoeTarget.debuffs || aoeTarget.playerDebuffs;

                if (spell.debuff) {
                    debuffsArray.push({ ...spell.debuff });
                    hitDescription += ` ${aoeTarget.name} is now ${spell.debuff.type}!`;
                }
                if (spell.onHit && total >= (spell.onHit.threshold || hitTarget) && spell.onHit.debuff) {
                    debuffsArray.push({ ...spell.onHit.debuff });
                    hitDescription += ` ${aoeTarget.name} is now ${spell.onHit.debuff.type}!`;
                }
                sharedState.log.push({ message: hitDescription, type: 'damage' });

                if ((spell.name === 'Punch' || spell.name === 'Kick') && character.equippedSpells.some(s => s.name === "Monk's Training") && !character.equipment.mainHand && !character.equipment.offHand) {
                    if ((actingPlayerState.focus || 0) < 3) {
                        actingPlayerState.focus = (actingPlayerState.focus || 0) + 1;
                        sharedState.log.push({ message: `${character.characterName} gains 1 Focus.`, type: 'heal' });
                    }
                }

                // --- MODIFICATION START ---
                // PvP-aware defeat logic for AOE spells.
                if (aoeTarget.health <= 0) {
                    if (sharedState.pvpEncounter) {
                        aoeTarget.health = 0;
                        aoeTarget.isDead = true;
                        const defeatedPlayerObject = players[aoeTarget.name];
                        handlePvpPlayerDeath(io, defeatedPlayerObject, party);
                    } else {
                        defeatEnemyInParty(io, party, aoeTarget, aoeIndex);
                    }
                }
                // --- MODIFICATION END ---
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
        actingPlayerState.threat += 1; // Add threat equal to AP cost
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
    actingPlayerState.threat += ability.cost; // Add threat equal to AP cost
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
    actingPlayerState.threat += cost; // Add threat equal to AP cost
    
    if (item.heal) {
        actingPlayerState.health = Math.min(actingPlayerState.maxHealth, actingPlayerState.health + item.heal);
        sharedState.log.push({ message: `${character.characterName} used ${item.name}, healing for ${item.heal} HP.`, type: 'heal' });
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