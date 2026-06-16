// handlersParty.js

/**
 * Manages all socket events related to party management, such as
 * creating, joining, leaving, and sending invites.
 *
 * This handler delegates to the centralized party-manager module
 * for all party state operations.
 */

import * as PartyManager from './party/party-manager.js';

export const registerPartyHandlers = (io, socket) => {
  socket.on('createParty', () => {
    PartyManager.createParty(io, socket);
  });

  socket.on('sendPartyInvite', (targetCharacterName) => {
    PartyManager.sendPartyInvite(io, socket, targetCharacterName);
  });

  socket.on('joinParty', (partyId) => {
    PartyManager.joinParty(io, socket, partyId);
  });

  socket.on('leaveParty', async () => {
    await PartyManager.removePlayerFromParty(io, socket);
  });
};
