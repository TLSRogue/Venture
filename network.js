'use strict';

/**
 * @file network.js
 * This module manages all communication with the server via Socket.IO.
 * It initializes the connection, sets up listeners for server events,
 * and provides methods for sending data to the server.
 */

export const socket = io({
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 5000,
    randomizationFactor: 0.5
});

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

    // Duel Listeners
    socket.on('duel:receiveChallenge', handlers.onDuelReceiveChallenge);
    socket.on('duel:start', handlers.onDuelStart);
    socket.on('duel:update', handlers.onDuelUpdate);
    socket.on('duel:end', handlers.onDuelEnd);

}

// --- EMITTER FUNCTIONS ---
// These functions wrap socket.emit calls to provide a clean API
// for other modules to interact with the server.

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

export function emitPartyEnterZone(zoneName, characterData) {
    socket.emit('party:enterZone', zoneName, characterData);
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


export function autoSave(gameState) {
    if (!socket.connected || !gameState || !gameState.characterName) {
        console.log("Auto-save prevented: No character loaded or not connected.");
        return;
    }

    // FIX: Do not auto-save while the player is in a server-managed state.
    // This prevents the client's state from overwriting critical server data
    // like a `duelId` or `partyId` during an active session.
    if (gameState.inDuel || gameState.currentZone) {
        console.log("Auto-save deferred: Player is in an active duel or adventure.");
        return;
    }
    
    // Create a copy of the state to avoid modifying the original object
    const stateToSave = { ...gameState };

    // Delete temporary, session-specific properties that should not be saved
    delete stateToSave.currentZone;
    delete stateToSave.zoneCards;
    delete stateToSave.zoneDeck;
    delete stateToSave.partyMemberStates; 
    delete stateToSave.turnState;
    delete stateToSave.inDuel;
    delete stateToSave.duelState;
    
    socket.emit('updateCharacter', stateToSave);
    console.log("Game auto-saved.");
}