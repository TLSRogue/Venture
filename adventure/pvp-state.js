// adventure/pvp-state.js
/**
 * PvP and Duel encounter state management.
 * Handles all PvP-specific logic including encounter lifecycle, turns, and player deaths.
 */

import { players, parties, pvpEncounters } from '../serverState.js';
import { broadcastAdventureUpdate } from '../utilsBroadcast.js';
import { createStateForClient, getBonusStatsForPlayer } from '../utilsHelpers.js';
import { applyDamage, applyDoTEffects, processEndOfTurnEffects, processRejuvenateHealing } from './combat-core.js';
import { PVP_TURN_DURATION_MS, INVENTORY_SIZE, DEFAULT_ACTION_POINTS } from '../constants.js';
import * as PartyManager from '../party/party-manager.js';
import { processZoneEffects } from './adventure-state.js';

/**
 * Handle player death in PvP combat.
 * Strips inventory/equipment in non-duel PvP and adds to ground loot.
 */
export function handlePvpPlayerDeath(io, defeatedPlayer, encounter) {
  const character = defeatedPlayer.character;

  // Skip loot stripping for duels
  if (encounter.isDuel) {
    encounter.log.push({ message: `${character.characterName} has been defeated!`, type: 'damage' });
    return;
  }

  const allLoot = [...character.inventory.filter(Boolean)];
  for (const slot in character.equipment) {
    if (character.equipment[slot]) {
      if (slot === 'offHand' && character.equipment[slot] === character.equipment.mainHand) {
        continue;
      }
      allLoot.push(character.equipment[slot]);
    }
  }

  encounter.groundLoot.push(...allLoot);

  character.inventory = Array(INVENTORY_SIZE).fill(null);
  character.equipment = {
    mainHand: null,
    offHand: null,
    helmet: null,
    armor: null,
    boots: null,
    accessory: null,
    ammo: null,
  };

  io.to(defeatedPlayer.id).emit('characterUpdate', character);
  encounter.log.push({
    message: `${character.characterName} has been slain and dropped all of their items!`,
    type: 'damage',
  });
}

/**
 * Check if a team has won the PvP encounter.
 * Returns true if the encounter ended.
 */
export function checkPvpWinCondition(io, encounter, defeatedPlayerState) {
  const opponentTeam = defeatedPlayerState.team === 'A' ? 'B' : 'A';
  const teammates = encounter.playerStates.filter((p) => p.team === defeatedPlayerState.team);
  const allTeammatesDead = teammates.every((p) => p.isDead);

  if (allTeammatesDead) {
    encounter.log.push({ message: 'All opponents have been defeated! You are victorious!', type: 'success' });
    const winningParty = opponentTeam === 'A' ? parties[encounter.partyAId] : parties[encounter.partyBId];
    const losingParty = opponentTeam === 'A' ? parties[encounter.partyBId] : parties[encounter.partyAId];

    // Safety check if parties exist (they might have disconnected)
    if (winningParty && losingParty) {
      endPvpEncounter(io, winningParty, losingParty);
    } else {
      // Fallback cleanup if a party is missing
      delete pvpEncounters[encounter.id];
    }
    return true;
  }
  return false;
}

/**
 * End a PvP encounter and clean up state.
 */
export function endPvpEncounter(io, winningParty, losingParty) {
  const encounterId = winningParty.sharedState.pvpEncounterId;
  const encounter = pvpEncounters[encounterId];

  if (encounter && encounter.turnTimerId) {
    clearTimeout(encounter.turnTimerId);
  }

  const isDuel = encounter?.isDuel || false;

  if (encounterId) {
    delete pvpEncounters[encounterId];
  }

  // For duels, handle differently - no loot/gold, just clean up both sides
  if (isDuel) {
    // Notify winners (no gold reward)
    winningParty.members.forEach((memberName) => {
      const memberPlayer = players[memberName];
      if (memberPlayer && memberPlayer.id) {
        io.to(memberPlayer.id).emit('duel:end', { outcome: 'win', reward: null, finalLog: encounter.log });
        io.to(memberPlayer.id).emit('party:adventureEnded', { finalLog: encounter.log });
      }
    });

    // Notify losers
    losingParty.members.forEach((memberName) => {
      const memberPlayer = players[memberName];
      if (memberPlayer && memberPlayer.id) {
        io.to(memberPlayer.id).emit('duel:end', { outcome: 'loss', reward: null, finalLog: encounter.log });
        io.to(memberPlayer.id).emit('party:adventureEnded', { finalLog: encounter.log });
      }
    });

    // Clean up duel parties via centralized party manager
    [winningParty, losingParty].forEach((party) => {
      party.members.forEach((memberName) => {
        const memberPlayer = players[memberName];
        if (memberPlayer?.character) {
          memberPlayer.character.duelId = null;
        }
      });
      PartyManager.disbandParty(io, party.id);
    });

    return;
  }

  // Normal PvP handling (non-duel)
  losingParty.members.forEach((memberName) => {
    const memberPlayer = players[memberName];
    if (memberPlayer && memberPlayer.id) {
      io.to(memberPlayer.id).emit('party:adventureEnded', {
        outcome: 'loss',
        message: 'Your party was defeated by another player!',
        finalLog: encounter.log,
      });
    }
  });

  if (losingParty.isSoloParty) {
    PartyManager.cleanupSoloParty(io, losingParty);
  } else {
    PartyManager.endPartyAdventure(io, losingParty.id);
  }

  const { sharedState } = winningParty;
  sharedState.pvpEncounterId = null;
  sharedState.zoneCards = [];
  sharedState.log.push({ message: 'Combat has ended! You may now loot the spoils of victory.', type: 'success' });

  sharedState.partyMemberStates.forEach((p) => {
    if (!p.isDead) {
      p.actionPoints = DEFAULT_ACTION_POINTS;
      p.turnEnded = false;
    }
  });

  broadcastAdventureUpdate(io, winningParty);
}

/**
 * End a duel encounter specifically (for surrender scenarios).
 * Exported for use by duel handlers.
 */
export function endDuelEncounter(io, winningParty, losingParty, encounter) {
  if (encounter && encounter.turnTimerId) {
    clearTimeout(encounter.turnTimerId);
  }

  if (encounter?.id) {
    delete pvpEncounters[encounter.id];
  }

  // Notify winners (no gold reward)
  winningParty.members.forEach((memberName) => {
    const memberPlayer = players[memberName];
    if (memberPlayer && memberPlayer.id) {
      io.to(memberPlayer.id).emit('duel:end', { outcome: 'win', reward: null, finalLog: encounter.log });
      io.to(memberPlayer.id).emit('party:adventureEnded', { finalLog: encounter.log });
    }
  });

  // Notify losers
  losingParty.members.forEach((memberName) => {
    const memberPlayer = players[memberName];
    if (memberPlayer && memberPlayer.id) {
      io.to(memberPlayer.id).emit('duel:end', { outcome: 'loss', reward: null, finalLog: encounter.log });
      io.to(memberPlayer.id).emit('party:adventureEnded', { finalLog: encounter.log });
    }
  });

  // Clean up duel parties via centralized party manager
  [winningParty, losingParty].forEach((party) => {
    party.members.forEach((memberName) => {
      const memberPlayer = players[memberName];
      if (memberPlayer?.character) {
        memberPlayer.character.duelId = null;
      }
    });
    PartyManager.disbandParty(io, party.id);
  });
}

/**
 * Start a PvP encounter between two parties.
 */
export function startPvpEncounter(io, partyA, partyB, isDuel = false) {
  if (!partyA.sharedState || !partyB.sharedState) {
    console.error('Attempted to start PvP encounter with a party that is missing a sharedState.');
    return;
  }

  partyA.sharedState.isLoadingNextArea = false;
  partyB.sharedState.isLoadingNextArea = false;

  const encounterId = `PVP-${Date.now()}`;
  const startingTeam = Math.random() < 0.5 ? 'A' : 'B';

  const createPlayerStatesForTeam = (party, team) => {
    return party.sharedState.partyMemberStates.map((p) => ({
      ...p,
      team,
      actionPoints: 0, // AP assigned dynamically
    }));
  };

  const playerStatesA = createPlayerStatesForTeam(partyA, 'A');
  const playerStatesB = createPlayerStatesForTeam(partyB, 'B');

  // Generate interleaved turnOrder
  const turnOrder = [];
  const team1 = startingTeam === 'A' ? playerStatesA : playerStatesB;
  const team2 = startingTeam === 'A' ? playerStatesB : playerStatesA;

  // Interleave
  const maxLength = Math.max(team1.length, team2.length);
  for (let i = 0; i < maxLength; i++) {
    if (i < team1.length) turnOrder.push(team1[i].playerId);
    if (i < team2.length) turnOrder.push(team2[i].playerId);
  }

  // Give AP to first player in turn order
  const firstPlayerId = turnOrder[0];
  const firstPlayerState = [...playerStatesA, ...playerStatesB].find((p) => p.playerId === firstPlayerId);
  if (firstPlayerState) {
    firstPlayerState.actionPoints = 1; // Team going first gets 1 AP initially
  }

  const duration = PVP_TURN_DURATION_MS;
  const timerEndsAt = Date.now() + duration;

  const timerId = setTimeout(() => {
    const currentEncounter = pvpEncounters[encounterId];
    if (currentEncounter) {
      const activePlayerId = currentEncounter.turnOrder[currentEncounter.activeTurnIndex];
      const activePlayer = currentEncounter.playerStates.find((p) => p.playerId === activePlayerId);
      if (activePlayer) {
        currentEncounter.log.push({ message: `${activePlayer.name}'s time expired! Turn ends.`, type: 'damage' });
        activePlayer.turnEnded = true;
      }
      startNextPvpTurn(io, encounterId);
    }
  }, duration);

  const encounterState = {
    id: encounterId,
    partyAId: partyA.id,
    partyBId: partyB.id,
    playerStates: [...playerStatesA, ...playerStatesB],
    turnOrder: turnOrder,
    activeTurnIndex: 0,
    groundLoot: [],
    isDuel: isDuel,
    log: [
      {
        message: isDuel ? `Duel has begun!` : `You have encountered an opposing party! Battle begins!`,
        type: 'damage',
      },
      { message: `${firstPlayerState.name} will go first, but with only 1 AP!`, type: 'info' },
    ],
    turnTimerEndsAt: timerEndsAt,
    turnTimerDuration: duration,
    turnTimerId: timerId,
    pendingReaction: null,
  };

  pvpEncounters[encounterId] = encounterState;

  partyA.sharedState.pvpEncounterId = encounterId;
  partyB.sharedState.pvpEncounterId = encounterId;

  partyA.sharedState.zoneCards = [];
  partyB.sharedState.zoneCards = [];
  partyA.sharedState.groundLoot = encounterState.groundLoot;
  partyB.sharedState.groundLoot = encounterState.groundLoot;
  partyA.sharedState.log = encounterState.log;
  partyB.sharedState.log = encounterState.log;
  // Share zoneEffects between both parties so either team's Blizzard is visible to all
  const sharedZoneEffects = [];
  partyA.sharedState.zoneEffects = sharedZoneEffects;
  partyB.sharedState.zoneEffects = sharedZoneEffects;

  const stateForClients = createStateForClient(partyA.sharedState, encounterState);

  // ** BUG FIX: Include partyId in the state sent to each party's members **
  // Without partyId, the client-side combat.js won't emit actions because it checks gameState.partyId
  partyA.members.forEach((memberName) => {
    const member = players[memberName];
    if (member && member.id) {
      io.to(member.id).emit('party:adventureStarted', { ...stateForClients, partyId: partyA.id });
    }
  });
  partyB.members.forEach((memberName) => {
    const member = players[memberName];
    if (member && member.id) {
      io.to(member.id).emit('party:adventureStarted', { ...stateForClients, partyId: partyB.id });
    }
  });
}

/**
 * Start the next PvP team's turn.
 */
export function startNextPvpTurn(io, encounterId) {
  const encounter = pvpEncounters[encounterId];
  if (!encounter) return;

  if (encounter.turnTimerId) {
    clearTimeout(encounter.turnTimerId);
    encounter.turnTimerId = null;
  }

  // Process out stragglers? Wait, if a turn ends, then the active player is handled
  const currentActiveId = encounter.turnOrder[encounter.activeTurnIndex];
  const currentActivePlayer = encounter.playerStates.find((p) => p.playerId === currentActiveId);
  if (currentActivePlayer && !currentActivePlayer.turnEnded && !currentActivePlayer.isDead) {
    processPvpPlayerEndTurn(io, encounter, currentActivePlayer);
  }

  // Find next living player in turn order
  let nextIndex = (encounter.activeTurnIndex + 1) % encounter.turnOrder.length;
  let nextPlayer = null;
  let roundEnded = false;

  // Safety check to prevent infinite loop if everyone dies
  // (though win condition logic should catch this)
  for (let attempts = 0; attempts < encounter.turnOrder.length; attempts++) {
    if (nextIndex < encounter.activeTurnIndex || nextIndex === 0) {
      // We wrapped around the turn order list
      if (nextIndex === 0) roundEnded = true;
    }

    const candidateId = encounter.turnOrder[nextIndex];
    const candidate = encounter.playerStates.find((p) => p.playerId === candidateId);

    if (candidate && !candidate.isDead) {
      nextPlayer = candidate;
      break;
    }
    nextIndex = (nextIndex + 1) % encounter.turnOrder.length;
    if (nextIndex === 0) roundEnded = true;
  }

  if (!nextPlayer) {
    // Everyone is dead? This means tie or game over, check win condition should have caught this.
    return;
  }

  encounter.activeTurnIndex = nextIndex;

  // Process zone effects (e.g., Blizzard) between rounds
  if (roundEnded) {
    const party = parties[encounter.partyAId];
    if (party) {
      processZoneEffects(io, party, encounter, null);
    }
  }

  encounter.log.push({ message: `--- ${nextPlayer.name}'s Turn ---`, type: 'info' });

  nextPlayer.turnEnded = false;
  const stunDebuff = nextPlayer.debuffs.find((d) => d.type === 'stun');
  if (stunDebuff) {
    nextPlayer.actionPoints = DEFAULT_ACTION_POINTS - 1; // Lose 1 AP due to stun
    encounter.log.push({
      message: `${nextPlayer.name} is stunned and starts with reduced Action Points!`,
      type: 'reaction',
    });
  } else {
    nextPlayer.actionPoints = DEFAULT_ACTION_POINTS;
  }

  // Cooldowns decrement at Start of Turn
  Object.keys(nextPlayer.weaponCooldowns).forEach((k) => {
    if (nextPlayer.weaponCooldowns[k] > 0) nextPlayer.weaponCooldowns[k]--;
  });
  Object.keys(nextPlayer.spellCooldowns).forEach((k) => {
    if (nextPlayer.spellCooldowns[k] > 0) nextPlayer.spellCooldowns[k]--;
  });
  Object.keys(nextPlayer.itemCooldowns).forEach((k) => {
    if (nextPlayer.itemCooldowns[k] > 0) nextPlayer.itemCooldowns[k]--;
  });

  const duration = PVP_TURN_DURATION_MS;
  const timerEndsAt = Date.now() + duration;

  encounter.turnTimerId = setTimeout(() => {
    const currentEncounter = pvpEncounters[encounterId];
    if (currentEncounter) {
      currentEncounter.log.push({ message: `${nextPlayer.name}'s time expired! Turn ends.`, type: 'damage' });
      if (!nextPlayer.isDead) nextPlayer.turnEnded = true;
      startNextPvpTurn(io, encounterId);
    }
  }, duration);

  encounter.turnTimerEndsAt = timerEndsAt;
  encounter.turnTimerDuration = duration;

  broadcastAdventureUpdate(io, parties[encounter.partyAId]);
}

/**
 * Process end of turn for a PvP player (DoT, buff/debuff decrements).
 */
export async function processPvpPlayerEndTurn(io, encounter, playerState) {
  if (!playerState || playerState.turnEnded) return;

  // Rejuvenate healing before buff duration drops
  processRejuvenateHealing(playerState, encounter.log);

  // UNIFIED: Use shared end-of-turn effects
  processEndOfTurnEffects(playerState, encounter.log);

  // Check Death
  if (playerState.health <= 0) {
    playerState.health = 0;
    playerState.isDead = true;
    encounter.log.push({ message: `${playerState.name} has succumbed to their wounds!`, type: 'damage' });

    const defeatedPlayerObject = players[playerState.name];
    if (defeatedPlayerObject) {
      handlePvpPlayerDeath(io, defeatedPlayerObject, encounter);
    }
    checkPvpWinCondition(io, encounter, playerState);
  }

  playerState.turnEnded = true;
}
