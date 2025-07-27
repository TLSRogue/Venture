'use strict';

import { gameData } from './game-data.js';
import { gameState } from './state.js';
import * as UI from './ui.js';
import * as Combat from './combat.js';
import * as Player from './player.js';
import * as Network from './network.js';

// --- MODULE STATE ---
const allQuestsById = new Map();
const questGiverMap = new Map();

// Initialize quest data as soon as the module loads
Object.values(gameData.cardPools).flat().forEach(poolItem => {
    if (poolItem.card.quests) {
        poolItem.card.quests.forEach(quest => {
            if (quest.reward && quest.reward.spellReward && typeof quest.reward.spellReward === 'object' && quest.reward.spellReward.name) {
                const spellName = quest.reward.spellReward.name;
                quest.reward.spellReward = gameData.allSpells.find(s => s.name === spellName);
            }
            allQuestsById.set(quest.id, quest);
            questGiverMap.set(quest.id, poolItem.card.name);
        });
    }
});


// --- EXPORTED FUNCTIONS ---

export function lootPlayer(targetPlayerIndex) {
    if (gameState.partyId) {
        Network.emitPartyAction({
            type: 'lootPlayer',
            payload: {
                targetPlayerIndex
            }
        });
    }
}

export function interactWithCard(cardIndex) {
    if (!gameState.turnState.isPlayerTurn || gameState.turnState.isProcessing) return;
    
    // Handle targeting other players in a party
    if (cardIndex.toString().startsWith('p')) {
        const selectedAction = gameState.turnState.selectedAction;
        if (selectedAction && selectedAction.type === 'spell') {
            const spell = selectedAction.data;
            if (spell.type === 'heal' || spell.type === 'buff' || spell.type === 'versatile') {
                if (gameState.inDuel) {
                     Network.emitDuelAction({ type: 'castSpell', payload: { spellIndex: selectedAction.index, targetIndex: cardIndex } });
                } else if (gameState.partyId) {
                    Combat.castSpell(selectedAction.index, cardIndex);
                }
            } else {
                UI.addToLog("You can't use that on another player.", "info");
            }
        } else {
            UI.addToLog("Invalid target for that action.", "info");
        }
        clearSelection();
        return;
    }
    
    if (cardIndex === 'player') {
        interactWithPlayerCard();
        return;
    }

    // *** NEW FIX LOGIC ***
    // This logic is now simplified. Since the duel opponent is now treated as a normal card
    // in `gameState.zoneCards`, we no longer need a special `if (gameState.inDuel)` check here.
    const card = gameState.zoneCards[cardIndex];
    
    if (!card) return;

    const selectedAction = gameState.turnState.selectedAction;

    if (selectedAction) {
        // The opponent card now has `type: 'enemy'`, so this check works for duels automatically.
        if (card.type === 'enemy' || card.type === 'player') { 
            if (gameState.inDuel) {
                const actionType = selectedAction.type === 'spell' ? 'castSpell' : 'weaponAttack';
                const payload = {
                    targetIndex: 'opponent', // The server knows this means the other player in the duel.
                    ...(selectedAction.type === 'spell' && { spellIndex: selectedAction.index }),
                    ...(selectedAction.type === 'weapon' && { weaponSlot: selectedAction.slot })
                };
                Network.emitDuelAction({ type: actionType, payload });
                clearSelection();
            } else if (selectedAction.type === 'spell') {
                Combat.castSpell(selectedAction.index, cardIndex);
            } else if (selectedAction.type === 'weapon') {
                Combat.weaponAttack(cardIndex);
            }
        } else {
            UI.addToLog("Invalid target. Action cancelled.", "info");
            clearSelection();
        }
        return;
    }
    
    if (gameState.inDuel) return; // No generic interactions in duels

    if (gameState.partyId) {
        Network.emitPartyAction({
            type: 'interactWithCard',
            payload: {
                cardIndex
            }
        });
        return;
    }

    // --- SOLO PLAY LOGIC ---
    if (card.type === 'resource') {
        if (card.name === 'Sewer Grate') {
            UI.showConfirmationModal('Descend into the sewers?', () => { 
                const event = new CustomEvent('enter-zone', { detail: { zoneName: 'sewers' } });
                document.body.dispatchEvent(event);
                UI.hideModal(); 
            });
        } else {
            showHarvestOptions(cardIndex);
        }
    } else if (card.type === 'treasure') {
        openTreasureChest(cardIndex);
    } else if (card.type === 'npc') {
        talkToNPC(cardIndex);
    } else if (card.name === 'Mugger') {
        handleMuggerInteraction(cardIndex);
    }
}

export function interactWithPlayerCard() {
    let localPlayerTargetIndex = 'player'; 
    if (gameState.partyId && gameState.partyMemberStates) {
        const localPlayerIndex = gameState.partyMemberStates.findIndex(p => p.playerId === Network.socket.id);
        if (localPlayerIndex !== -1) {
            localPlayerTargetIndex = `p${localPlayerIndex}`;
        }
    }

    const selectedAction = gameState.turnState.selectedAction;
    if (selectedAction) {
        if (selectedAction.type === 'spell') {
            const spell = selectedAction.data;
            if (spell.type === 'heal' || spell.type === 'buff' || spell.type === 'versatile') {
                if (gameState.inDuel) {
                     Network.emitDuelAction({ type: 'castSpell', payload: { spellIndex: selectedAction.index, targetIndex: 'player' } });
                     clearSelection();
                } else {
                    Combat.castSpell(selectedAction.index, localPlayerTargetIndex);
                }
            } else {
                 UI.addToLog("You can't use that on yourself.", "info");
                 clearSelection();
            }
        } else {
            UI.addToLog("Invalid target for that action.", "info");
            clearSelection();
        }
    }
}

export function selectAction(action) {
    if (gameState.turnState.selectedAction && gameState.turnState.selectedAction.data.name === action.data.name && gameState.turnState.selectedAction.slot === action.slot) {
        clearSelection();
        return;
    }
    gameState.turnState.selectedAction = action;
    UI.updateActionUI();
}

export function clearSelection() {
    gameState.turnState.selectedAction = null;
    UI.updateActionUI();
}

export function talkToNPC(cardIndex, dialogueNodeKey = 'start') {
    const npc = gameState.zoneCards[cardIndex];

    if (!npc.quests || npc.quests.length === 0) {
        UI.showInfoModal(`${npc.name} has nothing to say to you.`);
        return;
    }

    let currentDialogueNodeKey = dialogueNodeKey;

    if (dialogueNodeKey === 'start') {
        let nextQuestDef = null;
        let allQuestsDoneForNpc = true;
        for (const quest of npc.quests) {
            const playerQuest = gameState.quests.find(q => q.details.id === quest.id);
            if (!playerQuest || playerQuest.status !== 'completed') {
                nextQuestDef = quest;
                allQuestsDoneForNpc = false;
                break;
            }
        }

        if (allQuestsDoneForNpc) {
            currentDialogueNodeKey = 'allQuestsDone';
        } else if (nextQuestDef) {
            const playerQuest = gameState.quests.find(q => q.details.id === nextQuestDef.id);
            if (!playerQuest) {
                const prereq = nextQuestDef.prerequisite;
                if (typeof prereq === 'string' && !gameState.quests.some(q => q.details.id === prereq && q.status === 'completed')) {
                    currentDialogueNodeKey = 'prereqNotMet';
                } else if (prereq && typeof prereq === 'object' && prereq.qp && gameState.questPoints < prereq.qp) {
                    currentDialogueNodeKey = 'prereqNotMet';
                } else {
                    currentDialogueNodeKey = `${nextQuestDef.id}_start`;
                }
            } else {
                if (playerQuest.status === 'active') {
                    if ((playerQuest.details.target && playerQuest.progress >= playerQuest.details.required) || (playerQuest.details.turnInItems && Player.hasMaterials(playerQuest.details.turnInItems, true))) {
                        playerQuest.status = 'readyToTurnIn';
                    }
                }
                
                if (playerQuest.status === 'readyToTurnIn') {
                    currentDialogueNodeKey = `${nextQuestDef.id}_ready`;
                } else {
                    currentDialogueNodeKey = `${nextQuestDef.id}_inProgress`;
                }
            }
        }
    }
    
    const currentNode = npc.dialogue[currentDialogueNodeKey];
    if (!currentNode) {
        console.error(`Dialogue node "${currentDialogueNodeKey}" not found for NPC "${npc.name}"`);
        const farewellNode = npc.dialogue['farewell'];
        if (farewellNode) {
            UI.showModal(`<h2>${npc.name}</h2><p>${farewellNode.text}</p><button class="btn" id="npc-leave-btn">Leave</button>`);
            document.getElementById('npc-leave-btn').onclick = UI.hideModal;
        } else {
            UI.hideModal();
        }
        return;
    }

    let modalContent = `<h2>${npc.name}</h2><p>${currentNode.text}</p>`;
    let buttons = '<div class="action-buttons" id="npc-dialogue-options" style="flex-direction: column; gap: 10px;">';

    currentNode.options.forEach(option => {
        let action = `data-card-index="${cardIndex}" data-next-node="${option.next}"`;
        if (option.next === 'farewell') {
            action += ` data-action="hide"`;
        } else if (option.questId) {
            action += ` data-action="acceptQuest" data-quest-id="${option.questId}"`;
        } else if (option.questComplete) {
            action += ` data-action="completeQuest" data-quest-id="${option.questComplete}"`;
        } else {
            action += ` data-action="continue"`;
        }
        buttons += `<button class="btn btn-primary" ${action}>${option.text}</button>`;
    });

    if (currentNode.options.length === 0) {
        buttons += `<button class="btn" data-action="hide">Leave</button>`;
    }

    buttons += '</div>';
    modalContent += buttons;
    UI.showModal(modalContent);
}

export function acceptQuestById(questId) {
    if (gameState.quests.some(q => q.details.id === questId)) return;
    const questDetails = allQuestsById.get(questId);
    if (questDetails) {
        gameState.quests.push({details: questDetails, status: 'active', progress: 0});
        UI.addToLog(`New Quest Accepted: ${questDetails.title}`, 'success');
        UI.renderQuestLog();
    }
}

export function completeQuest(questId) {
    const quest = gameState.quests.find(q => q.details.id === questId);
    if (quest && quest.status === 'readyToTurnIn') {
        
        if (quest.details.turnInItems) {
            for (const material in quest.details.turnInItems) {
                let requiredCount = quest.details.turnInItems[material];
                
                for (let i = 0; i < gameState.inventory.length && requiredCount > 0; i++) {
                    const item = gameState.inventory[i];
                    if (item && item.name === material) {
                        const toConsume = Math.min(requiredCount, item.quantity || 1);
                        item.quantity -= toConsume;
                        requiredCount -= toConsume;
                        if (item.quantity <= 0) {
                            gameState.inventory[i] = null;
                        }
                    }
                }

                if (requiredCount > 0) {
                     for (let i = gameState.bank.length - 1; i >= 0 && requiredCount > 0; i--) {
                        const item = gameState.bank[i];
                        if (item && item.name === material) {
                            const toConsume = Math.min(requiredCount, item.quantity || 1);
                            item.quantity -= toConsume;
                            requiredCount -= toConsume;
                            if (item.quantity <= 0) {
                                gameState.bank.splice(i, 1);
                            }
                        }
                    }
                }
            }
        }

        if (quest.details.reward.gold) gameState.gold += quest.details.reward.gold;
        if (quest.details.reward.qp) gameState.questPoints += quest.details.reward.qp;
        if (quest.details.reward.spellReward) {
            gameState.spellbook.push(quest.details.reward.spellReward);
            UI.addToLog(`You learned a new spell: ${quest.details.reward.spellReward.name}!`, 'success');
        }
        if (quest.details.reward.titleReward) {
            const newTitle = quest.details.reward.titleReward;
            if (!gameState.unlockedTitles.includes(newTitle)) {
                gameState.unlockedTitles.push(newTitle);
                UI.showInfoModal(`New Title Unlocked: ${newTitle}!`);
            }
        }

        quest.status = 'completed';
        UI.addToLog(`Quest Complete: ${quest.details.title}!`, 'success');
        UI.updateDisplay();
        UI.renderInventory();
        UI.renderBankInterface();
        UI.renderQuestLog();
    }
}

// --- PRIVATE HELPER FUNCTIONS (NOT EXPORTED) ---

function openTreasureChest(cardIndex) {
    const inCombat = gameState.zoneCards.some(c => c && c.type === 'enemy');
    if (inCombat) {
        if (gameState.actionPoints < 1) {
            UI.showInfoModal("Not enough action points to open chest.");
            return;
        }
        gameState.actionPoints--;
    }

    const chest = gameState.zoneCards[cardIndex];
    const lootTable = chest.loot ? chest.loot.map(item => gameData.allItems.find(i => i.name === item.name) || item) : gameData.genericTreasureLoot.map(item => gameData.allItems.find(i => i.name === item.name) || item);
    const numItems = Math.floor(Math.random() * 2) + 1;
    let foundItems = '';

    for(let i=0; i<numItems; i++) {
        if (gameState.inventory.filter(Boolean).length >= 24) {
            UI.addToLog("Inventory full, couldn't get all the loot!", 'damage');
            break;
        }
        if (lootTable.length > 0) {
            const randomLoot = {...lootTable[Math.floor(Math.random() * lootTable.length)]};
            if (randomLoot.gold) {
                gameState.gold += randomLoot.gold;
                foundItems += `${randomLoot.gold} Gold, `;
            } else {
                if (Player.addItemToInventory(randomLoot)) {
                   foundItems += `${randomLoot.name}, `;
                }
            }
        }
    }

    if (foundItems) {
        foundItems = foundItems.slice(0, -2);
        UI.addToLog(`You opened the chest and found: ${foundItems}!`, 'success');
    } else {
        UI.addToLog("The chest was empty.", "info");
    }

    gameState.zoneCards[cardIndex] = null;
    UI.updateDisplay();
    UI.renderAdventureScreen();
    UI.renderInventory();
    if (inCombat) {
        UI.renderPlayerActionBars();
        Combat.checkEndOfPlayerTurn();
    }
}

function showHarvestOptions(cardIndex) {
    const resource = gameState.zoneCards[cardIndex];
    const hasToolInInventory = gameState.inventory.some(item => item && item.name === resource.tool) || 
                               (gameState.equipment.mainHand && gameState.equipment.mainHand.name === resource.tool);
    let modalContent = `<h2>${resource.name}</h2><p>${resource.description}</p>`;
    
    if (!hasToolInInventory) {
        modalContent += `<p>You need a ${resource.tool} equipped or in your inventory to interact with this.</p>`;
    } else {
        modalContent += `<button class="btn btn-success" id="harvest-btn" ${gameState.actionPoints < 1 && gameState.zoneCards.some(c => c && c.type === 'enemy') ? 'disabled' : ''}>Gather ${resource.loot.name} (1 AP)</button>`;
    }
    modalContent += `<button class="btn" onclick="this.closest('.modal-overlay').classList.add('hidden')">Close</button>`;
    UI.showModal(modalContent);

    const harvestBtn = document.getElementById('harvest-btn');
    if (harvestBtn) {
        harvestBtn.onclick = () => harvestResource(cardIndex);
    }
}

function harvestResource(cardIndex) {
    UI.hideModal();
    const inCombat = gameState.zoneCards.some(c => c && c.type === 'enemy');
    if (inCombat) {
        if (gameState.actionPoints < 1) {
            UI.showInfoModal("Not enough action points!");
            return;
        }
        gameState.actionPoints--;
    }

    const resource = gameState.zoneCards[cardIndex];
    const bonuses = Player.getBonusStats();
    const skillValue = (gameState[resource.skill] || 0) + (bonuses[resource.skill] || 0);
    const roll = Math.floor(Math.random() * 20) + 1;
    const total = roll + skillValue;
    const hitTarget = 11;
    let description = `Gathering attempt: ${roll}(d20) + ${skillValue}(${resource.skill.slice(0,3)}) = ${total}. (Target: ${hitTarget}+)`;

    if (roll === 1) {
        description += ` Critical Failure! You fumbled and found nothing.`;
        UI.addToLog(description, 'damage');
    } else if (total >= hitTarget) {
        if (Player.addItemToInventory(resource.loot)) {
            description += ` Success! You gathered 1 ${resource.loot.name}.`;
            UI.addToLog(description, 'success');
        } else {
            description += ` Success! But your inventory is full.`;
            UI.addToLog(description, 'damage');
        }
    } else {
        description += ` Failure! You couldn't find anything.`;
        UI.addToLog(description, 'info');
    }

    resource.charges--;
    
    if (resource.charges <= 0) {
        UI.addToLog(`${resource.name} has been depleted.`, 'info');
        gameState.zoneCards[cardIndex] = null;
    }

    UI.updateDisplay();
    UI.renderAdventureScreen();
    UI.renderInventory();
    if (inCombat) {
        UI.renderPlayerActionBars();
        Combat.checkEndOfPlayerTurn();
    }
}

async function handleMuggerInteraction(cardIndex, isEnemyTurn = false) {
    const mugger = gameState.zoneCards[cardIndex];
    if (!mugger) return;

    const payAction = () => {
        if (gameState.gold >= 5) {
            gameState.gold -= 5;
            UI.addToLog("You paid the Mugger 5 gold. He scurries away.", "info");
            gameState.zoneCards[cardIndex] = null;
            UI.hideModal();
            UI.renderAdventureScreen();
            UI.updateDisplay();
        } else {
            UI.showInfoModal("You don't have enough gold!");
        }
    };

    const fightAction = () => {
        UI.addToLog("You refuse to pay. The Mugger attacks!", "damage");
        UI.hideModal();
        if (isEnemyTurn) {
            const stabAttack = mugger.attackTable.find(a => a.message.includes("Stab!"));
            if (stabAttack) {
                Combat.processEnemyAction(mugger, cardIndex, stabAttack);
            }
        }
    };
    
    const modalContent = `
        <h2>Mugger</h2>
        <p>"Your coin or your life!" he hisses.</p>
        <p>Pay 5 Gold to make him leave?</p>
        <div class="action-buttons">
            <button class="btn btn-success" id="pay-mugger-btn">Pay 5 Gold</button>
            <button class="btn btn-danger" id="fight-mugger-btn">Fight</button>
        </div>
    `;
    UI.showModal(modalContent);
    document.getElementById('pay-mugger-btn').onclick = payAction;
    document.getElementById('fight-mugger-btn').onclick = fightAction;
}