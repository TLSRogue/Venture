'use strict';

import { gameData } from './game-data.js';
import { gameState, setGameState, getInitialGameState } from './state.js';
import * as Network from './network.js';
import * as Combat from './combat.js';
import * as Interactions from './interactions.js';
import * as Player from './player.js';
import * as Merchant from './merchant.js';
import * as UIMain from './ui/ui-main.js';
import * as UIAdventure from './ui/ui-adventure.js';
import * as UIParty from './ui/ui-party.js';
import * as UIPlayer from './ui/ui-player.js';
import * as UITown from './ui/ui-town.js';


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
        onOnlinePlayersUpdate: UIParty.renderOnlinePlayers,
        onPartyError: handlePartyError,
        onReceivePartyInvite: handleReceivePartyInvite,
        onPartyAdventureStarted: handlePartyAdventureStarted,
        onPartyAdventureUpdate: handlePartyAdventureUpdate,
        onPartyRequestReaction: UIAdventure.showReactionModal,
        onPartyReceiveMessage: handlePartyReceiveMessage,
        onShowDialogue: UIParty.showNPCDialogueFromServer,
        onHideDialogue: UIMain.hideModal,
        onPartyAdventureEnded: Player.resetToHomeState,
        onDiceRoll: handleDiceRoll,
        onDuelReceiveChallenge: handleDuelReceiveChallenge,
        onDuelStart: handleDuelStart,
        onDuelUpdate: handleDuelUpdate,
        onDuelEnd: handleDuelEnd,
    });
    UIParty.showCharacterSelectScreen();
}

function handleDiceRoll(data) {
    const container = document.getElementById('dice-roll-container');
    const diceEl = document.getElementById('dice');
    const detailsEl = document.getElementById('dice-roll-details');

    diceEl.textContent = data.roll;
    detailsEl.innerHTML = `
        <p>${data.rollerName} ${data.actionName}</p>
        <p><strong>Total: ${data.total}</strong> (vs Target: ${data.hitTarget}+)</p>
    `;

    container.classList.remove('hidden');
    
    if (data.roll === 20) {
        diceEl.style.color = 'var(--accent-color)';
    } else if (data.roll === 1) {
        diceEl.style.color = 'var(--danger-color)';
    } else if (data.total >= data.hitTarget) {
        diceEl.style.color = 'var(--success-color)';
    } else {
        diceEl.style.color = 'var(--text-color)';
    }

    setTimeout(() => {
        container.classList.add('hidden');
    }, 1800);
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
        groundLoot: gameState.groundLoot,
        isPartyLeader: gameState.isPartyLeader,
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
        gameState.isPartyLeader = preservedSession.isPartyLeader;
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
    UIMain.hideModal();
    UIPlayer.renderAll();
    
    if (wasInParty && !gameState.partyId) {
        UIParty.renderPartyManagement(null);
    }
}


function handleLoadError(message) {
    UIMain.showInfoModal(message);
    setTimeout(UIParty.showCharacterSelectScreen, 1000);
}

function handlePartyUpdate(party) {
    if (gameState && gameState.characterName) {
       gameState.partyId = party ? party.partyId : null;
       gameState.partyMembers = party ? party.members : [];
       gameState.isPartyLeader = party ? party.isPartyLeader : false;
    }
    UIParty.renderPartyManagement(party);
}

function handlePartyError(message) {
    UIMain.showInfoModal(message);
}
function handleReceivePartyInvite({ inviterName, partyId }) {
    UIMain.showConfirmationModal(`${inviterName} has invited you to their party. Join?`, () => {
        Network.emitJoinParty(partyId);
        UIMain.hideModal();
    });
}
function handlePartyAdventureStarted(serverAdventureState) {
    console.log("Party adventure started!", serverAdventureState);
    gameState.currentZone = serverAdventureState.currentZone;
    gameState.zoneCards = serverAdventureState.zoneCards;
    gameState.partyMemberStates = serverAdventureState.partyMemberStates;
    gameState.groundLoot = serverAdventureState.groundLoot;

    Player.resetPlayerCombatState();

    UIMain.setTabsDisabled(true);
    document.querySelectorAll('.tab-content').forEach(tab => tab.style.display = 'none');
    document.getElementById('adventure-tab').style.display = 'flex'; 
    document.getElementById('main-stats-display').style.display = 'none';
    document.getElementById('adventure-hud').style.display = 'flex';
    document.getElementById('player-action-bar').style.display = 'flex';
    document.getElementById('adventure-log-container').style.display = 'block';
    document.getElementById('chat-form').style.display = 'block';

    // --- BUG FIX: Move chat listener here ---
    // This ensures the listener is only added once the chat form is visible.
    document.getElementById('chat-form').addEventListener('submit', (e) => {
        e.preventDefault();
        const input = document.getElementById('chat-input');
        const message = input.value.trim();
        if (message) {
            Network.emitPartySendMessage(message);
            input.value = '';
        }
    });

    UIAdventure.renderAdventureScreen();
    document.getElementById('adventure-log').innerHTML = '';
    serverAdventureState.log.forEach(entry => UIMain.addToLog(entry.message, entry.type));
    UIPlayer.updateDisplay();
    UIAdventure.renderPlayerActionBars();
}

function handlePartyAdventureUpdate(serverAdventureState) {
    const reactionModalIsOpen = document.getElementById('reaction-buttons');

    const isReactionPendingForMe = serverAdventureState.pendingReaction &&
                                   serverAdventureState.pendingReaction.targetName === gameState.characterName;

    if (reactionModalIsOpen && !isReactionPendingForMe) {
        UIMain.hideModal();
    }

    gameState.zoneCards = serverAdventureState.zoneCards;
    gameState.partyMemberStates = serverAdventureState.partyMemberStates;
    gameState.groundLoot = serverAdventureState.groundLoot;
    
    const logContainer = document.getElementById('adventure-log');
    const existingLogCount = logContainer.children.length;
    const newLogEntries = serverAdventureState.log.slice(existingLogCount);
    newLogEntries.reverse().forEach(entry => UIMain.addToLog(entry.message, entry.type));
    
    UIAdventure.renderAdventureScreen();
    UIPlayer.updateDisplay();
    UIAdventure.renderPlayerActionBars(); 

    const groundLootModal = document.getElementById('ground-loot-modal');
    if (groundLootModal && !groundLootModal.closest('.modal-overlay').classList.contains('hidden')) {
        UIAdventure.showGroundLootModal();
    }
}

function handlePartyReceiveMessage({ senderName, message }) {
    UIMain.addToLog(`[${senderName}]: ${message}`, 'chat');
}


// --- DUEL HANDLERS ---
function handleDuelReceiveChallenge({ challengerName, challengerId }) {
    UIMain.showConfirmationModal(`${challengerName} has challenged you to a duel! Accept?`, () => {
        Network.emitDuelAccept(challengerId);
        UIMain.hideModal();
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

    UIMain.setTabsDisabled(true);
    document.querySelectorAll('.tab-content').forEach(tab => tab.style.display = 'none');
    document.getElementById('adventure-tab').style.display = 'flex';
    document.getElementById('main-stats-display').style.display = 'none';
    document.getElementById('adventure-hud').style.display = 'flex';
    document.getElementById('player-action-bar').style.display = 'flex';
    document.getElementById('adventure-log-container').style.display = 'block';
    document.getElementById('chat-form').style.display = 'block';

    document.getElementById('adventure-log').innerHTML = '';
    duelState.log.forEach(entry => UIMain.addToLog(entry.message, entry.type));
    
    UIAdventure.renderAdventureScreen();
    UIPlayer.updateDisplay();
    UIAdventure.renderPlayerActionBars();
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
    newLogEntries.reverse().forEach(entry => UIMain.addToLog(entry.message, entry.type));
    
    UIAdventure.renderAdventureScreen();
    UIPlayer.updateDisplay();
    UIAdventure.renderPlayerActionBars();
}

function handleDuelEnd({ outcome, reward }) {
    if (gameState.duelState) {
        gameState.duelState.ended = true;
    }
    
    if (outcome === 'win') {
        let rewardText = "You are victorious!";
        if (reward && reward.gold) {
            rewardText += ` You won ${reward.gold} gold.`;
        }
        UIMain.showInfoModal(rewardText);
    } else {
        UIMain.showInfoModal("You have been defeated!");
    }
    
    setTimeout(Player.resetToHomeState, 3000);
}


// --- CHARACTER MANAGEMENT ---
function loadCharacterFromServer(slotIndex) {
    const characterSlots = JSON.parse(localStorage.getItem('ventureCharacterSlots'));
    const characterData = characterSlots[slotIndex];
    if (characterData) {
        activeSlotIndex = slotIndex;
        Network.emitLoadCharacter(characterData);
        UIMain.showModal('<h2>Loading character...</h2>');
    } else {
        UIMain.showInfoModal("Could not find character data in that slot.");
    }
}
function deleteCharacter(slotIndex) {
    const characterSlots = JSON.parse(localStorage.getItem('ventureCharacterSlots') || '[null, null, null]');
    const charToDelete = characterSlots[slotIndex];
    if(!charToDelete) return;

    UIMain.showConfirmationModal(`Are you sure you want to delete ${charToDelete.characterName}? This is permanent.`, () => {
        characterSlots[slotIndex] = null;
        localStorage.setItem('ventureCharacterSlots', JSON.stringify(characterSlots));
        UIParty.showCharacterSelectScreen();
        UIMain.hideModal();
    });
}
function finalizeCharacterCreation(slotIndex) {
    const nameInput = document.getElementById('character-name-input');
    const characterName = nameInput.value.trim();
    const selectedIconEl = document.querySelector('.icon-option.selected');
    const characterIcon = selectedIconEl ? selectedIconEl.dataset.icon : '🧑';
    if (!characterName) {
        UIMain.showInfoModal("Please enter a name for your character.");
        return;
    }
    const newGameState = getInitialGameState();
    newGameState.characterName = characterName;
    newGameState.characterIcon = characterIcon;
    setGameState(newGameState);
    activeSlotIndex = slotIndex; 
    Network.emitRegisterPlayer(gameState);
    UIMain.showModal('<h2>Creating character...</h2>');
}

// --- EVENT LISTENERS ---
function addEventListeners() {
    document.body.addEventListener('click', (e) => {
        const target = e.target;
        
        // Modal and Character Select Buttons
        if (target.closest('.item-action-btn')) {
            const index = parseInt(target.closest('.item-action-btn').dataset.index, 10);
            return UIPlayer.showItemActions(index);
        }
        const npcOptionButton = target.closest('#npc-dialogue-options button');
        if (npcOptionButton) {
            const { action, payload } = npcOptionButton.dataset;
            if (action === 'hide') return UIMain.hideModal();
            if (action === 'choice') return Network.emitPartyAction({ type: 'dialogueChoice', payload: JSON.parse(payload) });
        }
        const reactionButton = target.closest('#reaction-buttons button');
        if (reactionButton) {
            const reactionType = reactionButton.dataset.reaction;
            Network.emitPartyAction({ type: 'resolveReaction', payload: { reactionType } });
            return UIMain.hideModal();
        }
        const charSelectButton = target.closest('#character-select-grid button');
        if (charSelectButton) {
            const { action, slot } = charSelectButton.dataset;
            const slotIndex = parseInt(slot, 10);
            if (action === 'load') return loadCharacterFromServer(slotIndex);
            if (action === 'create') return UIParty.showNewGameModal(slotIndex);
            if (action === 'delete') return deleteCharacter(slotIndex);
        }
        if (target.closest('#finalize-char-btn')) return finalizeCharacterCreation(parseInt(target.closest('#finalize-char-btn').dataset.slot, 10));
        if (target.closest('#cancel-creation-btn')) return UIParty.showCharacterSelectScreen();
        if (target.closest('.icon-option')) {
            document.querySelectorAll('.icon-option').forEach(el => el.classList.remove('selected'));
            target.closest('.icon-option').classList.add('selected');
            return;
        }

        // --- NEW UI INTERACTIONS for BANK and MERCHANT ---
        const inventoryPanelItem = target.closest('[data-inventory-action]');
        if (inventoryPanelItem) {
            const action = inventoryPanelItem.dataset.inventoryAction;
            const index = parseInt(inventoryPanelItem.dataset.index, 10);
            if (action === 'deposit') return Player.depositItem(index);
            if (action === 'sell') return UITown.showSellConfirmationModal(index);
        }
        const bankItem = target.closest('[data-bank-action="withdraw"]');
        if (bankItem) {
            const index = parseInt(bankItem.dataset.index, 10);
            return Player.withdrawItem(index);
        }
        const buyItem = target.closest('[data-buy-item]');
        if (buyItem && !buyItem.classList.contains('disabled')) {
            const isPermanent = buyItem.dataset.permanent === 'true';
            const identifier = isPermanent ? buyItem.dataset.buyItem : parseInt(buyItem.dataset.buyItem, 10);
            return Merchant.buyItem(identifier, isPermanent);
        }

        // Adventure and Zone Interactions
        if (target.closest('#ground-loot-btn')) return UIAdventure.showGroundLootModal();
        if (target.closest('#backpack-btn')) return UIAdventure.showBackpack();
        if (target.closest('#character-sheet-btn')) return UIAdventure.showCharacterSheet();
        if (target.closest('#end-turn-btn')) {
            if (gameState.inDuel) return Network.emitDuelAction({ type: 'endTurn' });
            return Combat.endTurn();
        }
        if (target.closest('#return-home-arrow')) return Player.returnToHome();
        if (target.closest('#venture-deeper-arrow')) return ventureDeeper();
        if (target.closest('.zone-card')) {
            const zoneName = target.closest('.zone-card').dataset.zone;
            const startAdventure = () => {
                if (gameState.partyId && !gameState.isPartyLeader) {
                    UIMain.showInfoModal("Only the party leader can start an adventure.");
                    return;
                }
                Network.emitPartyEnterZone(zoneName);
            };
            if (zoneName === 'arena') {
                if (gameState.gold < 100) return UIMain.showInfoModal("You don't have enough gold to enter the Arena! (Requires 100G)");
                UIMain.showConfirmationModal("Pay 100G to enter the Arena?", () => {
                    UIMain.hideModal();
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
            const playerIndex = parseInt(playerCard.dataset.index.substring(1), 10);
            return Interactions.lootPlayer(playerIndex);
        }
        if (target.closest('#party-cards-container .card')) {
            const cardElement = target.closest('.card');
            if (cardElement.classList.contains('is-local-player')) return Interactions.interactWithPlayerCard();
            return Interactions.interactWithCard(cardElement.dataset.index);
        }

        // General Button Handlers
        const button = target.closest('button');
        if(button) {
            if (button.id === 'consolidate-btn') return Network.emitPlayerAction('consolidateBank');
            if (button.id === 'create-party-btn') return Network.emitCreateParty();
            if (button.id === 'join-party-btn') {
                const input = document.getElementById('party-id-input');
                if (input && input.value) Network.emitJoinParty(input.value.trim().toUpperCase());
                return;
            }
            if (button.id === 'leave-party-btn') return Network.emitLeaveParty();
            if (button.id === 'copy-party-id-btn') {
                const partyId = document.querySelector('.party-id-display').textContent;
                navigator.clipboard.writeText(partyId).then(() => UIMain.showInfoModal('Party ID copied to clipboard!'));
                return;
            }
            if (button.dataset.action === 'invite') return Network.emitSendPartyInvite(button.dataset.id);
            if (button.dataset.action === 'duel') return Network.emitDuelChallenge(button.dataset.id);

            if (button.matches('.tab, [data-tab-target]')) return UIPlayer.showTab(button.dataset.tab || button.dataset.tabTarget);
            if (button.matches('#title-selection-container .btn')) {
                gameState.title = button.dataset.title;
                UIPlayer.renderTitleSelection();
                UIPlayer.renderHeader();
                Network.emitUpdateCharacter(gameState);
                return;
            }
            if (button.matches('.category-tab')) {
                if (button.closest('#crafting-categories')) UITown.setActiveCraftingCategory(button.dataset.category);
                else if (button.closest('#trainer-categories')) UITown.setActiveTrainerCategory(button.dataset.category);
                UIPlayer.renderAll(); // Re-render the active tab
                return;
            }

            if (button.id === 'info-ok-btn') return UIMain.hideModal();
            
            if (button.dataset.action === 'takeGroundLoot') return Player.takeGroundLoot(parseInt(button.dataset.index, 10));

            if (button.dataset.inventoryAction) {
                const index = parseInt(button.dataset.index, 10);
                Player.handleItemAction(button.dataset.inventoryAction, index);
                if (!button.closest('#ground-loot-modal')) UIMain.hideModal();
                return;
            }
            if (button.dataset.spellAction) {
                const index = parseInt(button.dataset.index, 10);
                if (button.dataset.spellAction === 'unequip') return Player.unequipSpell(index);
                if (button.dataset.spellAction === 'equip') return Player.equipSpell(index);
            }
            if (button.dataset.equipmentAction) return Player.unequipItem(button.dataset.slot);
            if (button.dataset.equipSlot) {
                Player.equipItem(parseInt(button.dataset.itemIndex), button.dataset.equipSlot);
                return UIMain.hideModal();
            }

            if (button.dataset.craftIndex) return UITown.showCraftingModal(parseInt(button.dataset.craftIndex, 10));
            if (button.dataset.spellName) return Merchant.buySpell(button.dataset.spellName);
            
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
            UIMain.showInfoModal("Only the party leader can decide to venture deeper.");
        }
        return;
    }
}

// --- START THE GAME ---
document.addEventListener('DOMContentLoaded', initGame);