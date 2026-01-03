'use strict';

import { gameData } from '../data/index.js';
import { gameState } from '../state.js';
import * as Network from '../network.js';
import { showModal, hideModal, showTooltip, hideTooltip } from './ui-main.js';

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

/**
 * Renders the unified navigation tabs for Town Services.
 * @param {string} activeTab - The ID of the currently active tab (merchant, bank, crafting, trainer).
 * @param {HTMLElement} container - The container element to prepend the navigation to.
 */
function renderTownNavigation(activeTab, container) {
    const navBar = document.createElement('div');
    navBar.className = 'town-nav-bar';

    const tabs = [
        { id: 'merchant', label: '🏪 Merchant', render: renderMerchant },
        { id: 'bank', label: '🏦 Bank', render: renderBankInterface },
        { id: 'crafting', label: '⚒️ Crafting', render: renderCrafting },
        { id: 'trainer', label: '⚔️ Trainer', render: renderTrainer }
    ];

    tabs.forEach(tab => {
        const btn = document.createElement('button');
        btn.className = `btn btn-sm ${activeTab === tab.id ? 'btn-primary' : ''}`;
        btn.textContent = tab.label;
        btn.onclick = () => {
            // Re-render the specific view. 
            // Since our render functions create new Modals contents, 
            // we just call the function which will replace the modal content.
            tab.render(); 
        };
        navBar.appendChild(btn);
    });

    const closeBtn = document.createElement('button');
    closeBtn.className = 'btn btn-sm btn-danger';
    closeBtn.textContent = '❌ Close';
    closeBtn.style.marginLeft = 'auto'; // Push to right
    closeBtn.onclick = hideModal;
    navBar.appendChild(closeBtn);

    container.insertBefore(navBar, container.firstChild);
}

// --- RENDER FUNCTIONS ---

export function renderBankInterface() {
    const container = document.createElement('div');
    container.className = 'bank-ui-container';
    
    // Add Navigation
    renderTownNavigation('bank', container);
    
    const contentWrapper = document.createElement('div');
    contentWrapper.innerHTML = `
        <div class="bank-header" style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px;">
            <h3>Bank Vault (${gameState.bank.length} items)</h3>
            <button class="btn btn-sm" id="consolidate-bank-btn">Consolidate Stacks</button>
        </div>
        <div class="bank-grid" id="bank-grid-display"></div>
    `;
    
    // Populate Grid
    const grid = contentWrapper.querySelector('#bank-grid-display');
    
    gameState.bank.forEach((item, index) => {
        const itemEl = document.createElement('div');
        itemEl.className = 'inventory-item';
        
        let itemHtml = `<strong>${item.name}</strong>`;
        if (item.quantity && item.quantity > 1) {
            itemHtml += `<span class="item-quantity">${item.quantity}</span>`;
        }
        itemHtml += `<div style="font-size: 0.7em; margin-top: 5px;">(Withdraw)</div>`;
        
        itemEl.innerHTML = itemHtml;
        itemEl.onclick = () => Network.emitPlayerAction('withdrawBankItem', { index });
        
        // Tooltip
        itemEl.addEventListener('mouseenter', () => showTooltip(`<strong>${item.name}</strong><br>${item.description || ''}`));
        itemEl.addEventListener('mouseleave', hideTooltip);

        grid.appendChild(itemEl);
    });

    if (gameState.bank.length === 0) {
        grid.innerHTML = '<div style="grid-column: 1/-1; text-align: center; color: #888; padding: 20px;">Your bank is empty.</div>';
    }

    container.appendChild(contentWrapper);

    // Bind Consolidate
    const consolidateBtn = contentWrapper.querySelector('#consolidate-bank-btn');
    if(consolidateBtn) {
        consolidateBtn.onclick = () => Network.emitPlayerAction('consolidateBank', {});
    }
    
    showModal(container, 'modal-wide');
}

export function renderMerchant() {
    const container = document.createElement('div');
    
    // Add Navigation
    renderTownNavigation('merchant', container);

    const contentWrapper = document.createElement('div');
    contentWrapper.innerHTML = `
        <div style="text-align: center; margin-bottom: 10px;">
            <p>Welcome! Stock refreshes in <span id="merchant-timer">--</span>s.</p>
            <p>Your Gold: <span style="color: gold; font-weight: bold;">${gameState.gold}</span></p>
        </div>
        <div class="inventory-grid" id="merchant-grid"></div>
        <hr style="margin: 15px 0; border-color: #444;">
        <h3>Sell Items</h3>
        <div class="inventory-grid" id="sell-grid"></div>
    `;

    // Buy Grid
    const buyGrid = contentWrapper.querySelector('#merchant-grid');
    gameState.merchantStock.forEach(item => {
        const itemEl = document.createElement('div');
        itemEl.className = 'inventory-item';
        itemEl.innerHTML = `
            <div style="font-size: 1.5em;">${item.icon || '📦'}</div>
            <strong>${item.name}</strong>
            <div style="color: gold; font-size: 0.9em;">${item.price}g</div>
        `;
        itemEl.onclick = () => Network.emitPlayerAction('buyItem', { identifier: item.name, isPermanent: false });
        itemEl.addEventListener('mouseenter', () => showTooltip(`<strong>${item.name}</strong><br>${item.description}<br>Price: ${item.price}g`));
        itemEl.addEventListener('mouseleave', hideTooltip);
        buyGrid.appendChild(itemEl);
    });

    // Sell Grid
    const sellGrid = contentWrapper.querySelector('#sell-grid');
    gameState.inventory.forEach((item, index) => {
        const itemEl = document.createElement('div');
        itemEl.className = 'inventory-item';
        if (item) {
            const sellPrice = Math.floor(item.price ? item.price / 2 : 1);
            let qty = item.quantity > 1 ? `<span class="item-quantity">${item.quantity}</span>` : '';
            itemEl.innerHTML = `
                <div style="font-size: 1.5em;">${item.icon || '🎒'}</div>
                <strong>${item.name}</strong>
                ${qty}
                <div style="color: gold; font-size: 0.8em;">Sell: ${sellPrice}g</div>
            `;
            itemEl.onclick = () => Network.emitPlayerAction('sellItem', { itemIndex: index });
            itemEl.addEventListener('mouseenter', () => showTooltip(`<strong>${item.name}</strong><br>Sell for ${sellPrice}g?`));
            itemEl.addEventListener('mouseleave', hideTooltip);
        } else {
            itemEl.style.opacity = 0.3;
            itemEl.innerHTML = '<small>Empty</small>';
        }
        sellGrid.appendChild(itemEl);
    });

    container.appendChild(contentWrapper);
    showModal(container, 'modal-wide');

    // Timer Logic
    if (merchantTimerInterval) clearInterval(merchantTimerInterval);
    const updateTimer = () => {
        const timerEl = document.getElementById('merchant-timer');
        if (!timerEl) return clearInterval(merchantTimerInterval);
        const now = Date.now();
        const nextRestock = gameState.merchantLastStocked + (5 * 60 * 1000); // 5 mins
        const diff = Math.max(0, Math.ceil((nextRestock - now) / 1000));
        timerEl.textContent = diff;
        if (diff <= 0) Network.emitPlayerAction('viewMerchant', {}); // Refresh
    };
    updateTimer();
    merchantTimerInterval = setInterval(updateTimer, 1000);
}

export function renderCrafting() {
    const container = document.createElement('div');
    
    // Add Navigation
    renderTownNavigation('crafting', container);

    const categories = [...new Set(gameData.craftingRecipes.map(r => r.category))];
    
    // Category Tabs
    const catTabs = document.createElement('div');
    catTabs.style.cssText = "display: flex; gap: 5px; margin-bottom: 10px; overflow-x: auto; padding-bottom: 5px;";
    categories.forEach(cat => {
        const btn = document.createElement('button');
        btn.className = `btn btn-sm ${activeCraftingCategory === cat ? 'btn-primary' : ''}`;
        btn.textContent = cat;
        btn.onclick = () => {
            activeCraftingCategory = cat;
            renderCrafting(); // Re-render current modal
        };
        catTabs.appendChild(btn);
    });
    container.appendChild(catTabs);

    const grid = document.createElement('div');
    grid.className = 'crafting-grid';

    const recipes = gameData.craftingRecipes.filter(r => r.category === activeCraftingCategory);
    
    recipes.forEach((recipe, index) => {
        // Find actual index in global array for the emit
        const globalIndex = gameData.craftingRecipes.indexOf(recipe);
        const hasMats = hasMaterials(recipe.materials);
        const known = !recipe.requiresDiscovery || gameState.knownRecipes.includes(recipe.result.name);

        if (!known) return;

        const itemEl = document.createElement('div');
        itemEl.className = 'crafting-item';
        itemEl.style.opacity = hasMats ? '1' : '0.5';
        
        // Build Mat List for Tooltip
        let matList = '';
        for(let m in recipe.materials) { matList += `${m}: ${recipe.materials[m]}, `; }

        itemEl.innerHTML = `
            <strong>${recipe.result.name}</strong>
            <small>${hasMats ? 'Ready' : 'Missing Mats'}</small>
        `;
        
        if (hasMats) {
            itemEl.onclick = () => Network.emitPlayerAction('craftItem', { recipeIndex: globalIndex });
        }
        
        itemEl.addEventListener('mouseenter', () => showTooltip(`<strong>${recipe.result.name}</strong><br>Requires: ${matList}`));
        itemEl.addEventListener('mouseleave', hideTooltip);

        grid.appendChild(itemEl);
    });

    container.appendChild(grid);
    showModal(container, 'modal-wide');
}

export function renderTrainer() {
    const container = document.createElement('div');
    
    // Add Navigation
    renderTownNavigation('trainer', container);

    const schools = ['Physical', 'Fire', 'Holy', 'Arcane'];
    
    const schoolTabs = document.createElement('div');
    schoolTabs.style.cssText = "display: flex; gap: 5px; margin-bottom: 10px;";
    schools.forEach(school => {
        const btn = document.createElement('button');
        btn.className = `btn btn-sm ${activeTrainerCategory === school ? 'btn-primary' : ''}`;
        btn.textContent = school;
        btn.onclick = () => {
            activeTrainerCategory = school;
            renderTrainer();
        };
        schoolTabs.appendChild(btn);
    });
    container.appendChild(schoolTabs);

    const grid = document.createElement('div');
    grid.className = 'trainer-grid';

    const spellsToDisplay = gameData.allSpells.filter(s => s.school === activeTrainerCategory && s.price > 0);

    spellsToDisplay.forEach(spell => {
        const spellEl = document.createElement('div');
        spellEl.className = 'trainer-item';
        spellEl.style.flexDirection = 'column';
        spellEl.style.alignItems = 'stretch';
        spellEl.style.padding = '10px';
        spellEl.style.aspectRatio = 'auto'; // Override square for trainer list

        const knowsSpell = gameState.spellbook.some(s => s.name === spell.name) || gameState.equippedSpells.some(s => s.name === spell.name);
        const canAfford = gameState.gold >= spell.price;

        let buttonHTML = `<button class="btn btn-sm btn-success" style="width: 100%; margin-top: 5px;">Learn (${spell.price}g)</button>`;
        if (knowsSpell) {
            buttonHTML = `<button class="btn btn-sm" disabled style="width: 100%; margin-top: 5px;">Learned</button>`;
        } else if (!canAfford) {
            buttonHTML = `<button class="btn btn-sm" disabled style="width: 100%; margin-top: 5px;">Need Gold</button>`;
        }

        spellEl.innerHTML = `
            <div style="display:flex; justify-content:space-between;">
                <strong>${spell.icon || '✨'} ${spell.name}</strong>
            </div>
            <small style="color:#aaa; display:block; margin: 5px 0;">${spell.description}</small>
        `;
        
        const btnContainer = document.createElement('div');
        btnContainer.innerHTML = buttonHTML;
        const btn = btnContainer.querySelector('button');
        
        if (!knowsSpell && canAfford) {
            btn.onclick = () => Network.emitPlayerAction('buySpell', { spellName: spell.name });
        }
        
        spellEl.appendChild(btnContainer);
        grid.appendChild(spellEl);
    });
    
    container.appendChild(grid);
    showModal(container, 'modal-wide');
}