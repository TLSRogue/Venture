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
import * as UITrade from './ui/ui-trade.js';
import { ARENA_ENTRY_FEE } from './constants.js';
import {
    preloadAllSounds,
    playSound,
    getMasterVolume,
    setMasterVolume,
    getMusicVolume,
    setMusicVolume,
    getSfxVolume,
    setSfxVolume
} from './audio/sound-manager.js';


// --- STATE VARIABLES ---
let activeSlotIndex = null;
let lootRollInterval = null;
let pvpTurnTimerInterval = null;

// --- INITIALIZATION ---
function initGame() {
    preloadAllSounds(); // Preload all game audio
    initVolumeControls(); // Setup volume control UI
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
        onPartyRequestIntervene: UIAdventure.showInterveneModal,
        onPartyRequestDebuffSelection: UIAdventure.showDebuffSelectionModal,
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
        // Chat Listeners
        onGlobalChatMessage: handleGlobalChatMessage,
        onGlobalChatHistory: handleGlobalChatHistory,
        onZoneChatMessage: handleZoneChatMessage,
        // Trade Listeners
        onTradeReceiveOffer: handleTradeReceiveOffer,
        onTradeStart: handleTradeStart,
        onTradeUpdate: handleTradeUpdate,
        onTradeComplete: handleTradeComplete,
        onTradeError: handleTradeError,
        onTradeEnded: handleTradeEnded,
        onTradeChat: handleTradeChat,
    });
    UIParty.showCharacterSelectScreen();
}

function getEffectsFromLog(logEntries) {
    const effects = [];
    logEntries.forEach(entry => {
        let match;

        // PATTERN 1: Damage with unique ID (e.g., "Dealt 2 damage to Pig [id:12345].")
        // Also matches "Deals 3 Physical damage! [id:123]"
        match = entry.message.match(/[Dd]eal[ts]? (\d+)(?: (.+?))? damage.*\[id:(.+?)\]/i);
        if (match) {
            const amount = match[1];
            const dmgType = match[2] || 'Physical';
            const targetId = match[3].replace(']', '');
            effects.push({ targetId, type: 'damage', text: `-${amount}`, damageType: dmgType });
            playSound('takedamage', 0.5);
            return;
        }

        // PATTERN 2: Enemy hit on player (e.g., "It hits TargetName for 3 damage! [id:xxx]")
        match = entry.message.match(/hits .+? for (\d+)(?: (.+?))? damage.*\[id:(.+?)\]/i);
        if (match) {
            const amount = match[1];
            const dmgType = match[2] || 'Physical';
            const targetId = match[3].replace(']', '');
            effects.push({ targetId, type: 'damage', text: `-${amount}`, damageType: dmgType });
            playSound('takedamage', 0.5);
            return;
        }

        // PATTERN 2b: Weapon attack damage (e.g., "attacks ... Deals 3 Physical damage!")
        match = entry.message.match(/attacks .+ with .+!.*[Dd]eals (\d+) (?:(.+?) )?damage.*\[id:(.+?)\]/);
        if (match) {
            const amount = match[1];
            const dmgType = match[2] || 'Physical';
            const targetId = match[3].replace(']', '');
            effects.push({ targetId, type: 'damage', text: `-${amount}`, damageType: dmgType });
            playSound('takedamage', 0.5);
            return;
        }

        // PATTERN 3a: Punch spell success (play punch sound instead of generic)
        match = entry.message.match(/(.+) casts Punch!/);
        if (match) {
            effects.push({ targetName: match[1], type: 'success', text: 'Hit!' });
            playSound('punch', 0.6);
            return;
        }

        // PATTERN 3b: Buff spell success - show the buff name instead of "Success!"
        match = entry.message.match(/(.+?) gains (.+?)!/);
        if (match) {
            const targetName = match[1];
            const buffName = match[2];
            const idMatch = entry.message.match(/\[id:(.+?)\]/);
            if (idMatch) {
                effects.push({ targetId: idMatch[1], type: 'buff', text: buffName + '!' });
            } else {
                effects.push({ targetName: targetName, type: 'buff', text: buffName + '!' });
            }
            playSound('spell_generic', 0.5);
            return;
        }

        // PATTERN 6: Spell fizzle / Critical Failure
        match = entry.message.match(/(.+?) casts .+!.*(?:Critical Failure|Fizzle)/i);
        if (match) {
            effects.push({ targetName: match[1], type: 'fail', text: 'Fail!' });
            playSound('fail', 0.4);
            return;
        }

        // PATTERN 3c: Attack spell success (shows Hit! for attack spells)
        match = entry.message.match(/(.+) casts (.+)!/);
        if (match) {
            const casterName = match[1];
            const spellName = match[2];
            if (spellName === 'Fireball') {
                playSound('fireball', 0.5);
            } else if (spellName === 'Flamestrike') {
                playSound('flamestrike', 0.5);
            } else {
                playSound('spell_generic', 0.5);
            }
            effects.push({ targetName: casterName, type: 'success', text: 'Hit!' });
            return;
        }

        // PATTERN 4: Weapon attack Hit! (e.g., "PlayerName attacks TargetName with Iron Dagger! Deals...")
        match = entry.message.match(/^(.+?) attacks (.+?) with .+!.*[Dd]eals (\d+)/);
        if (match) {
            effects.push({ targetName: match[1], type: 'success', text: 'Hit!' });
            return;
        }

        // PATTERN 5: Weapon attack Miss! (e.g., "PlayerName attacks TargetName with Iron Dagger! Miss!")
        match = entry.message.match(/^(.+?) attacks .+ with .+!.*Miss!/);
        if (match) {
            effects.push({ targetName: match[1], type: 'fail', text: 'Miss!' });
            playSound('fail', 0.4);
            return;
        }

        // PATTERN 7: Healing
        match = entry.message.match(/Healed (.+?) for (\d+) HP/);
        if (match) {
            effects.push({ targetName: match[1], type: 'heal', text: `+${match[2]}` });
            playSound('heal', 0.5);
            return;
        }

        // PATTERN 8: Debuff application with ID
        match = entry.message.match(/(.+?) is now (\w+)!/);
        if (match) {
            const targetName = match[1];
            const debuffName = match[2].charAt(0).toUpperCase() + match[2].slice(1);
            const idMatch = entry.message.match(/\[id:(.+?)\]/);
            if (idMatch) {
                effects.push({ targetId: idMatch[1], type: 'debuff', text: debuffName + '!' });
            } else {
                effects.push({ targetName: targetName, type: 'debuff', text: debuffName + '!' });
            }
            return;
        }

        // PATTERN 8b: Applies debuff format
        match = entry.message.match(/Applies (\w+)!/);
        if (match) {
            const debuffName = match[1].charAt(0).toUpperCase() + match[1].slice(1);
            const targetMatch = entry.message.match(/to (.+?) \[id:(.+?)\]/);
            if (targetMatch) {
                effects.push({ targetId: targetMatch[2], type: 'debuff', text: debuffName + '!' });
            }
            return;
        }

        // PATTERN 9/10: Block
        match = entry.message.match(/(.+?)'s Block: .+ Blocked/);
        if (match) {
            effects.push({ targetName: match[1], type: 'success', text: 'Blocked!' });
            playSound('block', 0.5);
            return;
        }

        // PATTERN 11/13: Dodge / Parry / Evasive Shot
        match = entry.message.match(/(.+?)'s (?:Dodge|Evasive Shot|Parry): .+ (?:Avoided|Deflected)!/);
        if (match) {
            const actionType = entry.message.includes('Deflected') ? 'Parried!' : 'Dodged!';
            effects.push({ targetName: match[1], type: 'success', text: actionType });
            playSound('dodge', 0.5);
            return;
        }

        // PATTERN 14: Take damage from source (e.g. "Player takes 2 Fire damage from Burn.")
        match = entry.message.match(/(.+?) takes (\d+) (?:(.+?) )?damage from .+/);
        if (match) {
            const targetName = match[1];
            const amount = match[2];
            const dmgType = match[3] || 'Physical';

            // Try to find an ID if available (often not in DoT messages unless updated)
            // But we can match by name usually
            const idMatch = entry.message.match(/\[id:(.+?)\]/);
            if (idMatch) {
                effects.push({ targetId: idMatch[1], type: 'damage', text: `-${amount}`, damageType: dmgType });
            } else {
                effects.push({ targetName: targetName, type: 'damage', text: `-${amount}`, damageType: dmgType });
            }
            playSound('takedamage', 0.5);
            return;
        }

        // PATTERN 11: Quest Accepted
        if (entry.message.includes('accepted Quest:')) {
            playSound('quest_accepted', 0.6);
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
    // Don't close modal if user is in an inventory-type modal during adventure
    // Instead, refresh the modal to show updated data
    // BUGFIX: Check if modal is VISIBLE (not hidden), not just if element exists
    const modal = document.getElementById('modal');
    const isModalVisible = modal && !modal.classList.contains('hidden');
    const groundLootModal = document.getElementById('ground-loot-modal');
    const backpackModal = document.getElementById('backpack-modal');

    if (isModalVisible && groundLootModal) {
        UIAdventure.showGroundLootModal();
    } else if (isModalVisible && backpackModal) {
        UIAdventure.showBackpack();
    } else {
        UIMain.hideModal();
    }
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
    if (serverAdventureState.pvpEncounterState) {
        // ** FIX: Ensure the entire state is updated, including the loading flag **
        Object.assign(gameState, serverAdventureState);
        gameState.pvpEncounter = serverAdventureState.pvpEncounterState;
        gameState.log = serverAdventureState.pvpEncounterState.log;
        gameState.groundLoot = serverAdventureState.pvpEncounterState.groundLoot;
    } else {
        Object.assign(gameState, serverAdventureState);
        gameState.pvpEncounter = null;
    }

    Player.resetPlayerCombatState();

    UIMain.setTabsDisabled(true);
    document.querySelectorAll('.tab-content').forEach(tab => tab.style.display = 'none');
    document.getElementById('adventure-tab').style.display = 'flex';

    // Hide header and tabs during adventure to save screen space
    document.querySelector('.header').style.display = 'none';
    document.querySelector('.tabs').style.display = 'none';

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
    if (serverAdventureState.pvpEncounterState) {
        gameState.pvpEncounter = serverAdventureState.pvpEncounterState;
        gameState.log = serverAdventureState.pvpEncounterState.log;
        gameState.groundLoot = serverAdventureState.pvpEncounterState.groundLoot;
        gameState.pendingReaction = serverAdventureState.pvpEncounterState.pendingReaction;
        // Ensure zone effects (Blizzard etc.) are visible in PVP
        gameState.zoneEffects = serverAdventureState.zoneEffects || [];
        gameState.isPlayerTurn = serverAdventureState.isPlayerTurn;
    } else {
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

    // Cache card positions BEFORE re-render so we can show popups on dying enemies
    const cachedPositions = UIAdventure.cacheCardPositions();

    newLogEntries.forEach(entry => UIMain.addToLog(entry.message, entry.type));

    UIAdventure.renderAdventureScreen();
    UIPlayer.updateDisplay();
    UIAdventure.renderPlayerActionBars();

    if (effectsToPlay.length > 0) {
        UIAdventure.playEffectQueue(effectsToPlay, cachedPositions);
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
    const actionBar = document.getElementById('player-action-bar');
    const pendingReaction = gameState.pvpEncounter ? gameState.pvpEncounter.pendingReaction : gameState.pendingReaction;

    if (pendingReaction && pendingReaction.targetName !== gameState.characterName) {
        banner.textContent = `Waiting for ${pendingReaction.targetName} to react...`;
        banner.style.display = 'block';
        // Disable action bar while waiting for another player's reaction
        if (actionBar) actionBar.classList.add('disabled-during-reaction');
    } else if (gameState.isLoadingNextArea && !gameState.pvpEncounter) {
        // Show banner when waiting in PVP zone queue for other players
        banner.textContent = '⏳ Searching for other adventurers...';
        banner.style.display = 'block';
        if (actionBar) actionBar.classList.remove('disabled-during-reaction');
    } else {
        banner.style.display = 'none';
        if (actionBar) actionBar.classList.remove('disabled-during-reaction');
    }
}

// --- TRADE HANDLERS ---
function handleTradeReceiveOffer({ offererName }) {
    UIMain.showConfirmationModal(`${offererName} wants to trade with you. Accept?`, () => {
        Network.emitTradeAccept(offererName);
        UIMain.hideModal();
    });
}

function handleTradeStart({ tradeId, otherPlayer, isPlayer1 }) {
    const initialTradeState = {
        id: tradeId,
        player1: { name: isPlayer1 ? gameState.characterName : otherPlayer, offer: { gold: 0, items: [] }, locked: false, confirmed: false },
        player2: { name: isPlayer1 ? otherPlayer : gameState.characterName, offer: { gold: 0, items: [] }, locked: false, confirmed: false }
    };
    UITrade.renderTradeModal(initialTradeState, isPlayer1);
}

function handleTradeUpdate(tradeState) {
    const isPlayer1 = tradeState.player1.name === gameState.characterName;
    UITrade.renderTradeModal(tradeState, isPlayer1);
}

function handleTradeComplete(message) {
    UIMain.showInfoModal(message);
    playSound('coins', 0.6);
}

function handleTradeError(message) {
    UIMain.showInfoModal(message);
}

function handleTradeEnded(message) {
    UIMain.showInfoModal(message);
}

function handleTradeChat({ senderName, message }) {
    UITrade.appendChatMessage(senderName, message);
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

    // Show adventure UI (same as adventure start)
    UIMain.setTabsDisabled(true);
    document.querySelectorAll('.tab-content').forEach(tab => tab.style.display = 'none');
    document.getElementById('adventure-tab').style.display = 'flex';
    document.querySelector('.header').style.display = 'none';
    document.querySelector('.tabs').style.display = 'none';
    document.getElementById('main-stats-display').style.display = 'none';
    document.getElementById('adventure-hud').style.display = 'flex';
    document.getElementById('player-action-bar').style.display = 'flex';
    document.getElementById('adventure-log-container').style.display = 'block';

    // Render duel
    UIAdventure.renderAdventureScreen();
    document.getElementById('adventure-log').innerHTML = '';
    duelState.log.forEach(entry => UIMain.addToLog(entry.message, entry.type));
    UIPlayer.updateDisplay();
    UIAdventure.renderPlayerActionBars();
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
    playSound(outcome === 'win' ? 'victory' : 'defeat', 0.6);
    UIMain.showInfoModal(message);
    setTimeout(Player.resetToHomeState, 3000);
}

function handleLootRollStarted(lootData) {
    if (lootRollInterval) clearInterval(lootRollInterval);

    playSound('loot', 0.5); // Play loot sound when item drops

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
    if (!charToDelete) return;

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

// --- VOLUME CONTROLS ---
function initVolumeControls() {
    const masterSlider = document.getElementById('master-volume');
    const musicSlider = document.getElementById('music-volume');
    const sfxSlider = document.getElementById('sfx-volume');

    if (!masterSlider || !musicSlider || !sfxSlider) return;

    // Load saved values
    masterSlider.value = Math.round(getMasterVolume() * 100);
    musicSlider.value = Math.round(getMusicVolume() * 100);
    sfxSlider.value = Math.round(getSfxVolume() * 100);

    // Update displays
    document.getElementById('master-volume-display').textContent = masterSlider.value + '%';
    document.getElementById('music-volume-display').textContent = musicSlider.value + '%';
    document.getElementById('sfx-volume-display').textContent = sfxSlider.value + '%';

    // Add event listeners
    masterSlider.addEventListener('input', (e) => {
        const value = parseInt(e.target.value, 10);
        document.getElementById('master-volume-display').textContent = value + '%';
        setMasterVolume(value / 100);
    });

    musicSlider.addEventListener('input', (e) => {
        const value = parseInt(e.target.value, 10);
        document.getElementById('music-volume-display').textContent = value + '%';
        setMusicVolume(value / 100);
    });

    sfxSlider.addEventListener('input', (e) => {
        const value = parseInt(e.target.value, 10);
        document.getElementById('sfx-volume-display').textContent = value + '%';
        setSfxVolume(value / 100);
        // Play a test sound when adjusting SFX
        playSound('click', 0.5);
    });
}

// --- EVENT LISTENERS ---
function addEventListeners() {
    document.body.addEventListener('click', (e) => {
        const target = e.target;

        // Log tab filtering
        const logTab = target.closest('.log-tab');
        if (logTab) {
            const filter = logTab.dataset.logFilter;
            const log = document.getElementById('adventure-log');

            // Update active tab
            document.querySelectorAll('.log-tab').forEach(t => t.classList.remove('active'));
            logTab.classList.add('active');

            // Apply filter class
            log.classList.remove('filter-combat', 'filter-chat');
            if (filter === 'combat') log.classList.add('filter-combat');
            if (filter === 'chat') log.classList.add('filter-chat');
            return;
        }

        const lootButton = target.closest('#loot-roll-container button[data-choice]');
        if (lootButton) {
            const choice = lootButton.dataset.choice;
            Network.emitPartyAction({ type: 'submitLootRoll', payload: { choice } });
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
            const fromBank = inventoryPanelItem.dataset.fromBank === 'true';
            if (action === 'deposit') return Player.depositItem(index);
            if (action === 'sell') return UITown.showSellConfirmationModal(index, fromBank);
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

        const zoneCard = target.closest('#zone-cards .card');
        if (zoneCard) {
            if (gameState.pvpEncounter) {
                return Interactions.interactWithCard(zoneCard.dataset.playerId);
            }
            return Interactions.interactWithCard(parseInt(zoneCard.dataset.index, 10));
        }

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

        // Handle gem socket selection from modal (before button check since these are divs)
        if (target.closest('[data-gem-socket-action]')) {
            const gemOption = target.closest('[data-gem-socket-action]');
            const gemIndex = parseInt(gemOption.dataset.gemIndex, 10);
            const equipmentSlot = gemOption.dataset.equipmentSlot;
            Player.socketGem(equipmentSlot, gemIndex);
            return UIMain.hideModal();
        }

        const button = target.closest('button');
        if (button) {
            if (button.id === 'ground-loot-btn') return UIAdventure.showGroundLootModal();
            if (button.id === 'consolidate-btn') return Network.emitPlayerAction('consolidateBank');
            if (button.id === 'deposit-all-btn') return Network.emitPlayerAction('depositAll');
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
            if (button.dataset.action === 'trade') return Network.emitTradeOffer(button.dataset.id);
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
            if (button.matches('.subtab-btn')) {
                const subtab = button.dataset.subtab;
                UITown.setActiveCraftingSubtab(subtab);
                UIPlayer.renderAll();
                return;
            }

            if (button.id === 'info-ok-btn') return UIMain.hideModal();
            if (button.id === 'confirm-avatar-change-btn') {
                const selectedIconEl = document.querySelector('.icon-option.selected');
                if (selectedIconEl && selectedIconEl.dataset.icon) {
                    gameState.characterIcon = selectedIconEl.dataset.icon;
                    UIPlayer.renderHeader();
                    Network.emitUpdateCharacter(gameState);
                    UIMain.hideModal();
                }
                return;
            }
            if (button.id === 'end-turn-btn') return gameState.inDuel ? Network.emitDuelAction({ type: 'endTurn' }) : Combat.endTurn();
            if (button.id === 'return-home-arrow') return Player.returnToHome();
            if (button.id === 'surrender-btn') return Network.emitPartyAction({ type: 'surrender' });
            if (button.id === 'venture-deeper-arrow') return ventureDeeper(button);
            if (button.id === 'backpack-btn') return UIAdventure.showBackpack();
            if (button.id === 'quest-log-btn') return UIPlayer.showQuestLogModal();
            if (button.id === 'character-sheet-btn') return UIAdventure.showCharacterSheet();

            if (button.dataset.action === 'takeGroundLoot') return Player.takeGroundLoot(parseInt(button.dataset.index, 10));
            if (button.dataset.action === 'takeAllGroundLoot') return Player.takeAllGroundLoot();

            if (button.dataset.inventoryAction) {
                const action = button.dataset.inventoryAction;
                const index = parseInt(button.dataset.index, 10);

                // Check if this is a targeted consumable
                if (action === 'useConsumable' && gameState.currentZone) {
                    const item = gameState.inventory?.[index];
                    if (item?.targetEnemy) {
                        // Enter targeting mode for this consumable
                        gameState.turnState.selectedAction = {
                            type: 'consumable',
                            index: index,
                            data: item
                        };
                        UIMain.hideModal();
                        UIAdventure.updateActionUI();
                        return;
                    }
                }

                Player.handleItemAction(action, index);
                // Only close modal if NOT inside an inventory-type modal
                if (!button.closest('#ground-loot-modal') && !button.closest('#backpack-modal')) UIMain.hideModal();
                return;
            }
            if (button.dataset.spellAction) {
                const index = parseInt(button.dataset.index, 10);
                if (button.dataset.spellAction === 'unequip') return Player.unequipSpell(index);
                if (button.dataset.spellAction === 'equip') return Player.equipSpell(index);
            }
            if (button.dataset.equipmentAction) {
                const action = button.dataset.equipmentAction;
                const slot = button.dataset.slot;
                if (action === 'unequip') return Player.unequipItem(slot);
                if (action === 'socketGem') return UIPlayer.showGemSocketModal(slot);
                if (action === 'unsocketGem') return Player.unsocketGem(slot);
            }
            if (button.dataset.equipSlot) {
                Player.equipItem(parseInt(button.dataset.itemIndex), button.dataset.equipSlot);
                return UIMain.hideModal();
            }

            if (button.dataset.craftIndex) return UITown.showCraftingModal(parseInt(button.dataset.craftIndex, 10));

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

    window.addEventListener('keydown', (e) => {
        if (e.altKey) {
            document.body.classList.add('show-spell-details');
        }
    });

    window.addEventListener('keyup', (e) => {
        if (!e.altKey) {
            document.body.classList.remove('show-spell-details');
        }
    });

    // Handle case where user switches windows while alt is pressed
    window.addEventListener('blur', () => {
        document.body.classList.remove('show-spell-details');
    });

    document.addEventListener('mousemove', (e) => {
        const tooltip = document.getElementById('tooltip');
        tooltip.style.left = e.pageX + 15 + 'px';
        tooltip.style.top = e.pageY + 15 + 'px';
    });
}

async function ventureDeeper(buttonElement) {
    // BUG FIX: Immediately disable the button on click to prevent race conditions from double-clicks.
    // The server-driven state will take over on the next update.
    if (buttonElement && buttonElement.disabled) return;
    if (buttonElement) buttonElement.disabled = true;

    // Block action during enemy turn
    if (gameState.isPlayerTurn === false) {
        UIMain.showInfoModal("Wait for the enemy turn to complete.");
        if (buttonElement) buttonElement.disabled = false;
        return;
    }

    if (gameState.partyId && gameState.isPartyLeader) {
        Network.emitPartyAction({ type: 'ventureDeeper' });
    }
}

// --- CHAT HANDLERS ---
function handleGlobalChatMessage(chatEntry) {
    appendChatMessage('global-chat-log', chatEntry);
}

function handleGlobalChatHistory(history) {
    const chatLog = document.getElementById('global-chat-log');
    if (!chatLog) return;
    chatLog.innerHTML = '';
    history.forEach(entry => appendChatMessage('global-chat-log', entry));
}

function handleZoneChatMessage(chatEntry) {
    // Add chat message to the adventure log (prepend for column-reverse layout)
    const logContainer = document.getElementById('adventure-log');
    if (!logContainer) return;

    const entry = document.createElement('div');
    entry.className = 'log-entry chat';
    entry.innerHTML = `<strong>${chatEntry.sender}:</strong> ${chatEntry.message}`;
    logContainer.prepend(entry);
}

function appendChatMessage(containerId, chatEntry) {
    const chatLog = document.getElementById(containerId);
    if (!chatLog) return;

    const messageEl = document.createElement('div');
    messageEl.className = 'chat-message';

    const time = new Date(chatEntry.timestamp);
    const timeStr = time.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    messageEl.innerHTML = `<span class="chat-sender">${chatEntry.sender}:</span> ${chatEntry.message} <span class="chat-timestamp">${timeStr}</span>`;
    chatLog.appendChild(messageEl);
    chatLog.scrollTop = chatLog.scrollHeight;
}

function setupChatListeners() {
    // Global Chat
    const globalInput = document.getElementById('global-chat-input');
    const globalSendBtn = document.getElementById('global-chat-send-btn');

    if (globalSendBtn && globalInput) {
        globalSendBtn.addEventListener('click', () => {
            const message = globalInput.value.trim();
            if (message) {
                Network.emitGlobalChatMessage(message);
                globalInput.value = '';
            }
        });

        globalInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                globalSendBtn.click();
            }
        });
    }

    // Zone Chat
    const zoneInput = document.getElementById('zone-chat-input');
    const zoneSendBtn = document.getElementById('zone-chat-send-btn');

    if (zoneSendBtn && zoneInput) {
        zoneSendBtn.addEventListener('click', () => {
            const message = zoneInput.value.trim();
            if (message) {
                Network.emitZoneChatMessage(message);
                zoneInput.value = '';
            }
        });

        zoneInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                zoneSendBtn.click();
            }
        });
    }
}

// --- START THE GAME ---
document.addEventListener('DOMContentLoaded', () => {
    initGame();
    setupChatListeners();
    Network.requestGlobalChatHistory();
});