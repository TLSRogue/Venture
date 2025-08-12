'use strict';

import { gameState } from './state.js';
import * as Combat from './combat.js';
import * as Network from './network.js';
import * as UIMain from './ui/ui-main.js';
import * as UIAdventure from './ui/ui-adventure.js';

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

export function interactWithCard(targetIdentifier) {
    const selectedAction = gameState.turnState.selectedAction;

    // Handle targeting allies for spells
    if (targetIdentifier.toString().startsWith('p')) {
        if (selectedAction && selectedAction.type === 'spell') {
            const spell = selectedAction.data;
            if (spell.type === 'heal' || spell.type === 'buff' || spell.type === 'versatile') {
                Combat.castSpell(selectedAction.index, targetIdentifier);
            }
        }
        clearSelection();
        return;
    }

    // If an action is selected, it's a targeted combat action
    if (selectedAction) {
        // In both PvE and PvP, the card has been identified. We just need to send the identifier.
        // The server knows whether the identifier is an index (PvE) or a playerId (PvP).
        if (selectedAction.type === 'spell') {
            Combat.castSpell(selectedAction.index, targetIdentifier);
        } else if (selectedAction.type === 'weapon') {
            Combat.weaponAttack(targetIdentifier);
        }
        return;
    }
    
    // If no action is selected, this is a generic PvE interaction (e.g., talk, open, harvest)
    if (gameState.partyId) {
        Network.emitPartyAction({
            type: 'interactWithCard',
            payload: { cardIndex: targetIdentifier } // Server expects `cardIndex` for this type
        });
    }
}

export function interactWithPlayerCard() {
    let localPlayerTargetIndex = 'player'; 
    if (gameState.pvpEncounter) {
        localPlayerTargetIndex = socket.id;
    } else if (gameState.partyId && gameState.partyMemberStates) {
        const localPlayerIndex = gameState.partyMemberStates.findIndex(p => p.playerId === socket.id);
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
            UIMain.addToLog("You can't use that on yourself.", "info");
        }
    }
    clearSelection();
}

export function selectAction(action) {
    if (gameState.turnState.selectedAction && gameState.turnState.selectedAction.data.name === action.data.name && gameState.turnState.selectedAction.slot === action.slot) {
        clearSelection();
        return;
    }
    gameState.turnState.selectedAction = action;
    UIAdventure.updateActionUI();
}

export function clearSelection() {
    gameState.turnState.selectedAction = null;
    UIAdventure.updateActionUI();
}