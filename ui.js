'use strict';

import { gameData } from './game-data.js';
import { gameState } from './state.js';
import { getBonusStats } from './player.js';
import {} from './merchant.js';
import { socket } from './network.js';
import * as Network from './network.js';

/**
 * @file ui.js
 * This module handles all DOM manipulation and rendering for the game.
 */

// --- LOCAL HELPER FUNCTION ---
function hasMaterials(materials, checkBank = true) {
    for (const material in materials) {
        const requiredCount = materials[material];
        let currentCount = 0;
        gameState.inventory.forEach(item => {
            if (item && item.name === material) currentCount += (item.quantity || 1);
        });
        if (checkBank) {
            gameState.bank.forEach(item => {
                if (item && item.name === material) currentCount += (item.quantity || 1);
            });
        }
        if (currentCount < requiredCount) return false;
    }
    return true;
}


// --- STATE VARIABLES (for UI) ---
let activeCraftingCategory = 'Blacksmithing';
let activeTrainerCategory = 'Physical';
let tooltipTimeout = null;
let merchantTimerInterval = null;

// --- EXPORTED RENDER FUNCTIONS ---

export function renderAll() {
    if (!gameState || !gameState.characterName) {
         console.log("RenderAll called without a valid gameState.");
         return;
    }
    renderHeader();
    renderQuestLog();
    updateDisplay();
    renderInventory();
    renderSpells();
    renderEquipment();
    renderMerchant();
    renderSellableInventory();
    renderBankInterface();
    renderCrafting();
    renderTrainer();
    renderTitleSelection();
    renderPartyManagement(null);
    if (gameState.currentZone || gameState.inDuel) {
        renderAdventureScreen();
        renderPlayerActionBars();
    } else {
        document.getElementById('adventure-tab').style.display = 'none';
    }
}

export function renderHeader() {
    const charInfo = document.getElementById('character-info');
    const nameEl = document.getElementById('character-name-display');
    const titleEl = document.getElementById('character-title-display');
    const defaultTitleEl = document.getElementById('default-header-title');

    if (gameState.characterName) {
        nameEl.textContent = gameState.characterName;
        titleEl.textContent = gameState.title;
        charInfo.style.display = 'block';
        defaultTitleEl.style.display = 'none';
    } else {
        charInfo.style.display = 'none';
        defaultTitleEl.style.display = 'block';
    }
}

export function renderQuestLog() {
    const container = document.getElementById('quest-log-tab');
    if (!container) return;
    const activeQuests = gameState.quests.filter(q => q.status === 'active' || q.status === 'readyToTurnIn');
    container.innerHTML = '<h2>Quest Log</h2>';
    if (activeQuests.length === 0) {
        container.innerHTML += '<p>You have no active quests.</p>';
        return;
    }

    const questGiverMap = new Map();
    Object.values(gameData.cardPools).flat().forEach(poolItem => {
        if (poolItem.card.quests) {
            poolItem.card.quests.forEach(quest => {
                questGiverMap.set(quest.id, poolItem.card.name);
            });
        }
    });

    activeQuests.forEach(quest => {
        const questEl = document.createElement('div');
        questEl.className = 'quest-entry';
        let progressText = '';
        if (quest.status === 'readyToTurnIn') {
            const giver = questGiverMap.get(quest.details.id) || 'Quest Giver';
            progressText = `(Ready to turn in to ${giver})`;
        } else if (quest.details.target) {
            progressText = `(${quest.progress} / ${quest.details.required} ${quest.details.target}s defeated)`;
        } else if (quest.details.turnInItems) {
            const itemName = Object.keys(quest.details.turnInItems)[0];
            const requiredAmount = quest.details.turnInItems[itemName];
            const currentAmount = gameState.inventory.filter(i => i && i.name === itemName).reduce((total, item) => total + (item.quantity || 1), 0);
            progressText = `(${currentAmount} / ${requiredAmount} ${itemName}s collected)`;
        }
        questEl.innerHTML = `<strong>${quest.details.title}</strong><br><small>${progressText}</small>`;
        container.appendChild(questEl);
    });
}

export function updateDisplay() {
    const bonuses = getBonusStats();
    gameState.maxHealth = 10 + bonuses.maxHealth;
    if (gameState.currentZone === null) {
        gameState.health = gameState.maxHealth;
    } else if (gameState.health > gameState.maxHealth) {
        gameState.health = gameState.maxHealth;
    }
    const calculatedStats = { strength: gameState.strength + bonuses.strength, wisdom: gameState.wisdom + bonuses.wisdom, agility: gameState.agility + bonuses.agility, defense: gameState.defense + bonuses.defense, physicalResistance: (gameState.physicalResistance || 0) + (bonuses.physicalResistance || 0) };
    const mainStatsContainer = document.getElementById('main-stats-display');
    mainStatsContainer.innerHTML = `<div class="compact-stat">❤️ Health: <span>${gameState.health} / ${gameState.maxHealth}</span></div><div class="compact-stat">💪 Str: <span>${calculatedStats.strength}</span></div><div class="compact-stat">🏃 Agi: <span>${calculatedStats.agility}</span></div><div class="compact-stat">🧠 Wis: <span>${calculatedStats.wisdom}</span></div><div class="compact-stat">🛡️ Def: <span>${calculatedStats.defense}</span></div><div class="compact-stat">💰 Gold: <span>${gameState.gold}</span></div><div class="compact-stat">⭐ QP: <span>${gameState.questPoints}</span></div>`;
    
    const adventureHUD = document.getElementById('adventure-hud');
    if (adventureHUD && adventureHUD.style.display !== 'none') {
        let currentHealth = gameState.health;
        let currentMaxHealth = gameState.maxHealth;
        let currentAP = gameState.actionPoints;

        if (gameState.partyId && gameState.partyMemberStates) {
            const localPlayerState = gameState.partyMemberStates.find(p => p.playerId === socket.id);
            if (localPlayerState) {
                currentHealth = localPlayerState.health;
                currentMaxHealth = localPlayerState.maxHealth;
                currentAP = localPlayerState.actionPoints;
            }
        } else if (gameState.inDuel && gameState.duelState) {
            const localPlayerState = gameState.duelState.player1.id === socket.id ? gameState.duelState.player1 : gameState.duelState.player2;
            currentHealth = localPlayerState.health;
            currentMaxHealth = localPlayerState.maxHealth;
            currentAP = localPlayerState.actionPoints;
        }

        const hudHealthBar = document.getElementById('hud-health-bar');
        const healthPercentage = (currentHealth / currentMaxHealth) * 100;
        hudHealthBar.style.width = `${healthPercentage}%`;
        hudHealthBar.textContent = `${currentHealth} / ${currentMaxHealth}`;
        document.getElementById('hud-action-points').textContent = currentAP;
        
        const shieldDisplay = document.getElementById('player-shield-display');
        if (gameState.shield > 0) {
            shieldDisplay.textContent = `🛡️ ${gameState.shield}`;
            shieldDisplay.style.display = 'block';
        } else {
            shieldDisplay.style.display = 'none';
        }
    }
}

export function renderInventory() {
    const container = document.getElementById('inventory-grid');
    container.innerHTML = '';
    
    for (let i = 0; i < 24; i++) {
        const slot = document.createElement('div');
        slot.className = 'inventory-item';
        
        const item = gameState.inventory[i];
        if (item) {
            const tooltipContent = `<strong>${item.name}</strong><br>${item.description}`;
            slot.onmouseover = () => showTooltip(tooltipContent);
            slot.onmouseout = () => hideTooltip();

            let itemText = `<div class="item-icon">${item.icon || '❓'}</div><div><strong>${item.name}</strong></div>`;
            if (item.quantity > 1) {
                itemText += ` <div>(x${item.quantity})</div>`
            }
            if (item.charges) {
                itemText += ` <div>(${item.charges})</div>`
            }
            slot.innerHTML = `
                ${itemText}
                <button class="btn btn-primary btn-sm item-action-btn" data-index="${i}">Actions</button>
            `;
        } else {
            slot.innerHTML = 'Empty';
            slot.style.opacity = '0.5';
        }
        
        container.appendChild(slot);
    }
}

export function showItemActions(itemIndex) {
    const item = gameState.inventory[itemIndex];
    if (!item) return;

    let buttonsHTML = '';

    if (item.type === 'consumable') {
        buttonsHTML += `<button class="btn btn-success" data-inventory-action="useConsumable" data-index="${itemIndex}">Use</button>`;
    }

    if (item.slot) {
        const slots = Array.isArray(item.slot) ? item.slot : [item.slot];
        slots.forEach(slot => {
            buttonsHTML += `<button class="btn btn-primary" data-equip-slot="${slot}" data-item-index="${itemIndex}">Equip to ${slot}</button>`;
        });
    }

    buttonsHTML += `<button class="btn btn-danger" data-inventory-action="drop" data-index="${itemIndex}">Drop</button>`;
    buttonsHTML += `<button class="btn" onclick="this.closest('.modal-overlay').classList.add('hidden')">Cancel</button>`;
    
    const modalContent = `
        <h2>${item.name}</h2>
        <p>${item.description}</p>
        <div class="action-buttons">${buttonsHTML}</div>
    `;
    showModal(modalContent);
}

export function renderSpells() {
    const equippedContainer = document.getElementById('spells-grid');
    const spellbookContainer = document.getElementById('spellbook-grid');
    equippedContainer.innerHTML = '';
    spellbookContainer.innerHTML = '';
    const canSwap = gameState.currentZone === null && !gameState.inDuel;

    let spellCooldowns = gameState.spellCooldowns;
    if (gameState.partyId && gameState.partyMemberStates) {
        const localPlayerState = gameState.partyMemberStates.find(p => p.playerId === socket.id);
        if (localPlayerState) {
            spellCooldowns = localPlayerState.spellCooldowns;
        }
    } else if (gameState.inDuel && gameState.duelState) {
        const localPlayerState = gameState.duelState.player1.id === socket.id ? gameState.duelState.player1 : gameState.duelState.player2;
        spellCooldowns = localPlayerState.spellCooldowns;
    }

    for (let i = 0; i < 5; i++) {
        const slot = document.createElement('div');
        
        if (gameState.equippedSpells[i]) {
            const spell = gameState.equippedSpells[i];
            slot.className = `spell-card ${spell.type}`;
            const cooldown = spellCooldowns[spell.name] || 0;
            
            if (cooldown > 0) slot.classList.add('on-cooldown');
            
            let swapButton = '';
            if (canSwap) {
                swapButton = `<button class="btn btn-danger btn-sm" data-spell-action="unequip" data-index="${i}">Unequip</button>`;
            }

            slot.innerHTML = `
                <div><strong>${spell.icon || '✨'} ${spell.name}</strong> <span style="font-size: 0.8em; color: var(--accent-color);">(${spell.school})</span></div>
                <div>Cost: ${spell.cost || 0} AP | CD: ${spell.cooldown}</div>
                <div>${spell.description}</div>
                ${swapButton}
            `;
        } else {
            slot.className = 'spell-card';
            slot.innerHTML = 'Empty Spell Slot';
            slot.style.opacity = '0.3';
        }
        equippedContainer.appendChild(slot);
    }

    gameState.spellbook.forEach((spell, index) => {
        const card = document.createElement('div');
        card.className = `spell-card ${spell.type}`;
        let equipButton = '';
        if (canSwap && gameState.equippedSpells.length < 5) {
            equipButton = `<button class="btn btn-success btn-sm" data-spell-action="equip" data-index="${index}">Equip</button>`;
        }
        card.innerHTML = `
            <div><strong>${spell.icon || '✨'} ${spell.name}</strong></div>
            <div>${spell.description}</div>
            ${equipButton}
        `;
        spellbookContainer.appendChild(card);
    });
}

export function renderEquipment() {
    const container = document.getElementById('equipment-grid');
    container.innerHTML = '';
    
    const slotNames = { mainHand: 'Main Hand', offHand: 'Off Hand', helmet: 'Helmet', armor: 'Armor', boots: 'Boots', accessory: 'Accessory', ammo: 'Ammo' };

    const slots = ['mainHand', 'offHand', 'helmet', 'armor', 'boots', 'accessory'];
    if (gameState.equipment.accessory && gameState.equipment.accessory.grantsSlot === 'ammo') {
        slots.push('ammo');
    }
    
    slots.forEach(slotKey => {
        const slotEl = document.createElement('div');
        slotEl.className = 'equipment-slot';
        const item = gameState.equipment[slotKey];
        
        if(item && item.hands === 2 && slotKey === 'offHand') {
            slotEl.classList.add('filled');
            slotEl.innerHTML = `<div><strong>${slotNames[slotKey]}</strong></div><div>(Blocked by 2H)</div>`;
        } else if (item) {
            slotEl.classList.add('filled');
            let itemText = `<div class="item-icon">${item.icon || '❓'}</div><div><strong>${item.name}</strong></div>`;
            if (item.quantity > 1) {
                itemText += ` <div>(x${item.quantity})</div>`;
            }
            slotEl.innerHTML = `<div><strong>${slotNames[slotKey]}</strong></div>${itemText}<button class="btn btn-danger btn-sm" data-equipment-action="unequip" data-slot="${slotKey}">Unequip</button>`;
        } else {
            slotEl.innerHTML = `<div><strong>${slotNames[slotKey]}</strong></div><div>Empty</div>`;
        }
        
        container.appendChild(slotEl);
    });
}

export function renderCrafting() {
    const categoriesContainer = document.getElementById('crafting-categories');
    const gridContainer = document.getElementById('crafting-grid');
    categoriesContainer.innerHTML = '';
    gridContainer.innerHTML = '';

    const categories = [...new Set(gameData.craftingRecipes.map(r => r.category))];
    
    categories.forEach(category => {
        const tab = document.createElement('button');
        tab.className = `category-tab ${activeCraftingCategory === category ? 'active' : ''}`;
        tab.dataset.category = category;
        tab.textContent = category;
        categoriesContainer.appendChild(tab);
    });

    const recipesToDisplay = gameData.craftingRecipes.filter(r => r.category === activeCraftingCategory);

    recipesToDisplay.forEach((recipe, index) => {
        if (recipe.requiresDiscovery && !gameState.knownRecipes.includes(recipe.result.name)) {
            return;
        }

        const recipeEl = document.createElement('div');
        recipeEl.className = 'crafting-item';
        
        let materialsList = '<ul>';
        for (const material in recipe.materials) {
            materialsList += `<li>${recipe.materials[material]}x ${material}</li>`;
        }
        materialsList += '</ul>';

        const canCraft = hasMaterials(recipe.materials);

        recipeEl.innerHTML = `
            <h4>${recipe.result.quantity || 1}x ${recipe.result.name}</h4>
            <p>Requires:</p>
            ${materialsList}
            <button class="btn btn-success" data-craft-index="${gameData.craftingRecipes.indexOf(recipe)}" ${!canCraft ? 'disabled' : ''}>Craft</button>
        `;
        gridContainer.appendChild(recipeEl);
    });
}

export function renderTrainer() {
    const categoriesContainer = document.getElementById('trainer-categories');
    const gridContainer = document.getElementById('trainer-grid');
    document.getElementById('trainer-gold').textContent = gameState.gold;
    categoriesContainer.innerHTML = '';
    gridContainer.innerHTML = '';

    const categories = [...new Set(gameData.allSpells.filter(s => s.price > 0).map(s => s.school))];

    categories.forEach(category => {
        const tab = document.createElement('button');
        tab.className = `category-tab ${activeTrainerCategory === category ? 'active' : ''}`;
        tab.dataset.category = category;
        tab.textContent = category;
        categoriesContainer.appendChild(tab);
    });

    const spellsToDisplay = gameData.allSpells.filter(s => s.school === activeTrainerCategory && s.price > 0);

    spellsToDisplay.forEach(spell => {
        const spellEl = document.createElement('div');
        spellEl.className = 'trainer-item';

        const knowsSpell = gameState.spellbook.some(s => s.name === spell.name) || gameState.equippedSpells.some(s => s.name === spell.name);
        const canAfford = gameState.gold >= spell.price;

        let buttonHTML = `<button class="btn btn-success" data-spell-name="${spell.name}" ${knowsSpell || !canAfford ? 'disabled' : ''}>Learn (${spell.price}g)</button>`;
        if (knowsSpell) {
            buttonHTML = `<button class="btn" disabled>Already Known</button>`;
        }

        spellEl.innerHTML = `
            <h4>${spell.icon || '✨'} ${spell.name}</h4>
            <p>${spell.description}</p>
            ${buttonHTML}
        `;
        gridContainer.appendChild(spellEl);
    });
}

export function renderBankInterface() {
    const invContainer = document.getElementById('bank-inventory-grid');
    const bankContainer = document.getElementById('bank-storage-grid');
    invContainer.innerHTML = '';
    bankContainer.innerHTML = '';

    gameState.inventory.forEach((item, index) => {
        if (!item) return;
        const itemEl = document.createElement('div');
        itemEl.className = 'inventory-item';
        let itemText = `<strong>${item.name}</strong>`;
        if (item.quantity > 1) itemText += ` (x${item.quantity})`;
        itemEl.innerHTML = `
            <div>${itemText}</div>
            <button class="btn btn-primary btn-sm" data-bank-action="deposit" data-index="${index}">Deposit</button>
        `;
        invContainer.appendChild(itemEl);
    });

    gameState.bank.forEach((item, index) => {
        if (!item) return;
        const itemEl = document.createElement('div');
        itemEl.className = 'inventory-item';
        let itemText = `<strong>${item.name}</strong>`;
        if (item.quantity > 1) itemText += ` (x${item.quantity})`;
        itemEl.innerHTML = `
            <div>${itemText}</div>
            <button class="btn btn-success btn-sm" data-bank-action="withdraw" data-index="${index}">Withdraw</button>
        `;
        bankContainer.appendChild(itemEl);
    });
}

export function renderMerchant() {
    document.getElementById('gold-display').textContent = gameState.gold;

    const permanentContainer = document.getElementById('merchant-permanent-stock');
    const rotatingContainer = document.getElementById('merchant-rotating-stock');
    permanentContainer.innerHTML = '';
    rotatingContainer.innerHTML = '';

    const permanentStock = gameData.allItems.filter(item => item.type === 'tool' || item.name === 'Spices');

    permanentStock.forEach(item => {
        const itemEl = document.createElement('div');
        itemEl.className = 'merchant-item';
        itemEl.innerHTML = `
            <div>
                <strong>${item.name}</strong>
                <div>${item.description}</div>
            </div>
            <button class="btn btn-success" data-buy-item='${item.name}' data-permanent="true" ${gameState.gold < item.price ? 'disabled' : ''}>
                Buy (${item.price}g)
            </button>
        `;
        permanentContainer.appendChild(itemEl);
    });

    if (gameState.merchantStock) {
        gameState.merchantStock.forEach((item, index) => {
            const itemEl = document.createElement('div');
            itemEl.className = 'merchant-item';
            itemEl.innerHTML = `
                <div>
                    <strong>${item.name} (x${item.quantity})</strong>
                    <div>${item.description}</div>
                </div>
                <button class="btn btn-success" data-buy-item="${index}" data-permanent="false" ${gameState.gold < item.price || item.quantity <= 0 ? 'disabled' : ''}>
                    Buy (${item.price}g)
                </button>
            `;
            rotatingContainer.appendChild(itemEl);
        });
    }

    if (merchantTimerInterval) clearInterval(merchantTimerInterval);
    merchantTimerInterval = setInterval(updateRestockTimer, 1000);
    updateRestockTimer();
}

function updateRestockTimer() {
    const TEN_MINUTES = 10 * 60 * 1000;
    const timerEl = document.getElementById('restock-timer');
    if (!timerEl || !gameState.merchantLastStocked) return;

    const timePassed = Date.now() - gameState.merchantLastStocked;
    const timeRemaining = TEN_MINUTES - timePassed;

    if (timeRemaining <= 0) {
        timerEl.textContent = '00:00';
    } else {
        const minutes = Math.floor(timeRemaining / 60000);
        const seconds = Math.floor((timeRemaining % 60000) / 1000);
        timerEl.textContent = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
    }
}

export function renderSellableInventory() {
    const container = document.getElementById('sell-grid');
    container.innerHTML = '';

    if(gameState.inventory.every(i => !i)) {
        container.innerHTML = "<p>You have no items to sell.</p>";
        return;
    }
    
    const getSellPrice = (item) => {
        if (!item.price) return 1; 
        return Math.floor(item.price / 2) || 1;
    }

    gameState.inventory.forEach((item, index) => {
        if (!item) return;
        const sellPrice = getSellPrice(item);
        const slot = document.createElement('div');
        slot.className = 'inventory-item';
        let itemText = `<strong>${item.name}</strong>`;
        if (item.quantity > 1) itemText += ` (x${item.quantity})`;
        slot.innerHTML = `
            <div>${itemText}</div>
            <button class="btn btn-success btn-sm" data-sell-index="${index}">Sell (${sellPrice}g)</button>
        `;
        container.appendChild(slot);
    });
}

export function renderTitleSelection() {
    const container = document.getElementById('title-selection-container');
    const section = document.getElementById('title-management-section');
    if (!gameState.characterName) {
        section.style.display = 'none';
        return;
    }
    section.style.display = 'block';
    container.innerHTML = '';
    
    gameState.unlockedTitles.forEach(title => {
        const btn = document.createElement('button');
        btn.className = 'btn';
        btn.textContent = title;
        if (title === gameState.title) {
            btn.classList.add('btn-success');
            btn.disabled = true;
        } else {
            btn.classList.add('btn-primary');
        }
        btn.dataset.title = title;
        container.appendChild(btn);
    });
}

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

export function showModal(content) {
    const modal = document.getElementById('modal');
    const modalContent = document.getElementById('modal-content');
    modalContent.innerHTML = '';
    if (typeof content === 'string') {
        modalContent.innerHTML = content;
    } else {
        modalContent.appendChild(content);
    }
    modal.classList.remove('hidden');
}

export function hideModal() {
    const modal = document.getElementById('modal');
    modal.classList.add('hidden');
    modal.querySelector('.modal-content').classList.remove('modal-wide');
}

export function showInfoModal(message) {
    const modalContent = `<p>${message}</p><div class="action-buttons"><button class="btn btn-primary" id="info-ok-btn">OK</button></div>`;
    showModal(modalContent);
}

export function showConfirmationModal(message, onConfirmCallback) {
    const fragment = document.createDocumentFragment();

    const messageEl = document.createElement('p');
    messageEl.textContent = message;
    fragment.appendChild(messageEl);

    const buttonContainer = document.createElement('div');
    buttonContainer.className = 'action-buttons';

    const yesButton = document.createElement('button');
    yesButton.className = 'btn btn-success';
    yesButton.id = 'confirm-yes-btn';
    yesButton.textContent = 'Yes';
    yesButton.onclick = onConfirmCallback;

    const noButton = document.createElement('button');
    noButton.className = 'btn btn-danger';
    noButton.id = 'confirm-no-btn';
    noButton.textContent = 'No';
    noButton.onclick = hideModal;

    buttonContainer.appendChild(yesButton);
    buttonContainer.appendChild(noButton);
    fragment.appendChild(buttonContainer);

    showModal(fragment);
}

export function showReactionModal({ damage, attacker, availableReactions }) {
    let buttons = '';
    availableReactions.forEach(reaction => {
        buttons += `<button class="btn btn-primary" data-reaction="${reaction.name}">Use ${reaction.name}</button>`;
    });

    const modalContent = `
        <h2>Reaction!</h2>
        <p>${attacker} is about to deal ${damage} damage to you!</p>
        <div class="action-buttons" id="reaction-buttons">
            ${buttons}
            <button class="btn btn-danger" data-reaction="take_damage">Take Damage</button>
        </div>
    `;
    showModal(modalContent);
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

function renderGroundLootButton() {
    const container = document.getElementById('ground-loot-container');
    if (!container) return;

    container.innerHTML = '';

    if (gameState.groundLoot && gameState.groundLoot.length > 0 && (gameState.currentZone || gameState.inDuel)) {
        const button = document.createElement('button');
        button.id = 'ground-loot-btn';
        button.className = 'btn';
        button.textContent = `💰 Ground Loot (${gameState.groundLoot.length})`;
        container.appendChild(button);
    }
}

export function showGroundLootModal() {
    const modalContentEl = document.createElement('div');
    modalContentEl.id = 'ground-loot-modal';
    modalContentEl.innerHTML = '<h2>Ground Loot & Inventory</h2><p>Take items from the ground or drop items from your inventory to make space.</p>';

    const storageGrid = document.createElement('div');
    storageGrid.className = 'storage-grid';

    // --- Ground Loot Side ---
    const groundLootSide = document.createElement('div');
    groundLootSide.innerHTML = '<h3>On The Ground</h3>';
    const groundGrid = document.createElement('div');
    groundGrid.className = 'inventory-grid';
    
    if (gameState.groundLoot && gameState.groundLoot.length > 0) {
        gameState.groundLoot.forEach((item, index) => {
            const itemEl = document.createElement('div');
            itemEl.className = 'inventory-item';
            let itemText = `<strong>${item.name}</strong>`;
            if (item.quantity > 1) itemText += ` (x${item.quantity})`;
            itemEl.innerHTML = `
                <div>${itemText}</div>
                <button class="btn btn-success btn-sm" data-action="takeGroundLoot" data-index="${index}">Take</button>
            `;
            groundGrid.appendChild(itemEl);
        });
    } else {
        groundGrid.innerHTML = '<p>Nothing on the ground.</p>';
    }
    groundLootSide.appendChild(groundGrid);

    // --- Inventory Side ---
    const inventorySide = document.createElement('div');
    inventorySide.innerHTML = '<h3>Your Inventory</h3>';
    const inventoryGrid = document.createElement('div');
    inventoryGrid.className = 'inventory-grid';

    gameState.inventory.forEach((item, index) => {
        const itemEl = document.createElement('div');
        itemEl.className = 'inventory-item';
        if (item) {
            let itemText = `<strong>${item.name}</strong>`;
            if (item.quantity > 1) itemText += ` (x${item.quantity})`;
            itemEl.innerHTML = `
                <div>${itemText}</div>
                <button class="btn btn-danger btn-sm" data-inventory-action="dropItem" data-index="${index}">Drop to Ground</button>
            `;
        } else {
            itemEl.innerHTML = 'Empty';
            itemEl.style.opacity = '0.5';
        }
        inventoryGrid.appendChild(itemEl);
    });
    inventorySide.appendChild(inventoryGrid);
    
    storageGrid.appendChild(groundLootSide);
    storageGrid.appendChild(inventorySide);
    modalContentEl.appendChild(storageGrid);

    const closeButton = document.createElement('button');
    closeButton.className = 'btn';
    closeButton.style.marginTop = '20px';
    closeButton.textContent = 'Close';
    closeButton.onclick = hideModal;
    modalContentEl.appendChild(closeButton);

    const modal = document.getElementById('modal');
    const modalContentContainer = modal.querySelector('.modal-content');
    modalContentContainer.classList.add('modal-wide');
    
    showModal(modalContentEl);
}


export function renderAdventureScreen() {
    const ventureArrow = document.getElementById('venture-deeper-arrow');
    const homeArrow = document.getElementById('return-home-arrow');

    ventureArrow.style.display = 'flex';
    homeArrow.style.display = 'flex';

    if (gameState.inDuel) {
        renderDuelScreen();
    } else if (gameState.partyId && gameState.partyMemberStates) {
        renderPartyScreen();
    } else if (!gameState.partyId && gameState.currentZone) {
        renderSoloScreen();
    }
    renderGroundLootButton();
    updateActionUI();
}

function renderSoloScreen() {
    const partyContainer = document.getElementById('party-cards-container');
    partyContainer.innerHTML = '';
    
    const playerCardEl = document.createElement('div');
    playerCardEl.className = 'card player is-local-player';
    playerCardEl.dataset.target = 'player';
    let effectsHtml = getEffectsHtml(gameState);
    playerCardEl.innerHTML = `
        <div class="card-icon">${gameState.characterIcon}</div>
        <div class="card-title">${gameState.characterName}</div>
        <div>❤️ ${gameState.health}/${gameState.maxHealth}</div>
        ${effectsHtml}
    `;
    partyContainer.appendChild(playerCardEl);

    renderZoneCards(gameState.zoneCards);
}

function renderPartyScreen() {
    const partyContainer = document.getElementById('party-cards-container');
    partyContainer.innerHTML = '';
    gameState.partyMemberStates.forEach((playerState, index) => {
        const cardEl = document.createElement('div');
        cardEl.className = 'card player';
        
        if (playerState.isDead) {
            cardEl.classList.add('dead');
            cardEl.innerHTML = `
                <div class="card-icon">💀</div>
                <div class="card-title">${playerState.name}</div>
                <div>DEFEATED</div>
                ${(playerState.lootableInventory.length > 0)
                    ? `<button class="btn btn-sm" data-action="lootPlayer">Loot Bag (${playerState.lootableInventory.length})</button>`
                    : ''
                }
            `;
        } else {
             if (playerState.playerId === socket.id) {
                cardEl.classList.add('is-local-player');
                gameState.health = playerState.health; 
                gameState.maxHealth = playerState.maxHealth;
            }
            if (playerState.turnEnded) {
                cardEl.style.opacity = '0.6';
            }
            
            let effectsHtml = `<div class="player-card-effects">AP: ${playerState.actionPoints}</div>`;

            cardEl.innerHTML = `
                <div class="card-icon">${playerState.icon}</div>
                <div class="card-title">${playerState.name}</div>
                <div>❤️ ${playerState.health}/${playerState.maxHealth}</div>
                ${effectsHtml}
            `;
        }

        cardEl.dataset.index = `p${index}`;
        partyContainer.appendChild(cardEl);
    });
    renderZoneCards(gameState.zoneCards);
}

function renderDuelScreen() {
    const zoneContainer = document.getElementById('zone-cards');
    const partyContainer = document.getElementById('party-cards-container');
    const ventureArrow = document.getElementById('venture-deeper-arrow');
    const homeArrow = document.getElementById('return-home-arrow');
    zoneContainer.innerHTML = '';
    partyContainer.innerHTML = '';

    ventureArrow.style.display = 'none';
    homeArrow.style.display = gameState.duelState.ended ? 'flex' : 'none';

    const localPlayer = gameState.duelState.player1.id === socket.id ? gameState.duelState.player1 : gameState.duelState.player2;
    const opponent = gameState.duelState.player1.id === socket.id ? gameState.duelState.player2 : gameState.duelState.player1;

    const playerCardEl = document.createElement('div');
    playerCardEl.className = 'card player is-local-player';
    if (gameState.duelState.activePlayerId === localPlayer.id && !gameState.duelState.ended) {
        playerCardEl.classList.add('active-turn');
    }
    playerCardEl.dataset.target = 'player';
    playerCardEl.innerHTML = `
        <div class="card-icon">${localPlayer.icon}</div>
        <div class="card-title">${localPlayer.name}</div>
        <div>❤️ ${localPlayer.health}/${localPlayer.maxHealth}</div>
        <div class="player-card-effects">AP: ${localPlayer.actionPoints}</div>
    `;
    partyContainer.appendChild(playerCardEl);

    const opponentCardEl = document.createElement('div');
    opponentCardEl.className = 'card player enemy';
    if (gameState.duelState.activePlayerId === opponent.id && !gameState.duelState.ended) {
        opponentCardEl.classList.add('active-turn');
    }
    opponentCardEl.dataset.index = 0; 
    
    if (opponent.health <= 0) {
        opponentCardEl.classList.add('dead');
        opponentCardEl.innerHTML = `
            <div class="card-icon">💀</div>
            <div class="card-title">${opponent.name}</div>
            <div>DEFEATED</div>
        `;
    } else {
        opponentCardEl.innerHTML = `
            <div class="card-icon">${opponent.icon}</div>
            <div class="card-title">${opponent.name}</div>
            <div>❤️ ${opponent.health}/${opponent.maxHealth}</div>
            <div class="player-card-effects">AP: ${opponent.actionPoints}</div>
        `;
    }
    zoneContainer.appendChild(opponentCardEl);
}

function renderZoneCards(cards) {
    const zoneContainer = document.getElementById('zone-cards');
    zoneContainer.innerHTML = '';
    cards.forEach((card, index) => {
        const cardEl = document.createElement('div');
        if (!card) {
            cardEl.className = 'card empty';
            zoneContainer.appendChild(cardEl);
            return;
        };

        cardEl.className = `card ${card.type}`;
        cardEl.dataset.index = index;
        
        if(card.type === 'enemy' || card.type === 'treasure' || card.type === 'npc') {
            let tooltipContent = `<strong>${card.name}</strong><br>${card.description}`;
            if (card.attackTable) {
                tooltipContent += `<hr style="margin: 5px 0;"><strong>Attacks:</strong>`;
                card.attackTable.forEach(attack => {
                    tooltipContent += `<br>${attack.range[0]}-${attack.range[1]}: ${attack.message || 'Miss!'}`;
                });
            } else if(card.attackDesc) {
                tooltipContent += `<hr style="margin: 5px 0;">${card.attackDesc}`;
            }
            cardEl.onmouseover = () => showTooltip(tooltipContent);
            cardEl.onmouseout = () => hideTooltip();
        }
        
        let healthDisplay = '';
        if (card.type === 'enemy') {
            healthDisplay = `<div>❤️ ${card.health}/${card.maxHealth}</div>`;
            if(card.debuffs && card.debuffs.length > 0) {
                card.debuffs.forEach(debuff => {
                    if(debuff.type === 'stun') healthDisplay += `<div class="debuff-icon">💫</div>`;
                    if(debuff.type === 'burn') healthDisplay += `<div class="debuff-icon">🔥</div>`;
                    if(debuff.type === 'bleed') healthDisplay += `<div class="debuff-icon">🩸</div>`;
                    if(debuff.type === 'daze') healthDisplay += `<div class="debuff-icon">😵</div>`;
                });
            }
        } else if (card.type === 'resource') {
            healthDisplay = `<div>Charges: ${card.charges}</div>`;
        }
        
        cardEl.innerHTML = `
            <div class="card-icon">${card.icon || '❓'}</div>
            <div class="card-title">${card.name}</div>
            ${healthDisplay}
        `;
        
        zoneContainer.appendChild(cardEl);
    });
}

function getEffectsHtml(playerState) {
    let effectsHtml = '<div class="player-card-effects">';
    playerState.buffs.forEach(buff => {
        effectsHtml += `<span class="player-card-effect buff" onmouseover="showTooltip('<strong>${buff.type}</strong><br>Turns Remaining: ${buff.duration -1}')" onmouseout="hideTooltip()">${buff.type}</span>`;
    });
    playerState.playerDebuffs.forEach(debuff => {
        effectsHtml += `<span class="player-card-effect debuff" onmouseover="showTooltip('<strong>${debuff.type}</strong><br>Turns Remaining: ${debuff.duration}')" onmouseout="hideTooltip()">${debuff.type}</span>`;
    });
    effectsHtml += '</div>';
    return effectsHtml;
}

export function renderPlayerActionBars() {
    const equipmentContainer = document.getElementById('equipment-bar');
    const spellContainer = document.getElementById('spell-bar');
    equipmentContainer.innerHTML = '';
    spellContainer.innerHTML = '';

    let localPlayerAP = gameState.actionPoints;
    let localPlayerTurnEnded = false;
    
    let weaponCooldowns = gameState.weaponCooldowns;
    let spellCooldowns = gameState.spellCooldowns;
    let itemCooldowns = gameState.itemCooldowns;
    
    if (gameState.partyId && gameState.partyMemberStates) {
        const localPlayerState = gameState.partyMemberStates.find(p => p.playerId === socket.id);
        if (localPlayerState) {
            localPlayerAP = localPlayerState.actionPoints;
            localPlayerTurnEnded = localPlayerState.turnEnded;
            weaponCooldowns = localPlayerState.weaponCooldowns;
            spellCooldowns = localPlayerState.spellCooldowns;
            itemCooldowns = localPlayerState.itemCooldowns;
        }
    } else if (gameState.inDuel && gameState.duelState) {
        const localPlayerState = gameState.duelState.player1.id === socket.id ? gameState.duelState.player1 : gameState.duelState.player2;
        localPlayerAP = localPlayerState.actionPoints;
        localPlayerTurnEnded = gameState.duelState.activePlayerId !== socket.id;
        weaponCooldowns = localPlayerState.weaponCooldowns;
        spellCooldowns = localPlayerState.spellCooldowns;
        itemCooldowns = localPlayerState.itemCooldowns;
    }


    document.getElementById('end-turn-btn').disabled = localPlayerTurnEnded;

    const equipmentSlots = [
        { key: 'mainHand', name: 'Main Hand' },
        { key: 'offHand', name: 'Off Hand' },
        { key: 'helmet', name: 'Helmet' },
        { key: 'armor', name: 'Armor' },
        { key: 'boots', 'name': 'Boots' },
        { key: 'accessory', name: 'Accessory' }
    ];

    if (gameState.equipment.accessory && gameState.equipment.accessory.grantsSlot === 'ammo') {
        equipmentSlots.push({ key: 'ammo', name: 'Ammo' });
    }

    equipmentSlots.forEach(slotInfo => {
        const slotEl = document.createElement('button');
        const item = gameState.equipment[slotInfo.key];
        
        if (item) {
            const tooltipContent = `<strong>${item.name}</strong><br>${item.description}`;
            slotEl.onmouseover = () => showTooltip(tooltipContent);
            slotEl.onmouseout = () => hideTooltip();
        }

        if (item && item.activatedAbility) {
            const canUse = localPlayerAP >= item.activatedAbility.cost && !localPlayerTurnEnded;
            slotEl.className = 'action-slot active';
            slotEl.disabled = !canUse;
            slotEl.dataset.action = 'useAbility';
            slotEl.dataset.slot = slotInfo.key;
            slotEl.innerHTML = `<div class="item-name">${item.name}</div><div class="item-details">AP: ${item.activatedAbility.cost} | CD: ${itemCooldowns[item.name] || 0}</div>`;
        } else if (item && item.type === 'weapon') {
            if(item.hands === 2 && slotInfo.key === 'offHand') {
                 slotEl.className = 'action-slot';
                 slotEl.disabled = true;
                 slotEl.innerHTML = `<div class="slot-name">(2H Weapon)</div>`;
            } else {
                const canAttack = localPlayerAP >= item.cost && !localPlayerTurnEnded;
                slotEl.className = 'action-slot active';
                slotEl.disabled = !canAttack;
                slotEl.dataset.action = 'select';
                slotEl.dataset.actionData = JSON.stringify({ type: 'weapon', data: item, slot: slotInfo.key });
                slotEl.innerHTML = `<div class="item-name">${item.name}</div><div class="item-details">AP: ${item.cost} | CD: ${weaponCooldowns[item.name] || 0}</div>`;
            }
        } else if (item) {
             slotEl.className = 'action-slot';
             slotEl.disabled = true;
             let itemText = item.name;
             if (item.quantity > 1) {
                 itemText += ` (x${item.quantity})`;
             }
             slotEl.innerHTML = `<div class="item-name">${itemText}</div><div class="slot-name">${slotInfo.name}</div>`;
        } else {
            slotEl.className = 'action-slot empty';
            slotEl.disabled = true;
            slotEl.innerHTML = `<div class="slot-name">${slotInfo.name}</div>`;
        }
        equipmentContainer.appendChild(slotEl);
    });

    for (let i = 0; i < 5; i++) {
        const slotEl = document.createElement('button');
        const spell = gameState.equippedSpells[i];

        if (spell) {
            const tooltipContent = `<strong>${spell.name}</strong><br>${spell.description}`;
            slotEl.onmouseover = () => showTooltip(tooltipContent);
            slotEl.onmouseout = () => hideTooltip();

            const canCast = (spellCooldowns[spell.name] || 0) <= 0 && localPlayerAP >= (spell.cost || 0) && !localPlayerTurnEnded;
            slotEl.className = 'action-slot active';
            slotEl.disabled = !canCast;
            slotEl.innerHTML = `<div class="item-name">${spell.name}</div><div class="item-details">AP: ${spell.cost || 0} | CD: ${spellCooldowns[spell.name] || 0}</div>`;

            if (spell.type === 'attack' || spell.type === 'aoe' || spell.type === 'versatile') {
                slotEl.dataset.action = 'select';
                slotEl.dataset.actionData = JSON.stringify({type: 'spell', data: spell, index: i});
            } else if (spell.type === 'heal' || spell.type === 'buff' || spell.type === 'utility') {
                slotEl.dataset.action = 'castSelf';
                slotEl.dataset.spellIndex = i;
            } else {
                slotEl.disabled = true;
            }
        } else {
            slotEl.className = 'action-slot empty';
            slotEl.disabled = true;
            slotEl.innerHTML = `<div class="slot-name">Spell ${i + 1}</div>`;
        }
        spellContainer.appendChild(slotEl);
    }
    updateActionUI();
}

export function updateActionUI() {
    document.querySelectorAll('.action-slot').forEach(btn => btn.classList.remove('selected'));
    if (gameState.turnState.selectedAction) {
        const actionName = gameState.turnState.selectedAction.data.name;
        const selectedBtn = Array.from(document.querySelectorAll('.action-slot .item-name')).find(span => span.textContent === actionName)?.parentElement;
        if(selectedBtn) selectedBtn.classList.add('selected');
    }

    document.querySelectorAll('.card').forEach(card => card.classList.remove('targetable'));
    if (gameState.turnState.selectedAction) {
        const action = gameState.turnState.selectedAction.data;
        if (action.type === 'attack' || action.type === 'aoe' || action.weaponDamage) {
            document.querySelectorAll('#zone-cards .card.enemy').forEach(enemyCard => {
                enemyCard.classList.add('targetable');
            });
        }
        if (action.type === 'heal' || action.type === 'buff' || action.type === 'versatile') {
            document.querySelectorAll('#party-cards-container .card.player:not(.dead)').forEach(playerCard => {
                playerCard.classList.add('targetable');
            });
            if(gameState.inDuel) {
                 document.querySelectorAll('#zone-cards .card.player').forEach(playerCard => {
                    playerCard.classList.add('targetable');
                });
            }
        }
    }
}

export function showTooltip(content) {
    if (tooltipTimeout) { clearTimeout(tooltipTimeout); tooltipTimeout = null; }
    const tooltip = document.getElementById('tooltip');
    tooltip.innerHTML = content;
    tooltip.style.display = 'block';
    tooltip.style.pointerEvents = 'auto';
    setTimeout(() => tooltip.style.opacity = '1', 10);
}

export function hideTooltip() {
    tooltipTimeout = setTimeout(() => {
        const tooltip = document.getElementById('tooltip');
        tooltip.style.opacity = '0';
        tooltip.style.pointerEvents = 'none';
        setTimeout(() => { if (tooltip.style.opacity === '0') { tooltip.style.display = 'none'; } }, 400);
    }, 300);
}

export function addToLog(message, type = 'info') {
    const log = document.getElementById('adventure-log');
    if (!log) return;
    const entry = document.createElement('div');
    entry.className = `log-entry ${type}`;
    entry.textContent = message;
    log.prepend(entry);
}

export function showTab(tabName) {
    document.querySelectorAll('.tab-content').forEach(tab => { tab.style.display = 'none'; });
    document.querySelectorAll('.tab').forEach(tab => { tab.classList.remove('active'); });
    document.getElementById(tabName + '-tab').style.display = 'block';
    document.querySelector(`.tab[data-tab="${tabName}"]`).classList.add('active');
    
    const mainStatsDisplay = document.getElementById('main-stats-display');
    const adventureHUD = document.getElementById('adventure-hud');
    const actionBar = document.getElementById('player-action-bar');
    const logContainer = document.getElementById('adventure-log-container');
    
    mainStatsDisplay.style.display = 'flex';
    adventureHUD.style.display = 'none';
    actionBar.style.display = 'none';
    logContainer.style.display = 'none';
    
    if (merchantTimerInterval) { clearInterval(merchantTimerInterval); merchantTimerInterval = null; }
    
    if (tabName === 'merchant') { 
        Network.emitPlayerAction('viewMerchant');
        renderMerchant(); 
        renderSellableInventory(); 
    }
    if (tabName === 'crafting') renderCrafting();
    if (tabName === 'bank') renderBankInterface();
    if (tabName === 'trainer') renderTrainer();
    if (tabName === 'home') renderTitleSelection();
    if (tabName === 'spells') renderSpells();
    if (tabName === 'quest-log') renderQuestLog();
}

export function setTabsDisabled(isDisabled) {
    document.querySelectorAll('.tab').forEach(tab => { tab.disabled = isDisabled; });
}

export function setActiveCraftingCategory(category) {
    activeCraftingCategory = category;
}

export function setActiveTrainerCategory(category) {
    activeTrainerCategory = category;
}

export function showBackpack() {
    const modalContentEl = document.createElement('div');
    modalContentEl.innerHTML = '<h2>Backpack</h2>';

    const itemsGrid = document.createElement('div');
    itemsGrid.className = 'inventory-grid';
    itemsGrid.style.maxWidth = '650px';
    itemsGrid.style.margin = '20px auto 0 auto';

    for (let i = 0; i < 24; i++) {
        const item = gameState.inventory[i];
        const slot = document.createElement('div');
        slot.className = 'inventory-item';

        if (item) {
            const tooltipContent = `<strong>${item.name}</strong><br>${item.description}`;
            slot.onmouseover = () => showTooltip(tooltipContent);
            slot.onmouseout = () => hideTooltip();

            let itemText = `<div class="item-icon">${item.icon || '❓'}</div><div><strong>${item.name}</strong></div>`;
            if (item.quantity > 1) {
                itemText += ` <div>(x${item.quantity})</div>`;
            }
            if (item.charges) {
                itemText += ` <div>(${item.charges})</div>`;
            }

            let actionButtonsHTML = '';
            if (item.type === 'consumable') {
                actionButtonsHTML += `<button class="btn btn-primary btn-sm" data-inventory-action="useConsumable" data-index="${i}">Use</button>`;
            }
            // Equipping is complex from this view, so it's omitted for now. Players can equip from the main inventory screen.
            actionButtonsHTML += `<button class="btn btn-danger btn-sm" data-inventory-action="dropItem" data-index="${i}">Drop</button>`;

            slot.innerHTML = `
                ${itemText}
                <div class="action-buttons" style="margin-top: 5px; flex-direction: column; gap: 5px;">
                    ${actionButtonsHTML}
                </div>
            `;
        } else {
            slot.textContent = 'Empty';
            slot.style.opacity = '0.5';
        }
        itemsGrid.appendChild(slot);
    }

    modalContentEl.appendChild(itemsGrid);

    const closeButton = document.createElement('button');
    closeButton.className = 'btn';
    closeButton.style.marginTop = '20px';
    closeButton.textContent = 'Close';
    closeButton.onclick = hideModal;
    modalContentEl.appendChild(closeButton);
    
    const modal = document.getElementById('modal');
    const modalContentContainer = modal.querySelector('.modal-content');
    modalContentContainer.classList.add('modal-wide');
    
    showModal(modalContentEl);
}

export function showCharacterSheet() {
    const bonuses = getBonusStats();
    const calculatedStats = {
        strength: gameState.strength + bonuses.strength,
        wisdom: gameState.wisdom + bonuses.wisdom,
        agility: gameState.agility + bonuses.agility,
        defense: gameState.defense + bonuses.defense,
        luck: gameState.luck + bonuses.luck,
        physicalResistance: (gameState.physicalResistance || 0) + (bonuses.physicalResistance || 0),
        mining: gameState.mining + bonuses.mining,
        fishing: gameState.fishing + bonuses.fishing,
        woodcutting: gameState.woodcutting + bonuses.woodcutting,
        harvesting: gameState.harvesting + bonuses.harvesting,
    };

    const modalContent = `
        <h2>Character Sheet</h2>
        <div style="text-align: left; margin-top: 20px;">
            <h3>Attributes</h3>
            <p>💪 Strength: ${calculatedStats.strength}</p>
            <p>🏃 Agility: ${calculatedStats.agility}</p>
            <p>🧠 Wisdom: ${calculatedStats.wisdom}</p>
            <p>🛡️ Defense: ${calculatedStats.defense}</p>
            <p>🍀 Luck: ${calculatedStats.luck}</p>
            <hr>
            <h3>Resistances</h3>
            <p>💎 Physical Resistance: ${calculatedStats.physicalResistance}</p>
            <hr>
            <h3>Professions</h3>
            <p>⛏️ Mining: ${calculatedStats.mining}</p>
            <p>🌲 Woodcutting: ${calculatedStats.woodcutting}</p>
            <p>🎣 Fishing: ${calculatedStats.fishing}</p>
        </div>
        <button class="btn btn-primary" style="margin-top: 20px;" onclick="this.closest('.modal-overlay').classList.add('hidden')">Close</button>
    `;
    showModal(modalContent);
}