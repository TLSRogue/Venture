'use strict';

/**
 * @file network.js
 * This module manages all communication with the server via Socket.IO.
 * It initializes the connection, sets up listeners for server events,
 * and provides methods for sending data to the server.
 */

export const socket = io('https://venturecrpg.onrender.com');

/**
 * Initializes all the listeners for events coming from the server.
 * This function should be called once when the game starts.
 * @param {object} handlers - An object containing callback functions for various server events.
 */
export function initSocketListeners(handlers) {
    socket.on('connect', () => {
        handlers.onConnect(socket.id);
    });

    socket.on('characterUpdate', handlers.onCharacterUpdate);
    socket.on('loadError', handlers.onLoadError);
    socket.on('partyUpdate', handlers.onPartyUpdate);
    socket.on('onlinePlayersUpdate', handlers.onOnlinePlayersUpdate);
    socket.on('partyError', handlers.onPartyError);
    socket.on('receivePartyInvite', handlers.onReceivePartyInvite);
    socket.on('party:adventureStarted', handlers.onPartyAdventureStarted);
    socket.on('party:adventureUpdate', handlers.onPartyAdventureUpdate);
    socket.on('party:showDialogue', handlers.onShowDialogue);
    socket.on('party:hideDialogue', handlers.onHideDialogue);
    socket.on('party:adventureEnded', handlers.onPartyAdventureEnded);
    socket.on('party:requestReaction', handlers.onPartyRequestReaction);
    socket.on('party:requestDebuffSelection', handlers.onPartyRequestDebuffSelection);

    // Loot Roll Listeners
    socket.on('party:lootRollStarted', handlers.onPartyLootRollStarted);
    socket.on('party:lootRollEnded', handlers.onPartyLootRollEnded);

    // NEW: PvP Flee Request Listener
    socket.on('party:pvpFleeRequest', handlers.onPartyPvpFleeRequest);

    // Duel Listeners
    socket.on('duel:receiveChallenge', handlers.onDuelReceiveChallenge);
    socket.on('duel:start', handlers.onDuelStart);
    socket.on('duel:update', handlers.onDuelUpdate);
    socket.on('duel:end', handlers.onDuelEnd);

    // Chat Listeners
    socket.on('chat:globalMessage', handlers.onGlobalChatMessage);
    socket.on('chat:globalHistory', handlers.onGlobalChatHistory);
    socket.on('chat:zoneMessage', handlers.onZoneChatMessage);

    // Trade Listeners
    socket.on('trade:receiveOffer', handlers.onTradeReceiveOffer);
    socket.on('trade:start', handlers.onTradeStart);
    socket.on('trade:update', handlers.onTradeUpdate);
    socket.on('trade:complete', handlers.onTradeComplete);
    socket.on('trade:error', handlers.onTradeError);
    socket.on('trade:ended', handlers.onTradeEnded);
    socket.on('trade:chat', handlers.onTradeChat);

}

// --- EMITTER FUNCTIONS ---

export function emitPlayerAction(type, payload) {
    socket.emit('playerAction', { type, payload });
}

export function emitRegisterPlayer(characterData) {
    socket.emit('registerPlayer', characterData);
}

export function emitLoadCharacter(characterData) {
    socket.emit('loadCharacter', characterData);
}

export function emitUpdateCharacter(characterData) {
    socket.emit('updateCharacter', characterData);
}

export function emitCreateParty() {
    socket.emit('createParty');
}

export function emitJoinParty(partyId) {
    socket.emit('joinParty', partyId);
}

export function emitLeaveParty() {
    socket.emit('leaveParty');
}

export function emitSendPartyInvite(targetCharacterName) {
    socket.emit('sendPartyInvite', targetCharacterName);
}

export function emitPartyEnterZone(zoneName) {
    socket.emit('party:enterZone', zoneName);
}

export function emitPartyAction(action) {
    socket.emit('party:playerAction', action);
}

export function emitDuelChallenge(targetCharacterName) {
    socket.emit('duel:challenge', targetCharacterName);
}

export function emitDuelAccept(challengerId) {
    socket.emit('duel:accept', challengerId);
}

export function emitDuelAction(action) {
    socket.emit('duel:playerAction', action);
}

// --- CHAT EMITTERS ---

export function emitGlobalChatMessage(message) {
    socket.emit('chat:sendGlobal', message);
}

export function emitZoneChatMessage(message) {
    socket.emit('chat:sendZone', message);
}

export function requestGlobalChatHistory() {
    socket.emit('chat:requestGlobalHistory');
}

// --- TRADE EMITTERS ---

export function emitTradeOffer(targetName) {
    socket.emit('trade:offer', targetName);
}

export function emitTradeAccept(offererName) {
    socket.emit('trade:accept', offererName);
}

export function emitTradeUpdate(tradeId, offer) {
    socket.emit('trade:updateOffer', { tradeId, offer });
}

export function emitTradeLock(tradeId, locked) {
    socket.emit('trade:lock', { tradeId, locked });
}

export function emitTradeConfirm(tradeId) {
    socket.emit('trade:confirm', { tradeId });
}

export function emitTradeCancel(tradeId) {
    socket.emit('trade:cancel', { tradeId });
}

export function emitTradeChat(tradeId, message) {
    socket.emit('trade:chat', { tradeId, message });
}