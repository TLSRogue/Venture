// handlersDuel.js

/**
 * Manages all socket events and logic related to player duels.
 */

import { players, parties, duels } from './serverState.js';
import { broadcastPartyUpdate } from './utilsBroadcast.js';
import { getBonusStatsForPlayer } from './utilsHelpers.js';
import { startPvpEncounter } from './adventure/pvp-state.js';
import { DEFAULT_ACTION_POINTS, STARTING_HEALTH } from './constants.js';

// This function is exported separately so the disconnect handler can call it.
export function endDuel(io, duelId, winnerName, loserName) {
  const duel = duels[duelId];
  if (!duel || duel.ended) return;

  console.log(`Ending duel ${duelId}. Winner: ${winnerName}, Loser: ${loserName}`);
  duel.ended = true;
  duel.log.push({ message: `${loserName} has been defeated! ${winnerName} is victorious!`, type: 'success' });

  const winner = players[winnerName];
  const loser = players[loserName];
  const duelReward = { gold: 50 };

  if (winner && winner.character) {
    winner.character.gold += duelReward.gold;
    winner.character.duelId = null;
    if (winner.id) {
      io.to(winner.id).emit('duel:end', { outcome: 'win', reward: duelReward });
      io.to(winner.id).emit('characterUpdate', winner.character);
    }
  }

  if (loser && loser.character) {
    loser.character.duelId = null;
    if (loser.id) {
      io.to(loser.id).emit('duel:end', { outcome: 'loss', reward: null });
      io.to(loser.id).emit('characterUpdate', loser.character);
    }
  }

  delete duels[duelId];

  if (winner?.character?.partyId) broadcastPartyUpdate(io, winner.character.partyId);
  if (loser?.character?.partyId) broadcastPartyUpdate(io, loser.character.partyId);
}

export const registerDuelHandlers = (io, socket) => {
  socket.on('duel:challenge', (targetCharacterName) => {
    const challengerName = socket.characterName;
    const challenger = players[challengerName];
    const target = players[targetCharacterName];

    if (!challenger || !target || !target.id) {
      return socket.emit('partyError', 'Target player is not available.');
    }
    const challengerInAdventure = challenger.character.partyId && parties[challenger.character.partyId]?.sharedState;
    const targetInAdventure = target.character.partyId && parties[target.character.partyId]?.sharedState;

    if (challengerInAdventure || targetInAdventure) {
      return socket.emit('partyError', 'Cannot duel while in an adventure.');
    }

    // Clean up stale duelIds (from previously broken duels)
    if (challenger.character.duelId && !duels[challenger.character.duelId]) {
      challenger.character.duelId = null;
    }
    if (target.character.duelId && !duels[target.character.duelId]) {
      target.character.duelId = null;
    }

    // Check if either player is already in a PvP encounter (including duels)
    const challengerPartyCheck = challenger.character.partyId ? parties[challenger.character.partyId] : null;
    const targetPartyCheck = target.character.partyId ? parties[target.character.partyId] : null;
    if (challengerPartyCheck?.sharedState?.pvpEncounterId || targetPartyCheck?.sharedState?.pvpEncounterId) {
      return socket.emit('partyError', 'One of the players is already in a duel or PvP encounter.');
    }

    console.log(`${challengerName} is challenging ${targetCharacterName} to a duel.`);
    io.to(target.id).emit('duel:receiveChallenge', {
      challengerName: challengerName,
      challengerId: challengerName,
    });
  });

  socket.on('duel:accept', (challengerName) => {
    const acceptorName = socket.characterName;
    const challenger = players[challengerName];
    const acceptor = players[acceptorName];

    if (!challenger || !challenger.id || !acceptor) return;

    // Block if either player is already in a party with an active adventure
    const challengerParty = challenger.character.partyId ? parties[challenger.character.partyId] : null;
    const acceptorParty = acceptor.character.partyId ? parties[acceptor.character.partyId] : null;

    if (challengerParty?.sharedState || acceptorParty?.sharedState) {
      return socket.emit('partyError', 'Cannot duel while in an active adventure.');
    }

    // If player is in a party (but no adventure), leave it first
    if (challengerParty) {
      challengerParty.members = challengerParty.members.filter((m) => m !== challengerName);
      if (challengerParty.members.length === 0) {
        delete parties[challengerParty.id];
      }
    }
    if (acceptorParty) {
      acceptorParty.members = acceptorParty.members.filter((m) => m !== acceptorName);
      if (acceptorParty.members.length === 0) {
        delete parties[acceptorParty.id];
      }
    }

    // Create temporary solo parties for both duelists
    const createDuelParty = (playerObj) => {
      const partyId = `DUEL-PARTY-${Math.random().toString(36).substr(2, 6).toUpperCase()}`;
      const bonuses = getBonusStatsForPlayer(playerObj.character, null);
      const maxHealth = STARTING_HEALTH + bonuses.maxHealth;

      const party = {
        id: partyId,
        leaderId: playerObj.character.characterName,
        members: [playerObj.character.characterName],
        isSoloParty: true,
        sharedState: {
          currentZone: 'duel',
          zoneDeck: [],
          zoneCards: [],
          groundLoot: [],
          turnNumber: 0,
          isPlayerTurn: true,
          partyMemberStates: [
            {
              playerId: playerObj.id,
              name: playerObj.character.characterName,
              icon: playerObj.character.characterIcon,
              health: maxHealth,
              maxHealth: maxHealth,
              actionPoints: DEFAULT_ACTION_POINTS,
              turnEnded: false,
              isDead: false,
              lootableInventory: [],
              buffs: [],
              debuffs: [],
              weaponCooldowns: {},
              spellCooldowns: {},
              itemCooldowns: {},
              threat: 0,
              focus: 0,
              equipment: playerObj.character.equipment,
              equippedSpells: playerObj.character.equippedSpells,
            },
          ],
          log: [],
          pendingReaction: null,
          pendingLootRoll: null,
        },
      };

      parties[partyId] = party;
      playerObj.character.partyId = partyId;
      return party;
    };

    const newChallengerParty = createDuelParty(challenger);
    const newAcceptorParty = createDuelParty(acceptor);

    console.log(`Duel starting between ${challengerName} and ${acceptorName} using PvP system.`);

    // Start the PvP encounter with isDuel flag
    startPvpEncounter(io, newChallengerParty, newAcceptorParty, true);
  });

  // Note: duel:playerAction is no longer needed - duels now use party:playerAction through adventure system
};
