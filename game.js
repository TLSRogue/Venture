'use strict';

import { gameData } from './game-data.js';
import { gameState, setGameState, getInitialGameState } from './state.js';
import * as UI from './ui.js';
import * as Network from './network.js';
import * as Combat from './combat.js';
import * as Interactions from './interactions.js';
import * as Player from './player.js';
import * as Merchant from './merchant.js';

// --- STATE VARIABLES ---
let activeSlotIndex = null;

// --- INITIALIZATION ---
function initGame() {
    addEventListeners();
    Network.initSocketListeners({
        onConnect: handleConnect,
        onCharacterUpdate: handleCharacterUpdate,
        onLoadError: handleLoadError,
        onPartyUpdate: handlePartyUpdate,
        onOnlinePlayersUpdate: UI.renderOnlinePlayers,
        onPartyError: handlePartyError,
        onReceivePartyInvite: handleReceivePartyInvite,
        onPartyAdventureStarted: handlePartyAdventureStarted,
        onPartyAdventureUpdate: handlePartyAdventureUpdate,
        onPartyRequestReaction: handlePartyRequestReaction,
        onShowDialogue: UI.showNPCDialogueFromServer,
        onHideDialogue: UI.hideModal,
        onPartyAdventureEnded: Player.resetToHomeState,
        onDuelReceiveChallenge: handleDuelReceiveChallenge,
        onDuelStart: handleDuelStart,
        onDuelUpdate: handleDuelUpdate,
        onDuelEnd: handleDuelEnd,
    });
    UI.showCharacterSelectScreen();
}

// --- NETWORK HANDLERS ---
function handleConnect(socketId) {
    console.log('Successfully connected to the server with ID:', socketId);
    if (gameState && gameState.characterName && activeSlotIndex !== null) {
        console.log(`Re-authenticating as ${gameState.characterName}...`);
        Network.emitLoadCharacter(gameState);
    }
}

function handleCharacterUpdate(serverState) {
    console.log('Received character update from server.');
    const wasInParty = gameState.partyId;

    const preservedSession = {
        currentZone: gameState.currentZone,
        inDuel: gameState.inDuel,
        duelState: gameState.duelState,
        zoneCards: gameState.zoneCards,
        partyMemberStates: gameState.partyMemberStates,
        groundLoot: gameState.groundLoot
    };

    Object.assign(gameState, serverState);

    if (!gameState.turnState) {
        gameState.turnState = {
            isPlayerTurn: true,
            pendingReaction: null,
            selectedAction: null,
            isProcessing: false,
        };
    }

    if (preservedSession.currentZone || preservedSession.inDuel) {
        gameState.currentZone = preservedSession.currentZone;
        gameState.inDuel = preservedSession.inDuel;
        gameState.duelState = preservedSession.duelState;
        gameState.zoneCards = preservedSession.zoneCards;
        gameState.partyMemberStates = preservedSession.partyMemberStates;
        gameState.groundLoot = preservedSession.groundLoot;
    } else {
        gameState.inDuel = false;
        gameState.duelState = null;
        gameState.currentZone = null;
        gameState.zoneCards = [];
        gameState.groundLoot = [];
    }

    if (activeSlotIndex !== null) {
        const characterSlots = JSON.parse(localStorage.getItem('ventureCharacterSlots') || '[null, null, null]');
        
        const stateToSave = { ...gameState };
        delete stateToSave.isPartyLeader;
        delete stateToSave.turnState;
        delete stateToSave.partyMemberStates;
        delete stateToSave.zoneCards;
        delete stateToSave.groundLoot;
        
        characterSlots[activeSlotIndex] = stateToSave;
        localStorage.setItem('ventureCharacterSlots', JSON.stringify(characterSlots));
    }

    document.querySelector('.game-container').style.display = 'block';
    UI.hideModal();
    UI.renderAll();
    
    if (wasInParty && !gameState.partyId) {
        UI.renderPartyManagement(null);
    }
}


function handleLoadError(message) {
    UI.showInfoModal(message);
    setTimeout(UI.showCharacterSelectScreen, 1000);
}

function handlePartyUpdate(party) {
    if (gameState && gameState.characterName) {
       gameState.partyId = party ? party.partyId : null;
       gameState.partyMembers = party ? party.members : [];
       gameState.isPartyLeader = party ? party.isPartyLeader : false;
    }
    UI.renderPartyManagement(party);
}

function handlePartyError(message) {
    UI.showInfoModal(message);
}
function handleReceivePartyInvite({ inviterName, partyId }) {
    UI.showConfirmationModal(`${inviterName} has invited you to their party. Join?`, () => {
        Network.emitJoinParty(partyId);
        UI.hideModal();
    });
}
function handlePartyAdventureStarted(serverAdventureState) {
    console.log("Party adventure started!", serverAdventureState);
    gameState.currentZone = serverAdventureState.currentZone;
    gameState.zoneCards = serverAdventureState.zoneCards;
    gameState.partyMemberStates = serverAdventureState.partyMemberStates;
    gameState.groundLoot = serverAdventureState.groundLoot;

    Player.resetPlayerCombatState();

    UI.setTabsDisabled(true);
    document.querySelectorAll('.tab-content').forEach(tab => tab.style.display = 'none');
    document.getElementById('adventure-tab').style.display = 'block';
    document.getElementById('main-stats-display').style.display = 'none';
    document.getElementById('adventure-hud').style.display = 'flex';
    document.getElementById('player-action-bar').style.display = 'flex';
    document.getElementById('adventure-log-container').style.display = 'block';

    UI.renderAdventureScreen();
    document.getElementById('adventure-log').innerHTML = '';
    serverAdventureState.log.forEach(entry => UI.addToLog(entry.message, entry.type));
    UI.updateDisplay();
    UI.renderPlayerActionBars();
}

function handlePartyAdventureUpdate(serverAdventureState) {
    if (document.getElementById('reaction-buttons')) {
        UI.hideModal();
    }
    gameState.zoneCards = serverAdventureState.zoneCards;
    gameState.partyMemberStates = serverAdventureState.partyMemberStates;
    gameState.groundLoot = serverAdventureState.groundLoot;
    
    const logContainer = document.getElementById('adventure-log');
    const existingLogCount = logContainer.children.length;
    const newLogEntries = serverAdventureState.log.slice(existingLogCount);
    newLogEntries.reverse().forEach(entry => UI.addToLog(entry.message, entry.type));
    
    UI.renderAdventureScreen();
    UI.updateDisplay();
    UI.renderPlayerActionBars(); 
}

function handlePartyRequestReaction(data) {
    console.log('Received reaction request from server:', data);
    UI.showReactionModal(data);
}

// --- DUEL HANDLERS ---
function handleDuelReceiveChallenge({ challengerName, challengerId }) {
    UI.showConfirmationModal(`${challengerName} has challenged you to a duel! Accept?`, () => {
        Network.emitDuelAccept(challengerId);
        UI.hideModal();
    });
}

function handleDuelStart(duelState) {
    gameState.inDuel = true;
    gameState.duelState = duelState;
    
    gameState.currentZone = null;
    gameState.groundLoot = [];

    Player.resetPlayerCombatState();

    const opponent = duelState.player1.id === Network.socket.id ? duelState.player2 : duelState.player1;
    const opponentCard = {
        name: opponent.name,
        icon: opponent.icon,
        health: opponent.health,
        maxHealth: opponent.maxHealth,
        type: 'enemy',
        isDuelOpponent: true,
        debuffs: opponent.debuffs || []
    };
    gameState.zoneCards = [opponentCard];

    UI.setTabsDisabled(true);
    document.querySelectorAll('.tab-content').forEach(tab => tab.style.display = 'none');
    document.getElementById('adventure-tab').style.display = 'block';
    document.getElementById('main-stats-display').style.display = 'none';
    document.getElementById('adventure-hud').style.display = 'flex';
    document.getElementById('player-action-bar').style.display = 'flex';
    document.getElementById('adventure-log-container').style.display = 'block';

    document.getElementById('adventure-log').innerHTML = '';
    duelState.log.forEach(entry => UI.addToLog(entry.message, entry.type));
    
    UI.renderAdventureScreen();
    UI.updateDisplay();
    UI.renderPlayerActionBars();
}

function handleDuelUpdate(duelState) {
    gameState.duelState = duelState;
    
    const opponent = duelState.player1.id === Network.socket.id ? duelState.player2 : duelState.player1;
    if (gameState.zoneCards[0] && gameState.zoneCards[0].isDuelOpponent) {
        gameState.zoneCards[0].health = opponent.health;
        gameState.zoneCards[0].maxHealth = opponent.maxHealth;
        gameState.zoneCards[0].debuffs = opponent.debuffs || [];
    }
    
    const logContainer = document.getElementById('adventure-log');
    const existingLogCount = logContainer.children.length;
    const newLogEntries = duelState.log.slice(existingLogCount);
    newLogEntries.reverse().forEach(entry => UI.addToLog(entry.message, entry.type));
    
    UI.renderAdventureScreen();
    UI.updateDisplay();
    UI.renderPlayerActionBars();
}

function handleDuelEnd({ outcome, reward }) {
    if (gameState.duelState) {
        gameState.duelState.ended = true;
    }
    
    gameState.inDuel = false; 
    
    if (outcome === 'win') {
        let rewardText = "You are victorious!";
        if (reward && reward.gold) {
            gameState.gold += reward.gold;
            rewardText += ` You won ${reward.gold} gold.`;
        }
        UI.showInfoModal(rewardText);
    } else {
        UI.showInfoModal("You have been defeated!");
    }
    
    UI.renderAdventureScreen();
    UI.renderInventory();
    UI.updateDisplay();
}


// --- CHARACTER MANAGEMENT ---
function loadCharacterFromServer(slotIndex) {
    const characterSlots = JSON.parse(localStorage.getItem('ventureCharacterSlots'));
    const characterData = characterSlots[slotIndex];
    if (characterData) {
        activeSlotIndex = slotIndex;
        Network.emitLoadCharacter(characterData);
        UI.showModal('<h2>Loading character...</h2>');
    } else {
        UI.showInfoModal("Could not find character data in that slot.");
    }
}
function deleteCharacter(slotIndex) {
    const characterSlots = JSON.parse(localStorage.getItem('ventureCharacterSlots') || '[null, null, null]');
    const charToDelete = characterSlots[slotIndex];
    if(!charToDelete) return;

    UI.showConfirmationModal(`Are you sure you want to delete ${charToDelete.characterName}? This is permanent.`, () => {
        characterSlots[slotIndex] = null;
        localStorage.setItem('ventureCharacterSlots', JSON.stringify(characterSlots));
        UI.showCharacterSelectScreen();
        UI.hideModal();
    });
}
function finalizeCharacterCreation(slotIndex) {
    const nameInput = document.getElementById('character-name-input');
    const characterName = nameInput.value.trim();
    const selectedIconEl = document.querySelector('.icon-option.selected');
    const characterIcon = selectedIconEl ? selectedIconEl.dataset.icon : '🧑';
    if (!characterName) {
        UI.showInfoModal("Please enter a name for your character.");
        return;
    }
    const newGameState = getInitialGameState();
    newGameState.characterName = characterName;
    newGameState.characterIcon = characterIcon;
    setGameState(newGameState);
    activeSlotIndex = slotIndex; 
    Network.emitRegisterPlayer(gameState);
    UI.showModal('<h2>Creating character...</h2>');
}

// --- EVENT LISTENERS ---
function addEventListeners() {
    document.body.addEventListener('click', (e) => {
        const target = e.target;
        const button = target.closest('button');

        if (target.closest('.item-action-btn')) {
            const index = parseInt(target.closest('.item-action-btn').dataset.index, 10);
            UI.showItemActions(index);
            return;
        }

        const npcOptionButton = target.closest('#npc-dialogue-options button');
        if (npcOptionButton) {
            const { action, payload } = npcOptionButton.dataset;
            if (action === 'hide') {
                UI.hideModal();
            } else if (action === 'choice') {
                Network.emitPartyAction({
                    type: 'dialogueChoice',
                    payload: JSON.parse(payload)
                });
            }
            return;
        }
        
        const reactionButton = target.closest('#reaction-buttons button');
        if (reactionButton) {
            const reactionType = reactionButton.dataset.reaction;
            Network.emitPartyAction({
                type: 'resolveReaction',
                payload: { reactionType }
            });
            UI.hideModal();
            return;
        }

        const charSelectButton = target.closest('#character-select-grid button');
        if (charSelectButton) {
            const { action, slot } = charSelectButton.dataset;
            const slotIndex = parseInt(slot, 10);
            if (action === 'load') loadCharacterFromServer(slotIndex);
            else if (action === 'create') UI.showNewGameModal(slotIndex);
            else if (action === 'delete') deleteCharacter(slotIndex);
            return;
        }
        
        if (target.closest('#finalize-char-btn')) return finalizeCharacterCreation(parseInt(target.closest('#finalize-char-btn').dataset.slot, 10));
        if (target.closest('#cancel-creation-btn')) return UI.showCharacterSelectScreen();
        if (target.closest('.icon-option')) {
            document.querySelectorAll('.icon-option').forEach(el => el.classList.remove('selected'));
            target.closest('.icon-option').classList.add('selected');
            return;
        }

        if (target.closest('#ground-loot-btn')) {
            UI.showGroundLootModal();
            return;
        }

        // Adventure Controls
        if (target.closest('#backpack-btn')) return UI.showBackpack();
        if (target.closest('#character-sheet-btn')) return UI.showCharacterSheet();
        if (target.closest('#end-turn-btn')) {
            if (gameState.inDuel) return Network.emitDuelAction({ type: 'endTurn' });
            return Combat.endTurn();
        }
        if (target.closest('#return-home-arrow')) return Player.returnToHome();
        if (target.closest('#venture-deeper-arrow')) return ventureDeeper();

        // Zone interactions
        if (target.closest('.zone-card')) {
            const zoneName = target.closest('.zone-card').dataset.zone;
            const startAdventure = () => {
                if (gameState.partyId && !gameState.isPartyLeader) {
                    UI.showInfoModal("Only the party leader can start an adventure.");
                    return;
                }
                Network.emitPartyEnterZone(zoneName);
            };

            if (zoneName === 'arena') {
                if (gameState.gold < 100) {
                    UI.showInfoModal("You don't have enough gold to enter the Arena! (Requires 100G)");
                    return;
                }
                UI.showConfirmationModal("Pay 100G to enter the Arena?", () => {
                    UI.hideModal();
                    startAdventure();
                });
            } else {
                startAdventure();
            }
            return;
        }
        
        if (target.closest('#zone-cards .card')) return Interactions.interactWithCard(parseInt(target.closest('.card').dataset.index, 10));
        
        if (target.closest('[data-action="lootPlayer"]')) {
            const playerCard = target.closest('.card');
            const playerIndex = parseInt(playerCard.dataset.index.substring(1), 10); // "p0" -> 0
            return Interactions.lootPlayer(playerIndex);
        }

        if (target.closest('#party-cards-container .card')) {
            const cardElement = target.closest('.card');
            if (cardElement.classList.contains('is-local-player')) {
                return Interactions.interactWithPlayerCard();
            }
            return Interactions.interactWithCard(cardElement.dataset.index);
        }

        if(button) {
            if (button.id === 'create-party-btn') return Network.emitCreateParty();
            if (button.id === 'join-party-btn') {
                const input = document.getElementById('party-id-input');
                if (input && input.value) Network.emitJoinParty(input.value.trim().toUpperCase());
                return;
            }
            if (button.id === 'leave-party-btn') return Network.emitLeaveParty();
            if (button.id === 'copy-party-id-btn') {
                const partyId = document.querySelector('.party-id-display').textContent;
                navigator.clipboard.writeText(partyId).then(() => UI.showInfoModal('Party ID copied to clipboard!'));
                return;
            }
            if (button.dataset.action === 'invite') return Network.emitSendPartyInvite(button.dataset.id);
            if (button.dataset.action === 'duel') return Network.emitDuelChallenge(button.dataset.id);

            if (button.matches('.tab, [data-tab-target]')) return UI.showTab(button.dataset.tab || button.dataset.tabTarget);
            if (button.matches('#title-selection-container .btn')) {
                gameState.title = button.dataset.title;
                UI.renderTitleSelection();
                UI.renderHeader();
                return;
            }
            if (button.matches('.category-tab')) {
                if (button.closest('#crafting-categories')) {
                    UI.setActiveCraftingCategory(button.dataset.category);
                    UI.renderCrafting();
                } else if (button.closest('#trainer-categories')) {
                    UI.setActiveTrainerCategory(button.dataset.category);
                    UI.renderTrainer();
                }
                return;
            }

            if (button.id === 'info-ok-btn') return UI.hideModal();
            
            if (button.dataset.action === 'takeGroundLoot') {
                const index = parseInt(button.dataset.index, 10);
                Player.takeGroundLoot(index);
                return;
            }

            if (button.dataset.inventoryAction) {
                const index = parseInt(button.dataset.index, 10);
                Player.handleItemAction(button.dataset.inventoryAction, index);
                // Note: The ground loot modal should not close automatically.
                // It will re-render based on the server update.
                if (!button.closest('#ground-loot-modal')) {
                    UI.hideModal();
                }
                return;
            }
            if (button.dataset.spellAction) {
                const index = parseInt(button.dataset.index, 10);
                if (button.dataset.spellAction === 'unequip') Player.unequipSpell(index);
                else if (button.dataset.spellAction === 'equip') Player.equipSpell(index);
                return;
            }
            if (button.dataset.equipmentAction) return Player.unequipItem(button.dataset.slot);
            if (button.dataset.bankAction) {
                const index = parseInt(button.dataset.index, 10);
                if (button.dataset.bankAction === 'deposit') Player.depositItem(index);
                else if (button.dataset.bankAction === 'withdraw') Player.withdrawItem(index);
                return;
            }
            if (button.dataset.equipSlot) {
                Player.equipItem(parseInt(button.dataset.itemIndex), button.dataset.equipSlot);
                UI.hideModal();
                return;
            }

            if (button.dataset.craftIndex) return Merchant.craftItem(parseInt(button.dataset.craftIndex, 10));
            if (button.dataset.spellName) return Merchant.buySpell(button.dataset.spellName);
            if (button.dataset.sellIndex) return Merchant.sellItem(parseInt(button.dataset.sellIndex, 10));
            if (button.dataset.buyItem) {
                const isPermanent = button.dataset.permanent === 'true';
                const identifier = isPermanent ? button.dataset.buyItem : parseInt(button.dataset.buyItem, 10);
                Merchant.buyItem(identifier, isPermanent);
                return;
            }
            
            if (button.closest('#player-action-bar')) {
                const { action, actionData, spellIndex, slot } = button.dataset;
                if (action === 'select') Interactions.selectAction(JSON.parse(actionData));
                else if (action === 'castSelf') Combat.castSpell(parseInt(spellIndex, 10), 'player');
                else if (action === 'useAbility') Combat.useItemAbility(slot);
                return;
            }
        }
    });

    document.body.addEventListener('enter-zone', (e) => {
        Network.emitPartyEnterZone(e.detail.zoneName);
    });

    document.addEventListener('mousemove', (e) => {
        const tooltip = document.getElementById('tooltip');
        tooltip.style.left = e.pageX + 15 + 'px';
        tooltip.style.top = e.pageY + 15 + 'px';
    });
}

async function ventureDeeper() {
    if (gameState.partyId) {
        if (gameState.isPartyLeader) {
            Network.emitPartyAction({ type: 'ventureDeeper' });
        } else {
            UI.showInfoModal("Only the party leader can decide to venture deeper.");
        }
        return;
    }
}

// --- START THE GAME ---
document.addEventListener('DOMContentLoaded', initGame);