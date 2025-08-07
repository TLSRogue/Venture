'use strict';

import { gameData } from '../game-data.js';
import { gameState } from '../state.js';
import * as Network from '../network.js';
import { showModal, hideModal, showTooltip } from './ui-main.js';

// --- LOCAL STATE & HELPERS ---

let activeCraftingCategory = 'Blacksmithing';
let activeTrainerCategory = 'Physical';
let merchantTimerInterval = null;
let bankCurrentPage = 1;

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

// --- RENDER FUNCTIONS ---

export function renderBankInterface() {
    const container = document.getElementById('bank-tab');
    container.innerHTML = `
        <div class="bank-header">
            <h2>Bank</h2>
            <button id="consolidate-btn" class="btn btn-sm">Consolidate Stacks</button>
        </div>`;

    const bankItems = [...gameState.bank].sort((a, b) => a.name.localeCompare(b.name));
    const itemsPerPage = 24;
    const totalPages = Math.ceil(bankItems.length / itemsPerPage) || 1;
    if (bankCurrentPage > totalPages) bankCurrentPage = totalPages;

    const bankGrid = document.createElement('div');
    bankGrid.className = 'inventory-grid';
    const startIndex = (bankCurrentPage - 1) * itemsPerPage;
    const endIndex = startIndex + itemsPerPage;
    const pageItems = bankItems.slice(startIndex, endIndex);

    for (let i = 0; i < itemsPerPage; i++) {
        const slot = document.createElement('div');
        slot.className = 'inventory-item';
        const item = pageItems[i];
        if (item) {
            slot.innerHTML = `<div class="item-icon">${item.icon || '❓'}</div><div class="item-quantity">${item.quantity || 1}</div>`;
            slot.dataset.bankAction = 'withdraw';
            const originalIndex = gameState.bank.findIndex(bankItem => bankItem.name === item.name);
            slot.dataset.index = originalIndex;
            slot.onmouseover = () => showTooltip(`<strong>${item.name}</strong><br>${item.description}<br><br>Click to Withdraw 1`);
            slot.onmouseout = () => hideTooltip();
        } else {
            slot.classList.add('empty');
        }
        bankGrid.appendChild(slot);
    }
    container.appendChild(bankGrid);

    if (totalPages > 1) {
        const paginationControls = document.createElement('div');
        paginationControls.className = 'pagination-controls';
        paginationControls.innerHTML = `
            <button id="bank-prev-btn" class="btn" ${bankCurrentPage === 1 ? 'disabled' : ''}>Previous</button>
            <span>Page ${bankCurrentPage} / ${totalPages}</span>
            <button id="bank-next-btn" class="btn" ${bankCurrentPage === totalPages ? 'disabled' : ''}>Next</button>
        `;
        container.appendChild(paginationControls);

        paginationControls.querySelector('#bank-prev-btn').addEventListener('click', () => {
            if (bankCurrentPage > 1) {
                bankCurrentPage--;
                renderBankInterface();
            }
        });
        paginationControls.querySelector('#bank-next-btn').addEventListener('click', () => {
            if (bankCurrentPage < totalPages) {
                bankCurrentPage++;
                renderBankInterface();
            }
        });
    }

    renderPlayerInventoryPanel(container, 'deposit');
}

function renderPlayerInventoryPanel(parentContainer, mode) {
    const panel = document.createElement('div');
    panel.className = 'player-inventory-panel';

    let title = '';
    let action = '';
    if (mode === 'deposit') {
        title = 'Your Inventory (Click to Deposit)';
        action = 'deposit';
    } else if (mode === 'sell') {
        title = 'Your Items to Sell';
        action = 'sell';
    }
    panel.innerHTML = `<h3>${title}</h3>`;

    const inventoryGrid = document.createElement('div');
    inventoryGrid.className = 'inventory-grid';

    for (let i = 0; i < 24; i++) {
        const slot = document.createElement('div');
        slot.className = 'inventory-item';
        const item = gameState.inventory[i];
        if (item) {
            slot.innerHTML = `<div class="item-icon">${item.icon || '❓'}</div><div class="item-quantity">${item.quantity || ''}</div>`;
            slot.dataset.inventoryAction = action;
            slot.dataset.index = i;
            
            let tooltipContent = `<strong>${item.name}</strong><br>${item.description}`;
            if (mode === 'sell' && item.price) {
                const sellPrice = Math.floor(item.price / 2) || 1;
                tooltipContent += `<hr style="margin: 5px 0;">Sell Price: ${sellPrice}g`;
            }
            slot.addEventListener('mouseover', () => showTooltip(tooltipContent));
            slot.addEventListener('mouseout', () => hideTooltip());
        } else {
            slot.classList.add('empty');
        }
        inventoryGrid.appendChild(slot);
    }

    panel.appendChild(inventoryGrid);
    parentContainer.appendChild(panel);
}

export function renderMerchant() {
    const container = document.getElementById('merchant-tab');
    container.innerHTML = `
        <h2>Merchant's Shop</h2>
        <p>Your Gold: <span id="gold-display">${gameState.gold}</span> | Restock in: <span id="restock-timer">10:00</span></p>
        <hr>
        <div class="storage-grid">
            <div id="merchant-wares-container"></div>
            <div id="merchant-sell-container"></div>
        </div>
    `;
    
    document.getElementById('gold-display').textContent = gameState.gold;
    const waresContainer = document.getElementById('merchant-wares-container');
    waresContainer.innerHTML = ''; // Clear previous content

    const permanentStock = gameData.allItems.filter(item => item.type === 'tool' || item.name === 'Spices');
    const rotatingStock = gameState.merchantStock || [];
    
    // Permanent Stock
    const permanentHeader = document.createElement('h3');
    permanentHeader.textContent = 'Permanent Stock';
    waresContainer.appendChild(permanentHeader);

    const permanentGrid = document.createElement('div');
    permanentGrid.className = 'inventory-grid';
    permanentStock.forEach(item => {
        const itemEl = document.createElement('div');
        itemEl.className = 'inventory-item';
        itemEl.innerHTML = `<div class="item-icon">${item.icon || '❓'}</div>`;
        itemEl.dataset.buyItem = item.name;
        itemEl.dataset.permanent = 'true';
        
        itemEl.addEventListener('mouseover', () => showTooltip(`<strong>${item.name}</strong> (${item.price}g)<br>${item.description}<br><br>Click to Buy`));
        itemEl.addEventListener('mouseout', () => hideTooltip());

        if (gameState.gold < item.price) {
            itemEl.classList.add('disabled');
        }
        permanentGrid.appendChild(itemEl);
    });
    waresContainer.appendChild(permanentGrid);
    
    // Rotating Wares
    const rotatingHeader = document.createElement('h3');
    rotatingHeader.textContent = 'Rotating Wares';
    rotatingHeader.style.marginTop = '20px';
    waresContainer.appendChild(rotatingHeader);

    const rotatingGrid = document.createElement('div');
    rotatingGrid.className = 'inventory-grid';
     if (rotatingStock.length > 0) {
        rotatingStock.forEach((item, index) => {
            const itemEl = document.createElement('div');
            itemEl.className = 'inventory-item';
            itemEl.innerHTML = `<div class="item-icon">${item.icon || '❓'}</div><div class="item-quantity">${item.quantity}</div>`;
            itemEl.dataset.buyItem = index;
            itemEl.dataset.permanent = 'false';

            itemEl.addEventListener('mouseover', () => showTooltip(`<strong>${item.name}</strong> (${item.price}g)<br>${item.description}<br><br>Click to Buy`));
            itemEl.addEventListener('mouseout', () => hideTooltip());

            if (gameState.gold < item.price || item.quantity <= 0) {
                itemEl.classList.add('disabled');
            }
            rotatingGrid.appendChild(itemEl);
        });
    }
    waresContainer.appendChild(rotatingGrid);

    // Player Inventory Panel (for selling)
    const sellContainer = document.getElementById('merchant-sell-container');
    sellContainer.innerHTML = ''; // Clear previous content
    renderPlayerInventoryPanel(sellContainer, 'sell');

    if (merchantTimerInterval) clearInterval(merchantTimerInterval);
    merchantTimerInterval = setInterval(updateRestockTimer, 1000);
    updateRestockTimer();
}

export function updateRestockTimer() {
    const TEN_MINUTES = 10 * 60 * 1000;
    const timerEl = document.getElementById('restock-timer');
    if (!timerEl || !gameState.merchantLastStocked) return;

    const timePassed = Date.now() - gameState.merchantLastStocked;
    const timeRemaining = TEN_MINUTES - timePassed;

    if (timeRemaining <= 0) {
        timerEl.textContent = '00:00';
        if (merchantTimerInterval) clearInterval(merchantTimerInterval);
    } else {
        const minutes = Math.floor(timeRemaining / 60000);
        const seconds = Math.floor((timeRemaining % 60000) / 1000);
        timerEl.textContent = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
    }
}

export function showSellConfirmationModal(itemIndex) {
    const item = gameState.inventory[itemIndex];
    if (!item) return;

    const sellPrice = Math.floor(item.price / 2) || 1;

    const modalContent = `
        <h2>Confirm Sell</h2>
        <div class="item-icon" style="font-size: 3em; margin: 10px;">${item.icon || '❓'}</div>
        <p>Sell 1x ${item.name} for ${sellPrice} Gold?</p>
        <div class="action-buttons">
            <button id="confirm-sell-btn" class="btn btn-success">Sell</button>
            <button class="btn btn-danger" onclick="this.closest('.modal-overlay').classList.add('hidden')">Cancel</button>
        </div>
    `;
    showModal(modalContent);

    document.getElementById('confirm-sell-btn').addEventListener('click', () => {
        Network.emitPlayerAction('sellItem', { itemIndex });
        hideModal();
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
        const resultItem = gameData.allItems.find(i => i.name === recipe.result.name);

        recipeEl.innerHTML = `
            <div class="crafting-item-header">
                <div class="item-icon">${resultItem.icon || '❓'}</div>
                <h4>${recipe.result.quantity || 1}x ${recipe.result.name}</h4>
            </div>
            <p>Requires:</p>
            ${materialsList}
            <button class="btn btn-success" data-craft-index="${gameData.craftingRecipes.indexOf(recipe)}" ${!canCraft ? 'disabled' : ''}>Craft</button>
        `;
        
        recipeEl.addEventListener('mousemove', (e) => {
            if (e.altKey) {
                let breakdown = `<strong>${resultItem.name}</strong><br>${resultItem.description}`;
                if (resultItem.bonus) {
                    breakdown += '<hr style="margin: 5px 0;"><strong>Bonuses:</strong><br>';
                    for (const stat in resultItem.bonus) {
                        breakdown += `${stat.charAt(0).toUpperCase() + stat.slice(1)}: +${resultItem.bonus[stat]}<br>`;
                    }
                }
                if (resultItem.type === 'weapon') {
                    breakdown += `<hr style="margin: 5px 0;"><strong>Ability:</strong><br>`;
                    breakdown += `Cost: ${resultItem.cost} AP | CD: ${resultItem.cooldown}<br>`;
                    const statName = (resultItem.stat || 'strength').charAt(0).toUpperCase() + (resultItem.stat || 'strength').slice(1);
                    breakdown += `Roll: D20 + ${statName} (${resultItem.hit}+)<br>`;
                    breakdown += `Deals ${resultItem.weaponDamage} ${resultItem.damageType} Damage.`;
                    if (resultItem.onCrit && resultItem.onCrit.debuff) {
                        breakdown += `<br>On Crit (20): Apply ${resultItem.onCrit.debuff.type}.`;
                    }
                }
                 if (resultItem.traits) {
                    breakdown += `<hr style="margin: 5px 0;"><strong>Traits:</strong> ${resultItem.traits.join(', ')}`;
                }
                showTooltip(breakdown);
            }
        });
        recipeEl.addEventListener('mouseleave', () => hideTooltip());

        gridContainer.appendChild(recipeEl);
    });
}

export function showCraftingModal(recipeIndex) {
    const recipe = gameData.craftingRecipes[recipeIndex];
    const resultItem = gameData.allItems.find(i => i.name === recipe.result.name);

    let maxCraftable = Infinity;
    for (const materialName in recipe.materials) {
        const requiredAmount = recipe.materials[materialName];
        const playerAmount = (gameState.inventory.filter(i => i && i.name === materialName).reduce((sum, i) => sum + (i.quantity || 1), 0)) + 
                             (gameState.bank.filter(i => i && i.name === materialName).reduce((sum, i) => sum + (i.quantity || 1), 0));
        maxCraftable = Math.min(maxCraftable, Math.floor(playerAmount / requiredAmount));
    }
    
    if (maxCraftable === 0) return;

    const modalContent = document.createElement('div');
    modalContent.innerHTML = `
        <h2>Craft: ${resultItem.name}</h2>
        <p>Select how many you want to craft.</p>
        <div class="crafting-modal-controls">
            <input type="range" id="craft-quantity-slider" min="1" max="${maxCraftable}" value="1">
            <span id="craft-quantity-display">1</span>
        </div>
        <div class="action-buttons">
            <button id="confirm-craft-btn" class="btn btn-success">Confirm</button>
            <button id="cancel-craft-btn" class="btn btn-danger">Cancel</button>
        </div>
    `;

    const slider = modalContent.querySelector('#craft-quantity-slider');
    const display = modalContent.querySelector('#craft-quantity-display');
    const confirmBtn = modalContent.querySelector('#confirm-craft-btn');
    const cancelBtn = modalContent.querySelector('#cancel-craft-btn');

    slider.addEventListener('input', () => {
        display.textContent = slider.value;
    });

    confirmBtn.addEventListener('click', () => {
        const quantity = parseInt(slider.value, 10);
        Network.emitPlayerAction('craftItem', { recipeIndex, quantity });
        hideModal();
    });

    cancelBtn.addEventListener('click', hideModal);

    showModal(modalContent);
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

export function setActiveCraftingCategory(category) {
    activeCraftingCategory = category;
}

export function setActiveTrainerCategory(category) {
    activeTrainerCategory = category;
}