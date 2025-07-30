// handlersParty.js

/**
 * Manages all socket events related to party management, such as
 * creating, joining, leaving, and sending invites.
 */

import { players, parties } from './serverState.js';
import { broadcastPartyUpdate, broadcastOnlinePlayers } from './utilsBroadcast.js';

export const registerPartyHandlers = (io, socket) => {
  socket.on('createParty', () => {
    const name = socket.characterName;
    if (!name || !players[name] || players[name].character.partyId) return;

    const partyId = `PARTY-${Math.random().toString(36).substr(2, 6).toUpperCase()}`;
    parties[partyId] = { id: partyId, leaderId: name, members: [name], sharedState: null, isSoloParty: false };
    players[name].character.partyId = partyId;
    
    socket.emit('characterUpdate', players[name].character);
    console.log(`Player ${name} created party ${partyId}`);
    broadcastPartyUpdate(io, partyId);
    broadcastOnlinePlayers(io);
  });

  socket.on('sendPartyInvite', (targetCharacterName) => {
    const inviterName = socket.characterName;
    const inviter = players[inviterName];
    const target = players[targetCharacterName];
    const partyId = inviter?.character?.partyId;

    if (!inviter || !inviter.character || !partyId) {
        return socket.emit('partyError', 'You must be in a party to invite someone.');
    }
    if (!target || !target.id) {
        return socket.emit('partyError', 'The player you are trying to invite is not online.');
    }
    if (target.character.partyId) {
        return socket.emit('partyError', `${target.character.characterName} is already in a party.`);
    }
    
    io.to(target.id).emit('receivePartyInvite', { inviterName: inviter.character.characterName, partyId: partyId });
    console.log(`${inviter.character.characterName} invited ${target.character.characterName} to party ${partyId}`);
  });

  socket.on('joinParty', (partyId) => {
    const name = socket.characterName;
    const player = players[name];
    if (!player || !player.character || player.character.partyId) return;

    const party = parties[partyId];
    if (!party) {
        return socket.emit('partyError', 'Party not found.');
    }
    if (party.members.length >= 3) {
        return socket.emit('partyError', 'Party is full.');
    }

    party.members.push(name);
    player.character.partyId = partyId;

    socket.emit('characterUpdate', player.character);
    console.log(`Player ${name} joined party ${partyId}`);
    broadcastPartyUpdate(io, partyId);
    broadcastOnlinePlayers(io);
  });

  socket.on('leaveParty', () => {
    const name = socket.characterName;
    if (!name || !players[name] || !players[name].character) return;

    const partyId = players[name].character.partyId;
    if (!partyId || !parties[partyId]) return;
    
    const party = parties[partyId];
    party.members = party.members.filter(memberName => memberName !== name);
    players[name].character.partyId = null;
    
    socket.emit('characterUpdate', players[name].character);
    console.log(`Player ${name} left party ${partyId}`);

    if (party.members.length === 0) {
        delete parties[partyId];
        console.log(`Party ${partyId} disbanded.`);
    } else {
        if (party.leaderId === name) {
            party.leaderId = party.members[0];
            console.log(`New leader for party ${partyId} is ${party.leaderId}`);
        }
        broadcastPartyUpdate(io, partyId);
    }
    
    broadcastOnlinePlayers(io);
  });
};