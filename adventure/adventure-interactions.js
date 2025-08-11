// adventure/adventure-interactions.js

import { players, parties } from '../serverState.js';
import { gameData } from '../data/index.js';
import { buildZoneDeckForServer, drawCardsForServer, getBonusStatsForPlayer, addItemToInventoryServer, consumeMaterials } from '../utilsHelpers.js';

// Note: We will create the adventure-state.js file in the next step.
import { checkAndEndTurnForPlayer } from './adventure-state.js';


export function processDropItem(io, party, player, payload) {
    const { inventoryIndex } = payload;
    const { character } = player;
    const { sharedState } = party;
    const itemToDrop = character.inventory[inventoryIndex];

    if (itemToDrop) {
        character.inventory[inventoryIndex] = null;
        sharedState.groundLoot.push(itemToDrop);
        sharedState.log.push({ message: `${character.characterName} dropped ${itemToDrop.name} to the ground.`, type: 'info' });
        io.to(player.id).emit('characterUpdate', character);
    }
}

export function processTakeGroundLoot(io, party, player, payload) {
    const { groundLootIndex } = payload;
    const { character } = player;
    const { sharedState } = party;
    const itemToTake = sharedState.groundLoot[groundLootIndex];

    if (itemToTake) {
        if (addItemToInventoryServer(character, itemToTake)) {
            sharedState.groundLoot.splice(groundLootIndex, 1);
            sharedState.log.push({ message: `${character.characterName} picked up ${itemToTake.name}.`, type: 'success' });
            io.to(player.id).emit('characterUpdate', character);
        } else {
            sharedState.log.push({ message: `${character.characterName} tried to pick up ${itemToTake.name}, but their inventory is full.`, type: 'damage' });
        }
    }
}

export async function processInteractWithCard(io, party, player, payload) {
    const { cardIndex } = payload;
    const { character } = player;
    const { sharedState } = party;
    const actingPlayerState = sharedState.partyMemberStates.find(p => p.playerId === player.id);
    const card = sharedState.zoneCards[cardIndex];

    if (!card) return;

    if (card.name === 'Sewer Grate') {
        sharedState.log.push({ message: "The party descends through the grate into the darkness below...", type: 'info' });
        party.sharedState.currentZone = 'sewers';
        party.sharedState.zoneDeck = buildZoneDeckForServer('sewers');
        party.sharedState.zoneCards = [];
        party.sharedState.groundLoot = [];
        drawCardsForServer(party.sharedState, 3);
        return; 
    }

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
            let lootItemData = null;
            if (card.lootPool && card.lootPool.length > 0) {
                const randomLootInfo = card.lootPool[Math.floor(Math.random() * card.lootPool.length)];
                lootItemData = gameData.allItems.find(i => i.name === randomLootInfo.name);
            } else {
                lootItemData = card.loot;
            }
    
            if (lootItemData) {
                if (!addItemToInventoryServer(character, lootItemData, 1, sharedState.groundLoot)) {
                     sharedState.log.push({ message: `Success! But their inventory is full. They dropped 1 ${lootItemData.name} on the ground.`, type: 'damage' });
                } else {
                     logMessage += ` Success! They gathered 1 ${lootItemData.name}.`;
                     sharedState.log.push({ message: logMessage, type: 'success' });
                }
                io.to(player.id).emit('characterUpdate', character);
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
                        if (addItemToInventoryServer(character, randomLoot, 1, sharedState.groundLoot)) {
                           foundItemsLog += `${randomLoot.name}, `;
                        } else {
                           sharedState.log.push({ message: `Found ${randomLoot.name}, but inventory was full. It was left on the ground.`, type: 'damage' });
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

    await checkAndEndTurnForPlayer(io, party, player);
}

export function startNPCDialogue(io, player, party, npc, cardIndex, dialogueNodeKey = 'start') {
    const leaderCharacter = player.character;

    let currentDialogueNodeKey = dialogueNodeKey;
    if (dialogueNodeKey === 'start') {
        npc.quests.forEach(questDef => {
            if (questDef.turnInItems) {
                const playerQuest = leaderCharacter.quests.find(q => q.details.id === questDef.id);
                if (playerQuest && playerQuest.status === 'active') {
                    let hasAllItems = true;
                    for (const itemName in questDef.turnInItems) {
                        const requiredAmount = questDef.turnInItems[itemName];
                        const inventoryAmount = leaderCharacter.inventory
                            .filter(i => i && i.name === itemName)
                            .reduce((total, item) => total + (item.quantity || 1), 0);
                        const bankAmount = leaderCharacter.bank
                            .filter(i => i && i.name === itemName)
                            .reduce((total, item) => total + (item.quantity || 1), 0);
                        const currentAmount = inventoryAmount + bankAmount;
                        if (currentAmount < requiredAmount) {
                            hasAllItems = false;
                            break;
                        }
                    }
                    if (hasAllItems) {
                        playerQuest.status = 'readyToTurnIn';
                    }
                }
            }
        });

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

export function processDialogueChoice(io, player, party, payload) {
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
            if (questToComplete.details.turnInItems) {
                consumeMaterials(character, questToComplete.details.turnInItems);
            }

             party.members.forEach(memberName => {
                const memberPlayer = players[memberName];
                const member = memberPlayer?.character;
                if (member) {
                    const memberQuest = member.quests.find(q => q.details.id === choice.questComplete);
                    if (memberQuest) {
                        const reward = memberQuest.details.reward;
                        memberQuest.status = 'completed';
                        
                        if (reward.gold) member.gold += reward.gold;
                        if (reward.qp) member.questPoints += reward.qp;
                        
                        if (reward.titleReward && !member.unlockedTitles.includes(reward.titleReward)) {
                            member.unlockedTitles.push(reward.titleReward);
                        }
                        
                        if (reward.spellReward) {
                            const spellData = gameData.allSpells.find(s => s.name === reward.spellReward.name);
                            const alreadyHasSpell = member.spellbook.some(s => s.name === spellData.name) || member.equippedSpells.some(s => s.name === spellData.name);
                            if (spellData && !alreadyHasSpell) {
                                member.spellbook.push({...spellData});
                            }
                        }
                        
                        if (reward.recipeReward && !member.knownRecipes.includes(reward.recipeReward)) {
                            member.knownRecipes.push(reward.recipeReward);
                        }

                        if(memberPlayer.id) io.to(memberPlayer.id).emit('characterUpdate', memberPlayer.character);
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

export function processLootPlayer(io, player, party, payload) {
    const { targetPlayerIndex } = payload;
    const { sharedState } = party;
    
    const deadPlayerState = sharedState.partyMemberStates[targetPlayerIndex];
    const lootingCharacter = player.character;

    if (!deadPlayerState || !deadPlayerState.isDead || deadPlayerState.lootableInventory.length === 0) {
        return;
    }

    const itemToLoot = deadPlayerState.lootableInventory[0];

    if (addItemToInventoryServer(lootingCharacter, itemToLoot, 1, sharedState.groundLoot)) {
        deadPlayerState.lootableInventory.splice(0, 1);
        sharedState.log.push({ message: `${lootingCharacter.characterName} looted ${itemToLoot.name} from ${deadPlayerState.name}'s bag.`, type: 'info' });
        
        io.to(player.id).emit('characterUpdate', lootingCharacter);
    } else {
        sharedState.log.push({ message: `${lootingCharacter.characterName} tried to loot, but their inventory is full. The item was left on the ground.`, type: 'damage' });
    }
}