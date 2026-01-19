// adventure/adventure-interactions.js

import { players, parties } from '../serverState.js';
import { gameData } from '../data/index.js';
import { buildZoneDeckForServer, drawCardsForServer, getBonusStatsForPlayer, addItemToInventoryServer, consumeMaterials } from '../utilsHelpers.js';
import { checkAndEndTurnForPlayer } from './adventure-state.js';
import { broadcastAdventureUpdate } from '../utilsBroadcast.js';

/**
 * Get the area card to use when replacing treasure chests or resources in a zone.
 * @param {string} zoneName - The current zone name
 * @returns {Object|null} Area card object with unique id, or null if no area card for zone
 */
function getZoneAreaCard(zoneName, index = 0) {
    const zoneAreaCards = {
        farmlands: gameData.specialCards.farmlandsArea,
        sewers: gameData.specialCards.emptyCanal,
        goblinCaves: gameData.specialCards.goblinCavesTunnel,
        darkForest: gameData.specialCards.darkForestTrail,
        mansion: gameData.specialCards.mansionHall
    };
    const areaCard = zoneAreaCards[zoneName];
    return areaCard ? { ...areaCard, id: Date.now() + 1000 + index } : null;
}


export function processDropItem(io, party, player, payload) {
    const { inventoryIndex } = payload;
    const { character } = player;
    const { sharedState } = party;
    const itemToDrop = character.inventory[inventoryIndex];

    if (itemToDrop) {
        character.inventory[inventoryIndex] = null;
        // This will correctly reference the encounter's groundLoot in PvP
        sharedState.groundLoot.push(itemToDrop);
        sharedState.log.push({ message: `${character.characterName} dropped ${itemToDrop.name} to the ground.`, type: 'info' });
        io.to(player.id).emit('characterUpdate', character);
        // BUG FIX: Broadcast the state change to all players
        broadcastAdventureUpdate(io, party);
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
            // BUG FIX: Broadcast the state change to all players
            broadcastAdventureUpdate(io, party);
        } else {
            sharedState.log.push({ message: `${character.characterName} tried to pick up ${itemToTake.name}, but their inventory is full.`, type: 'damage' });
            broadcastAdventureUpdate(io, party);
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

    if (card.name === 'The Mansion') {
        sharedState.log.push({ message: "The party enters the decrepit mansion. A chill runs down their spines...", type: 'info' });
        party.sharedState.currentZone = 'mansion';
        party.sharedState.zoneDeck = buildZoneDeckForServer('mansion');
        party.sharedState.zoneCards = [];
        party.sharedState.groundLoot = [];
        // Draw 3 cards - will draw Vampire and fill with 2 Mansion Hall area cards
        drawCardsForServer(party.sharedState, 3);
        return;
    }

    if (card.type === 'resource') {
        // Check if player has a valid tool for this resource
        // Tool must match the required type and have tier >= required tier
        const hasValidTool = (item) => {
            if (!item || item.type !== 'tool') return false;
            return item.toolType === card.toolType && item.tier >= card.toolTier;
        };
        const hasTool = character.inventory.some(hasValidTool) ||
            hasValidTool(character.equipment.mainHand) ||
            hasValidTool(character.equipment.offHand);

        if (!hasTool) {
            // Provide helpful feedback about which tool is needed
            const toolNames = {
                mining: "Mining Pickaxe",
                woodcutting: "Woodcutting Axe",
                fishing: "Fishing Rod",
                harvesting: "Harvesting Sickle"
            };
            const toolName = toolNames[card.toolType] || card.toolType;
            const tier = card.toolTier || 1;
            sharedState.log.push({
                message: `You need a ${toolName} (T${tier} or better) to gather from ${card.name}.`,
                type: 'info'
            });
            return;
        }

        if (actingPlayerState.actionPoints < 1) return;
        actingPlayerState.actionPoints--;

        const bonuses = getBonusStatsForPlayer(character, actingPlayerState);
        const skillValue = (character[card.skill] || 0) + (bonuses[card.skill] || 0);
        const roll = Math.floor(Math.random() * 20) + 1;
        const total = roll + skillValue;
        const hitTarget = 11;
        const isSuccess = roll > 1 && total >= hitTarget;
        const rollColor = isSuccess ? '#2ecc71' : '#e74c3c';
        const rollDisplay = `<span style="color:${rollColor}">🎲${roll}</span>`;
        let logMessage = `${character.characterName} gathers from ${card.name}! ${rollDisplay}`;

        if (isSuccess) {
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
                    logMessage += ` Gathered 1 ${lootItemData.name}!`;
                    sharedState.log.push({ message: logMessage, type: 'success' });
                }
                io.to(player.id).emit('characterUpdate', character);
            }
        } else {
            logMessage += ` Failed!`;
            sharedState.log.push({ message: logMessage, type: 'info' });
        }

        card.charges--;
        if (card.charges <= 0) {
            sharedState.log.push({ message: `${card.name} has been depleted.`, type: 'info' });

            // Check for onDepletedSpawn (e.g., Boulders in Goblin Caves)
            if (card.onDepletedSpawn && sharedState.currentZone === 'goblinCaves') {
                const spawnRoll = Math.floor(Math.random() * 100) + 1;
                const goblinCavesPool = gameData.cardPools.goblinCaves;

                if (spawnRoll <= 50) {
                    // 50% chance: Spawn random enemy (not Gorbon)
                    const enemyCards = goblinCavesPool.filter(entry =>
                        entry.card.type === 'enemy' &&
                        entry.card.name !== 'Gorbon the Goblin King'
                    );
                    if (enemyCards.length > 0) {
                        const randomEntry = enemyCards[Math.floor(Math.random() * enemyCards.length)];
                        const spawnedEnemy = {
                            ...randomEntry.card,
                            id: Date.now(),
                            health: randomEntry.card.health,
                            maxHealth: randomEntry.card.maxHealth,
                            buffs: [],
                            debuffs: []
                        };
                        sharedState.zoneCards[cardIndex] = spawnedEnemy;
                        sharedState.log.push({ message: `A ${spawnedEnemy.name} was hiding behind the rubble!`, type: 'damage' });
                    } else {
                        sharedState.zoneCards[cardIndex] = getZoneAreaCard(sharedState.currentZone);
                    }
                } else if (spawnRoll <= 75) {
                    // 25% chance: Spawn treasure chest
                    const treasureChestEntry = goblinCavesPool.find(entry => entry.card.type === 'treasure');
                    if (treasureChestEntry) {
                        const spawnedChest = { ...treasureChestEntry.card, id: Date.now() };
                        sharedState.zoneCards[cardIndex] = spawnedChest;
                        sharedState.log.push({ message: `A hidden treasure chest was revealed behind the boulders!`, type: 'success' });
                    } else {
                        sharedState.zoneCards[cardIndex] = getZoneAreaCard(sharedState.currentZone);
                    }
                } else {
                    // 25% chance: Empty tunnel
                    sharedState.zoneCards[cardIndex] = getZoneAreaCard(sharedState.currentZone);
                    sharedState.log.push({ message: `The rubble clears to reveal an empty tunnel.`, type: 'info' });
                }
            } else {
                // Normal resource depletion - spawn zone area card if available
                sharedState.zoneCards[cardIndex] = getZoneAreaCard(sharedState.currentZone);
            }
        }
    }

    else if (card.type === 'enemy') {
        return;
    }

    // Area cards are non-interactable - don't spend AP
    else if (card.type === 'area') {
        return;
    }

    // Interaction cards that spawn enemies (e.g., Chicken Coop -> Angry Rooster)
    else if (card.type === 'interaction' && card.spawnsEnemy) {
        const cost = card.interactionCost || 1;
        if (actingPlayerState.actionPoints < cost) {
            sharedState.log.push({ message: `Not enough AP to interact with ${card.name}.`, type: 'info' });
            return;
        }
        actingPlayerState.actionPoints -= cost;

        const enemyTemplate = gameData.specialCards[card.spawnsEnemy];
        if (enemyTemplate) {
            const spawnedEnemy = {
                ...enemyTemplate,
                id: Date.now(),
                health: enemyTemplate.health,
                maxHealth: enemyTemplate.maxHealth,
                buffs: [],
                debuffs: []
            };
            sharedState.zoneCards[cardIndex] = spawnedEnemy;
            sharedState.log.push({ message: `${character.characterName} disturbed the ${card.name}! A ${spawnedEnemy.name} appears!`, type: 'damage' });
        }
        await checkAndEndTurnForPlayer(io, party, player);
        return;
    }

    // NPCs are now interactable by any party member (removed leader-only check)

    else if (actingPlayerState.actionPoints >= 1) {
        actingPlayerState.actionPoints--;

        if (card.type === 'npc') {
            startNPCDialogue(io, player, party, card, cardIndex);
        }
        else if (card.type === 'treasure') {
            const lootTable = card.loot ? card.loot.map(item => gameData.allItems.find(i => i.name === item.name) || item) : gameData.genericTreasureLoot.map(item => gameData.allItems.find(i => i.name === item.name) || item);
            const numItems = 3; // Always drop 3 items from treasure chests
            let foundItemsLog = '';

            for (let i = 0; i < numItems; i++) {
                if (lootTable.length > 0) {
                    const randomLoot = { ...lootTable[Math.floor(Math.random() * lootTable.length)] };
                    if (randomLoot.gold) {
                        const goldPerPlayer = Math.floor(randomLoot.gold / party.members.length);
                        party.members.forEach(memberName => {
                            const memberPlayer = players[memberName];
                            if (memberPlayer && memberPlayer.character) {
                                memberPlayer.character.gold += goldPerPlayer;
                                if (memberPlayer.id) io.to(memberPlayer.id).emit('characterUpdate', memberPlayer.character);
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
            // Replace with zone-specific area card, or null if none defined
            const areaCard = getZoneAreaCard(sharedState.currentZone);
            sharedState.zoneCards[cardIndex] = areaCard;
        }
    }

    await checkAndEndTurnForPlayer(io, party, player);
}

export function startNPCDialogue(io, player, party, npc, cardIndex, dialogueNodeKey = 'start') {
    const interactingCharacter = player.character;

    // Fallback for NPCs without dialogue defined
    if (!npc.dialogue) {
        const genericDialogue = {
            text: npc.description || "Hello, traveler. Safe journeys to you.",
            options: [{ text: "Farewell.", next: "farewell" }]
        };
        const payload = {
            npcName: npc.name,
            node: genericDialogue,
            cardIndex: cardIndex
        };
        // Only show dialogue to the player who initiated the conversation
        io.to(player.id).emit('party:showDialogue', payload);
        return;
    }

    // For NPCs with dialogue but no quests, just show the dialogue directly
    if (!npc.quests || npc.quests.length === 0) {
        const currentNode = npc.dialogue[dialogueNodeKey];
        if (!currentNode) {
            // Fallback if the requested dialogue key doesn't exist
            const genericDialogue = {
                text: npc.description || "Hello, traveler. Safe journeys to you.",
                options: [{ text: "Farewell.", next: "farewell" }]
            };
            const payload = {
                npcName: npc.name,
                node: genericDialogue,
                cardIndex: cardIndex
            };
            // Only show dialogue to the player who initiated
            io.to(player.id).emit('party:showDialogue', payload);
            return;
        }

        // Filter out options that require items the player doesn't have
        let filteredNode = currentNode;
        if (currentNode.options) {
            const filteredOptions = currentNode.options.filter(opt => {
                if (opt.requiresItem) {
                    return interactingCharacter.inventory.some(item => item && item.name === opt.requiresItem);
                }
                return true;
            });
            filteredNode = { ...currentNode, options: filteredOptions };
        }

        const payload = {
            npcName: npc.name,
            node: filteredNode,
            cardIndex: cardIndex
        };
        // Only show dialogue to the player who initiated
        io.to(player.id).emit('party:showDialogue', payload);
        return;
    }

    let currentDialogueNodeKey = dialogueNodeKey;
    if (dialogueNodeKey === 'start') {
        npc.quests.forEach(questDef => {
            if (questDef.turnInItems) {
                const playerQuest = interactingCharacter.quests.find(q => q.details.id === questDef.id);
                if (playerQuest && playerQuest.status === 'active') {
                    let hasAllItems = true;
                    for (const itemName in questDef.turnInItems) {
                        const requiredAmount = questDef.turnInItems[itemName];
                        const inventoryAmount = interactingCharacter.inventory
                            .filter(i => i && i.name === itemName)
                            .reduce((total, item) => total + (item.quantity || 1), 0);
                        const bankAmount = interactingCharacter.bank
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
            const playerQuest = interactingCharacter.quests.find(q => q.details.id === quest.id);
            if (!playerQuest || playerQuest.status !== 'completed') {
                nextQuestDef = quest;
                break;
            }
        }

        if (nextQuestDef) {
            const playerQuest = interactingCharacter.quests.find(q => q.details.id === nextQuestDef.id);
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

    // Filter out options that require items the player doesn't have
    let filteredNode = currentNode;
    if (currentNode && currentNode.options) {
        const filteredOptions = currentNode.options.filter(opt => {
            if (opt.requiresItem) {
                return interactingCharacter.inventory.some(item => item && item.name === opt.requiresItem);
            }
            return true;
        });
        filteredNode = { ...currentNode, options: filteredOptions };
    }

    const payload = {
        npcName: npc.name,
        node: filteredNode,
        cardIndex: cardIndex
    };

    // Only show dialogue to the player who initiated
    io.to(player.id).emit('party:showDialogue', payload);
}

export function processDialogueChoice(io, player, party, payload) {
    const { cardIndex, choice } = payload;
    const { character } = player;
    const npc = party.sharedState.zoneCards[cardIndex];

    if (choice.questId) {
        const questDetails = npc.quests.find(q => q.id === choice.questId);
        if (questDetails) {
            // Only add quest to the player who accepted
            if (!character.quests.some(q => q.details.id === choice.questId)) {
                character.quests.push({ details: questDetails, status: 'active', progress: 0 });
                io.to(player.id).emit('characterUpdate', character);
            }
            party.sharedState.log.push({ message: `${character.characterName} accepted Quest: ${questDetails.title}`, type: 'success' });
        }
    }

    if (choice.questComplete) {
        const questToComplete = character.quests.find(q => q.details.id === choice.questComplete);
        if (questToComplete && questToComplete.status === 'readyToTurnIn') {
            if (questToComplete.details.turnInItems) {
                consumeMaterials(character, questToComplete.details.turnInItems);
            }

            // Only complete quest for the player who turned it in
            const reward = questToComplete.details.reward;
            questToComplete.status = 'completed';

            if (reward.gold) character.gold += reward.gold;
            if (reward.qp) character.questPoints += reward.qp;

            if (reward.titleReward && !character.unlockedTitles.includes(reward.titleReward)) {
                character.unlockedTitles.push(reward.titleReward);
            }

            if (reward.spellReward) {
                const spellData = gameData.allSpells.find(s => s.name === reward.spellReward.name);
                const alreadyHasSpell = character.spellbook.some(s => s.name === spellData.name) || character.equippedSpells.some(s => s.name === spellData.name);
                if (spellData && !alreadyHasSpell) {
                    character.spellbook.push({ ...spellData });
                }
            }

            if (reward.recipeReward) {
                const recipes = Array.isArray(reward.recipeReward) ? reward.recipeReward : [reward.recipeReward];
                recipes.forEach(recipe => {
                    if (!character.knownRecipes.includes(recipe)) {
                        character.knownRecipes.push(recipe);
                    }
                });
            }

            if (reward.itemReward) {
                const items = Array.isArray(reward.itemReward) ? reward.itemReward : [reward.itemReward];
                items.forEach(rewardItem => {
                    const itemData = gameData.allItems.find(i => i.name === rewardItem.name);
                    if (itemData) {
                        addItemToInventoryServer(character, itemData, rewardItem.quantity || 1);
                    }
                });
            }

            io.to(player.id).emit('characterUpdate', character);
            party.sharedState.log.push({ message: `${character.characterName} completed Quest: ${questToComplete.details.title}`, type: 'success' });
        }
    }

    // Handle teachRecipe - NPC teaches a recipe to the player
    if (choice.teachRecipe) {
        const recipeName = choice.teachRecipe;
        // Only teach recipe to the player who initiated the dialogue
        if (!character.knownRecipes.includes(recipeName)) {
            character.knownRecipes.push(recipeName);
            io.to(player.id).emit('characterUpdate', character);
        }
        party.sharedState.log.push({ message: `${npc.name} taught ${character.characterName} how to craft: ${recipeName}!`, type: 'success' });
    }

    if (choice.next === 'farewell') {
        // Only hide dialogue for the interacting player
        io.to(player.id).emit('party:hideDialogue');
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
        broadcastAdventureUpdate(io, party);
    } else {
        sharedState.log.push({ message: `${lootingCharacter.characterName} tried to loot, but their inventory is full. The item was left on the ground.`, type: 'damage' });
        broadcastAdventureUpdate(io, party);
    }
}