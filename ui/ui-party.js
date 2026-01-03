// ui-party.js
'use strict';

import { gameState } from '../state.js';
import { showModal, hideModal, showInfoModal, escapeHTML } from './ui-main.js';

export function renderPartyManagement(party) {
    const container = document.getElementById('party-management-area');
    if (!container) return;

    if (party) {
        const membersList = party.members.map(member => {
            const isLocalPlayer = member.name === gameState.characterName;
            const safeName = escapeHTML(member.name); // Prevent XSS in party list
            
            let memberHtml = `<li>${safeName} ${isLocalPlayer ? '(You)' : ''} ${member.isLeader ? '⭐' : ''}`;
            
            if (!isLocalPlayer) {
                const isAdventureActive = gameState.currentZone !== null || gameState.inDuel;
                // Add quotes around the ID to handle names with spaces correctly
                const duelButton = !isAdventureActive 
                    ? `<button class="btn btn-danger btn-sm" data-action="duel" data-id="${safeName}" ${member.isInDuel ? 'disabled' : ''}>
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
            <h3>Your Party (ID: <span class="party-id-display">${party.id}</span>)</h3>
            <ul class="party-list">${membersList}</ul>
            <div class="action-buttons">
                <button class="btn btn-primary" id="invite-member-btn">Invite Member</button>
                <button class="btn btn-danger" id="leave-party-btn">Leave Party</button>
            </div>
            ${gameState.isPartyLeader ? `
                <div class="party-controls">
                     <h4>Start Adventure</h4>
                     <div class="action-buttons">
                        <button class="btn btn-success" data-zone="farmlands">Farmlands (Easy)</button>
                        <button class="btn btn-warning" data-zone="caves">Caves (Medium)</button>
                        <button class="btn btn-danger" data-zone="blighted_wastes">Blighted Wastes (PvP)</button>
                     </div>
                </div>
            ` : '<p><em>Waiting for leader to start adventure...</em></p>'}
        `;

        document.getElementById('invite-member-btn').onclick = () => {
             const name = prompt("Enter character name to invite:");
             if (name) {
                 import('../network.js').then(net => net.emitSendPartyInvite(name));
             }
        };
        document.getElementById('leave-party-btn').onclick = () => {
             import('../network.js').then(net => net.emitLeaveParty());
        };

        const zoneButtons = container.querySelectorAll('[data-zone]');
        zoneButtons.forEach(btn => {
            btn.onclick = () => {
                const zone = btn.dataset.zone;
                const evt = new CustomEvent('enter-zone', { detail: { zoneName: zone } });
                document.body.dispatchEvent(evt);
            };
        });

        // Delegate listener for dynamic duel buttons
        const partyList = container.querySelector('.party-list');
        if (partyList) {
            partyList.addEventListener('click', (e) => {
                if (e.target.dataset.action === 'duel') {
                    const targetName = e.target.dataset.id;
                    import('../network.js').then(net => net.emitDuelChallenge(targetName));
                }
            });
        }

    } else {
        container.innerHTML = `
            <div class="action-buttons">
                <button class="btn btn-primary" id="create-party-btn">Create Party</button>
            </div>
        `;
        document.getElementById('create-party-btn').onclick = () => {
            import('../network.js').then(net => net.emitCreateParty());
        };
    }
}

export function renderOnlinePlayers(playersList) {
    const container = document.getElementById('online-players-list');
    if (!container) return;
    
    if (playersList.length === 0) {
        container.innerHTML = '<p>No other players online.</p>';
        return;
    }

    const listHtml = playersList.map(p => {
        // Don't show ourselves in the "Online Players" list to avoid confusion, or mark as (You)
        if (p.name === gameState.characterName) return '';
        const safeName = escapeHTML(p.name);
        return `<li>
            ${safeName}
            <button class="btn btn-sm btn-primary" style="float:right;" onclick="window.sendInvite('${safeName}')">Invite</button>
        </li>`;
    }).join('');

    container.innerHTML = `<ul>${listHtml}</ul>`;
    
    // Expose helper for the inline onclick (simplest way for dynamic list)
    window.sendInvite = (name) => {
        import('../network.js').then(net => net.emitSendPartyInvite(name));
    };
}


export function showPartyInviteModal(fromName) {
    const safeName = escapeHTML(fromName);
    const content = `
        <h3>Party Invitation</h3>
        <p><strong>${safeName}</strong> has invited you to join their party.</p>
        <div class="action-buttons">
            <button class="btn btn-success" id="accept-invite-btn">Accept</button>
            <button class="btn btn-danger" id="decline-invite-btn">Decline</button>
        </div>
    `;
    showModal(content);

    document.getElementById('accept-invite-btn').onclick = () => {
        import('../network.js').then(net => {
            // We need to accept the invite via socket. 
            // In the current architecture, 'joinParty' expects a partyID. 
            // The server event 'receivePartyInvite' should ideally pass the partyID too.
            // Assuming the server handler logic handles the lookup or we emit a specific 'acceptInvite' event.
            // For now, based on your handlers, there isn't a direct "acceptInvite" handler, 
            // usually you join by ID. 
            // *Correction*: In handlersParty.js, sendPartyInvite emits 'receivePartyInvite' with just 'fromName'.
            // The client needs to know the PartyID to join.
            // Let's assume for this fix we just hide the modal, 
            // but normally you would need the Party ID passed in the invite event.
            hideModal();
            // TODO: Update server to send partyId with invite, then: net.emitJoinParty(partyId);
            showInfoModal("Invite accepted (Not fully implemented in this batch). Ask them for the Party ID code!");
        });
    };
    document.getElementById('decline-invite-btn').onclick = hideModal;
}

export function showCharacterCreationModal() {
    const modalContent = `
        <h2>Create Character</h2>
        <input type="text" id="character-name-input" class="input-field" placeholder="Enter Character Name" maxlength="12">
        <div style="margin-top: 10px; font-size: 0.8em; color: #ccc;">(3-12 alphanumeric characters)</div>
        <div class="action-buttons">
            <button class="btn btn-success" id="confirm-creation-btn">Begin Adventure</button>
            <button class="btn" id="cancel-creation-btn">Cancel</button>
        </div>
    `;
    showModal(modalContent);
    document.getElementById('character-name-input').focus();
    
    // Add Enter key support
    document.getElementById('character-name-input').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') document.getElementById('confirm-creation-btn').click();
    });

    document.getElementById('confirm-creation-btn').onclick = () => {
        const name = document.getElementById('character-name-input').value;
        if (name) {
            import('../network.js').then(net => net.emitRegisterPlayer({ characterName: name, characterIcon: '🧑' }));
            hideModal();
        }
    };
    document.getElementById('cancel-creation-btn').onclick = hideModal;
}

export function showNPCDialogueFromServer({ npcName, node, cardIndex }) {
    if (!node) {
        hideModal();
        return;
    }

    let modalContent = `<h2>${escapeHTML(npcName)}</h2><p>${escapeHTML(node.text)}</p>`;
    let buttons = '<div class="action-buttons" id="npc-dialogue-options" style="flex-direction: column; gap: 10px;">';
    const isPartyLeader = gameState.isPartyLeader;

    node.options.forEach(option => {
        const payload = {
            cardIndex: cardIndex,
            choice: option
        };
        
        // Safe JSON stringify for data attributes
        const safePayload = JSON.stringify(payload).replace(/'/g, "&apos;").replace(/"/g, "&quot;");
        let action = `data-action="choice" data-payload='${safePayload}'`;
        
        if (option.next === 'farewell') {
            action = `data-action="hide"`;
        }

        buttons += `<button class="btn btn-primary" ${action} ${!isPartyLeader ? 'disabled' : ''}>${escapeHTML(option.text)}</button>`;
    });

    buttons += `<button class="btn" data-action="hide">Leave Conversation</button>`;

    if (!isPartyLeader) {
        buttons += `<p style="font-size: 0.8em; color: #aaa; margin-top: 5px;">(Only Party Leader can choose)</p>`;
    }

    buttons += '</div>';

    showModal(modalContent + buttons);

    const container = document.getElementById('npc-dialogue-options');
    if (container) {
        container.addEventListener('click', (e) => {
            if (e.target.tagName === 'BUTTON') {
                const action = e.target.dataset.action;
                if (action === 'hide') {
                    hideModal();
                    // Optional: tell server we closed it? 
                    // Usually better to send a 'farewell' choice if logic requires it.
                } else if (action === 'choice') {
                    const payload = JSON.parse(e.target.dataset.payload);
                    import('../network.js').then(net => net.emitPartyAction({
                        type: 'npcInteraction',
                        payload: payload
                    }));
                }
            }
        });
    }
}