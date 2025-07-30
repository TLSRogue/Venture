'use strict';

import { gameState } from './state.js';
import * as UI from './ui.js';
import * as Interactions from './interactions.js';
import * as Network from './network.js';

/**
 * @file combat.js
 * This module is now responsible for sending player combat intents to the server.
 * All game logic and state manipulation has been removed from the client.
 */

export function endTurn() {
    if (gameState.inDuel) {
        Network.emitDuelAction({ type: 'endTurn' });
    } else if (gameState.partyId) {
        // This now handles both solo and party adventures, as both have a partyId
        Network.emitPartyAction({ type: 'endTurn' });
        document.getElementById('end-turn-btn').disabled = true; // Disable locally until server update
        UI.addToLog("You have ended your turn.", "info");
    }
    Interactions.clearSelection();
}

export function castSpell(spellIndex, targetIndex) {
    if (gameState.inDuel) {
        Network.emitDuelAction({
            type: 'castSpell',
            payload: { spellIndex, targetIndex }
        });
    } else if (gameState.partyId) {
        Network.emitPartyAction({
            type: 'castSpell',
            payload: { spellIndex, targetIndex }
        });
    }
    Interactions.clearSelection();
}

export function weaponAttack(targetIndex) {
    const selectedAction = gameState.turnState.selectedAction;
    if (!selectedAction || selectedAction.type !== 'weapon') {
        return;
    }

    if (gameState.inDuel) {
        Network.emitDuelAction({
            type: 'weaponAttack',
            payload: { weaponSlot: selectedAction.slot, targetIndex: 'opponent' }
        });
    } else if (gameState.partyId) {
        Network.emitPartyAction({
            type: 'weaponAttack',
            payload: { weaponSlot: selectedAction.slot, targetIndex }
        });
    }
    Interactions.clearSelection();
}

export function useItemAbility(slot) {
    const item = gameState.equipment[slot];
    if (!item || !item.activatedAbility) return;

    if (gameState.inDuel) {
        Network.emitDuelAction({
            type: 'useItemAbility',
            payload: { slot }
        });
    } else if (gameState.partyId) {
        Network.emitPartyAction({
            type: 'useItemAbility',
            payload: { slot }
        });
    }
    Interactions.clearSelection();
}

// NOTE: All solo-play logic functions that were here previously have been removed.
// This includes:
// - runEnemyPhase()
// - startPlayerTurn()
// - checkEndOfPlayerTurn()
// - processEnemyAction()
// - awaitPlayerReaction()
// - resolveReaction()
// - defeatEnemy()
// The server is now exclusively responsible for all of this logic.