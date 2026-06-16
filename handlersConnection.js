// handlersConnection.js

/**
 * Manages the initial connection, authentication (login/register),
 * and disconnection events for a player's socket.
 * Now includes logic to save player data to a file on disconnect.
 */

import { players, parties, duels, pvpEncounters, createInitialCharacter } from './serverState.js';
import {
  broadcastOnlinePlayers,
  broadcastPartyUpdate,
  broadcastDuelUpdate,
  broadcastAdventureUpdate,
} from './utilsBroadcast.js';
import { endDuel } from './handlersDuel.js';
import { handlePvpPlayerDeath } from './adventure/pvp-state.js';
import { runMigrations } from './migrations.js';
import fs from 'fs';
import { DUEL_DISCONNECT_MS, DEFAULT_ACTION_POINTS } from './constants.js';

let isSaving = false;
let savePending = false;

function savePlayersDatabase() {
  if (isSaving) {
    savePending = true;
    return;
  }

  isSaving = true;
  savePending = false;

  fs.writeFile('players.json', JSON.stringify(players, null, 2), (err) => {
    isSaving = false;
    if (err) {
      console.error('Failed to save players database:', err);
    } else {
      console.log('Players database successfully saved to players.json.');
    }

    if (savePending) {
      savePlayersDatabase();
    }
  });
}

export const registerConnectionHandlers = (io, socket) => {
  const handlePlayerLogin = (characterDataFromClient) => {
    const name = characterDataFromClient.characterName;

    if (!name) {
      socket.emit('loadError', 'Invalid character name provided.');
      socket.disconnect();
      return;
    }

    if (players[name] && players[name].id) {
      io.to(players[name].id).emit('loadError', 'Character is already online on another session.');
      socket.disconnect();
      return;
    }

    let characterToUpdate;

    if (players[name]) {
      // Player is RECONNECTING to an active session. Use existing server data.
      console.log(`Character ${name} is reconnecting with new socket ${socket.id}.`);
      players[name].id = socket.id;
      socket.characterName = name;
      characterToUpdate = players[name].character;

      const duelId = characterToUpdate.duelId;
      if (duelId && duels[duelId] && duels[duelId].disconnectTimeout) {
        console.log(`Player ${name} reconnected, cancelling duel termination for ${duelId}`);
        clearTimeout(duels[duelId].disconnectTimeout);
        duels[duelId].disconnectTimeout = null;
      }
    } else {
      // Player is LOADING from localStorage or REGISTERING for the first time.
      // Trust the client's data to establish the session state.
      console.log(`Character ${name} is connecting for the first time or loading from save.`);

      players[name] = { id: socket.id, character: characterDataFromClient };
      socket.characterName = name;
      characterToUpdate = characterDataFromClient;
    }

    // Run all migrations/refreshes via the centralized module
    runMigrations(characterToUpdate, name);

    // Send the authoritative state to the client for this session
    if (characterToUpdate.duelId && duels[characterToUpdate.duelId]) {
      socket.emit('duel:start', duels[characterToUpdate.duelId]);
    } else {
      socket.emit('characterUpdate', characterToUpdate);
    }

    const partyId = characterToUpdate.partyId;
    if (partyId) {
      if (parties[partyId]) {
        broadcastPartyUpdate(io, partyId);
        if (parties[partyId].sharedState) {
          socket.emit('party:adventureStarted', parties[partyId].sharedState);
        }
      } else {
        // Clear stale partyId if the party no longer exists
        console.log(`Clearing stale partyId ${partyId} for character ${name}.`);
        characterToUpdate.partyId = null;
        // Sync the corrected state to client so localStorage is updated
        socket.emit('characterUpdate', characterToUpdate);
      }
    }

    broadcastOnlinePlayers(io);
  };

  socket.on('registerPlayer', (characterData) => {
    const name = characterData?.characterName;
    if (!name) {
      return socket.emit('loadError', 'Invalid character name.');
    }
    if (players[name]) {
      return socket.emit('loadError', 'Character name is already taken.');
    }
    // When registering, we create a fresh character to ensure no modified data is sent.
    const newCharacter = createInitialCharacter(name, characterData.characterIcon);
    handlePlayerLogin(newCharacter);
  });

  socket.on('loadCharacter', (characterData) => {
    const name = characterData?.characterName;
    if (!name) {
      return socket.emit('loadError', 'Invalid character name.');
    }
    const player = players[name];
    if (!player || !player.character) {
      return socket.emit('loadError', 'Character not found on the server.');
    }
    // Log in using the server's authoritative character data
    handlePlayerLogin(player.character);
  });

  socket.on('deleteCharacter', (characterName) => {
    if (!characterName) return;
    // Prevent deleting a player that is currently online
    if (players[characterName] && players[characterName].id) {
      return;
    }
    if (players[characterName]) {
      delete players[characterName];
      console.log(`Character ${characterName} has been deleted from the server.`);
      savePlayersDatabase();
    }
  });

  socket.on('disconnect', () => {
    const name = socket.characterName;
    console.log(`Socket ${socket.id} for character ${name} disconnected.`);
    if (name && players[name]) {
      const character = players[name].character;
      if (!character) return;

      const duelId = character.duelId;
      if (duelId && duels[duelId] && !duels[duelId].ended) {
        const duel = duels[duelId];
        const opponent = duel.player1.name === name ? duel.player2 : duel.player1;
        duel.log.push({ message: `${name} has disconnected. The duel will end in 20 seconds...`, type: 'damage' });
        broadcastDuelUpdate(io, duelId);
        duel.disconnectTimeout = setTimeout(() => {
          if (duels[duelId] && !duels[duelId].ended) {
            endDuel(io, duelId, opponent.name, name);
          }
        }, DUEL_DISCONNECT_MS);
      }

      // --- PVP ENCOUNTER DISCONNECT HANDLING ---
      const partyId = character.partyId;
      if (partyId && parties[partyId] && parties[partyId].sharedState?.pvpEncounterId) {
        const party = parties[partyId];
        const encounter = pvpEncounters[party.sharedState.pvpEncounterId];

        if (encounter) {
          const disconnectedPlayerState = encounter.playerStates.find((p) => p.name === name);

          if (disconnectedPlayerState && !disconnectedPlayerState.isDead) {
            // Kill the disconnected player and drop their items
            disconnectedPlayerState.isDead = true;
            disconnectedPlayerState.health = 0;

            const disconnectedPlayer = players[name];
            if (disconnectedPlayer) {
              handlePvpPlayerDeath(io, disconnectedPlayer, encounter);
            }

            encounter.log.push({ message: `${name} has disconnected and forfeits the battle!`, type: 'damage' });

            // Check if the disconnected player's entire team is now dead
            const team = disconnectedPlayerState.team;
            const teammates = encounter.playerStates.filter((p) => p.team === team);
            const allTeamDead = teammates.every((p) => p.isDead);

            if (allTeamDead) {
              // End the encounter - the other team wins
              const winningTeam = team === 'A' ? 'B' : 'A';
              const winningPartyId = winningTeam === 'A' ? encounter.partyAId : encounter.partyBId;
              const losingPartyId = winningTeam === 'A' ? encounter.partyBId : encounter.partyAId;
              const winningParty = parties[winningPartyId];
              const losingParty = parties[losingPartyId];

              encounter.log.push({ message: `All opponents have been defeated! You are victorious!`, type: 'success' });

              if (encounter.turnTimerId) {
                clearTimeout(encounter.turnTimerId);
              }

              // Clean up the losing party
              if (losingParty) {
                losingParty.members.forEach((memberName) => {
                  const memberPlayer = players[memberName];
                  if (memberPlayer && memberPlayer.id) {
                    io.to(memberPlayer.id).emit('party:adventureEnded');
                  }
                });

                if (losingParty.isSoloParty) {
                  if (players[losingParty.leaderId]?.character) {
                    players[losingParty.leaderId].character.partyId = null;
                  }
                  delete parties[losingParty.id];
                } else {
                  losingParty.sharedState = null;
                  broadcastPartyUpdate(io, losingParty.id);
                }
              }

              // Clean up winning party's PVP state
              if (winningParty && winningParty.sharedState) {
                winningParty.sharedState.pvpEncounterId = null;
                winningParty.sharedState.zoneCards = [];
                winningParty.sharedState.groundLoot = encounter.groundLoot;
                winningParty.sharedState.log = encounter.log;
                winningParty.sharedState.partyMemberStates.forEach((p) => {
                  if (!p.isDead) {
                    p.actionPoints = DEFAULT_ACTION_POINTS;
                    p.turnEnded = false;
                  }
                });
                broadcastAdventureUpdate(io, winningParty);
              }

              delete pvpEncounters[encounter.id];
            } else {
              // Just broadcast the update - the encounter continues
              broadcastAdventureUpdate(io, party);
            }
          }
        }
      }
      // --- END PVP DISCONNECT HANDLING ---

      // --- PvE DEFENSE QUEST DISCONNECT HANDLING ---
      if (character.partyId && parties[character.partyId]) {
        const party = parties[character.partyId];
        if (party.sharedState && party.sharedState.defenseQuest && party.sharedState.defenseQuest.active) {
          const questId = party.sharedState.defenseQuest.questId;

          party.members.forEach((memberName) => {
            const member = players[memberName];
            if (member && member.character) {
              member.character.quests = member.character.quests.filter(
                (q) => q.details.id !== questId || q.status === 'completed'
              );
              if (member.id) io.to(member.id).emit('characterUpdate', member.character);
            }
          });

          party.sharedState.log.push({
            message: `A player disconnected! The defense quest has failed.`,
            type: 'damage',
          });
          party.sharedState.defenseQuest = null;
          if (party.sharedState.zoneEffects) {
            party.sharedState.zoneEffects = party.sharedState.zoneEffects.filter((ze) => ze.type !== 'defenseQuest');
          }
          broadcastAdventureUpdate(io, party);
        }
      }

      // --- SAVE PROGRESS TO FILE ---
      savePlayersDatabase();
      // ---------------------------

      players[name].id = null;
      broadcastOnlinePlayers(io);
    }
  });
};
