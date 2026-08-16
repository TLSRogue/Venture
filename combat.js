'use strict';

import { gameState } from './state.js';
import * as Network from './network.js';
import * as UIMain from './ui/ui-main.js';
import * as UIAdventure from './ui/ui-adventure.js';

/**
 * @file combat.js
 * This module is now responsible for sending player combat intents to the server.
 * All game logic and state manipulation has been removed from the client.
 */

export function clearSelection() {
  gameState.turnState.selectedAction = null;
  UIAdventure.updateActionUI();
}

export function endTurn() {
  if (gameState.inDuel) {
    Network.emitDuelAction({ type: 'endTurn' });
  } else if (gameState.partyId) {
    // This now handles both solo and party adventures, as both have a partyId
    Network.emitPartyAction({ type: 'endTurn' });
    document.getElementById('end-turn-btn').disabled = true; // Disable locally until server update
    UIMain.addToLog('You have ended your turn.', 'info');
  }
  clearSelection();
}

export function castSpell(spellIndex, targetIndex) {
  if (gameState.inDuel) {
    Network.emitDuelAction({
      type: 'castSpell',
      payload: { spellIndex, targetIndex },
    });
  } else if (gameState.partyId) {
    Network.emitPartyAction({
      type: 'castSpell',
      payload: { spellIndex, targetIndex },
    });
  }
  clearSelection();
}

export function weaponAttack(targetIndex) {
  const selectedAction = gameState.turnState.selectedAction;
  if (!selectedAction || selectedAction.type !== 'weapon') {
    return;
  }

  if (gameState.inDuel) {
    Network.emitDuelAction({
      type: 'weaponAttack',
      payload: { weaponSlot: selectedAction.slot, targetIndex: 'opponent' },
    });
  } else if (gameState.partyId) {
    Network.emitPartyAction({
      type: 'weaponAttack',
      payload: { weaponSlot: selectedAction.slot, targetIndex },
    });
  }
  clearSelection();
}

export function useItemAbility(slot) {
  const item = gameState.equipment[slot];
  if (!item || !item.activatedAbility) return;

  if (gameState.inDuel) {
    Network.emitDuelAction({
      type: 'useItemAbility',
      payload: { slot },
    });
  } else if (gameState.partyId) {
    Network.emitPartyAction({
      type: 'useItemAbility',
      payload: { slot },
    });
  }
  clearSelection();
}
