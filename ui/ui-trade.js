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
        <div class="trade-wrapper">
            <h2 class="trade-title">Trading with <span class="partner-name">${remoteState.name}</span></h2>
            
            <div class="trade-main-area">
                <!-- Local Player Column -->
                <div class="trade-column local-player ${localState.locked ? 'locked' : ''} ${localState.confirmed ? 'confirmed' : ''}">
                    <div class="column-header">
                        <span class="player-label">You</span>
                        <span class="status-badge ${localState.activeStatusClass}">${getStatusText(localState)}</span>
                    </div>
                    
                    <div class="gold-input-container">
                        <span class="gold-icon">💰</span>
                        <input type="number" id="trade-gold-input" 
                               value="${localState.offer.gold}" 
                               min="0" max="${gameState.gold}" 
                               class="gold-input"
                               ${localState.locked ? 'disabled' : ''}>
                        <span class="gold-label">Gold</span>
                    </div>

                    <div class="offer-area">
                        <div class="offer-slots" id="local-offer-slots">
                            ${renderOfferSlots(localState.offer.items, true, localState.locked)}
                        </div>
                    </div>
                </div>
                
                <!-- Center Divider -->
                <div class="trade-divider">
                    <div class="arrow-icon">⇄</div>
                </div>
                
                <!-- Remote Player Column -->
                <div class="trade-column remote-player ${remoteState.locked ? 'locked' : ''} ${remoteState.confirmed ? 'confirmed' : ''}">
                   <div class="column-header">
                        <span class="player-label">${remoteState.name}</span>
                        <span class="status-badge ${remoteState.activeStatusClass}">${getStatusText(remoteState)}</span>
                    </div>
                    
                    <div class="gold-display-container">
                        <span class="gold-icon">💰</span>
                        <span class="gold-amount">${remoteState.offer.gold}</span>
                        <span class="gold-label">Gold</span>
                    </div>

                    <div class="offer-area">
                        <div class="offer-slots">
                            ${renderOfferSlots(remoteState.offer.items, false, true)}
                        </div>
                    </div>
                </div>
            </div>

            <!-- Action Buttons -->
            <div class="trade-actions">
                ${!localState.locked
            ? `<button class="btn btn-warning action-btn" id="trade-lock-btn">🔒 Lock Offer</button>`
            : `<button class="btn btn-secondary action-btn" id="trade-unlock-btn" ${localState.confirmed ? 'disabled' : ''}>🔓 Unlock</button>`
        }
                
                <button class="btn btn-success action-btn" id="trade-confirm-btn" ${!localState.locked || localState.confirmed ? 'disabled' : ''}>
                    ✅ Confirm Trade
                </button>
                
                <button class="btn btn-danger action-btn" id="trade-cancel-btn">❌ Cancel</button>
            </div>

            <!-- Inventory Picker (Only visible if not locked) -->
            ${!localState.locked ? `
            <div class="trade-inventory-section">
                <h3>Your Inventory <small>(Click to add)</small></h3>
                <div class="mini-inventory-grid" id="trade-inventory-list">
                    ${renderInventoryForTrade(gameState.inventory, localState.offer.items)}
                </div>
            </div>
            ` : ''}
        </div>
        
        <style>
            .trade-wrapper {
                display: flex;
                flex-direction: column;
                gap: 15px;
                color: #ecf0f1;
            }
            
            .trade-title {
                margin: 0;
                font-size: 1.5em;
                border-bottom: 1px solid rgba(255,255,255,0.1);
                padding-bottom: 10px;
            }
            .partner-name { color: #f1c40f; }

            .trade-main-area {
                display: flex;
                gap: 20px;
                align-items: stretch;
                min-height: 250px;
            }

            .trade-column {
                flex: 1;
                background: rgba(0, 0, 0, 0.3);
                border: 1px solid #7f8c8d;
                border-radius: 8px;
                padding: 15px;
                display: flex;
                flex-direction: column;
                gap: 15px;
                transition: all 0.3s ease;
            }

            .trade-column.locked {
                border-color: #f1c40f;
                background: rgba(241, 196, 15, 0.05);
                box-shadow: 0 0 10px rgba(241, 196, 15, 0.1);
            }
            .trade-column.confirmed {
                border-color: #2ecc71;
                background: rgba(46, 204, 113, 0.1);
                box-shadow: 0 0 15px rgba(46, 204, 113, 0.2);
            }

            .column-header {
                display: flex;
                justify-content: space-between;
                align-items: center;
                border-bottom: 1px solid rgba(255,255,255,0.1);
                padding-bottom: 5px;
            }
            .player-label { font-weight: bold; font-size: 1.1em; }
            .status-badge { font-size: 0.8em; padding: 2px 6px; border-radius: 4px; background: #555; }
            .status-badge.locked { background: #d35400; }
            .status-badge.confirmed { background: #27ae60; }

            .gold-input-container, .gold-display-container {
                display: flex;
                align-items: center;
                gap: 10px;
                background: rgba(0,0,0,0.4);
                padding: 8px;
                border-radius: 6px;
            }
            .gold-input {
                background: transparent;
                border: none;
                border-bottom: 1px solid #7f8c8d;
                color: #f1c40f;
                font-size: 1.1em;
                width: 80px;
                text-align: right;
            }
            .gold-amount {
                color: #f1c40f;
                font-weight: bold;
                font-size: 1.1em;
                flex-grow: 1;
                text-align: right;
            }
            
            .offer-area {
                flex-grow: 1;
                background: rgba(0,0,0,0.2);
                border-radius: 6px;
                padding: 5px;
            }
            
            .offer-slots {
                display: grid;
                grid-template-columns: repeat(4, 1fr);
                gap: 5px;
            }

            .trade-slot {
                aspect-ratio: 1;
                background: rgba(255,255,255,0.05);
                border: 1px solid rgba(255,255,255,0.1);
                border-radius: 4px;
                display: flex;
                align-items: center;
                justify-content: center;
                position: relative;
                font-size: 2em;
            }
            .trade-slot img { max-width: 80%; max-height: 80%; }
            .trade-slot .remove-btn {
                position: absolute;
                top: -5px;
                right: -5px;
                background: #c0392b;
                color: white;
                border: none;
                border-radius: 50%;
                width: 18px;
                height: 18px;
                font-size: 12px;
                cursor: pointer;
                display: flex;
                align-items: center;
                justify-content: center;
            }

            .trade-divider {
                display: flex;
                align-items: center;
                justify-content: center;
                color: #7f8c8d;
            }
            .arrow-icon { font-size: 2em; }

            .trade-actions {
                display: flex;
                justify-content: center;
                gap: 15px;
                margin-top: 10px;
                border-top: 1px solid rgba(255,255,255,0.1);
                padding-top: 15px;
            }
            .action-btn { min-width: 120px; }

            .trade-inventory-section {
                margin-top: 10px;
                background: rgba(0,0,0,0.4);
                padding: 10px;
                border-radius: 8px;
                border-top: 2px solid #3498db;
            }
            .trade-inventory-section h3 { margin-top: 0; font-size: 1em; color: #3498db; }
            .mini-inventory-grid {
                display: grid;
                grid-template-columns: repeat(auto-fill, minmax(50px, 1fr));
                gap: 5px;
                max-height: 150px;
                overflow-y: auto;
                padding-right: 5px;
            }
            .inv-item {
                width: 50px; height: 50px;
                background: rgba(255,255,255,0.05);
                border: 1px solid rgba(255,255,255,0.2);
                border-radius: 4px;
                cursor: pointer;
                display: flex; align-items: center; justify-content: center;
                font-size: 1.5em;
                transition: transform 0.1s;
            }
            .inv-item:hover { transform: scale(1.1); border-color: white; background: rgba(255,255,255,0.2); }
            .inv-item.disabled { opacity: 0.3; cursor: default; transform: none; border-color: transparent; }
        </style>
    `;

    showModal(modalContent);

    // HACK: Force the modal to be wide for trading
    const modalEl = document.getElementById('modal-content');
    if (modalEl) {
        modalEl.style.maxWidth = '850px';
        modalEl.style.width = '95%';
    }

    // Attach local listeners
    if (document.getElementById('trade-gold-input')) {
        document.getElementById('trade-gold-input').addEventListener('change', (e) => {
            updateOffer(currentTradeId, localState.offer.items, parseInt(e.target.value) || 0);
        });
    }

    // Inventory click listener
    const invList = document.getElementById('trade-inventory-list');
    if (invList) {
        invList.addEventListener('click', (e) => {
            const itemEl = e.target.closest('.inv-item');
            if (itemEl && !itemEl.classList.contains('disabled')) {
                const index = parseInt(itemEl.dataset.index);
                const item = gameState.inventory[index];

                const newItems = [...localState.offer.items, { type: 'inventory', index, item }];
                updateOffer(currentTradeId, newItems, parseInt(document.getElementById('trade-gold-input').value) || 0);
            }
        });
    }

    // Remove item listener
    const offerList = document.getElementById('local-offer-slots');
    if (offerList && !localState.locked) {
        offerList.addEventListener('click', (e) => {
            if (e.target.classList.contains('remove-btn')) {
                const slotEl = e.target.closest('.trade-slot');
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
    // Use the Cancel handler which will close the modal locally too
    document.getElementById('trade-cancel-btn')?.addEventListener('click', () => Network.emitTradeCancel(tradeState.id));
}

function updateOffer(tradeId, items, gold) {
    if (gold < 0) gold = 0;
    if (gold > gameState.gold) gold = gameState.gold; // Cap at max gold locally
    Network.emitTradeUpdate(tradeId, { items, gold });
}

function getStatusText(state) {
    state.activeStatusClass = '';
    if (state.confirmed) {
        state.activeStatusClass = 'confirmed';
        return 'CONFIRMED';
    }
    if (state.locked) {
        state.activeStatusClass = 'locked';
        return 'LOCKED';
    }
    return 'OFFERING';
}

function renderOfferSlots(items, isLocal, isLocked) {
    // Ensure we have at least 8 slots visually
    const slots = [];
    for (let i = 0; i < 8; i++) {
        if (i < items.length) {
            const wrapper = items[i];
            const item = wrapper.item;
            slots.push(`
                <div class="trade-slot" data-offer-index="${i}" title="${item.name}">
                    ${item.icon || '📦'}
                    ${isLocal && !isLocked ? '<button class="remove-btn">x</button>' : ''}
                </div>
            `);
        } else {
            slots.push(`<div class="trade-slot empty"></div>`);
        }
    }
    return slots.join('');
}

function renderInventoryForTrade(inventory, offeredItems) {
    return inventory.map((item, idx) => {
        if (!item) return '';
        // Check if item is already offered
        const isOffered = offeredItems.some(off => off.index === idx && off.type === 'inventory');

        return `
        <div class="inv-item ${isOffered ? 'disabled' : ''}" data-index="${idx}" title="${item.name}">
            ${item.icon || '📦'}
        </div>`;
    }).join('');
}
