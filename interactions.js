'use strict';

import { gameState } from './state.js';
import * as UI from './ui.js';
import * as Combat from './combat.js';
import * as Network from './network.js';

/**
 * @file interactions.js
 * This module handles user interactions with game elements (cards, UI buttons)
 * and translates them into network events to be sent to the server.
 */

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
    // Handle targeting other players in a party for spells
    if (cardIndex.toString().startsWith('p')) {
        const selectedAction = gameState.turnState.selectedAction;
        if (selectedAction && selectedAction.type === 'spell') {
            const spell = selectedAction.data;
            if (spell.type === 'heal' || spell.type === 'buff' || spell.type === 'versatile') {
                Combat.castSpell(selectedAction.index, cardIndex);
            }
        }
        clearSelection();
        return;
    }
    
    const card = gameState.zoneCards[cardIndex];
    if (!card) return;

    const selectedAction = gameState.turnState.selectedAction;

    if (selectedAction) {
        // A player has selected an action (like a weapon or spell) and is now clicking a target
        if (card.type === 'enemy' || card.type === 'player') {
            if (selectedAction.type === 'spell') {
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
    
    // If no action is selected, this is a generic interaction (e.g., talk, open, harvest)
    // We just need to tell the server what card was clicked.
    // This now works for BOTH solo and party play.
    if (gameState.partyId) {
        Network.emitPartyAction({
            type: 'interactWithCard',
            payload: { cardIndex }
        });
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
    if (selectedAction && selectedAction.type === 'spell') {
        const spell = selectedAction.data;
        if (spell.type === 'heal' || spell.type === 'buff' || spell.type === 'versatile') {
            Combat.castSpell(selectedAction.index, localPlayerTargetIndex);
        } else {
            UI.addToLog("You can't use that on yourself.", "info");
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

// NOTE: All solo-play logic functions that were here previously have been removed.
// This includes:
// - talkToNPC()
// - acceptQuestById()
// - completeQuest()
// - openTreasureChest()
// - showHarvestOptions()
// - harvestResource()
// - handleMuggerInteraction()
// The server is now exclusively responsible for all of this logic.