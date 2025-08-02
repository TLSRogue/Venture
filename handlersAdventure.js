// handlersAdventure.js

import { players, parties, duels } from './serverState.js';
import { gameData } from './game-data.js';
import { broadcastAdventureUpdate } from './utilsBroadcast.js';
import { buildZoneDeckForServer, drawCardsForServer, getBonusStatsForPlayer, addItemToInventoryServer } from './utilsHelpers.js';

// --- ADVENTURE HELPER FUNCTIONS ---

function defeatEnemyInParty(io, party, enemy, enemyIndex) {
    const { sharedState } = party;
    sharedState.log.push({ message: `${enemy.name} has been defeated!`, type: 'success' });

    // --- NEW: LOOT TABLE PROCESSING ---
    let rolledLootItems = [];
    if (enemy.lootTable && enemy.lootTable.length > 0) {
        const roll = Math.floor(Math.random() * 20) + 1;
        const lootDrop = enemy.lootTable.find(entry => roll >= entry.range[0] && roll <= entry.range[1]);

        if (lootDrop) {
            if (lootDrop.items && lootDrop.items.length > 0) {
                rolledLootItems.push(...lootDrop.items);
            }
            if (lootDrop.randomItems && lootDrop.randomItems.pool) {
                for (let i = 0; i < lootDrop.randomItems.count; i++) {
                    const randomItemName = lootDrop.randomItems.pool[Math.floor(Math.random() * lootDrop.randomItems.pool.length)];
                    rolledLootItems.push(randomItemName);
                }
            }
        }
    }
    const rolledLootObjects = rolledLootItems.map(name => gameData.allItems.find(i => i.name === name)).filter(Boolean);
    // --- END: LOOT TABLE PROCESSING ---


    party.members.forEach(memberName => {
        const member = players[memberName];
        if (!member || !member.character) return;
        const character = member.character;

        // Quest Progress
        character.quests.forEach(quest => {
            if (quest.status === 'active' && (quest.details.target === enemy.name || (quest.details.target === 'Goblin' && enemy.name.includes('Goblin')))) {
                quest.progress++;
                if (quest.progress >= quest.details.required) {
                    quest.status = 'readyToTurnIn';
                    if(member.id) io.to(member.id).emit('questObjectiveComplete', quest.details.title);
                }
            }
        });

        // Guaranteed Gold
        if (enemy.guaranteedLoot && enemy.guaranteedLoot.gold) {
            const goldAmount = (Math.floor(Math.random() * 20) + 1) + (Math.floor(Math.random() * 20) + 1);
            const goldPerPlayer = Math.floor(goldAmount / party.members.length);
            character.gold += goldPerPlayer;
        }

        // Guaranteed Items
        if (enemy.guaranteedLoot && enemy.guaranteedLoot.items) {
            enemy.guaranteedLoot.items.forEach(itemName => {
                 const itemData = gameData.allItems.find(i => i.name === itemName);
                 if (itemData) {
                    addItemToInventoryServer(character, itemData);
                 }
            });
        }
        
        // --- NEW: Award Rolled Loot ---
        if(rolledLootObjects.length > 0) {
            rolledLootObjects.forEach(itemData => {
                addItemToInventoryServer(character, itemData);
            });
        }
        // --- END: Award Rolled Loot ---

        if (member.id) io.to(member.id).emit('characterUpdate', character);
    });
    
    // Logging Drops
    if (enemy.guaranteedLoot && enemy.guaranteedLoot.gold) {
        sharedState.log.push({ message: `${enemy.name} dropped gold, which was split among the party.`, type: 'success'});
    }
     if (enemy.guaranteedLoot && enemy.guaranteedLoot.items) {
        sharedState.log.push({ message: `${enemy.name} dropped: ${enemy.guaranteedLoot.items.join(', ')} for everyone!`, type: 'success'});
    }
    // --- NEW: Log Rolled Loot ---
    if (rolledLootItems.length > 0) {
        sharedState.log.push({ message: `${enemy.name} also dropped: ${rolledLootItems.join(', ')} for everyone!`, type: 'success' });
    }
    // --- END: Log Rolled Loot ---

    sharedState.zoneCards[enemyIndex] = null;

    if (!sharedState.zoneCards.some(c => c && c.type === 'enemy')) {
        sharedState.log.push({ message: "Combat has ended! Action Points restored.", type: "success" });
        sharedState.partyMemberStates.forEach(p => { if (!p.isDead) p.actionPoints = 3; });
    }
}

function processWeaponAttack(io, party, player, payload) {
    const { weaponSlot, targetIndex } = payload;
    const character = player.character;
    const { sharedState } = party;
    const actingPlayerState = sharedState.partyMemberStates.find(p => p.playerId === player.id);
    const weapon = character.equipment[weaponSlot];
    const target = sharedState.zoneCards[targetIndex];

    if (!weapon || weapon.type !== 'weapon' || !target || target.type !== 'enemy' || actingPlayerState.actionPoints < weapon.cost || (actingPlayerState.weaponCooldowns[weapon.name] || 0) > 0) {
        return;
    }

    actingPlayerState.actionPoints -= weapon.cost;
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

        if (roll === 20 && weapon.onCrit && weapon.onCrit.debuff) {
            target.debuffs.push({ ...weapon.onCrit.debuff });
            logMessage += ` CRITICAL HIT! ${target.name} is now ${weapon.onCrit.debuff.type}!`;
        }
        if (weapon.onHit && weapon.onHit.debuff) {
            target.debuffs.push({ ...weapon.onHit.debuff });
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
}

function processCastSpell(io, party, player, payload) {
    const { spellIndex, targetIndex } = payload;
    const character = player.character;
    const { sharedState } = party;
    const actingPlayerState = sharedState.partyMemberStates.find(p => p.playerId === player.id);
    const spell = character.equippedSpells[spellIndex];

    if (!spell || actingPlayerState.actionPoints < (spell.cost || 0) || (actingPlayerState.spellCooldowns[spell.name] || 0) > 0) {
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

    actingPlayerState.actionPoints -= (spell.cost || 0);
    actingPlayerState.spellCooldowns[spell.name] = spell.cooldown;

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
        return;
    }

    const bonuses = getBonusStatsForPlayer(character, actingPlayerState);
    let statValue = 0;
    let rollDescription = "";

    if (spell.name === "Warrior's Might") {
        statValue = actingPlayerState.maxHealth - actingPlayerState.health;
        rollDescription = `(Missing Health)`;
    } else {
        statValue = (character[spell.stat] || 0) + (bonuses[spell.stat] || 0);
        rollDescription = `(${spell.stat.slice(0, 3)})`;
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
        return;
    }

    if (total < hitTarget) {
        description += ` The spell fizzles!`;
        sharedState.log.push({ message: description, type: 'info' });
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
        const enemyIdx = parseInt(targetIndex);
        if (!isNaN(enemyIdx) && sharedState.zoneCards[enemyIdx] && sharedState.zoneCards[enemyIdx].type === 'enemy') {
            enemyTarget = sharedState.zoneCards[enemyIdx];
        }
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
                let hitDescription = `Dealt ${damage} damage to ${aoeTarget.name}.`;

                if (spell.debuff) {
                    aoeTarget.debuffs.push({ ...spell.debuff });
                    hitDescription += ` ${aoeTarget.name} is now ${spell.debuff.type}!`;
                }
                if (spell.onHit && total >= (spell.onHit.threshold || hitTarget) && spell.onHit.debuff) {
                    aoeTarget.debuffs.push({ ...spell.onHit.debuff });
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
}

function processEquipItem(io, party, player, payload) {
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
        party.sharedState.log.push({ message: `${character.characterName} spends 1 AP to change equipment.`, type: 'info' });
    }

    let itemsToUnequip = [];
    if (itemToEquip.hands === 2) {
        if (character.equipment.mainHand) itemsToUnequip.push(character.equipment.mainHand);
        if (character.equipment.offHand && character.equipment.offHand !== character.equipment.mainHand) itemsToUnequip.push(character.equipment.offHand);
    } else {
        if (character.equipment.mainHand && character.equipment.mainHand.hands === 2) {
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
}

function processUseItemAbility(party, player, payload) {
    const { slot } = payload;
    const character = player.character;
    const { sharedState } = party;
    const actingPlayerState = sharedState.partyMemberStates.find(p => p.playerId === player.id);
    const item = character.equipment[slot];
    
    if (!item || !item.activatedAbility || actingPlayerState.actionPoints < item.activatedAbility.cost || (actingPlayerState.itemCooldowns[item.name] || 0) > 0) {
        return;
    }
    
    const ability = item.activatedAbility;
    actingPlayerState.actionPoints -= ability.cost;
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
}

function processUseConsumable(io, party, player, payload) {
    const { inventoryIndex } = payload;
    const character = player.character;
    const { sharedState } = party;
    const actingPlayerState = sharedState.partyMemberStates.find(p => p.playerId === player.id);
    const item = character.inventory[inventoryIndex];

    if (!item || item.type !== 'consumable' || actingPlayerState.actionPoints < (item.cost || 0)) {
        return;
    }

    actingPlayerState.actionPoints -= (item.cost || 0);
    
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
}

function processDropItem(io, party, player, payload) {
    const { inventoryIndex } = payload;
    const { character } = player;
    const { sharedState } = party;

    if (character.inventory[inventoryIndex]) {
        const itemName = character.inventory[inventoryIndex].name;
        character.inventory[inventoryIndex] = null;
        sharedState.log.push({ message: `${character.characterName} dropped ${itemName}.`, type: 'info' });
        io.to(player.id).emit('characterUpdate', character);
    }
}

function processInteractWithCard(io, party, player, payload) {
    const { cardIndex } = payload;
    const { character } = player;
    const { sharedState } = party;
    const actingPlayerState = sharedState.partyMemberStates.find(p => p.playerId === player.id);
    const card = sharedState.zoneCards[cardIndex];

    if (!card) return;

    if (card.type === 'resource') {
        const hasTool = character.inventory.some(item => item && item.name === card.tool) || (character.equipment.mainHand && character.equipment.mainHand.name === card.tool);
        if (!hasTool) return;

        if (actingPlayerState.actionPoints < 1) return;
        actingPlayerState.actionPoints--;

        const bonuses = getBonusStatsForPlayer(character, actingPlayerState);
        const skillValue = (character[card.skill] || 0) + (bonuses[card.skill] || 0);
        const roll = Math.floor(Math.random() * 20) + 1;
        const total = roll + skillValue;
        const hitTarget = 11;
        let logMessage = `${character.characterName}'s gathering attempt: ${roll}(d20) + ${skillValue} = ${total}. (Target: ${hitTarget}+)`;

        if (roll > 1 && total >= hitTarget) {
            if (addItemToInventoryServer(character, card.loot)) {
                logMessage += ` Success! They gathered 1 ${card.loot.name}.`;
                sharedState.log.push({ message: logMessage, type: 'success' });
                io.to(player.id).emit('characterUpdate', character);
            } else {
                logMessage += ` Success! But their inventory is full.`;
                sharedState.log.push({ message: logMessage, type: 'damage' });
            }
        } else {
            logMessage += ` Failure!`;
            sharedState.log.push({ message: logMessage, type: 'info' });
        }

        card.charges--;
        if (card.charges <= 0) {
            sharedState.log.push({ message: `${card.name} has been depleted.`, type: 'info' });
            sharedState.zoneCards[cardIndex] = null;
        }
    }
    
    else if (card.type === 'enemy') {
        return;
    }
    
    else if (card.type === 'npc' && player.character.characterName !== party.leaderId) {
        return;
    }

    else if (actingPlayerState.actionPoints >= 1) {
        actingPlayerState.actionPoints--;

        if (card.type === 'npc') {
            startNPCDialogue(io, player, party, card, cardIndex);
        }
        else if (card.type === 'treasure') {
            const lootTable = card.loot ? card.loot.map(item => gameData.allItems.find(i => i.name === item.name) || item) : gameData.genericTreasureLoot.map(item => gameData.allItems.find(i => i.name === item.name) || item);
            const numItems = Math.floor(Math.random() * 2) + 1;
            let foundItemsLog = '';

            for(let i = 0; i < numItems; i++) {
                if (lootTable.length > 0) {
                    const randomLoot = {...lootTable[Math.floor(Math.random() * lootTable.length)]};
                    if (randomLoot.gold) {
                        const goldPerPlayer = Math.floor(randomLoot.gold / party.members.length);
                        party.members.forEach(memberName => {
                            const memberPlayer = players[memberName];
                            if (memberPlayer && memberPlayer.character) {
                                memberPlayer.character.gold += goldPerPlayer;
                                if(memberPlayer.id) io.to(memberPlayer.id).emit('characterUpdate', memberPlayer.character);
                            }
                        });
                        foundItemsLog += `${randomLoot.gold} Gold (split), `;
                    } else {
                        if (addItemToInventoryServer(character, randomLoot)) {
                           foundItemsLog += `${randomLoot.name}, `;
                        }
                    }
                }
            }
            
            if (foundItemsLog) {
                foundItemsLog = foundItemsLog.slice(0, -2);
                sharedState.log.push({ message: `${character.characterName} opened a chest and found: ${foundItemsLog}!`, type: 'success' });
            } else {
                sharedState.log.push({ message: "The chest was empty.", type: "info" });
            }
            
            io.to(player.id).emit('characterUpdate', character);
            sharedState.zoneCards[cardIndex] = null;
        }
    }
}

function startNPCDialogue(io, player, party, npc, cardIndex, dialogueNodeKey = 'start') {
    const leaderCharacter = player.character;

    let currentDialogueNodeKey = dialogueNodeKey;
    if (dialogueNodeKey === 'start') {
        let nextQuestDef = null;
        for (const quest of npc.quests) {
            const playerQuest = leaderCharacter.quests.find(q => q.details.id === quest.id);
            if (!playerQuest || playerQuest.status !== 'completed') {
                nextQuestDef = quest;
                break;
            }
        }

        if (nextQuestDef) {
            const playerQuest = leaderCharacter.quests.find(q => q.details.id === nextQuestDef.id);
            if (!playerQuest) {
                currentDialogueNodeKey = `${nextQuestDef.id}_start`;
            } else if (playerQuest.status === 'readyToTurnIn') {
                currentDialogueNodeKey = `${nextQuestDef.id}_ready`;
            } else {
                currentDialogueNodeKey = `${nextQuestDef.id}_inProgress`;
            }
        } else {
            currentDialogueNodeKey = 'allQuestsDone';
        }
    }
    
    const currentNode = npc.dialogue[currentDialogueNodeKey];
    const payload = {
        npcName: npc.name,
        node: currentNode,
        cardIndex: cardIndex
    };

    party.members.forEach(memberName => {
        const member = players[memberName];
        if (member && member.id) io.to(member.id).emit('party:showDialogue', payload);
    });
}

function processDialogueChoice(io, player, party, payload) {
    const { cardIndex, choice } = payload;
    const { character } = player;
    const npc = party.sharedState.zoneCards[cardIndex];

    if (choice.questId) {
        const questDetails = npc.quests.find(q => q.id === choice.questId);
        if (questDetails) {
            party.members.forEach(memberName => {
                const member = players[memberName]?.character;
                if (member && !member.quests.some(q => q.details.id === choice.questId)) {
                    member.quests.push({ details: questDetails, status: 'active', progress: 0 });
                    if(players[memberName].id) io.to(players[memberName].id).emit('characterUpdate', member);
                }
            });
            party.sharedState.log.push({ message: `Party accepted Quest: ${questDetails.title}`, type: 'success' });
        }
    }

    if (choice.questComplete) {
        const questToComplete = character.quests.find(q => q.details.id === choice.questComplete);
        if (questToComplete && questToComplete.status === 'readyToTurnIn') {
             party.members.forEach(memberName => {
                const member = players[memberName]?.character;
                if (member) {
                    const memberQuest = member.quests.find(q => q.details.id === choice.questComplete);
                    if (memberQuest) {
                        memberQuest.status = 'completed';
                        if (memberQuest.details.reward.gold) member.gold += memberQuest.details.reward.gold;
                        if (memberQuest.details.reward.qp) member.questPoints += memberQuest.details.reward.qp;
                        if(players[memberName].id) io.to(players[memberName].id).emit('characterUpdate', member);
                    }
                }
            });
            party.sharedState.log.push({ message: `Party completed Quest: ${questToComplete.details.title}`, type: 'success' });
        }
    }

    if (choice.next === 'farewell') {
        party.members.forEach(memberName => {
            const member = players[memberName];
            if(member && member.id) io.to(member.id).emit('party:hideDialogue')
        });
    } else {
        startNPCDialogue(io, player, party, npc, cardIndex, choice.next);
    }
}

function processEndAdventure(io, player, party) {
    const { sharedState } = party;
    if (!sharedState) return;

    party.members.forEach(memberName => {
        const memberPlayer = players[memberName];
        const memberCharacter = memberPlayer?.character;
        if (memberCharacter) {
            memberCharacter.health = memberCharacter.maxHealth; 
            if(memberPlayer.id) {
                io.to(memberPlayer.id).emit('characterUpdate', memberCharacter);
                io.to(memberPlayer.id).emit('party:adventureEnded');
            }
        }
    });

    if (party.isSoloParty) {
        const player = players[party.leaderId];
        if (player && player.character) {
            player.character.partyId = null;
            if(player.id) io.to(player.id).emit('partyUpdate', null);
        }
        delete parties[party.id];
    } else {
       party.sharedState = null;
    }
}

async function processVentureDeeper(io, player, party) {
    if (player.character.characterName !== party.leaderId || !party.sharedState) return;

    const { sharedState } = party;
    
    const proceedToNextArea = () => {
        sharedState.zoneCards = [];
        drawCardsForServer(sharedState, 3);

        sharedState.partyMemberStates.forEach(p => {
            p.actionPoints = 3;
            p.turnEnded = false;
            p.weaponCooldowns = {};
            p.spellCooldowns = {};
            p.itemCooldowns = {};
        });
        sharedState.turnNumber = 0;
        sharedState.isPlayerTurn = true;
    };
    
    const inCombat = sharedState.zoneCards.some(c => c && c.type === 'enemy');
    if (inCombat) {
        sharedState.log.push({ message: "The party attempts to flee, but the enemies get one last attack!", type: 'reaction' });
        await runEnemyPhaseForParty(io, party.id, true); 

        const alivePlayers = sharedState.partyMemberStates.filter(p => p.health > 0);
        if (alivePlayers.length > 0) {
            sharedState.log.push({ message: "They successfully escaped to a new area!", type: 'success' });
            proceedToNextArea();
        } else {
            sharedState.log.push({ message: "The party was wiped out while trying to flee!", type: 'damage' });
        }
    } else {
        sharedState.log.push({ message: "The party ventures deeper into the zone!", type: 'info' });
        proceedToNextArea();
    }
}

function processLootPlayer(io, lootingPlayer, party, payload) {
    const { targetPlayerIndex } = payload;
    const { sharedState } = party;
    
    const deadPlayerState = sharedState.partyMemberStates[targetPlayerIndex];
    const lootingCharacter = lootingPlayer.character;

    if (!deadPlayerState || !deadPlayerState.isDead || deadPlayerState.lootableInventory.length === 0) {
        return; 
    }

    const itemToLoot = deadPlayerState.lootableInventory[0];

    if (addItemToInventoryServer(lootingCharacter, itemToLoot, itemToLoot.quantity || 1)) {
        deadPlayerState.lootableInventory.splice(0, 1);
        sharedState.log.push({ message: `${lootingCharacter.characterName} looted ${itemToLoot.name} from ${deadPlayerState.name}'s bag.`, type: 'info' });
        
        io.to(lootingPlayer.id).emit('characterUpdate', lootingCharacter);
    } else {
        sharedState.log.push({ message: `${lootingCharacter.characterName} tried to loot ${itemToLoot.name}, but their inventory is full.`, type: 'damage' });
    }
}

async function runEnemyPhaseForParty(io, partyId, isFleeing = false, startIndex = 0) {
    const party = parties[partyId];
    if (!party || !party.sharedState || party.sharedState.pendingReaction) return;

    const { sharedState } = party;
    if (startIndex === 0) {
        sharedState.isPlayerTurn = false;
        if (!isFleeing) {
            sharedState.log.push({ message: "--- Zone's Turn ---", type: 'info' });
        }
        broadcastAdventureUpdate(io, partyId);
    }

    const enemies = sharedState.zoneCards.map((card, index) => ({ card, index })).filter(e => e.card && e.card.type === 'enemy');

    for (let i = startIndex; i < enemies.length; i++) {
        const { card: enemy, index: enemyIndex } = enemies[i];
        if (enemy.health <= 0) continue;
        
        try {
            await new Promise(resolve => setTimeout(resolve, 1000));
            
            let tookDotDamage = false;
            const burnDebuff = enemy.debuffs.find(d => d.type === 'burn');
            if (burnDebuff) {
                enemy.health -= burnDebuff.damage;
                sharedState.log.push({ message: `${enemy.name} takes ${burnDebuff.damage} damage from Burn.`, type: 'damage' });
                burnDebuff.duration--;
                tookDotDamage = true;
            }
            if (enemy.health <= 0) {
                defeatEnemyInParty(io, party, enemy, enemyIndex);
                broadcastAdventureUpdate(io, partyId);
                continue;
            }
            enemy.debuffs = enemy.debuffs.filter(d => d.duration > 0);
            if(tookDotDamage) broadcastAdventureUpdate(io, partyId);

            if (enemy.debuffs.some(d => d.type === 'stun')) {
                sharedState.log.push({ message: `${enemy.name} is stunned and cannot act!`, type: 'reaction' });
                enemy.debuffs = enemy.debuffs.filter(d => d.type !== 'stun');
                broadcastAdventureUpdate(io, partyId);
                continue;
            }

            const alivePlayers = sharedState.partyMemberStates.filter(p => !p.isDead);
            if (alivePlayers.length === 0) continue;

            const targetPlayerState = alivePlayers[Math.floor(Math.random() * alivePlayers.length)];
            const targetPlayerObject = players[targetPlayerState.name];
            if (!targetPlayerObject) continue;
            
            const roll = Math.floor(Math.random() * 20) + 1;
            const attack = enemy.attackTable ? enemy.attackTable.find(a => roll >= a.range[0] && roll <= a.range[1]) : null;

            if (attack && attack.action === 'attack') {
                const targetCharacter = targetPlayerObject.character;
                const availableReactions = [];
                const dodgeSpell = targetCharacter.equippedSpells.find(s => s.name === "Dodge");
                if (dodgeSpell && (targetPlayerState.spellCooldowns[dodgeSpell.name] || 0) <= 0) {
                    availableReactions.push({ name: 'Dodge', type: 'spell', spell: dodgeSpell });
                }
                
                if (availableReactions.length > 0) {
                    sharedState.pendingReaction = {
                        attackerName: enemy.name,
                        attackerIndex: enemyIndex,
                        targetName: targetPlayerState.name,
                        damage: attack.damage,
                        debuff: attack.debuff || null,
                        message: attack.message,
                        isFleeing: isFleeing // --- FIX #1: Remember if we are fleeing
                    };
                    
                    io.to(targetPlayerState.playerId).emit('party:requestReaction', {
                        damage: attack.damage,
                        attacker: enemy.name,
                        availableReactions
                    });
                    
                    sharedState.reactionTimeout = setTimeout(() => {
                        const playerSocket = io.sockets.sockets.get(targetPlayerState.playerId);
                        if (playerSocket) {
                            handleResolveReaction(io, playerSocket, { reactionType: 'take_damage' });
                        }
                    }, 15000);

                    return;
                } else {
                    targetPlayerState.health -= attack.damage;
                    let attackMessage = `${enemy.name} ${attack.message} It hits ${targetPlayerState.name} for ${attack.damage} damage!`;
                    if (attack.debuff) {
                        targetPlayerState.debuffs.push({ ...attack.debuff });
                        attackMessage += ` ${targetPlayerState.name} is now ${attack.debuff.type}!`;
                    }
                    sharedState.log.push({ message: attackMessage, type: 'damage'});
                }

            } else if (attack && attack.action === 'special') {
                sharedState.log.push({ message: `${enemy.name} uses a special ability: ${attack.message}`, type: 'reaction' });
            } else {
                sharedState.log.push({ message: `${enemy.name} misses its attack.`, type: 'info' });
            }
            
            if (targetPlayerState.health <= 0) {
                targetPlayerState.health = 0;
                targetPlayerState.isDead = true;
                if (targetPlayerObject.character) {
                    targetPlayerState.lootableInventory = [...targetPlayerObject.character.inventory.filter(Boolean)];
                    targetPlayerObject.character.inventory = Array(24).fill(null);
                    if(targetPlayerObject.id) io.to(targetPlayerObject.id).emit('characterUpdate', targetPlayerObject.character);
                }
                sharedState.log.push({ message: `${targetPlayerState.name} has been defeated!`, type: 'damage' });
            }
            
            broadcastAdventureUpdate(io, partyId);

        } catch (error) {
            console.error(`Error processing turn for enemy ${enemy.name}:`, error);
        }
    }
    
    if (!isFleeing) {
        await new Promise(resolve => setTimeout(resolve, 1000));
        startNextPlayerTurn(io, partyId);
    }
}

function startNextPlayerTurn(io, partyId) {
    const party = parties[partyId];
    if (!party || !party.sharedState) return;
    
    const { sharedState } = party;
    sharedState.turnNumber++;
    sharedState.isPlayerTurn = true;
    
    sharedState.log.push({ message: "--- Players' Turn ---", type: 'info' });
    sharedState.partyMemberStates.forEach(p => {
        if (p.isDead) {
            p.turnEnded = true;
        } else {
            p.actionPoints = 3;
            p.turnEnded = false;
        }
        p.buffs.forEach(b => b.duration--);
        p.debuffs.forEach(d => d.duration--);
        p.buffs = p.buffs.filter(b => b.duration > 0);
        p.debuffs = p.debuffs.filter(d => d.duration > 0);

        Object.keys(p.weaponCooldowns).forEach(k => { if (p.weaponCooldowns[k] > 0) p.weaponCooldowns[k]--; });
        Object.keys(p.spellCooldowns).forEach(k => { if (p.spellCooldowns[k] > 0) p.spellCooldowns[k]--; });
        Object.keys(p.itemCooldowns).forEach(k => { if (p.itemCooldowns[k] > 0) p.itemCooldowns[k]--; });
    });
    broadcastAdventureUpdate(io, partyId);
}

// --- REACTION HANDLER LOGIC ---
async function handleResolveReaction(io, socket, payload) {
    const name = socket.characterName;
    const player = players[name];
    if (!player) return;

    const partyId = player.character.partyId;
    const party = parties[partyId];
    if (!party || !party.sharedState || !party.sharedState.pendingReaction) return;
    
    const { sharedState } = party;
    const reaction = sharedState.pendingReaction;

    if (reaction.targetName !== name) return;

    clearTimeout(sharedState.reactionTimeout);
    sharedState.reactionTimeout = null;

    const { reactionType } = payload;
    const reactingPlayerState = sharedState.partyMemberStates.find(p => p.name === name);
    const reactingPlayer = players[name];
    
    let finalDamage = reaction.damage;
    let dodged = false;
    let logMessage = '';

    if (reactionType === 'Dodge') {
        const dodgeSpell = reactingPlayer.character.equippedSpells.find(s => s.name === "Dodge");
        if (dodgeSpell && (reactingPlayerState.spellCooldowns[dodgeSpell.name] || 0) <= 0) {
            reactingPlayerState.spellCooldowns[dodgeSpell.name] = dodgeSpell.cooldown;
            const bonuses = getBonusStatsForPlayer(reactingPlayer.character, reactingPlayerState);
            const statValue = reactingPlayer.character.agility + bonuses.agility;
            const roll = Math.floor(Math.random() * 20) + 1;
            const total = roll + statValue;

            if (roll === 1) {
                logMessage = `${name}'s Dodge: ${roll}(d20) + ${statValue} = ${total}. Critical Failure!`;
            } else if (total >= dodgeSpell.hit) {
                finalDamage = 0;
                dodged = true;
                logMessage = `${name}'s Dodge: ${roll}(d20) + ${statValue} = ${total}. Success! They avoid the attack!`;
            } else {
                logMessage = `${name}'s Dodge: ${roll}(d20) + ${statValue} = ${total}. Failure!`;
            }
        } else {
            // --- BUG FIX: Add a log message for when Dodge fails due to cooldown or not being equipped ---
            logMessage = `${name} tries to Dodge, but fails!`;
        }
    } else { // 'take_damage'
        logMessage = `${name} braces for the attack!`;
    }
    
    sharedState.log.push({ message: logMessage, type: dodged ? 'success' : 'reaction' });

    if (finalDamage > 0) {
        reactingPlayerState.health -= finalDamage;
        let damageMessage = `${reaction.attackerName} ${reaction.message} It hits ${name} for ${finalDamage} damage!`;
        if (reaction.debuff && !dodged) {
            reactingPlayerState.debuffs.push({ ...reaction.debuff });
            damageMessage += ` ${name} is now ${reaction.debuff.type}!`;
        }
        sharedState.log.push({ message: damageMessage, type: 'damage' });
    }

    if (reactingPlayerState.health <= 0) {
        reactingPlayerState.health = 0;
        reactingPlayerState.isDead = true;
        if (reactingPlayer.character) {
            reactingPlayerState.lootableInventory = [...reactingPlayer.character.inventory.filter(Boolean)];
            reactingPlayer.character.inventory = Array(24).fill(null);
            if(reactingPlayer.id) io.to(reactingPlayer.id).emit('characterUpdate', reactingPlayer.character);
        }
        sharedState.log.push({ message: `${name} has been defeated!`, type: 'damage' });
    }

    const lastAttackerIndex = reaction.attackerIndex;
    const wasFleeing = reaction.isFleeing || false; // --- FIX #2: Retrieve the fleeing status
    sharedState.pendingReaction = null;

    const enemies = sharedState.zoneCards.map((c, i) => ({card: c, index: i})).filter(e => e.card && e.card.type === 'enemy');
    const lastEnemyListIndex = enemies.findIndex(e => e.index === lastAttackerIndex);
    
    await runEnemyPhaseForParty(io, partyId, wasFleeing, lastEnemyListIndex + 1); // --- FIX #2: Pass the status along
}

// --- MAIN EXPORT ---
export const registerAdventureHandlers = (io, socket) => {
    socket.on('party:enterZone', (zoneName) => {
        const name = socket.characterName;
        const player = players[name];
        if (!player) return;
        
        if (player.character.duelId && duels[player.character.duelId]) {
            return; 
        }

        let partyId = player.character.partyId;
        let party;

        if (partyId && parties[partyId]) {
            party = parties[partyId];
            if (party.leaderId !== name) {
                return socket.emit('partyError', 'Only the party leader can start an adventure.');
            }
        } else {
            partyId = `SOLO-${Math.random().toString(36).substr(2, 6).toUpperCase()}`;
            party = { id: partyId, leaderId: name, members: [name], sharedState: null, isSoloParty: true };
            parties[partyId] = party;
            player.character.partyId = partyId;
            socket.emit('partyUpdate', { partyId: partyId, leaderId: name, members: [{ name: name, id: socket.id, isLeader: true }], isPartyLeader: true });
            console.log(`Player ${name} created temporary solo party ${partyId}`);
        }
        
        const deck = buildZoneDeckForServer(zoneName); 
        party.sharedState = {
            currentZone: zoneName,
            zoneDeck: deck,
            zoneCards: [],
            turnNumber: 0,
            isPlayerTurn: true,
            partyMemberStates: party.members.map(memberName => {
                const memberPlayer = players[memberName];
                const memberCharacter = memberPlayer.character;
                const bonuses = getBonusStatsForPlayer(memberCharacter, null);
                const maxHealth = 10 + bonuses.maxHealth;
                return { 
                    playerId: memberPlayer.id, 
                    name: memberCharacter.characterName,
                    icon: memberCharacter.characterIcon,
                    health: maxHealth,
                    maxHealth: maxHealth,
                    actionPoints: 3,
                    turnEnded: false,
                    isDead: false,
                    lootableInventory: [],
                    buffs: [],
                    debuffs: [],
                    weaponCooldowns: {},
                    spellCooldowns: {},
                    itemCooldowns: {},
                    focus: 0,
                };
            }),
            log: [{ message: `Party has entered the ${zoneName}!`, type: 'info' }],
            pendingReaction: null,
            reactionTimeout: null
        };
        drawCardsForServer(party.sharedState, 3);
        
        console.log(`[SERVER LOG] Emitting 'party:adventureStarted' to ${party.members.length} member(s).`);
        party.members.forEach(memberName => {
            const member = players[memberName];
            if(member && member.id) io.to(member.id).emit('party:adventureStarted', party.sharedState);
        });
        console.log(`Party ${partyId} is entering zone ${zoneName}.`);
    });
  
    socket.on('party:playerAction', async (action) => {
        const name = socket.characterName;
        const player = players[name];
        if (!player || !player.character) return;
        
        const partyId = player.character.partyId;
        const party = parties[partyId];
        if (!party) return;

        if (action.type === 'resolveReaction') {
            await handleResolveReaction(io, socket, action.payload);
            return;
        }

        if (action.type === 'equipItem') {
            processEquipItem(io, party, player, action.payload);
            if (party.sharedState) broadcastAdventureUpdate(io, partyId);
            return;
        }
        
        if (!party.sharedState || party.sharedState.pendingReaction) return;

        if (action.type === 'returnHome' || action.type === 'ventureDeeper') {
            if (name !== party.leaderId) return;
            if (action.type === 'returnHome') processEndAdventure(io, player, party);
            if (action.type === 'ventureDeeper') await processVentureDeeper(io, player, party);
            broadcastAdventureUpdate(io, partyId);
            return;
        }

        const actingPlayerState = party.sharedState.partyMemberStates.find(p => p.name === name);
        if (!actingPlayerState || actingPlayerState.isDead) return;

        if (!party.sharedState.isPlayerTurn) return;
        if (actingPlayerState.turnEnded && action.type !== 'dialogueChoice') return;
        if (action.type === 'dialogueChoice' && name !== party.leaderId) return;

        switch(action.type) {
            case 'weaponAttack':
                processWeaponAttack(io, party, player, action.payload);
                break;
            case 'castSpell':
                processCastSpell(io, party, player, action.payload);
                break;
            case 'useItemAbility':
                processUseItemAbility(party, player, action.payload);
                break;
            case 'useConsumable':
                processUseConsumable(io, party, player, action.payload);
                break;
            case 'dropItem':
                processDropItem(io, party, player, action.payload);
                break;
            case 'interactWithCard':
                processInteractWithCard(io, party, player, action.payload);
                break;
            case 'dialogueChoice':
                processDialogueChoice(io, player, party, action.payload);
                break; 
            case 'lootPlayer':
                processLootPlayer(io, player, party, action.payload);
                break;
            case 'endTurn':
                actingPlayerState.turnEnded = true;
                party.sharedState.log.push({ message: `${player.character.characterName} has ended their turn.`, type: 'info' });
                
                const allTurnsEnded = party.sharedState.partyMemberStates.every(p => p.turnEnded || p.isDead);
                
                if (allTurnsEnded) {
                    await runEnemyPhaseForParty(io, partyId);
                    return; 
                }
                break;
        }

        if (party.sharedState) {
            broadcastAdventureUpdate(io, partyId);
        }
    });
};