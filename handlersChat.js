// handlersChat.js

/**
 * Manages chat-related socket events for zone chat and global chat.
 */

import { players, parties, pvpEncounters, globalChatHistory } from './serverState.js';

export const registerChatHandlers = (io, socket) => {
  // --- Global Chat ---
  socket.on('chat:sendGlobal', (message) => {
    const name = socket.characterName;
    if (!name || !message || typeof message !== 'string') return;

    const sanitizedMessage = message.trim().substring(0, 200); // Limit message length
    if (!sanitizedMessage) return;

    const chatEntry = {
      sender: name,
      message: sanitizedMessage,
      timestamp: Date.now(),
    };

    // Store in history (keep last 50 messages)
    globalChatHistory.push(chatEntry);
    if (globalChatHistory.length > 50) {
      globalChatHistory.shift();
    }

    // Broadcast to all connected players
    io.emit('chat:globalMessage', chatEntry);
  });

  // --- Zone Chat (Adventure/PvP) ---
  socket.on('chat:sendZone', (message) => {
    const name = socket.characterName;
    const player = players[name];
    if (!player || !player.character || !message || typeof message !== 'string') return;

    const sanitizedMessage = message.trim().substring(0, 200);
    if (!sanitizedMessage) return;

    const partyId = player.character.partyId;
    const party = parties[partyId];
    if (!party || !party.sharedState) return; // Must be in an active adventure

    const chatEntry = {
      sender: name,
      message: sanitizedMessage,
      timestamp: Date.now(),
      type: 'chat',
    };

    // Check if in PvP encounter
    if (party.sharedState.pvpEncounterId) {
      const encounter = pvpEncounters[party.sharedState.pvpEncounterId];
      if (encounter) {
        // Send to all players in both parties of the PvP encounter
        const partyA = parties[encounter.partyAId];
        const partyB = parties[encounter.partyBId];

        const allMembers = [...(partyA?.members || []), ...(partyB?.members || [])];
        allMembers.forEach((memberName) => {
          const memberPlayer = players[memberName];
          if (memberPlayer && memberPlayer.id) {
            io.to(memberPlayer.id).emit('chat:zoneMessage', chatEntry);
          }
        });
      }
    } else {
      // Send to all party members only
      party.members.forEach((memberName) => {
        const memberPlayer = players[memberName];
        if (memberPlayer && memberPlayer.id) {
          io.to(memberPlayer.id).emit('chat:zoneMessage', chatEntry);
        }
      });
    }
  });

  // --- Send chat history on request ---
  socket.on('chat:requestGlobalHistory', () => {
    socket.emit('chat:globalHistory', globalChatHistory);
  });
};
