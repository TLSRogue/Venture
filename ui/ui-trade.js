'use strict';

import { gameState } from '../state.js';
import { showModal, hideModal, showInfoModal } from './ui-main.js';
import * as Network from '../network.js';

let currentTradeId = null;

export function renderTradeModal(tradeState, isPlayer1) {
    currentTradeId = tradeState.id;

    // Determine which side is local player
    const localState = isPlayer1 ? tradeState.player1 : tradeState.player2;
    const remoteState = isPlayer1 ? tradeState.player2 : tradeState.player1;

    const modalContent = `
        <div class="trade-container">
            <h2>Trading with ${remoteState.name}</h2>
            <div class="trade-interface">
                <div class="trade-column local-player ${localState.locked ? 'locked' : ''} ${localState.confirmed ? 'confirmed' : ''}">
                    <h3>You</h3>
                    <div class="trade-status">${getStatusText(localState)}</div>
                    <div class="trade-gold">
                        Gold: <input type="number" id="trade-gold-input" value="${localState.offer.gold}" min="0" max="${gameState.gold}" ${localState.locked ? 'disabled' : ''}>
                    </div>
                    <div class="trade-offer-slots" id="local-offer-slots">
                        ${renderOfferSlots(localState.offer.items, true, localState.locked)}
                    </div>
                </div>
                
                <div class="trade-divider">⇄</div>
                
                <div class="trade-column remote-player ${remoteState.locked ? 'locked' : ''} ${remoteState.confirmed ? 'confirmed' : ''}">
                    <h3>${remoteState.name}</h3>
                    <div class="trade-status">${getStatusText(remoteState)}</div>
                    <div class="trade-gold">Gold: ${remoteState.offer.gold}</div>
                    <div class="trade-offer-slots">
                        ${renderOfferSlots(remoteState.offer.items, false, true)}
                    </div>
                </div>
            </div>

            <div class="trade-actions">
                ${!localState.locked
            ? `<button class="btn btn-warning" id="trade-lock-btn">Lock Offer</button>`
            : `<button class="btn btn-secondary" id="trade-unlock-btn" ${localState.confirmed ? 'disabled' : ''}>Unlock Offer</button>`
        }
                
                <button class="btn btn-success" id="trade-confirm-btn" ${!localState.locked || localState.confirmed ? 'disabled' : ''}>Confirm Trade</button>
                <button class="btn btn-danger" id="trade-cancel-btn">Cancel Trade</button>
            </div>

            ${!localState.locked ? `
            <div class="trade-inventory-picker">
                <h3>Select Items to Offer</h3>
                <div class="inventory-grid" id="trade-inventory-list">
                    ${renderInventoryForTrade(gameState.inventory)}
                </div>
            </div>
            ` : ''}
        </div>
        <style>
            .trade-container { width: 800px; max-width: 90vw; }
            .trade-interface { display: flex; justify-content: space-between; align-items: stretch; gap: 20px; background: rgba(0,0,0,0.5); padding: 20px; border-radius: 8px; }
            .trade-column { flex: 1; padding: 10px; border: 1px solid #555; border-radius: 5px; min-height: 300px; display: flex; flex-direction: column; }
            .trade-column.locked { border-color: #f1c40f; background: rgba(241, 196, 15, 0.1); }
            .trade-column.confirmed { border-color: #2ecc71; background: rgba(46, 204, 113, 0.1); }
            .trade-divider { display: flex; align-items: center; font-size: 2em; color: #888; }
            .trade-offer-slots { display: flex; flex-wrap: wrap; gap: 5px; margin-top: 10px; flex: 1; align-content: flex-start; }
            .trade-slot { width: 50px; height: 50px; background: #333; border: 1px solid #555; display: flex; align-items: center; justify-content: center; position: relative; }
            .trade-slot img { max-width: 100%; max-height: 100%; }
            .trade-inventory-picker { margin-top: 20px; border-top: 1px solid #555; padding-top: 10px; }
            .inventory-grid { display: flex; flex-wrap: wrap; gap: 5px; max-height: 200px; overflow-y: auto; }
            .inv-item { width: 50px; height: 50px; background: #222; border: 1px solid #444; cursor: pointer; }
            .inv-item:hover { border-color: #fff; }
        </style>
    `;

    showModal(modalContent);

    // Attach local listeners immediately since modal content is fresh
    if (document.getElementById('trade-gold-input')) {
        document.getElementById('trade-gold-input').addEventListener('change', (e) => {
            updateOffer(currentTradeId, localState.offer.items, parseInt(e.target.value) || 0);
        });
    }

    // Inventory click listener delegation
    const invList = document.getElementById('trade-inventory-list');
    if (invList) {
        invList.addEventListener('click', (e) => {
            const itemEl = e.target.closest('.inv-item');
            if (itemEl) {
                const index = parseInt(itemEl.dataset.index);
                const item = gameState.inventory[index];
                // Check if already in offer
                if (localState.offer.items.some(i => i.index === index && i.type === 'inventory')) return;

                const newItems = [...localState.offer.items, { type: 'inventory', index, item }];
                updateOffer(currentTradeId, newItems, parseInt(document.getElementById('trade-gold-input').value) || 0);
            }
        });
    }

    // Remove item listener delegation
    const offerList = document.getElementById('local-offer-slots');
    if (offerList && !localState.locked) {
        offerList.addEventListener('click', (e) => {
            const slotEl = e.target.closest('.trade-slot');
            if (slotEl && slotEl.dataset.offerIndex) {
                const removeIdx = parseInt(slotEl.dataset.offerIndex);
                const newItems = [...localState.offer.items];
                newItems.splice(removeIdx, 1);
                updateOffer(currentTradeId, newItems, parseInt(document.getElementById('trade-gold-input').value) || 0);
            }
        });
    }

    document.getElementById('trade-lock-btn')?.addEventListener('click', () => Network.emitTradeLock(tradeState.id, true));
    document.getElementById('trade-unlock-btn')?.addEventListener('click', () => Network.emitTradeLock(tradeState.id, false));
    document.getElementById('trade-confirm-btn')?.addEventListener('click', () => Network.emitTradeConfirm(tradeState.id));
    document.getElementById('trade-cancel-btn')?.addEventListener('click', () => Network.emitTradeCancel(tradeState.id));
}

function updateOffer(tradeId, items, gold) {
    if (gold < 0) gold = 0;
    if (gold > gameState.gold) gold = gameState.gold; // Cap at max gold locally
    Network.emitTradeUpdate(tradeId, { items, gold });
}

function getStatusText(state) {
    if (state.confirmed) return 'CONFIRMED';
    if (state.locked) return 'LOCKED - Ready to Confirm';
    return 'Offering...';
}

function renderOfferSlots(items, isLocal, isLocked) {
    if (!items || items.length === 0) return '<div class="empty-msg">No items offered</div>';

    return items.map((wrapper, idx) => {
        const item = wrapper.item;
        return `
        <div class="trade-slot" data-offer-index="${idx}" title="${item.name}">
            ${item.icon || '📦'}
            ${isLocal && !isLocked ? '<span class="remove-overlay">❌</span>' : ''}
        </div>`;
    }).join('');
}

function renderInventoryForTrade(inventory) {
    return inventory.map((item, idx) => {
        if (!item) return '';
        return `
        <div class="inv-item" data-index="${idx}" title="${item.name}">
            ${item.icon || '📦'}
        </div>`;
    }).join('');
}
