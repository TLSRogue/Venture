// server.js

// 1. SETUP
import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import path from 'path';
import { fileURLToPath } from 'url';
import { gameData } from './game-data.js';

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    pingTimeout: 20000,
    pingInterval: 25000,
});

const PORT = process.env.PORT || 3000;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 2. SERVER-SIDE GAME STATE
let players = {}; // Keyed by characterName
let parties = {}; // Keyed by partyId
let duels = {};   // Keyed by duelId

// 3. SERVE THE GAME FILES
app.use(express.static(__dirname));
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// 4. HELPER FUNCTIONS
function broadcastOnlinePlayers() {
    const onlinePlayers = Object.values(players)
        .filter(p => p.id && p.character && !p.character.partyId)
        .map(p => ({
            id: p.character.characterName,
            name: p.character.characterName
        }));
    io.emit('onlinePlayersUpdate', onlinePlayers);
}

// --- MODIFIED SECTION ---
function broadcastPartyUpdate(partyId) {
    if (parties[partyId]) {
        const party = parties[partyId];

        // This list is generated once and sent to everyone in the party.
        const partyMembersForPayload = party.members.map(name => {
            const player = players[name];
            const isLeader = name === party.leaderId;
            const duelId = player?.character?.duelId;
            const isInDuel = !!(duelId && duels[duelId] && !duels[duelId].ended);
            return {
                id: player?.id,
                name: name,
                isLeader: isLeader,
                isInDuel: isInDuel,
            };
        });

        // We loop through each member to send them a customized payload.
        party.members.forEach(memberName => {
            const player = players[memberName];
            if (player && player.id && io.sockets.sockets.get(player.id)) {
                // Determine if this specific member is the leader.
                const isThisMemberLeader = party.leaderId === memberName;

                // Send the update, now with the authoritative `isPartyLeader` flag.
                io.to(player.id).emit('partyUpdate', {
                    partyId: partyId,
                    leaderId: party.leaderId,
                    members: partyMembersForPayload,
                    isPartyLeader: isThisMemberLeader // Explicitly tell the client its status
                });
            }
        });
    }
}
// --- END MODIFIED SECTION ---

function broadcastAdventureUpdate(partyId) {
    const party = parties[partyId];
    if (party && party.sharedState) {
        party.members.forEach(memberName => {
            const player = players[memberName];
            const socket = player && player.id ? io.sockets.sockets.get(player.id) : null;
            if (socket) {
                socket.emit('party:adventureUpdate', party.sharedState);
            }
        });
    }
}

function broadcastDuelUpdate(duelId) {
    const duel = duels[duelId];
    if (duel) {
        const player1 = players[duel.player1.name];
        const player2 = players[duel.player2.name];
        if (player1 && player1.id) io.to(player1.id).emit('duel:update', duel);
        if (player2 && player2.id) io.to(player2.id).emit('duel:update', duel);
    }
}


function buildZoneDeckForServer(zoneName) {
    let npcs = [];
    let otherCards = [];
    let cardPool = gameData.cardPools[zoneName] ? [...gameData.cardPools[zoneName]] : [];
    
    cardPool.forEach(poolItem => {
        for (let i = 0; i < poolItem.count; i++) {
            const card = { ...poolItem.card };
            if (card.type === 'npc') {
                npcs.push(card);
            } else {
                otherCards.push(card);
            }
        }
    });

    if (Math.random() < 0.33) {
        otherCards.push({ ...gameData.specialCards.lootGoblin, stolenGold: 0 });
    }
    
    // Shuffle only the non-NPC cards
    for (let i = otherCards.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [otherCards[i], otherCards[j]] = [otherCards[j], otherCards[i]];
    }
    
    return [...npcs, ...otherCards];
}

function drawCardsForServer(sharedState, amount, exclude = []) {
    for(let i = 0; i < amount; i++) {
        if (sharedState.zoneDeck.length === 0) {
            sharedState.log.push({ message: "The zone's deck is empty!", type: 'info' });
            break;
        }
        
        const [card] = sharedState.zoneDeck.splice(0, 1);

        if (card.type === 'enemy') {
            card.id = Date.now() + i;
            card.health = card.maxHealth;
            card.debuffs = [];
        } else if (card.type === 'resource') {
            card.charges = 3;
        }
        sharedState.zoneCards.push(card);
    }
}

function getBonusStatsForPlayer(character, playerState) {
    const bonuses = { strength: 0, wisdom: 0, agility: 0, defense: 0, luck: 0, maxHealth: 0, physicalResistance: 0, mining: 0, woodcutting: 0, fishing: 0, harvesting: 0, rollBonus: 0 };
    for (const slot in character.equipment) {
        const item = character.equipment[slot];
        if (item && item.hands === 2 && slot === 'offHand') continue;
        if (item && item.bonus) {
            for (const stat in item.bonus) {
                bonuses[stat] = (bonuses[stat] || 0) + item.bonus[stat];
            }
        }
    }
    character.inventory.forEach(item => {
        if (item && item.skillBonus) {
            for (const skill in item.skillBonus) {
                bonuses[skill] = (bonuses[skill] || 0) + item.skillBonus[skill];
            }
        }
    });
    if (playerState && playerState.buffs) {
        playerState.buffs.forEach(buff => {
            if (buff.bonus) {
                for (const stat in buff.bonus) {
                    bonuses[stat] = (bonuses[stat] || 0) + buff.bonus[stat];
                }
            }
        });
    }
    return bonuses;
}

function addItemToInventoryServer(character, itemData, quantity = 1) {
    if (!itemData) return false; // Prevent crash if null item is passed
    const baseItem = gameData.allItems.find(i => i.name === itemData.name);
    if (!baseItem) return false;

    let remainingQuantity = quantity;

    if (baseItem.stackable) {
        for (const invItem of character.inventory) {
            if (invItem && invItem.name === itemData.name && invItem.quantity < baseItem.stackable) {
                const canAdd = baseItem.stackable - invItem.quantity;
                const toAdd = Math.min(remainingQuantity, canAdd);
                invItem.quantity += toAdd;
                remainingQuantity -= toAdd;
                if (remainingQuantity <= 0) return true;
            }
        }
        while (remainingQuantity > 0) {
            const emptySlotIndex = character.inventory.findIndex(slot => !slot);
            if (emptySlotIndex === -1) return false;
            const newStackAmount = Math.min(remainingQuantity, baseItem.stackable);
            character.inventory[emptySlotIndex] = { ...baseItem, quantity: newStackAmount };
            remainingQuantity -= newStackAmount;
        }
    } else {
        for (let i = 0; i < quantity; i++) {
            const emptySlotIndex = character.inventory.findIndex(slot => !slot);
            if (emptySlotIndex === -1) return false;
            character.inventory[emptySlotIndex] = { ...baseItem, quantity: 1 };
        }
    }
    return true;
}

function playerHasMaterials(character, materials) {
    for (const material in materials) {
        const requiredCount = materials[material];
        let currentCount = 0;
        character.inventory.forEach(item => {
            if (item && item.name === material) currentCount += (item.quantity || 1);
        });
        character.bank.forEach(item => {
            if (item && item.name === material) currentCount += (item.quantity || 1);
        });
        if (currentCount < requiredCount) return false;
    }
    return true;
}

function consumeMaterials(character, materials) {
    for (const material in materials) {
        let requiredCount = materials[material];
        for (let i = 0; i < character.inventory.length && requiredCount > 0; i++) {
            const item = character.inventory[i];
            if (item && item.name === material) {
                const toConsume = Math.min(requiredCount, item.quantity || 1);
                item.quantity -= toConsume;
                requiredCount -= toConsume;
                if (item.quantity <= 0) character.inventory[i] = null;
            }
        }
        if (requiredCount > 0) {
             for (let i = character.bank.length - 1; i >= 0 && requiredCount > 0; i--) {
                const item = character.bank[i];
                if (item && item.name === material) {
                    const toConsume = Math.min(requiredCount, item.quantity || 1);
                    item.quantity -= toConsume;
                    requiredCount -= toConsume;
                    if (item.quantity <= 0) character.bank.splice(i, 1);
                }
            }
        }
    }
}

function defeatEnemyInParty(party, enemy, enemyIndex) {
    const { sharedState } = party;
    sharedState.log.push({ message: `${enemy.name} has been defeated!`, type: 'success' });

    party.members.forEach(memberName => {
        const member = players[memberName];
        if (!member || !member.character) return;
        const character = member.character;

        character.quests.forEach(quest => {
            if (quest.status === 'active' && (quest.details.target === enemy.name || (quest.details.target === 'Goblin' && enemy.name.includes('Goblin')))) {
                quest.progress++;
                if (quest.progress >= quest.details.required) {
                    quest.status = 'readyToTurnIn';
                    if(member.id) io.to(member.id).emit('questObjectiveComplete', quest.details.title);
                }
            }
        });

        if (enemy.guaranteedLoot && enemy.guaranteedLoot.gold) {
            const goldAmount = (Math.floor(Math.random() * 20) + 1) + (Math.floor(Math.random() * 20) + 1);
            const goldPerPlayer = Math.floor(goldAmount / party.members.length);
            character.gold += goldPerPlayer;
        }

        if (enemy.guaranteedLoot && enemy.guaranteedLoot.items) {
            enemy.guaranteedLoot.items.forEach(itemName => {
                 const itemData = gameData.allItems.find(i => i.name === itemName);
                 if (itemData) {
                    addItemToInventoryServer(character, itemData);
                 }
            });
        }
        if (member.id) io.to(member.id).emit('characterUpdate', character);
    });
    
    if (enemy.guaranteedLoot && enemy.guaranteedLoot.gold) {
        sharedState.log.push({ message: `${enemy.name} dropped gold, which was split among the party.`, type: 'success'});
    }
     if (enemy.guaranteedLoot && enemy.guaranteedLoot.items) {
        sharedState.log.push({ message: `${enemy.name} dropped: ${enemy.guaranteedLoot.items.join(', ')} for everyone!`, type: 'success'});
    }


    sharedState.zoneCards[enemyIndex] = null;

    if (!sharedState.zoneCards.some(c => c && c.type === 'enemy')) {
        sharedState.log.push({ message: "Combat has ended! Action Points restored.", type: "success" });
        sharedState.partyMemberStates.forEach(p => { if (!p.isDead) p.actionPoints = 3; });
    }
}


// --- SERVER-SIDE ACTION PROCESSING (PARTIES) ---

function processWeaponAttack(player, party, payload) {
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
            defeatEnemyInParty(party, target, targetIndex);
        }
    } else {
        logMessage += ` Miss!`;
        sharedState.log.push({ message: logMessage, type: 'info' });
    }
}

function processCastSpell(player, party, payload) {
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
                defeatEnemyInParty(party, enemyTarget, parseInt(targetIndex));
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
                    defeatEnemyInParty(party, aoeTarget, aoeIndex);
                }
            }
        });
    }
}


function processEquipItem(player, party, payload) {
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

function processUseItemAbility(player, party, payload) {
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

function processUseConsumable(player, party, payload) {
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

function processInteractWithCard(player, party, payload) {
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
            startNPCDialogue(player, party, card, cardIndex);
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

function startNPCDialogue(player, party, npc, cardIndex, dialogueNodeKey = 'start') {
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

function processDialogueChoice(player, party, payload) {
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
        startNPCDialogue(player, party, npc, cardIndex, choice.next);
    }
}

function processEndAdventure(player, party) {
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

async function processVentureDeeper(player, party) {
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
        await runEnemyPhaseForParty(party.id, true); 

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

function processLootPlayer(lootingPlayer, party, payload) {
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


async function runEnemyPhaseForParty(partyId, isFleeing = false) {
    const party = parties[partyId];
    if (!party || !party.sharedState) return;

    const { sharedState } = party;
    sharedState.isPlayerTurn = false;
    
    if (!isFleeing) {
        sharedState.log.push({ message: "--- Zone's Turn ---", type: 'info' });
    }
    broadcastAdventureUpdate(partyId);

    const enemies = sharedState.zoneCards.map((card, index) => ({ card, index })).filter(e => e.card && e.card.type === 'enemy');

    for (const { card: enemy, index } of enemies) {
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
                 sharedState.log.push({ message: `${enemy.name} succumbed to its wounds!`, type: 'success' });
                 sharedState.zoneCards[index] = null;
                 broadcastAdventureUpdate(partyId);
                 continue;
            }
            enemy.debuffs = enemy.debuffs.filter(d => d.duration > 0);
            if(tookDotDamage) broadcastAdventureUpdate(partyId);

            if (enemy.debuffs.some(d => d.type === 'stun')) {
                sharedState.log.push({ message: `${enemy.name} is stunned and cannot act!`, type: 'reaction' });
                enemy.debuffs = enemy.debuffs.filter(d => d.type !== 'stun');
                broadcastAdventureUpdate(partyId);
                continue;
            }

            const alivePlayers = sharedState.partyMemberStates.filter(p => !p.isDead);
            if (alivePlayers.length === 0) continue;

            const targetPlayer = alivePlayers[Math.floor(Math.random() * alivePlayers.length)];
            const roll = Math.floor(Math.random() * 20) + 1;

            if (enemy.attackTable) {
                const attack = enemy.attackTable.find(a => roll >= a.range[0] && roll <= a.range[1]);
                if (attack && attack.action === 'attack') {
                    targetPlayer.health -= attack.damage;
                    let attackMessage = `${enemy.name} ${attack.message} It hits ${targetPlayer.name} for ${attack.damage} damage!`;
                    if (attack.debuff) {
                        targetPlayer.debuffs.push({ ...attack.debuff });
                        attackMessage += ` ${targetPlayer.name} is now ${attack.debuff.type}!`;
                    }
                    sharedState.log.push({ message: attackMessage, type: 'damage'});
                } else if (attack && attack.action === 'special') {
                    sharedState.log.push({ message: `${enemy.name} uses a special ability: ${attack.message}`, type: 'reaction' });
                } else {
                    sharedState.log.push({ message: `${enemy.name} misses its attack.`, type: 'info' });
                }
            } else {
                if (roll >= 10) {
                    targetPlayer.health -= enemy.damage;
                    sharedState.log.push({ message: `${enemy.name} attacks ${targetPlayer.name} for ${enemy.damage} damage!`, type: 'damage' });
                } else {
                    sharedState.log.push({ message: `${enemy.name} misses its attack.`, type: 'info' });
                }
            }
            
            if (targetPlayer.health <= 0) {
                targetPlayer.health = 0;
                targetPlayer.isDead = true;
                const deadPlayerCharacter = players[targetPlayer.name]?.character;
                if (deadPlayerCharacter) {
                    targetPlayer.lootableInventory = [...deadPlayerCharacter.inventory.filter(Boolean)];
                    deadPlayerCharacter.inventory = Array(24).fill(null);
                    if(players[targetPlayer.name].id) io.to(players[targetPlayer.name].id).emit('characterUpdate', deadPlayerCharacter);
                }
                sharedState.log.push({ message: `${targetPlayer.name} has been defeated!`, type: 'damage' });
            }
            
            broadcastAdventureUpdate(partyId);

        } catch (error) {
            console.error(`Error processing turn for enemy ${enemy.name}:`, error);
        }
    }
    
    if (!isFleeing) {
        await new Promise(resolve => setTimeout(resolve, 1000));
        startNextPlayerTurn(partyId);
    }
}

function startNextPlayerTurn(partyId) {
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

        // Decrement ability cooldowns at the start of the player's turn phase
        Object.keys(p.weaponCooldowns).forEach(k => { if (p.weaponCooldowns[k] > 0) p.weaponCooldowns[k]--; });
        Object.keys(p.spellCooldowns).forEach(k => { if (p.spellCooldowns[k] > 0) p.spellCooldowns[k]--; });
        Object.keys(p.itemCooldowns).forEach(k => { if (p.itemCooldowns[k] > 0) p.itemCooldowns[k]--; });
    });
    broadcastAdventureUpdate(partyId);
}

// 5. HANDLE PLAYER CONNECTIONS
io.on('connection', (socket) => {
    console.log(`A player connected with ID: ${socket.id}`);

    const handlePlayerLogin = (characterData) => {
        const name = characterData.characterName;

        if (players[name] && players[name].id) {
            io.to(players[name].id).emit('loadError', 'Character is already online on another session.');
            socket.disconnect();
            return;
        }
        
        if (players[name]) {
            console.log(`Character ${name} is reconnecting with new socket ${socket.id}.`);
            players[name].id = socket.id;
            const serverCharacter = players[name].character;
            players[name].character = { ...serverCharacter, ...characterData };
            socket.characterName = name;
            
            const duelId = players[name].character.duelId;
            if (duelId && duels[duelId] && duels[duelId].disconnectTimeout) {
                console.log(`Player ${name} reconnected, cancelling duel termination for ${duelId}`);
                clearTimeout(duels[duelId].disconnectTimeout);
                duels[duelId].disconnectTimeout = null;
                const opponentState = duels[duelId].player1.name === name ? duels[duelId].player2 : duels[duelId].player1;
                const opponent = players[opponentState.name];
                if (opponent && opponent.id) {
                    io.to(opponent.id).emit('duel:update', duels[duelId]);
                    io.to(opponent.id).emit('info', `${name} has reconnected to the duel.`);
                }
            }

            if (duelId && duels[duelId]) {
                 socket.emit('duel:start', duels[duelId]);
            } else {
                 socket.emit('characterUpdate', players[name].character);
            }
            
            const partyId = players[name].character.partyId;
            if (partyId && parties[partyId]) {
                broadcastPartyUpdate(partyId);
                if (parties[partyId].sharedState) {
                    socket.emit('party:adventureStarted', parties[partyId].sharedState);
                }
            }
        } else {
            console.log(`Character ${name} is connecting for the first time.`);
            characterData.partyId = null;
            players[name] = { id: socket.id, character: characterData };
            socket.characterName = name;
            socket.emit('characterUpdate', players[name].character);
        }
        broadcastOnlinePlayers();
    };

    socket.on('registerPlayer', handlePlayerLogin);
    socket.on('loadCharacter', handlePlayerLogin);

    socket.on('updateCharacter', (characterData) => {
        const name = socket.characterName;
        if (name && players[name]) {
            players[name].character = characterData;
            // No need to emit back, this is the new save mechanism
        }
    });

    socket.on('createParty', () => {
        const name = socket.characterName;
        if (!name || !players[name] || players[name].character.partyId) return;

        const partyId = `PARTY-${Math.random().toString(36).substr(2, 6).toUpperCase()}`;
        parties[partyId] = { id: partyId, leaderId: name, members: [name], sharedState: null, isSoloParty: false };
        players[name].character.partyId = partyId;
        
        socket.emit('characterUpdate', players[name].character);
        console.log(`Player ${name} created party ${partyId}`);
        broadcastPartyUpdate(partyId);
        broadcastOnlinePlayers();
    });

    socket.on('sendPartyInvite', (targetCharacterName) => {
        const inviterName = socket.characterName;
        const inviter = players[inviterName];
        const target = players[targetCharacterName];
        const partyId = inviter?.character?.partyId;

        if (!inviter || !inviter.character || !partyId) return socket.emit('partyError', 'You must be in a party to invite someone.');
        if (!target || !target.id) return socket.emit('partyError', 'The player you are trying to invite is not online.');
        if (target.character.partyId) return socket.emit('partyError', `${target.character.characterName} is already in a party.`);
        
        io.to(target.id).emit('receivePartyInvite', { inviterName: inviter.character.characterName, partyId: partyId });
        console.log(`${inviter.character.characterName} invited ${target.character.characterName} to party ${partyId}`);
    });

    socket.on('joinParty', (partyId) => {
        const name = socket.characterName;
        const player = players[name];
        if (!player || !player.character || player.character.partyId) return;
        const party = parties[partyId];
        if (!party) return socket.emit('partyError', 'Party not found.');
        if (party.members.length >= 3) return socket.emit('partyError', 'Party is full.');
        party.members.push(name);
        player.character.partyId = partyId;

        socket.emit('characterUpdate', player.character);
        console.log(`Player ${name} joined party ${partyId}`);
        broadcastPartyUpdate(partyId);
        broadcastOnlinePlayers();
    });
    
    socket.on('party:enterZone', (zoneName, characterData) => {
        const name = socket.characterName;
        const player = players[name];
        if (!player) return;
        
        if (characterData) {
            players[name].character = characterData;
        }
        
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
            log: [{ message: `Party has entered the ${zoneName}!`, type: 'info' }]
        };
        drawCardsForServer(party.sharedState, 3);
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

        if (action.type === 'equipItem') {
            processEquipItem(player, party, action.payload);
            if (party.sharedState) broadcastAdventureUpdate(partyId);
            return;
        }
        
        if (!party.sharedState) return;

        if (action.type === 'returnHome' || action.type === 'ventureDeeper') {
            if (name !== party.leaderId) return;
            if (action.type === 'returnHome') processEndAdventure(player, party);
            if (action.type === 'ventureDeeper') await processVentureDeeper(player, party);
            broadcastAdventureUpdate(partyId);
            return;
        }

        const actingPlayerState = party.sharedState.partyMemberStates.find(p => p.name === name);
        if (!actingPlayerState || actingPlayerState.isDead) return;

        if (!party.sharedState.isPlayerTurn) return;
        if (actingPlayerState.turnEnded && action.type !== 'dialogueChoice') return;
        if (action.type === 'dialogueChoice' && name !== party.leaderId) return;

        switch(action.type) {
            case 'weaponAttack':
                processWeaponAttack(player, party, action.payload);
                break;
            case 'castSpell':
                processCastSpell(player, party, action.payload);
                break;
            case 'useItemAbility':
                processUseItemAbility(player, party, action.payload);
                break;
            case 'useConsumable':
                processUseConsumable(player, party, action.payload);
                break;
            case 'interactWithCard':
                processInteractWithCard(player, party, action.payload);
                break;
            case 'dialogueChoice':
                processDialogueChoice(player, party, action.payload);
                break; 
            case 'lootPlayer':
                processLootPlayer(player, party, action.payload);
                break;
            case 'endTurn':
                actingPlayerState.turnEnded = true;
                party.sharedState.log.push({ message: `${player.character.characterName} has ended their turn.`, type: 'info' });
                
                const allTurnsEnded = party.sharedState.partyMemberStates.every(p => p.turnEnded || p.isDead);
                
                if (allTurnsEnded) {
                    await runEnemyPhaseForParty(partyId);
                    return; 
                }
                break;
        }

        if (party.sharedState) {
            broadcastAdventureUpdate(partyId);
        }
    });

    socket.on('leaveParty', () => {
        const name = socket.characterName;
        if (!name || !players[name] || !players[name].character) return;
        const partyId = players[name].character.partyId;
        if (!partyId || !parties[partyId]) return;
        
        const party = parties[partyId];
        party.members = party.members.filter(memberName => memberName !== name);
        players[name].character.partyId = null;
        
        socket.emit('characterUpdate', players[name].character);
        console.log(`Player ${name} left party ${partyId}`);

        if (party.members.length === 0) {
            delete parties[partyId];
            console.log(`Party ${partyId} disbanded.`);
        } else {
            if (party.leaderId === name) {
                party.leaderId = party.members[0];
                console.log(`New leader for party ${partyId} is ${party.leaderId}`);
            }
            broadcastPartyUpdate(partyId);
        }
        
        broadcastOnlinePlayers();
    });

    // --- NEW: Master handler for all non-adventure player actions ---
    socket.on('playerAction', (action) => {
        const name = socket.characterName;
        const player = players[name];
        if (!player || (player.character.partyId && parties[player.character.partyId]?.sharedState) || player.character.inDuel) return;
        const character = player.character;
        const { type, payload } = action;

        let success = false; // Flag to check if an action successfully changed the state

        switch(type) {
            case 'buyItem':
                {
                    const { identifier, isPermanent } = payload;
                    const stockItem = isPermanent ? null : character.merchantStock[identifier];
                    const itemData = isPermanent ? gameData.allItems.find(i => i.name === identifier) : stockItem;
                    if (itemData && character.gold >= itemData.price) {
                        if(addItemToInventoryServer(character, { ...itemData })) {
                            character.gold -= itemData.price;
                            if (!isPermanent && stockItem) stockItem.quantity--;
                            success = true;
                        }
                    }
                }
                break;
            case 'sellItem':
                {
                    const item = character.inventory[payload.itemIndex];
                    if(item) {
                        const sellPrice = Math.floor(item.price / 2) || 1;
                        character.gold += sellPrice;
                        item.quantity = (item.quantity || 1) - 1;
                        if (item.quantity <= 0) character.inventory[payload.itemIndex] = null;
                        success = true;
                    }
                }
                break;
            case 'craftItem':
                {
                    const recipe = gameData.craftingRecipes[payload.recipeIndex];
                    if (recipe && playerHasMaterials(character, recipe.materials)) {
                        consumeMaterials(character, recipe.materials);
                        const baseItem = gameData.allItems.find(i => i.name === recipe.result.name);
                        addItemToInventoryServer(character, baseItem, recipe.result.quantity || 1);
                        success = true;
                    }
                }
                break;
            case 'buySpell':
                {
                    const spell = gameData.allSpells.find(s => s.name === payload.spellName && s.price > 0);
                    if (spell && character.gold >= spell.price) {
                        character.gold -= spell.price;
                        character.spellbook.push({...spell});
                        success = true;
                    }
                }
                break;
            case 'equipItem':
                {
                    const { itemIndex, chosenSlot } = payload;
                    const itemToEquip = character.inventory[itemIndex];
                    if (!itemToEquip || !itemToEquip.slot) break;
            
                    const canEquipInSlot = Array.isArray(itemToEquip.slot) ? itemToEquip.slot.includes(chosenSlot) : itemToEquip.slot === chosenSlot;
                    if (!canEquipInSlot) break;
            
                    const currentlyEquipped = character.equipment[chosenSlot];
            
                    if (itemToEquip.hands === 2) {
                        const mainHandItem = character.equipment.mainHand;
                        const offHandItem = character.equipment.offHand;
                        const freeSlots = character.inventory.filter(i => !i).length;
                        const slotsToFree = (mainHandItem ? 1 : 0) + (offHandItem && offHandItem !== mainHandItem ? 1 : 0);
                        
                        if (slotsToFree > freeSlots + 1) break;
            
                        character.inventory[itemIndex] = null;
                        if (mainHandItem) addItemToInventoryServer(character, mainHandItem);
                        if (offHandItem && offHandItem !== mainHandItem) addItemToInventoryServer(character, offHandItem);
                        
                        character.equipment.mainHand = itemToEquip;
                        character.equipment.offHand = itemToEquip;
            
                    } else {
                        if (character.equipment.mainHand && character.equipment.mainHand.hands === 2) {
                            const twoHandedWeapon = character.equipment.mainHand;
                            character.equipment.mainHand = null;
                            character.equipment.offHand = null;
                            addItemToInventoryServer(character, twoHandedWeapon);
                        }
                        
                        character.equipment[chosenSlot] = itemToEquip;
                        character.inventory[itemIndex] = currentlyEquipped;
                    }
                    success = true;
                }
                break;
            case 'unequipItem':
                {
                    const { slot } = payload;
                    const itemToUnequip = character.equipment[slot];
                    if (!itemToUnequip) break;
                    
                    if (addItemToInventoryServer(character, itemToUnequip)) {
                        character.equipment[slot] = null;
                        if (itemToUnequip.hands === 2) {
                            character.equipment.offHand = null;
                        }
                        success = true;
                    }
                }
                break;
            case 'equipSpell':
                {
                    const { index } = payload;
                    if (character.equippedSpells.length >= 5) break;
                    const spellToEquip = character.spellbook[index];
                    if (!spellToEquip) break;
            
                    character.equippedSpells.push(spellToEquip);
                    character.spellbook.splice(index, 1);
                    success = true;
                }
                break;
            case 'unequipSpell':
                {
                    const { index } = payload;
                    const spellToUnequip = character.equippedSpells[index];
                    if (!spellToUnequip) break;
            
                    character.spellbook.push(spellToUnequip);
                    character.equippedSpells.splice(index, 1);
                    success = true;
                }
                break;
            case 'useConsumable':
                {
                    const { index } = payload;
                    const item = character.inventory[index];
                    if (!item || item.type !== 'consumable') break;

                    if (item.heal) {
                        const bonuses = getBonusStatsForPlayer(character, null);
                        const maxHealth = 10 + bonuses.maxHealth;
                        character.health = Math.min(maxHealth, character.health + item.heal);
                    }
                    if (item.buff) {
                        character.buffs.push({ ...item.buff });
                    }
    
                    if (item.charges) {
                        item.charges--;
                        if (item.charges <= 0) character.inventory[index] = null;
                    } else {
                        item.quantity = (item.quantity || 1) - 1;
                        if (item.quantity <= 0) character.inventory[index] = null;
                    }
                    success = true;
                }
                break;
            case 'drop':
                {
                    const { index } = payload;
                    if (character.inventory[index]) {
                        character.inventory[index] = null;
                        success = true;
                    }
                }
                break;
        }

        if (success) {
            socket.emit('characterUpdate', character);
        }
    });
    
    // --- DUEL HANDLERS ---
    socket.on('duel:challenge', (targetCharacterName) => {
        const challengerName = socket.characterName;
        const challenger = players[challengerName];
        const target = players[targetCharacterName];

        if (!challenger || !target || !target.id) {
            return socket.emit('partyError', 'Target player is not available.');
        }
        const challengerInAdventure = challenger.character.partyId && parties[challenger.character.partyId]?.sharedState;
        const targetInAdventure = target.character.partyId && parties[target.character.partyId]?.sharedState;

        if (challengerInAdventure || targetInAdventure) {
            return socket.emit('partyError', 'Cannot duel while in an adventure.');
        }
        if (challenger.character.duelId || target.character.duelId) {
            return socket.emit('partyError', 'One of the players is already in a duel.');
        }

        console.log(`${challengerName} is challenging ${targetCharacterName} to a duel.`);
        io.to(target.id).emit('duel:receiveChallenge', {
            challengerName: challengerName,
            challengerId: challengerName 
        });
    });

    socket.on('duel:accept', (challengerName) => {
        const acceptorName = socket.characterName;
        const challenger = players[challengerName];
        const acceptor = players[acceptorName];

        if (!challenger || !challenger.id || !acceptor) return; 

        const duelId = `DUEL-${Date.now()}`;
        
        const createPlayerState = (playerObj) => {
            const bonuses = getBonusStatsForPlayer(playerObj.character, null);
            const maxHealth = 10 + bonuses.maxHealth;
            return {
                id: playerObj.id,
                name: playerObj.character.characterName,
                icon: playerObj.character.characterIcon,
                health: maxHealth,
                maxHealth: maxHealth,
                actionPoints: 3,
                buffs: [],
                debuffs: [],
                weaponCooldowns: {},
                spellCooldowns: {},
                itemCooldowns: {}
            };
        };

        const duelState = {
            id: duelId,
            player1: createPlayerState(challenger),
            player2: createPlayerState(acceptor),
            activePlayerId: challenger.id,
            log: [{ message: `Duel between ${challengerName} and ${acceptorName} has begun!`, type: 'success' }],
            ended: false,
            disconnectTimeout: null
        };

        duels[duelId] = duelState;
        challenger.character.duelId = duelId;
        acceptor.character.duelId = duelId;
        
        console.log(`Duel ${duelId} starting.`);
        io.to(challenger.id).to(acceptor.id).emit('duel:start', duelState);
        if (challenger.character.partyId) broadcastPartyUpdate(challenger.character.partyId);
        if (acceptor.character.partyId) broadcastPartyUpdate(acceptor.character.partyId);
    });

    socket.on('duel:playerAction', (action) => {
        try {
            const playerName = socket.characterName;
            const player = players[playerName];
            if (!player || !player.character.duelId) return;
        
            const duel = duels[player.character.duelId];
            if (!duel || duel.ended || duel.activePlayerId !== player.id) return;
            
            const actingPlayerState = duel.player1.name === playerName ? duel.player1 : duel.player2;
            const opponentPlayerState = duel.player1.name === playerName ? duel.player2 : duel.player1;
            const actingCharacter = player.character;
        
            let actionTaken = false;

            if (action.type === 'weaponAttack') {
                const weapon = actingCharacter.equipment[action.payload.weaponSlot];
                if (weapon && actingPlayerState.actionPoints >= weapon.cost && (actingPlayerState.weaponCooldowns[weapon.name] || 0) <= 0) {
                    actingPlayerState.actionPoints -= weapon.cost;
                    actingPlayerState.weaponCooldowns[weapon.name] = weapon.cooldown;
                    
                    const bonuses = getBonusStatsForPlayer(actingCharacter, actingPlayerState);
                    const stat = weapon.stat || 'strength';
                    const statValue = (actingCharacter[stat] || 0) + (bonuses[stat] || 0);
                    const roll = Math.floor(Math.random() * 20) + 1;
                    const total = roll + statValue;
                    
                    let logMessage = `${playerName} attacks with ${weapon.name}: ${roll}(d20) + ${statValue} = ${total}.`;
                    
                    if (roll === 1) {
                        logMessage += ` Critical Failure!`;
                        duel.log.push({ message: logMessage, type: 'damage' });
                    } else if (total >= (weapon.hit || 15)) {
                        opponentPlayerState.health -= weapon.weaponDamage;
                        logMessage += ` Hit for ${weapon.weaponDamage} damage!`;
                        duel.log.push({ message: logMessage, type: 'damage' });
                    } else {
                        logMessage += ` Miss!`;
                        duel.log.push({ message: logMessage, type: 'info' });
                    }
                    actionTaken = true;
                }
            }
        
            if (action.type === 'castSpell') {
                const { spellIndex, targetIndex } = action.payload;
                const spell = actingCharacter.equippedSpells[spellIndex];
                if (spell && actingPlayerState.actionPoints >= (spell.cost || 0) && (actingPlayerState.spellCooldowns[spell.name] || 0) <= 0) {
                    actingPlayerState.actionPoints -= (spell.cost || 0);
                    actingPlayerState.spellCooldowns[spell.name] = spell.cooldown;

                    const bonuses = getBonusStatsForPlayer(actingCharacter, actingPlayerState);
                    const statValue = (actingCharacter[spell.stat] || 0) + (bonuses[spell.stat] || 0);
                    const roll = Math.floor(Math.random() * 20) + 1;
                    const total = roll + statValue;

                    let logMessage = `${playerName} casts ${spell.name}: ${roll}(d20) + ${statValue} = ${total}.`;

                    if (roll === 1 || total < (spell.hit || 15)) {
                        logMessage += ` The spell fizzles!`;
                        duel.log.push({ message: logMessage, type: 'info' });
                    } else {
                        logMessage += ` Success!`;
                        duel.log.push({ message: logMessage, type: spell.type === 'heal' ? 'heal' : 'damage' });
                        
                        const target = (targetIndex === 'player') ? actingPlayerState : opponentPlayerState;

                        if (spell.type === 'heal') {
                            target.health = Math.min(target.maxHealth, target.health + spell.heal);
                            duel.log.push({ message: `${playerName} healed ${target.name} for ${spell.heal} HP.`, type: 'heal' });
                        } else if (spell.type === 'attack') {
                            target.health -= spell.damage;
                            duel.log.push({ message: `Dealt ${spell.damage} damage to ${target.name}.`, type: 'damage' });
                        }
                    }
                    actionTaken = true;
                }
            }

            if (action.type === 'useItemAbility') {
                const item = actingCharacter.equipment[action.payload.slot];
                const ability = item?.activatedAbility;
                if (ability && actingPlayerState.actionPoints >= ability.cost && (actingPlayerState.itemCooldowns[item.name] || 0) <= 0) {
                    actingPlayerState.actionPoints -= ability.cost;
                    actingPlayerState.itemCooldowns[item.name] = ability.cooldown;
                    if (ability.buff) {
                        actingPlayerState.buffs.push({ ...ability.buff });
                        duel.log.push({ message: `${playerName} used ${ability.name} and gained ${ability.buff.type}!`, type: 'heal' });
                    }
                    actionTaken = true;
                }
            }

            if (action.type === 'useConsumable') {
                const item = actingCharacter.inventory[action.payload.inventoryIndex];
                 if (item?.type === 'consumable' && actingPlayerState.actionPoints >= (item.cost || 0)) {
                    actingPlayerState.actionPoints -= (item.cost || 0);
                    if(item.heal) {
                        actingPlayerState.health = Math.min(actingPlayerState.maxHealth, actingPlayerState.health + item.heal);
                        duel.log.push({ message: `${playerName} used ${item.name}, healing for ${item.heal} HP.`, type: 'heal' });
                    }
                    item.quantity = (item.quantity || 1) - 1;
                    if(item.quantity <= 0) actingCharacter.inventory[action.payload.inventoryIndex] = null;
                    io.to(player.id).emit('characterUpdate', actingCharacter);
                    actionTaken = true;
                 }
            }
        
            if (actionTaken) {
                if (opponentPlayerState.health <= 0) {
                    endDuel(duel.id, actingPlayerState.name, opponentPlayerState.name);
                    return; 
                }
                if (actingPlayerState.actionPoints <= 0) {
                    action.type = 'endTurn';
                }
            }
        
            if (action.type === 'endTurn') {
                if (!actionTaken) duel.log.push({ message: `${playerName} ends their turn.`, type: 'info' });
                
                Object.keys(actingPlayerState.weaponCooldowns).forEach(k => { if(actingPlayerState.weaponCooldowns[k] > 0) actingPlayerState.weaponCooldowns[k]--; });
                Object.keys(actingPlayerState.spellCooldowns).forEach(k => { if(actingPlayerState.spellCooldowns[k] > 0) actingPlayerState.spellCooldowns[k]--; });
                Object.keys(actingPlayerState.itemCooldowns).forEach(k => { if(actingPlayerState.itemCooldowns[k] > 0) actingPlayerState.itemCooldowns[k]--; });
                
                duel.activePlayerId = opponentPlayerState.id;
                opponentPlayerState.actionPoints = 3;

                duel.log.push({ message: `It is now ${opponentPlayerState.name}'s turn.`, type: 'info' });
            }
            
            broadcastDuelUpdate(duel.id);
        } catch (error) {
            console.error(`!!! DUEL ERROR !!! A server crash was prevented. Details:`);
            console.error(error);
            socket.emit('partyError', 'A server error occurred during the duel. The action may not have completed.');
        }
    });


    socket.on('disconnect', () => {
        const name = socket.characterName;
        console.log(`Socket ${socket.id} for character ${name} disconnected.`);
        if (name && players[name]) {
            const duelId = players[name].character.duelId;
            if (duelId && duels[duelId] && !duels[duelId].ended) {
                const duel = duels[duelId];
                const opponent = duel.player1.name === name ? duel.player2 : duel.player1;

                duel.log.push({ message: `${name} has disconnected. The duel will end in 20 seconds if they do not reconnect.`, type: 'damage' });
                broadcastDuelUpdate(duelId);

                duel.disconnectTimeout = setTimeout(() => {
                    console.log(`Disconnect timer for ${name} in duel ${duelId} has expired.`);
                    endDuel(duelId, opponent.name, name);
                }, 20000);
            }

            players[name].id = null;
            broadcastOnlinePlayers();
        }
    });
});

function endDuel(duelId, winnerName, loserName) {
    const duel = duels[duelId];
    if (!duel || duel.ended) return;

    console.log(`Ending duel ${duelId}. Winner: ${winnerName}, Loser: ${loserName}`);
    duel.ended = true;
    duel.log.push({ message: `${loserName} has been defeated! ${winnerName} is victorious!`, type: 'success' });
    
    const winner = players[winnerName];
    const loser = players[loserName];
    const duelReward = { gold: 50 };

    if (winner && winner.character) {
        winner.character.gold += duelReward.gold;
        winner.character.duelId = null;
        if (winner.id) io.to(winner.id).emit('duel:end', { outcome: 'win', reward: duelReward });
    }

    if (loser && loser.character) {
        loser.character.duelId = null;
        if (loser.id) io.to(loser.id).emit('duel:end', { outcome: 'loss', reward: null });
    }

    delete duels[duelId];
    
    if (winner?.character?.partyId) broadcastPartyUpdate(winner.character.partyId);
    if (loser?.character?.partyId) broadcastPartyUpdate(loser.character.partyId);
}

// 6. START THE SERVER
server.listen(PORT, () => {
  console.log(`Server listening on http://localhost:${PORT}`);
});