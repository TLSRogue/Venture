'use strict';

import { gameData } from '../data/index.js';
import { gameState } from '../state.js';
import * as Network from '../network.js';
import { showModal, hideModal, showTooltip, hideTooltip, buildItemTooltip } from './ui-main.js';

// --- LOCAL STATE & HELPERS ---

let activeCraftingCategory = 'Blacksmithing';
let activeCraftingSubtab = null;
let activeTrainerCategory = 'Physical';
let merchantTimerInterval = null;
let bankCurrentPage = 1;
let merchantSellTab = 'inventory'; // local state for merchant tab

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

/**
 * Get the count of a specific material from inventory + bank
 */
function getMaterialCount(materialName) {
    let count = 0;
    gameState.inventory.forEach(item => {
        if (item && item.name === materialName) count += (item.quantity || 1);
    });
    gameState.bank.forEach(item => {
        if (item && item.name === materialName) count += (item.quantity || 1);
    });
    return count;
}

/**
 * Get all "junk" items from inventory (common tier 1 materials)
 * Returns array of { index, item } objects
 */
function getJunkItems() {
    const junkItems = [];
    gameState.inventory.forEach((item, index) => {
        if (item &&
            item.type === 'material' &&
            item.tier === 1 &&
            item.rarity === 'common' &&
            item.price) {
            junkItems.push({ index, ...item });
        }
    });
    return junkItems;
}

/**
 * Show confirmation modal for selling all junk
 */
function showSellAllJunkModal(junkItems, totalValue) {
    const itemNames = [...new Set(junkItems.map(i => i.name))];
    const itemList = itemNames.slice(0, 5).join(', ') + (itemNames.length > 5 ? '...' : '');

    const modalContent = `
        <h2>Sell All Junk</h2>
        <p>Sell <strong>${junkItems.length}</strong> common T1 materials for <strong style="color:#f1c40f">${totalValue}g</strong>?</p>
        <p style="font-size: 0.9em; color: #888;">Items: ${itemList}</p>
        <div class="action-buttons">
            <button id="confirm-sell-junk-btn" class="btn btn-success">Sell All</button>
            <button class="btn btn-danger" onclick="this.closest('.modal-overlay').classList.add('hidden')">Cancel</button>
        </div>
    `;
    showModal(modalContent);

    document.getElementById('confirm-sell-junk-btn').addEventListener('click', () => {
        Network.emitPlayerAction('sellAllJunk');
        hideModal();
    });
}

// --- RENDER FUNCTIONS ---

export function renderBankInterface() {
    const container = document.getElementById('bank-tab');
    container.innerHTML = `
        <div class="bank-header">
            <h2>Bank</h2>
            <div class="header-actions">
                <button id="deposit-all-btn" class="btn btn-sm btn-primary">Deposit All</button>
                <button id="consolidate-btn" class="btn btn-sm">Consolidate Stacks</button>
            </div>
        </div>`;

    const bankItems = [...gameState.bank].sort((a, b) => a.name.localeCompare(b.name));
    const itemsPerPage = 28;
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
            let tooltipContent = buildItemTooltip(item, { action: 'Click to Withdraw 1' });
            slot.onmouseover = () => showTooltip(tooltipContent);
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

    renderStoragePanel(container, 'deposit');
}

function renderStoragePanel(parentContainer, mode, storageSource = 'inventory') {
    const panel = document.createElement('div');
    panel.className = 'player-inventory-panel';

    let title = '';
    let action = '';

    if (mode === 'deposit') {
        title = 'Your Inventory (Click to Deposit)';
        action = 'deposit';
    } else if (mode === 'sell') {
        const titleText = storageSource === 'inventory' ? 'Inventory' : 'Bank';
        title = `Sell from ${titleText}`;
        action = 'sell';
    }

    panel.innerHTML = `<h3>${title}</h3>`;

    const inventoryGrid = document.createElement('div');
    inventoryGrid.className = 'inventory-grid';

    const items = storageSource === 'inventory' ? gameState.inventory : gameState.bank;
    const isBank = storageSource === 'bank';
    const slotsToShow = 28;

    for (let i = 0; i < slotsToShow; i++) {
        const slot = document.createElement('div');
        slot.className = 'inventory-item';
        const item = items[i];
        if (item) {
            slot.innerHTML = `<div class="item-icon">${item.icon || '❓'}</div><div class="item-quantity">${item.quantity || ''}</div>`;
            slot.dataset.inventoryAction = action;
            slot.dataset.index = i;
            if (isBank) slot.dataset.fromBank = 'true';

            let tooltipContent = buildItemTooltip(item);
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

    const permanentStock = gameData.allItems.filter(item => item.type === 'tool' || item.name === 'Spices' || item.permanentMerchantStock === true);
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

        itemEl.addEventListener('mouseover', () => showTooltip(buildItemTooltip(item, { showPrice: true, action: 'Click to Buy' })));
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

            itemEl.addEventListener('mouseover', () => showTooltip(buildItemTooltip(item, { showPrice: true, action: 'Click to Buy' })));
            itemEl.addEventListener('mouseout', () => hideTooltip());

            if (gameState.gold < item.price || item.quantity <= 0) {
                itemEl.classList.add('disabled');
            }
            rotatingGrid.appendChild(itemEl);
        });
    }
    waresContainer.appendChild(rotatingGrid);

    // Player Inventory/Bank Panel (for selling)
    const sellContainer = document.getElementById('merchant-sell-container');
    sellContainer.innerHTML = ''; // Clear previous content

    const tabContainer = document.createElement('div');
    tabContainer.className = 'merchant-sell-tabs';
    tabContainer.innerHTML = `
        <button class="tab-btn ${merchantSellTab === 'inventory' ? 'active' : ''}" data-sell-tab="inventory">Inventory</button>
        <button class="tab-btn ${merchantSellTab === 'bank' ? 'active' : ''}" data-sell-tab="bank">Bank</button>
    `;
    sellContainer.appendChild(tabContainer);

    tabContainer.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            merchantSellTab = btn.dataset.sellTab;
            renderMerchant();
        });
    });

    // Quick Action: Sell All Junk button
    const quickActionsContainer = document.createElement('div');
    quickActionsContainer.className = 'merchant-quick-actions';
    quickActionsContainer.style.cssText = 'margin-top: 10px; padding: 10px; background: rgba(0,0,0,0.2); border-radius: 4px;';

    const junkItems = getJunkItems();
    const totalJunkValue = junkItems.reduce((sum, item) => sum + (Math.floor(item.price / 2) || 1), 0);

    quickActionsContainer.innerHTML = `
        <button id="sell-all-junk-btn" class="btn btn-warning" ${junkItems.length === 0 ? 'disabled' : ''}>
            💰 Sell All Junk (${junkItems.length} items, ${totalJunkValue}g)
        </button>
        <small style="display: block; margin-top: 5px; color: #888;">Sells common T1 materials from inventory</small>
    `;
    sellContainer.appendChild(quickActionsContainer);

    // Add event listener for Sell All Junk
    const sellJunkBtn = document.getElementById('sell-all-junk-btn');
    if (sellJunkBtn && junkItems.length > 0) {
        sellJunkBtn.addEventListener('click', () => {
            showSellAllJunkModal(junkItems, totalJunkValue);
        });
    }

    renderStoragePanel(sellContainer, 'sell', merchantSellTab);

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
        if (merchantTimerInterval) {
            clearInterval(merchantTimerInterval);
            merchantTimerInterval = null;
        }
    } else {
        const minutes = Math.floor(timeRemaining / 60000);
        const seconds = Math.floor((timeRemaining % 60000) / 1000);
        timerEl.textContent = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
    }
}

export function showSellConfirmationModal(itemIndex, fromBank = false) {
    const item = fromBank ? gameState.bank[itemIndex] : gameState.inventory[itemIndex];
    if (!item) return;

    const sellPrice = Math.floor(item.price / 2) || 1;

    const modalContent = `
        <h2>Confirm Sell</h2>
        <div class="item-icon" style="font-size: 3em; margin: 10px;">${item.icon || '❓'}</div>
        <p>Sell 1x ${item.name} for ${sellPrice} Gold?</p>
        <p style="font-size: 0.8em; color: #888;">(From ${fromBank ? 'Bank' : 'Inventory'})</p>
        <div class="action-buttons">
            <button id="confirm-sell-btn" class="btn btn-success">Sell</button>
            <button class="btn btn-danger" onclick="this.closest('.modal-overlay').classList.add('hidden')">Cancel</button>
        </div>
    `;
    showModal(modalContent);

    document.getElementById('confirm-sell-btn').addEventListener('click', () => {
        Network.emitPlayerAction('sellItem', { itemIndex, fromBank });
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
        tab.onclick = () => {
            setActiveCraftingCategory(category);
            renderCrafting();
        };
        categoriesContainer.appendChild(tab);
    });

    // Get recipes for active category
    const recipesInCategory = gameData.craftingRecipes.filter(r => r.category === activeCraftingCategory);

    // Determine subtabs based on result item types
    const subtabMap = {};
    recipesInCategory.forEach(recipe => {
        if (recipe.requiresDiscovery && !gameState.knownRecipes.includes(recipe.result.name)) {
            return; // Skip hidden recipes
        }
        const resultItem = gameData.allItems.find(i => i.name === recipe.result.name);
        let subtab = 'Other';
        if (resultItem) {
            if (resultItem.type === 'weapon') subtab = 'Weapons';
            else if (resultItem.type === 'armor' || resultItem.type === 'shield') subtab = 'Armor';
            else if (resultItem.type === 'arrows') subtab = 'Ammo';
            else if (resultItem.type === 'consumable') subtab = 'Food';
            else if (resultItem.type === 'material') subtab = 'Materials';
        }
        if (!subtabMap[subtab]) subtabMap[subtab] = [];
        subtabMap[subtab].push(recipe);
    });

    const subtabNames = Object.keys(subtabMap);

    // If no active subtab or it doesn't exist, select the first one
    if (!activeCraftingSubtab || !subtabMap[activeCraftingSubtab]) {
        activeCraftingSubtab = subtabNames[0] || null;
    }

    // Render subtabs
    if (subtabNames.length > 1) {
        const subtabContainer = document.createElement('div');
        subtabContainer.className = 'crafting-subtabs';
        subtabNames.forEach(subtab => {
            const btn = document.createElement('button');
            btn.className = `subtab-btn ${activeCraftingSubtab === subtab ? 'active' : ''}`;
            btn.dataset.subtab = subtab;
            btn.textContent = subtab;
            btn.onclick = () => {
                setActiveCraftingSubtab(subtab);
                renderCrafting();
            };
            subtabContainer.appendChild(btn);
        });
        gridContainer.appendChild(subtabContainer);
    }

    // Sort recipes: craftable first, then alphabetically
    const recipesToDisplay = (subtabMap[activeCraftingSubtab] || []).sort((a, b) => {
        const canCraftA = hasMaterials(a.materials);
        const canCraftB = hasMaterials(b.materials);
        if (canCraftA && !canCraftB) return -1;
        if (!canCraftA && canCraftB) return 1;
        return a.result.name.localeCompare(b.result.name);
    });

    // Create a wrapper for the grid items to separate them from the subtabs
    const cardsWrapper = document.createElement('div');
    cardsWrapper.className = 'crafting-grid';
    // Remove the display grid from the parent container if we are using a wrapper,
    // but here gridContainer IS the target. Actually the CSS styles .crafting-grid.
    // The previous implementation appended subtabs directly to #crafting-grid.
    // I should probably append subtabs (flex) then a NEW div for the grid content.
    // BUT the CSS I wrote aims at .crafting-grid which IS gridContainer in HTML.
    // So the subtabs would be grid items if I'm not careful.
    // FIX: Render subtabs OUTSIDE grid or use full-width span.
    // The previous code appended subtabs to gridContainer.
    // Let's create a NEW container for the cards.
    // Actually, looking at HTML structure `div id="crafting-grid" class="crafting-grid"`
    // I should change the ID or structure slightly.
    // The easiest fix: Make gridContainer display: block, append subtabs, append a NEW div with class 'crafting-grid'.
    gridContainer.className = ''; // Remove grid class from container so subtabs stack normally

    if (subtabNames.length > 1) {
        // Appended subtabs above
    }

    const itemsGrid = document.createElement('div');
    itemsGrid.className = 'crafting-grid'; // This gets the grid styles
    itemsGrid.style.marginTop = '10px';

    recipesToDisplay.forEach((recipe) => {
        const canCraft = hasMaterials(recipe.materials);
        const resultItem = gameData.allItems.find(i => i.name === recipe.result.name);
        const recipeIndex = gameData.craftingRecipes.indexOf(recipe);

        const card = document.createElement('div');
        card.className = `crafting-item-card ${canCraft ? 'craftable' : 'disabled'}`;

        let quantityBadge = '';
        if (recipe.result.quantity > 1) {
            quantityBadge = `<span class="quantity-badge">${recipe.result.quantity}</span>`;
        }

        card.innerHTML = `
            <div class="icon">${resultItem?.icon || '📦'}</div>
            ${quantityBadge}
        `;

        // Tooltip logic
        let tooltip = `<strong>${resultItem?.name || recipe.result.name}</strong>`;
        if (resultItem?.type === 'weapon') {
            tooltip += `<br><span style="color:#aaa">${resultItem.weaponDamage} ${resultItem.damageType} Dmg</span>`;
        }
        tooltip += `<hr style="margin: 5px 0;"><strong>Requires:</strong>`;

        for (const [matName, reqQty] of Object.entries(recipe.materials)) {
            const owned = getMaterialCount(matName);
            const color = owned >= reqQty ? '#2ecc71' : '#e74c3c'; // Green or Red
            tooltip += `<br><span style="color:${color}">${matName}: ${owned}/${reqQty}</span>`;
        }

        if (canCraft) {
            tooltip += `<br><br><em style="color:#f1c40f">Click to Craft</em>`;
            card.onclick = () => showCraftingModal(recipeIndex);
        } else {
            tooltip += `<br><br><em style="color:#aaa">Insufficient Materials</em>`;
        }

        card.onmouseover = () => showTooltip(tooltip);
        card.onmouseout = () => hideTooltip();

        itemsGrid.appendChild(card);
    });

    gridContainer.appendChild(itemsGrid);
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

    const categories = [...new Set(gameData.allSpells.filter(s => s.scrollCost).map(s => s.school))];

    categories.forEach(category => {
        const tab = document.createElement('button');
        tab.className = `category-tab ${activeTrainerCategory === category ? 'active' : ''}`;
        tab.dataset.category = category;
        tab.textContent = category;
        categoriesContainer.appendChild(tab);
    });

    const spellsToDisplay = gameData.allSpells.filter(s => s.school === activeTrainerCategory && s.scrollCost);

    spellsToDisplay.forEach(spell => {
        const spellEl = document.createElement('div');
        spellEl.className = 'trainer-row';

        const knowsSpell = gameState.spellbook.some(s => s.name === spell.name) || gameState.equippedSpells.some(s => s.name === spell.name);

        // Check for scroll in inventory
        const hasScroll = gameState.inventory.some(i => i && i.name === spell.scrollCost);

        let buttonHTML = `<button class="btn btn-sm btn-success" data-spell-name="${spell.name}" ${knowsSpell || !hasScroll ? 'disabled' : ''}>Learn (1x ${spell.scrollCost})</button>`;
        if (knowsSpell) {
            buttonHTML = `<button class="btn btn-sm" disabled>Known</button>`;
        } else if (!hasScroll) {
            buttonHTML = `<button class="btn btn-sm" disabled style="background-color: #555; border-color: #444;">Need Scroll</button>`;
        }

        spellEl.innerHTML = `
            <div class="trainer-row-info">
                <span class="trainer-row-icon">${spell.icon || '✨'}</span>
                <span class="trainer-row-name">${spell.name}</span>
            </div>
            ${buttonHTML}
        `;

        // Build tooltip content
        let tooltipContent = `<strong>${spell.name}</strong>`;
        tooltipContent += `<br>${spell.description}`;
        tooltipContent += `<hr style="margin: 5px 0;">`;
        tooltipContent += `<strong>Requires:</strong> ${spell.scrollCost}`;

        if (spell.cost !== undefined) {
            tooltipContent += `<br><strong>Cost:</strong> ${spell.cost} AP`;
        }
        if (spell.cooldown !== undefined) {
            tooltipContent += ` | <strong>CD:</strong> ${spell.cooldown}`;
        }
        if (spell.type) {
            tooltipContent += `<br><strong>Type:</strong> ${spell.type}`;
        }

        spellEl.addEventListener('mouseenter', () => showTooltip(tooltipContent));
        spellEl.addEventListener('mouseleave', () => hideTooltip());

        gridContainer.appendChild(spellEl);
    });
}

export function setActiveCraftingCategory(category) {
    activeCraftingCategory = category;
    activeCraftingSubtab = null; // Reset subtab when category changes
}

export function setActiveCraftingSubtab(subtab) {
    activeCraftingSubtab = subtab;
}

export function setActiveTrainerCategory(category) {
    activeTrainerCategory = category;
}