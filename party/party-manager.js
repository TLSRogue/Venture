// party/party-manager.js

/**
 * Centralized Party Management Module
 *
 * This module consolidates all party-related operations to provide a single
 * source of truth for party state management. All party creation, joining,
 * leaving, and cleanup operations should go through this module.
 */

import { players, parties } from '../serverState.js';
import { broadcastPartyUpdate, broadcastOnlinePlayers, broadcastAdventureUpdate } from '../utilsBroadcast.js';

/**
 * Creates a new party with the given player as the leader.
 * @param {object} io - Socket.io server instance
 * @param {object} socket - The player's socket
 * @returns {string|null} The new party ID, or null if creation failed
 */
export function createParty(io, socket) {
  const name = socket.characterName;
  if (!name || !players[name] || players[name].character.partyId) {
    return null;
  }

  const partyId = `PARTY-${Math.random().toString(36).substr(2, 6).toUpperCase()}`;
  parties[partyId] = {
    id: partyId,
    leaderId: name,
    members: [name],
    sharedState: null,
    isSoloParty: false,
  };
  players[name].character.partyId = partyId;

  socket.emit('characterUpdate', players[name].character);
  console.log(`Player ${name} created party ${partyId}`);
  broadcastPartyUpdate(io, partyId);
  broadcastOnlinePlayers(io);

  return partyId;
}

/**
 * Creates a temporary solo party for adventure purposes.
 * @param {object} io - Socket.io server instance
 * @param {object} player - The player object
 * @param {object} socket - The player's socket
 * @returns {object} The created party object
 */
export function createSoloParty(io, player, socket) {
  const name = player.character.characterName;
  const partyId = `SOLO-${Math.random().toString(36).substr(2, 6).toUpperCase()}`;

  const party = {
    id: partyId,
    leaderId: name,
    members: [name],
    sharedState: null,
    isSoloParty: true,
  };

  parties[partyId] = party;
  player.character.partyId = partyId;

  socket.emit('partyUpdate', {
    partyId: partyId,
    leaderId: name,
    members: [{ name: name, id: socket.id, isLeader: true }],
    isPartyLeader: true,
  });

  console.log(`Player ${name} created temporary solo party ${partyId}`);
  return party;
}

/**
 * Attempts to add a player to an existing party.
 * @param {object} io - Socket.io server instance
 * @param {object} socket - The player's socket
 * @param {string} partyId - The ID of the party to join
 * @returns {boolean} True if join succeeded, false otherwise
 */
export function joinParty(io, socket, partyId) {
  const name = socket.characterName;
  const player = players[name];

  if (!player || !player.character || player.character.partyId) {
    return false;
  }

  const party = parties[partyId];
  if (!party) {
    socket.emit('partyError', 'Party not found.');
    return false;
  }
  if (party.members.length >= 3) {
    socket.emit('partyError', 'Party is full.');
    return false;
  }

  party.members.push(name);
  player.character.partyId = partyId;

  socket.emit('characterUpdate', player.character);
  console.log(`Player ${name} joined party ${partyId}`);
  broadcastPartyUpdate(io, partyId);
  broadcastOnlinePlayers(io);

  return true;
}

/**
 * Removes a player from their current party with full state cleanup.
 * Handles adventure state cleanup, leader promotion, and party disbanding.
 * @param {object} io - Socket.io server instance
 * @param {object} socket - The player's socket
 */
export function removePlayerFromParty(io, socket) {
  const name = socket.characterName;
  if (!name || !players[name] || !players[name].character) return;

  const partyId = players[name].character.partyId;
  if (!partyId) return; // Player isn't in a party

  const party = parties[partyId];

  // Handle desync: player thinks they're in a party that doesn't exist
  if (!party) {
    players[name].character.partyId = null;
    console.log(`Corrected state for player ${name} who was in a non-existent party.`);
    socket.emit('characterUpdate', players[name].character);
    broadcastOnlinePlayers(io);
    return;
  }

  // Clean up adventure state if player was in an adventure
  cleanupAdventureStateForPlayer(io, party, name);

  // Remove player from party members
  party.members = party.members.filter((memberName) => memberName !== name);
  players[name].character.partyId = null;

  socket.emit('characterUpdate', players[name].character);
  console.log(`Player ${name} left party ${partyId}`);

  // Disband or promote new leader
  if (party.members.length === 0) {
    delete parties[partyId];
    console.log(`Party ${partyId} disbanded.`);
  } else {
    if (party.leaderId === name) {
      party.leaderId = party.members[0];
      console.log(`New leader for party ${partyId} is ${party.leaderId}`);

      const newLeader = players[party.leaderId];
      if (newLeader && newLeader.id) {
        io.to(newLeader.id).emit('partyUpdate', { isPartyLeader: true });
      }
    }
    broadcastPartyUpdate(io, partyId);
  }

  broadcastOnlinePlayers(io);
}

/**
 * Cleans up adventure state when a player leaves a party mid-adventure.
 * @param {object} io - Socket.io server instance
 * @param {object} party - The party object
 * @param {string} playerName - The name of the player leaving
 */
function cleanupAdventureStateForPlayer(io, party, playerName) {
  if (!party.sharedState || !party.sharedState.partyMemberStates) return;

  // Check if there is an active defense quest, if so, remove it from this player's character
  if (party.sharedState.defenseQuest && party.sharedState.defenseQuest.active) {
    const player = players[playerName];
    if (player && player.character) {
      player.character.quests = player.character.quests.filter(
        (q) => q.details.id !== party.sharedState.defenseQuest.questId || q.status === 'completed'
      );
    }
  }

  const memberIndex = party.sharedState.partyMemberStates.findIndex((p) => p.name === playerName);
  if (memberIndex === -1) return;

  // Remove from adventure state
  party.sharedState.partyMemberStates.splice(memberIndex, 1);
  party.sharedState.log.push({
    message: `${playerName} has left the party (and the adventure).`,
    type: 'info',
  });

  // If adventure is now empty, end it
  if (party.sharedState.partyMemberStates.length === 0) {
    party.sharedState = null;
    console.log(`Adventure ended for party ${party.id} (empty).`);
  } else {
    // Broadcast update to remaining members
    broadcastAdventureUpdate(io, party);
  }
}

/**
 * Disbands a party completely, cleaning up all member states.
 * @param {object} io - Socket.io server instance
 * @param {string} partyId - The party ID to disband
 */
export function disbandParty(io, partyId) {
  const party = parties[partyId];
  if (!party) return;

  // Clear partyId from all members
  party.members.forEach((memberName) => {
    const memberPlayer = players[memberName];
    if (memberPlayer?.character) {
      memberPlayer.character.partyId = null;
      if (party.sharedState && party.sharedState.defenseQuest && party.sharedState.defenseQuest.active) {
        memberPlayer.character.quests = memberPlayer.character.quests.filter(
          (q) => q.details.id !== party.sharedState.defenseQuest.questId || q.status === 'completed'
        );
      }
    }
  });

  delete parties[partyId];
  console.log(`Party ${partyId} disbanded.`);
  broadcastOnlinePlayers(io);
}

/**
 * Cleans up a solo/temporary party after an adventure ends.
 * @param {object} io - Socket.io server instance
 * @param {object} party - The party object
 * @param {object} player - The player object (optional, for older cleanup style)
 */
export function cleanupSoloParty(io, party, player = null) {
  if (!party.isSoloParty) return;

  // Clear the leader's partyId
  const leader = player || players[party.leaderId];
  if (leader?.character) {
    leader.character.partyId = null;
    if (party.sharedState && party.sharedState.defenseQuest && party.sharedState.defenseQuest.active) {
      leader.character.quests = leader.character.quests.filter(
        (q) => q.details.id !== party.sharedState.defenseQuest.questId || q.status === 'completed'
      );
    }
    if (leader.id) {
      io.to(leader.id).emit('partyUpdate', null);
    }
  }

  delete parties[party.id];
  console.log(`Solo party ${party.id} cleaned up.`);
}

/**
 * Clears the sharedState from a party (ending adventure) without disbanding.
 * Used after returning from adventures for non-solo parties.
 * @param {object} io - Socket.io server instance
 * @param {string} partyId - The party ID
 */
export function endPartyAdventure(io, partyId) {
  const party = parties[partyId];
  if (!party) return;

  party.sharedState = null;
  broadcastPartyUpdate(io, partyId);
}

/**
 * Gets a party by ID with optional validation.
 * @param {string} partyId - The party ID
 * @returns {object|null} The party object or null
 */
export function getParty(partyId) {
  return parties[partyId] || null;
}

/**
 * Checks if a player is the leader of a party.
 * @param {string} playerName - The player's character name
 * @param {string} partyId - The party ID to check
 * @returns {boolean} True if the player is the party leader
 */
export function isPartyLeader(playerName, partyId) {
  const party = parties[partyId];
  return party ? party.leaderId === playerName : false;
}

/**
 * Sends a party invite to a target player.
 * @param {object} io - Socket.io server instance
 * @param {object} socket - The inviter's socket
 * @param {string} targetCharacterName - The character to invite
 */
export function sendPartyInvite(io, socket, targetCharacterName) {
  const inviterName = socket.characterName;
  const inviter = players[inviterName];
  const target = players[targetCharacterName];
  let partyId = inviter?.character?.partyId;

  if (!inviter || !inviter.character) {
    return socket.emit('partyError', 'Unable to send invite.');
  }

  // Auto-create party if inviter doesn't have one
  if (!partyId) {
    partyId = createParty(io, socket);
    if (!partyId) {
      return socket.emit('partyError', 'Failed to create party.');
    }
  }

  if (!target || !target.id) {
    return socket.emit('partyError', 'The player you are trying to invite is not online.');
  }
  if (target.character.partyId) {
    return socket.emit('partyError', `${target.character.characterName} is already in a party.`);
  }

  io.to(target.id).emit('receivePartyInvite', {
    inviterName: inviter.character.characterName,
    partyId: partyId,
  });
  console.log(`${inviter.character.characterName} invited ${target.character.characterName} to party ${partyId}`);
}
