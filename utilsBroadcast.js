// utils/broadcast.js

/**
 * This module contains all broadcasting functions for the server.
 * It imports the server state to get the necessary data for sending updates.
 */

// MODIFICATION: Corrected import paths from ../ to ./
import { players, parties, duels } from './serverState.js';
import { createStateForClient } from './utilsHelpers.js';

export function broadcastOnlinePlayers(io) {
    const onlinePlayers = Object.values(players)
        .filter(p => p.id && p.character && !p.character.partyId)
        .map(p => ({
            id: p.character.characterName,
            name: p.character.characterName
        }));
    io.emit('onlinePlayersUpdate', onlinePlayers);
}

export function broadcastPartyUpdate(io, partyId) {
    if (parties[partyId]) {
        const party = parties[partyId];

        const partyMembersForPayload = party.members.map(name => {
            const player = players[name];
            const isLeader = name === party.leaderId;
            const duelId = player?.character?.duelId;
            const isInDuel = !!(duelId && duels[duelId] && !duels[duelId].ended);
            return {
                id: player?.id,
                name: name,
                isLeader: isLeader,
                isInDuel: isInDuel,
            };
        });

        party.members.forEach(memberName => {
            const player = players[memberName];
            if (player && player.id && io.sockets.sockets.get(player.id)) {
                const isThisMemberLeader = party.leaderId === memberName;
                io.to(player.id).emit('partyUpdate', {
                    partyId: partyId,
                    leaderId: party.leaderId,
                    members: partyMembersForPayload,
                    isPartyLeader: isThisMemberLeader
                });
            }
        });
    }
}

export function broadcastAdventureUpdate(io, partyId) {
    const party = parties[partyId];
    if (party && party.sharedState) {
        const clientState = createStateForClient(party.sharedState);

        party.members.forEach(memberName => {
            const player = players[memberName];
            const socket = player && player.id ? io.sockets.sockets.get(player.id) : null;
            if (socket) {
                socket.emit('party:adventureUpdate', clientState);
            }
        });
    }
}

export function broadcastDuelUpdate(io, duelId) {
    const duel = duels[duelId];
    if (duel) {
        const player1 = players[duel.player1.name];
        const player2 = players[duel.player2.name];
        if (player1 && player1.id) io.to(player1.id).emit('duel:update', duel);
        if (player2 && player2.id) io.to(player2.id).emit('duel:update', duel);
    }
}