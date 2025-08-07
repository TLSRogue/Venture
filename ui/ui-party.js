'use strict';

import { gameState } from '../state.js';
import { showModal, showInfoModal } from './ui-main.js';

export function renderPartyManagement(party) {
    const container = document.getElementById('party-management-area');
    if (!container) return;

    if (party) {
        const membersList = party.members.map(member => {
            const isLocalPlayer = member.name === gameState.characterName;
            let memberHtml = `<li>${member.name} ${isLocalPlayer ? '(You)' : ''} ${member.isLeader ? '⭐' : ''}`;
            
            if (!isLocalPlayer) {
                const isAdventureActive = gameState.currentZone !== null || gameState.inDuel;
                const duelButton = !isAdventureActive 
                    ? `<button class="btn btn-danger btn-sm" data-action="duel" data-id="${member.name}" ${member.isInDuel ? 'disabled' : ''}>
                           ${member.isInDuel ? 'In Duel' : 'Duel'}
                       </button>` 
                    : '';
                memberHtml += `
                    <div style="display: inline-flex; gap: 5px; float: right;">
                        ${duelButton}
                    </div>
                `;
            }
            memberHtml += `</li>`;
            return memberHtml;
        }).join('');

        container.innerHTML = `
            <h3>Your Party (ID: <span class="party-id-display">${party.partyId}</span>)</h3>
            <ul class="party-member-list">${membersList}</ul>
            <div class="action-buttons">
                <button id="copy-party-id-btn" class="btn btn-primary">Copy ID</button>
                <button id="leave-party-btn" class="btn btn-danger">Leave Party</button>
            </div>
        `;
    } else if (gameState.partyId) {
        // This is the "stuck" or "desynced" party state. Show a manual fix UI.
        container.innerHTML = `
            <h3>Party Desynchronized</h3>
            <p>Your character data indicates you are in a party (ID: ${gameState.partyId}), but the party is no longer active on the server. This can happen after a disconnect.</p>
            <p>Click here to force-leave the party and fix your character's state.</p>
            <div class="action-buttons">
                <button id="leave-party-btn" class="btn btn-danger">Force Leave Party</button>
            </div>
        `;
    } else {
        // This is the normal state for a player not in a party.
        container.innerHTML = `
            <p>You are not in a party. Create one to invite friends, or join a friend's party using their ID.</p>
            <div class="action-buttons">
                <button id="create-party-btn" class="btn btn-success">Create Party</button>
            </div>
            <div class="party-join-container">
                <input type="text" id="party-id-input" placeholder="Enter Party ID">
                <button id="join-party-btn" class="btn btn-primary">Join</button>
            </div>
        `;
    }
}

export function renderOnlinePlayers(onlinePlayers) {
    const container = document.getElementById('online-players-list');
    if (!container) return;

    const otherPlayers = onlinePlayers.filter(p => p.name !== gameState.characterName);

    if (otherPlayers.length === 0) {
        container.innerHTML = '<p>No other players online.</p>';
        return;
    }

    const canInvite = gameState.partyId !== null;

    const playersList = otherPlayers.map(player => `
        <li class="party-member-list-item" style="display: flex; justify-content: space-between; align-items: center;">
            <span>${player.name}</span>
            ${canInvite ? `<button class="btn btn-primary btn-sm" data-action="invite" data-id="${player.name}">Invite</button>` : ''}
        </li>
    `).join('');
    container.innerHTML = `<ul class="party-member-list">${playersList}</ul>`;
}

export function showCharacterSelectScreen() {
    document.querySelector('.game-container').style.display = 'none';
    const characterSlots = JSON.parse(localStorage.getItem('ventureCharacterSlots') || '[null, null, null]');
    let slotsHTML = '';

    characterSlots.forEach((char, index) => {
        slotsHTML += '<div class="character-slot">';
        if (char) {
            slotsHTML += `
                <div class="char-info">
                    <span class="char-icon">${char.characterIcon}</span>
                    <div>
                        <span class="char-name">${char.characterName}</span>
                        <span class="char-title">${char.title}</span>
                    </div>
                </div>
                <div class="action-buttons">
                    <button class="btn btn-success" data-action="load" data-slot="${index}">Load</button>
                    <button class="btn btn-danger" data-action="delete" data-slot="${index}">Delete</button>
                </div>
            `;
        } else {
            slotsHTML += `
                <div class="char-info-empty">Empty Slot</div>
                <div class="action-buttons">
                    <button class="btn btn-primary" data-action="create" data-slot="${index}">Create</button>
                </div>
            `;
        }
        slotsHTML += '</div>';
    });

    const modalContent = `
        <h2>Select Your Character</h2>
        <div id="character-select-grid">${slotsHTML}</div>
        <style>
            #character-select-grid { display: flex; flex-direction: column; gap: 15px; margin-top: 20px; }
            .character-slot { display: flex; justify-content: space-between; align-items: center; background: rgba(0,0,0,0.3); padding: 15px; border-radius: 8px; }
            .char-info { display: flex; align-items: center; gap: 15px; }
            .char-icon { font-size: 2.5em; }
            .char-name { font-size: 1.2em; font-weight: bold; display: block; }
            .char-title { font-style: italic; color: var(--accent-color); }
        </style>
    `;
    showModal(modalContent);
}

export function showNewGameModal(slotIndex) {
    const icons = ['🧑', '👩', '👨‍🚀', '🦸', '🦹', '🧙', '🧝', '🧛', '🧟'];
    let iconSelectionHTML = '';
    icons.forEach((icon, index) => {
        iconSelectionHTML += `<div class="icon-option ${index === 0 ? 'selected' : ''}" data-icon="${icon}">${icon}</div>`;
    });

    const modalContent = `
        <h2>Create Your Character</h2>
        <p>Enter your adventurer's name:</p>
        <input type="text" id="character-name-input" placeholder="e.g., Sir Reginald" style="width: 80%; padding: 10px; margin: 10px 0; border-radius: 5px; border: 1px solid #7f8c8d; background: #34495e; color: white;">
        <p>Choose your icon:</p>
        <div class="icon-selection">${iconSelectionHTML}</div>
        <div class="action-buttons">
            <button class="btn btn-success" id="finalize-char-btn" data-slot="${slotIndex}">Begin Adventure</button>
            <button class="btn" id="cancel-creation-btn">Cancel</button>
        </div>
    `;
    showModal(modalContent);
    document.getElementById('character-name-input').focus();
}

export function showNPCDialogueFromServer({ npcName, node, cardIndex }) {
    if (!node) {
        hideModal();
        return;
    }

    let modalContent = `<h2>${npcName}</h2><p>${node.text}</p>`;
    let buttons = '<div class="action-buttons" id="npc-dialogue-options" style="flex-direction: column; gap: 10px;">';
    const isPartyLeader = gameState.isPartyLeader;

    node.options.forEach(option => {
        const payload = {
            cardIndex: cardIndex,
            choice: option
        };
        
        const safePayload = JSON.stringify(payload).replace(/'/g, "&#39;");
        let action = `data-action="choice" data-payload='${safePayload}'`;
        
        if (option.next === 'farewell') {
            action = `data-action="hide"`;
        }

        buttons += `<button class="btn btn-primary" ${action} ${!isPartyLeader ? 'disabled' : ''}>${option.text}</button>`;
    });

    buttons += `<button class="btn" data-action="hide">Leave Conversation</button>`;

    if (!isPartyLeader) {
        buttons += `<p style="margin-top: 15px; font-style: italic; opacity: 0.7;">Only the party leader can make dialogue choices.</p>`;
    }

    buttons += '</div>';
    modalContent += buttons;
    showModal(modalContent);
}