'use strict';

import { gameState } from '../state.js';
import { showModal, hideModal, showInfoModal } from './ui-main.js'; // BUG FIX: Added hideModal
import { emitLeaveParty } from '../network.js';

export function renderPartyManagement(party) {
  const container = document.getElementById('party-management-area');
  if (!container) return;

  if (party) {
    const membersList = party.members
      .map((member) => {
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
      })
      .join('');

    container.innerHTML = `
            <h3>Your Party (ID: <span class="party-id-display">${party.partyId}</span>)</h3>
            <ul class="party-member-list">${membersList}</ul>
            <div class="action-buttons">
                <button id="copy-party-id-btn" class="btn btn-primary">Copy ID</button>
                <button id="leave-party-btn" class="btn btn-danger">Leave Party</button>
            </div>
        `;
  } else if (gameState.partyId) {
    // Auto-fix desync: player thinks they're in a party that doesn't exist on the server.
    // Silently send a leave-party request to clean up the server state, and clear locally.
    console.log(`Auto-fixing desync: clearing stale partyId ${gameState.partyId}`);
    emitLeaveParty();
    gameState.partyId = null;
    gameState.isPartyLeader = false;
    gameState.partyMembers = [];

    // Render the normal "not in a party" state
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

  const otherPlayers = onlinePlayers.filter((p) => p.name !== gameState.characterName);

  if (otherPlayers.length === 0) {
    container.innerHTML = '<p>No other players online.</p>';
    return;
  }

  const playersList = otherPlayers
    .map((player) => {
      const isInParty = !!player.partyId;
      const isInAdventure = !!player.inAdventure;
      const statusBadge = isInAdventure
        ? '<span class="player-status-badge adventure">⚔️ Adventure</span>'
        : isInParty
          ? '<span class="player-status-badge party">🎉 In Party</span>'
          : '<span class="player-status-badge online">🟢 Online</span>';

      const inviteDisabled = isInParty ? 'disabled' : '';
      const duelDisabled = isInAdventure ? 'disabled' : '';

      return `
        <li class="party-member-list-item" style="display: flex; justify-content: space-between; align-items: center;">
            <span class="online-player-name">${player.name} ${statusBadge}</span>
            <div style="display: flex; gap: 5px;">
                <button class="btn btn-primary btn-sm" data-action="invite" data-id="${player.name}" ${inviteDisabled}>Invite</button>
                <button class="btn btn-success btn-sm" data-action="trade" data-id="${player.name}">Trade</button>
                <button class="btn btn-danger btn-sm" data-action="duel" data-id="${player.name}" ${duelDisabled}>Duel</button>
            </div>
        </li>
    `;
    })
    .join('');
  container.innerHTML = `<ul class="party-member-list">${playersList}</ul>`;
}

const AVAILABLE_AVATARS = [
  '/assets/avatars/avatar-male-1.jpg',
  '/assets/avatars/avatar-female-1.jpg',
  '/assets/avatars/avatar-male-2.jpg',
  '/assets/avatars/avatar-female-2.jpg',
];

export function showCharacterSelectScreen() {
  document.querySelector('.game-container').style.display = 'none';
  const characterSlots = JSON.parse(localStorage.getItem('ventureCharacterSlots') || '[null, null, null]');
  let slotsHTML = '';

  characterSlots.forEach((char, index) => {
    slotsHTML += '<div class="character-slot">';
    if (char) {
      const isImage = char.characterIcon && char.characterIcon.includes('/');
      const iconHtml = isImage
        ? `<img src="${char.characterIcon}" class="char-icon-img">`
        : `<span class="char-icon">${char.characterIcon || '👤'}</span>`;

      slotsHTML += `
                <div class="char-info">
                    ${iconHtml}
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
            .char-icon-img { width: 64px; height: 64px; border-radius: 50%; object-fit: cover; border: 2px solid #fff; }
            .char-name { font-size: 1.2em; font-weight: bold; display: block; }
            .char-title { font-style: italic; color: var(--accent-color); }
        </style>
    `;
  showModal(modalContent);
}

export function showNewGameModal(slotIndex) {
  const icons = AVAILABLE_AVATARS;
  let iconSelectionHTML = '';
  icons.forEach((icon, index) => {
    iconSelectionHTML += `<div class="icon-option ${index === 0 ? 'selected' : ''}" data-icon="${icon}"><img src="${icon}"></div>`;
  });

  const modalContent = `
        <h2>Create Your Character</h2>
        <p>Enter your adventurer's name:</p>
        <input type="text" id="character-name-input" placeholder="e.g., Sir Reginald" style="width: 80%; padding: 10px; margin: 10px 0; border-radius: 5px; border: 1px solid #7f8c8d; background: #34495e; color: white;">
        <p>Choose your avatar:</p>
        <div class="icon-selection">${iconSelectionHTML}</div>
        <div class="action-buttons">
            <button class="btn btn-success" id="finalize-char-btn" data-slot="${slotIndex}">Begin Adventure</button>
            <button class="btn" id="cancel-creation-btn">Cancel</button>
        </div>
        <style>
            .icon-selection { display: flex; gap: 15px; justify-content: center; margin: 20px 0; flex-wrap: wrap; }
            .icon-option { cursor: pointer; padding: 5px; border-radius: 50%; transition: transform 0.2s; border: 3px solid transparent; }
            .icon-option:hover { transform: scale(1.1); }
            .icon-option img { width: 60px; height: 60px; border-radius: 50%; object-fit: cover; display: block; }
            .icon-option.selected { border-color: var(--accent-color); box-shadow: 0 0 10px var(--accent-color); }
        </style>
    `;
  showModal(modalContent);
  document.getElementById('character-name-input').focus();
}

export function showAvatarSelectionModal() {
  const icons = AVAILABLE_AVATARS;
  let iconSelectionHTML = '';
  const currentIcon = gameState.characterIcon;
  icons.forEach((icon) => {
    const isSelected = icon === currentIcon;
    iconSelectionHTML += `<div class="icon-option ${isSelected ? 'selected' : ''}" data-icon="${icon}"><img src="${icon}"></div>`;
  });

  const modalContent = `
        <h2>Change Avatar</h2>
        <p>Select a new appearance:</p>
        <div class="icon-selection">${iconSelectionHTML}</div>
        <div class="action-buttons">
            <button class="btn btn-success" id="confirm-avatar-change-btn">Confirm Change</button>
            <button class="btn" onclick="document.getElementById('modal').classList.add('hidden')">Cancel</button>
        </div>
        <style>
            .icon-selection { display: flex; gap: 15px; justify-content: center; margin: 20px 0; flex-wrap: wrap; }
            .icon-option { cursor: pointer; padding: 5px; border-radius: 50%; transition: transform 0.2s; border: 3px solid transparent; }
            .icon-option:hover { transform: scale(1.1); }
            .icon-option img { width: 60px; height: 60px; border-radius: 50%; object-fit: cover; display: block; }
            .icon-option.selected { border-color: var(--accent-color); box-shadow: 0 0 10px var(--accent-color); }
        </style>
    `;
  showModal(modalContent);
}

export function showNPCDialogueFromServer({ npcName, node, cardIndex }) {
  if (!node) {
    hideModal();
    return;
  }

  let modalContent = `<h2>${npcName}</h2><p>${node.text}</p>`;
  let buttons = '<div class="action-buttons" id="npc-dialogue-options" style="flex-direction: column; gap: 10px;">';

  node.options.forEach((option) => {
    const payload = {
      cardIndex: cardIndex,
      choice: option,
    };

    const safePayload = JSON.stringify(payload).replace(/'/g, '&#39;');
    let action = `data-action="choice" data-payload='${safePayload}'`;

    if (option.next === 'farewell' && !option.action) {
      action = `data-action="hide"`;
    }

    // Any party member can now interact with dialogue (no leader-only check)
    buttons += `<button class="btn btn-primary" ${action}>${option.text}</button>`;
  });

  buttons += `<button class="btn" data-action="hide">Leave Conversation</button>`;

  buttons += '</div>';
  modalContent += buttons;
  showModal(modalContent);
}
