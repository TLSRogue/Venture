'use strict';

import { gameData } from './data/index.js';
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
import { ARENA_ENTRY_FEE } from './constants.js';


// --- STATE VARIABLES ---
let activeSlotIndex = null;
let lootRollInterval = null;
let pvpTurnTimerInterval = null;

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
        onShowDialogue: UIParty.showNPCDialogueFromServer,
        onHideDialogue: UIMain.hideModal,
        onPartyAdventureEnded: Player.resetToHomeState,
        // Loot Roll Listeners
        onPartyLootRollStarted: handleLootRollStarted,
        onPartyLootRollEnded: handleLootRollEnded,
        // PvP Flee Listener
        onPartyPvpFleeRequest: handlePvpFleeRequest,
        // Duel Listeners
        onDuelReceiveChallenge: handleDuelReceiveChallenge,
        onDuelStart: handleDuelStart,
        onDuelUpdate: handleDuelUpdate,
        onDuelEnd: handleDuelEnd,
    });
    UIParty.showCharacterSelectScreen();
}

function getEffectsFromLog(logEntries) {
    const effects = [];
    logEntries.forEach(entry => {
        let match;

        // PATTERN 1: Damage with unique ID (e.g., "Dealt 2 damage to Pig [id:12345].")
        match = entry.message.match(/Dealt (\d+) damage to (.+?) \[id:(.+?)\]/);
        if (match) {
            effects.push({ targetId: match[3], type: 'damage', text: `-${match[1]}` });
            return;
        }

        // PATTERN 2: Complex player attack with damage and ID (e.g., "... Hit! Dealt 3 Physical damage to Goblin [id:12345].")
        match = entry.message.match(/dealt (\d+).*damage to .* \[id:(.+?)\]/i);
        if (match) {
            effects.push({ targetId: match[2], type: 'damage', text: `-${match[1]}` });
            return;
        }

        // PATTERN 3: Simple spell success
        match = entry.message.match(/(.+) casting .*:.* Success!/);
        if (match) {
            effects.push({ targetName: match[1], type: 'success', text: 'Success!' });
            return;
        }

        // PATTERN 4: Spell fizzle / Critical Failure
        match = entry.message.match(/(.+?) (?:attacks|casting).*(?:Critical Failure|fizzles)!/);
        if (match) {
            effects.push({ targetName: match[1], type: 'fail', text: 'Fail!' });
            return;
        }

        // PATTERN 5: Healing
        match = entry.message.match(/Healed (.+?) for (\d+) HP/);
        if (match) {
            effects.push({ targetName: match[1], type: 'heal', text: `+${match[2]}` });
            return;
        }
    });
    return effects;
}


// --- NETWORK HANDLERS ---
function handleConnect(socketId) {
    console.log('Successfully connected to the server with ID:', socketId);
    if (gameState && gameState.characterName && activeSlotIndex !== null) {
        Network.emitLoadCharacter(gameState);
    }
}

function handleCharacterUpdate(serverState) {
    const wasInParty = gameState.partyId;

    const preservedSession = {
        currentZone: gameState.currentZone,
        inDuel: gameState.inDuel,
        duelState: gameState.duelState,
        zoneCards: gameState.zoneCards,
        partyMemberStates: gameState.partyMemberStates,
        groundLoot: gameState.groundLoot,
        isPartyLeader: gameState.isPartyLeader,
        pvpEncounter: gameState.pvpEncounter,
        pvpEncounterState: gameState.pvpEncounterState
    };

    Object.assign(gameState, serverState);

    if (!gameState.turnState) {
        gameState.turnState = { isPlayerTurn: true, pendingReaction: null, selectedAction: null, isProcessing: false, };
    }

    if (preservedSession.currentZone || preservedSession.inDuel) {
        Object.assign(gameState, preservedSession);
    } else {
        gameState.inDuel = false;
        gameState.duelState = null;
        gameState.currentZone = null;
        gameState.zoneCards = [];
        gameState.groundLoot = [];
        gameState.pvpEncounter = null;
        gameState.pvpEncounterState = null;
    }

    if (activeSlotIndex !== null) {
        const characterSlots = JSON.parse(localStorage.getItem('ventureCharacterSlots') || '[null, null, null]');
        const stateToSave = { ...gameState };
        ['isPartyLeader', 'turnState', 'partyMemberStates', 'zoneCards', 'groundLoot', 'pvpEncounter', 'pvpEncounterState'].forEach(key => delete stateToSave[key]);
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

function handlePartyError(message) { UIMain.showInfoModal(message); }
function handleReceivePartyInvite({ inviterName, partyId }) {
    UIMain.showConfirmationModal(`${inviterName} has invited you to their party. Join?`, () => {
        Network.emitJoinParty(partyId);
        UIMain.hideModal();
    });
}

function handlePartyAdventureStarted(serverAdventureState) {
    // NEW: Handle the initial state, which could be a PvP encounter
    if (serverAdventureState.pvpEncounterState) {
        gameState.pvpEncounter = serverAdventureState.pvpEncounterState;
        gameState.log = serverAdventureState.pvpEncounterState.log;
        gameState.groundLoot = serverAdventureState.pvpEncounterState.groundLoot;
    } else {
        Object.assign(gameState, serverAdventureState);
    }

    Player.resetPlayerCombatState();

    UIMain.setTabsDisabled(true);
    document.querySelectorAll('.tab-content').forEach(tab => tab.style.display = 'none');
    document.getElementById('adventure-tab').style.display = 'flex'; 

    document.getElementById('main-stats-display').style.display = 'none';
    document.getElementById('adventure-hud').style.display = 'flex';
    document.getElementById('player-action-bar').style.display = 'flex';
    document.getElementById('adventure-log-container').style.display = 'block';

    UIAdventure.renderAdventureScreen();
    document.getElementById('adventure-log').innerHTML = '';
    const logSource = gameState.pvpEncounter ? gameState.pvpEncounter.log : serverAdventureState.log;
    logSource.forEach(entry => UIMain.addToLog(entry.message, entry.type));
    UIPlayer.updateDisplay();
    UIAdventure.renderPlayerActionBars();
}

function handlePartyAdventureUpdate(serverAdventureState) {
    // NEW: Check for and assign the unified PvP encounter state
    if (serverAdventureState.pvpEncounterState) {
        gameState.pvpEncounter = serverAdventureState.pvpEncounterState;
        // Ensure top-level state items are also synced from the encounter state
        gameState.log = serverAdventureState.pvpEncounterState.log;
        gameState.groundLoot = serverAdventureState.pvpEncounterState.groundLoot;
        gameState.pendingReaction = serverAdventureState.pvpEncounterState.pendingReaction;
    } else {
        // Fallback for PvE
        Object.assign(gameState, serverAdventureState);
        gameState.pvpEncounter = null; 
    }

    const reactionModalIsOpen = document.getElementById('reaction-buttons');
    const pendingReaction = gameState.pvpEncounter ? gameState.pvpEncounter.pendingReaction : gameState.pendingReaction;
    const isReactionPendingForMe = pendingReaction && pendingReaction.targetName === gameState.characterName;

    if (reactionModalIsOpen && !isReactionPendingForMe) {
        UIMain.hideModal();
    }
    
    const logContainer = document.getElementById('adventure-log');
    const existingLogCount = logContainer.children.length;
    const logSource = gameState.pvpEncounter ? gameState.pvpEncounter.log : serverAdventureState.log;
    const newLogEntries = logSource.slice(existingLogCount);
    const effectsToPlay = getEffectsFromLog(newLogEntries);
    
    newLogEntries.reverse().forEach(entry => UIMain.addToLog(entry.message, entry.type));
    
    UIAdventure.renderAdventureScreen();
    UIPlayer.updateDisplay();
    UIAdventure.renderPlayerActionBars(); 

    if (effectsToPlay.length > 0) {
        UIAdventure.playEffectQueue(effectsToPlay);
    }
    
    updateLootRollUI(gameState.pendingLootRoll);
    updatePvpTurnTimerUI();
    updateWaitingBannerUI();

    if (document.getElementById('ground-loot-modal') && !document.getElementById('ground-loot-modal').closest('.modal-overlay').classList.contains('hidden')) {
        UIAdventure.showGroundLootModal();
    }
}

function updatePvpTurnTimerUI() {
    if (pvpTurnTimerInterval) clearInterval(pvpTurnTimerInterval);
    const timerContainer = document.getElementById('pvp-turn-timer-container');
    const timerText = document.getElementById('pvp-turn-timer-text');

    if (gameState.pvpEncounter && gameState.pvpEncounter.turnTimerEndsAt) {
        timerContainer.style.display = 'block';

        const update = () => {
            const remaining = Math.round((gameState.pvpEncounter.turnTimerEndsAt - Date.now()) / 1000);
            if (remaining > 0) {
                const activeTeam = gameState.pvpEncounter.activeTeam;
                timerText.textContent = `Team ${activeTeam}'s Turn: ${remaining}s`;
                if (remaining <= 10) {
                    timerContainer.classList.add('urgent');
                } else {
                    timerContainer.classList.remove('urgent');
                }
            } else {
                timerText.textContent = `Team ${gameState.pvpEncounter.activeTeam}'s Turn: 0s`;
                clearInterval(pvpTurnTimerInterval);
            }
        };
        update();
        pvpTurnTimerInterval = setInterval(update, 1000);
    } else {
        timerContainer.style.display = 'none';
    }
}

function updateWaitingBannerUI() {
    const banner = document.getElementById('waiting-for-reaction-banner');
    const pendingReaction = gameState.pvpEncounter ? gameState.pvpEncounter.pendingReaction : gameState.pendingReaction;
    if (pendingReaction && pendingReaction.targetName !== gameState.characterName) {
        banner.textContent = `Waiting for ${pendingReaction.targetName} to react...`;
        banner.style.display = 'block';
    } else {
        banner.style.display = 'none';
    }
}

// --- DUEL, LOOT, & PVP HANDLERS ---
function handleDuelReceiveChallenge({ challengerName, challengerId }) {
    UIMain.showConfirmationModal(`${challengerName} has challenged you to a duel! Accept?`, () => {
        Network.emitDuelAccept(challengerId);
        UIMain.hideModal();
    });
}

function handleDuelStart(duelState) {
    Object.assign(gameState, { inDuel: true, duelState, currentZone: null, groundLoot: [] });
    Player.resetPlayerCombatState();
    // ... rest of duel start logic would go here if needed ...
}

function handleDuelUpdate(duelState) {
    const logContainer = document.getElementById('adventure-log');
    const existingLogCount = logContainer.children.length;
    const newLogEntries = duelState.log.slice(existingLogCount);
    const effectsToPlay = getEffectsFromLog(newLogEntries);

    gameState.duelState = duelState;
    // ... rest of duel update logic ...
    
    newLogEntries.reverse().forEach(entry => UIMain.addToLog(entry.message, entry.type));
    
    UIAdventure.renderAdventureScreen();
    UIPlayer.updateDisplay();
    UIAdventure.renderPlayerActionBars();

    if (effectsToPlay.length > 0) {
        UIAdventure.playEffectQueue(effectsToPlay);
    }
}

function handleDuelEnd({ outcome, reward }) {
    if (gameState.duelState) gameState.duelState.ended = true;
    const message = outcome === 'win' ? `You are victorious! You won ${reward?.gold || 0} gold.` : "You have been defeated!";
    UIMain.showInfoModal(message);
    setTimeout(Player.resetToHomeState, 3000);
}

function handleLootRollStarted(lootData) {
    if (lootRollInterval) clearInterval(lootRollInterval);

    const container = document.getElementById('loot-roll-container');
    const itemDisplay = document.getElementById('loot-item-display');
    const timerDisplay = document.getElementById('loot-timer-display');
    
    const rarityColor = { common: '#fff', uncommon: '#2ecc71', rare: '#3498db', quest: '#9b59b6' }[lootData.item.rarity] || '#fff';
    itemDisplay.innerHTML = `<div class="item-icon">${lootData.item.icon || '❓'}</div> <span class="item-name" style="color: ${rarityColor};">[${lootData.item.name}]</span>`;
    
    document.querySelectorAll('#loot-roll-container button').forEach(btn => btn.disabled = false);
    container.classList.remove('hidden');

    lootRollInterval = setInterval(() => {
        const timeRemaining = Math.max(0, Math.round((lootData.endTime - Date.now()) / 1000));
        timerDisplay.textContent = timeRemaining;
        if (timeRemaining <= 0) clearInterval(lootRollInterval);
    }, 1000);

    updateLootRollUI(lootData);
}

function handleLootRollEnded() {
    if (lootRollInterval) clearInterval(lootRollInterval);
    document.getElementById('loot-roll-container').classList.add('hidden');
}

function handlePvpFleeRequest({ fleeingPartyName }) {
    const message = `The opposing party has requested to flee the battle. Do you let them go?`;
    
    const onYes = () => {
        Network.emitPartyAction({ type: 'resolvePvpFlee', payload: { allow: true } });
        UIMain.hideModal();
    };

    const onNo = () => {
        Network.emitPartyAction({ type: 'resolvePvpFlee', payload: { allow: false } });
        UIMain.hideModal();
    };

    UIMain.showDecisionModal(message, onYes, onNo);
}

function updateLootRollUI(lootData) {
    const container = document.getElementById('loot-roll-container');
    if (!lootData) {
        if (!container.classList.contains('hidden')) handleLootRollEnded();
        return;
    }
    
    if (container.classList.contains('hidden')) handleLootRollStarted(lootData);

    const rollList = document.getElementById('loot-roll-list');
    rollList.innerHTML = '';
    lootData.rolls.forEach(roll => {
        const entry = document.createElement('div');
        entry.className = 'loot-roll-entry';
        const choiceClass = `roll-choice-${roll.choice}`;
        entry.innerHTML = `<span class="player-name">${roll.playerName}</span> <span class="roll-value ${choiceClass}">${roll.choice !== 'pass' ? `${roll.roll} (${roll.choice})` : 'Pass'}</span>`;
        rollList.appendChild(entry);

        if (roll.playerName === gameState.characterName) {
            document.querySelectorAll('#loot-roll-container button').forEach(btn => btn.disabled = true);
        }
    });
}


// --- CHARACTER MANAGEMENT ---
function loadCharacterFromServer(slotIndex) {
    const characterSlots = JSON.parse(localStorage.getItem('ventureCharacterSlots'));
    const characterData = characterSlots[slotIndex];
    if (characterData) {
        activeSlotIndex = slotIndex;
        Network.emitLoadCharacter(characterData);
        UIMain.showModal('<h2>Loading character...</h2>');
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
        return UIMain.showInfoModal("Please enter a name for your character.");
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
        
        const lootButton = target.closest('#loot-roll-container button[data-choice]');
        if (lootButton) {
            const choice = lootButton.dataset.choice;
            Network.emitPartyAction({ type: 'submitLootRoll', payload: { choice }});
            document.querySelectorAll('#loot-roll-container button').forEach(btn => btn.disabled = true);
            return;
        }

        if (target.closest('.item-action-btn')) {
            const index = parseInt(target.closest('.item-action-btn').dataset.index, 10);
            return UIPlayer.showItemActions(index);
        }
        if (target.closest('#npc-dialogue-options button')) {
            const { action, payload } = target.closest('#npc-dialogue-options button').dataset;
            if (action === 'hide') return UIMain.hideModal();
            if (action === 'choice') return Network.emitPartyAction({ type: 'dialogueChoice', payload: JSON.parse(payload) });
        }
        if (target.closest('#reaction-buttons button')) {
            const reactionType = target.closest('#reaction-buttons button').dataset.reaction;
            Network.emitPartyAction({ type: 'resolveReaction', payload: { reactionType } });
            return UIMain.hideModal();
        }
        if (target.closest('#character-select-grid button')) {
            const { action, slot } = target.closest('#character-select-grid button').dataset;
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

        const inventoryPanelItem = target.closest('[data-inventory-action]');
        if (inventoryPanelItem) {
            const action = inventoryPanelItem.dataset.inventoryAction;
            const index = parseInt(inventoryPanelItem.dataset.index, 10);
            if (action === 'deposit') return Player.depositItem(index);
            if (action === 'sell') return UITown.showSellConfirmationModal(index);
        }
        if (target.closest('[data-bank-action="withdraw"]')) {
            const index = parseInt(target.closest('[data-bank-action="withdraw"]').dataset.index, 10);
            return Player.withdrawItem(index);
        }
        const buyItem = target.closest('[data-buy-item]');
        if (buyItem && !buyItem.classList.contains('disabled')) {
            const isPermanent = buyItem.dataset.permanent === 'true';
            const identifier = isPermanent ? buyItem.dataset.buyItem : parseInt(buyItem.dataset.buyItem, 10);
            return Merchant.buyItem(identifier, isPermanent);
        }

        if (target.closest('.zone-card')) {
            const zoneName = target.closest('.zone-card').dataset.zone;
            const startAdventure = () => {
                if (gameState.partyId && !gameState.isPartyLeader) {
                    return UIMain.showInfoModal("Only the party leader can start an adventure.");
                }
                Network.emitPartyEnterZone(zoneName);
            };

            if (zoneName === 'arena') {
                if (gameState.gold < ARENA_ENTRY_FEE) return UIMain.showInfoModal(`You don't have enough gold to enter the Arena! (Requires ${ARENA_ENTRY_FEE}G)`);
                UIMain.showConfirmationModal(`Pay ${ARENA_ENTRY_FEE}G to enter the Arena?`, () => {
                    UIMain.hideModal();
                    startAdventure();
                });
            } else if (zoneName === 'blighted_wastes') {
                const warningMessage = "You are about to enter The Blighted Wastes, a lawless PvP zone. If you are defeated by another player, you will lose ALL items in your inventory and everything you have equipped. Are you sure you wish to enter?";
                UIMain.showConfirmationModal(warningMessage, () => {
                    UIMain.hideModal();
                    startAdventure();
                });
            } else {
                startAdventure();
            }
            return;
        }

        // --- MODIFIED: Handle PvP targeting ---
        const zoneCard = target.closest('#zone-cards .card');
        if (zoneCard) {
            if (gameState.pvpEncounter) {
                // In PvP, the target is identified by playerId
                return Interactions.interactWithCard(zoneCard.dataset.playerId);
            }
            // In PvE, the target is identified by its index
            return Interactions.interactWithCard(parseInt(zoneCard.dataset.index, 10));
        }
        // --- End of Modification ---

        if (target.closest('[data-action="lootPlayer"]')) {
            const playerIndex = parseInt(target.closest('.card').dataset.index.substring(1), 10);
            return Interactions.lootPlayer(playerIndex);
        }
        if (target.closest('#party-cards-container .card')) {
            const cardElement = target.closest('.card');
            if (cardElement.classList.contains('is-local-player')) return Interactions.interactWithPlayerCard();
            
            const targetIdentifier = gameState.pvpEncounter ? cardElement.dataset.playerId : cardElement.dataset.index;
            return Interactions.interactWithCard(targetIdentifier);
        }

        const button = target.closest('button');
        if(button) {
            if (button.id === 'ground-loot-btn') return UIAdventure.showGroundLootModal();
            if (button.id === 'consolidate-btn') return Network.emitPlayerAction('consolidateBank');
            if (button.id === 'create-party-btn') return Network.emitCreateParty();
            if (button.id === 'join-party-btn') {
                const input = document.getElementById('party-id-input');
                if (input && input.value) Network.emitJoinParty(input.value.trim().toUpperCase());
                return;
            }
            if (button.id === 'leave-party-btn') return Network.emitLeaveParty();
            if (button.id === 'copy-party-id-btn') {
                navigator.clipboard.writeText(document.querySelector('.party-id-display').textContent).then(() => UIMain.showInfoModal('Party ID copied to clipboard!'));
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
                const category = button.dataset.category;
                if (button.closest('#crafting-categories')) UITown.setActiveCraftingCategory(category);
                else if (button.closest('#trainer-categories')) UITown.setActiveTrainerCategory(category);
                UIPlayer.renderAll();
                return;
            }

            if (button.id === 'info-ok-btn') return UIMain.hideModal();
            if (button.id === 'end-turn-btn') return gameState.inDuel ? Network.emitDuelAction({ type: 'endTurn' }) : Combat.endTurn();
            if (button.id === 'return-home-arrow') return Player.returnToHome();
            if (button.id === 'venture-deeper-arrow') return ventureDeeper();
            if (button.id === 'backpack-btn') return UIAdventure.showBackpack();
            if (button.id === 'character-sheet-btn') return UIAdventure.showCharacterSheet();
            
            if (button.dataset.action === 'takeGroundLoot') return Player.takeGroundLoot(parseInt(button.dataset.index, 10));

            if (button.dataset.inventoryAction) {
                Player.handleItemAction(button.dataset.inventoryAction, parseInt(button.dataset.index, 10));
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
    if (gameState.partyId && gameState.isPartyLeader) {
        Network.emitPartyAction({ type: 'ventureDeeper' });
    }
}

// --- START THE GAME ---
document.addEventListener('DOMContentLoaded', initGame);