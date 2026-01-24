'use strict';

import { gameData } from '../data/index.js'; // Corrected Path
import { gameState } from '../state.js';
import * as Network from '../network.js';
import { getBonusStats } from '../player.js';
import { showModal, hideModal, showTooltip, hideTooltip, buildItemTooltip, buildSpellTooltip } from './ui-main.js';
import * as TownUI from './ui-town.js';
import * as AdventureUI from './ui-adventure.js';
import * as UIParty from './ui-party.js';

let activeSpellbookCategory = 'Physical'; // Default category

// --- MAIN RENDER ORCHESTRATOR ---

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
    TownUI.renderMerchant();
    TownUI.renderBankInterface();
    TownUI.renderCrafting();
    TownUI.renderTrainer();
    renderTitleSelection();
    // renderPartyManagement is called by network events, so it's not needed here.
    if (gameState.currentZone || gameState.inDuel) {
        AdventureUI.renderAdventureScreen();
    } else {
        document.getElementById('adventure-tab').style.display = 'none';
    }
}

// --- TAB MANAGEMENT ---

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

    TownUI.updateRestockTimer(); // Clears or updates the timer interval

    // --- BUG FIX: Add a loading state for the merchant to prevent race condition ---
    if (tabName === 'merchant') {
        document.getElementById('merchant-tab').innerHTML = '<h2>Contacting merchant...</h2>';
        Network.emitPlayerAction('viewMerchant');
    }
    // --- END OF BUG FIX ---

    if (tabName === 'party') UIParty.renderPartyManagement(null);
    if (tabName === 'bank') TownUI.renderBankInterface();
    if (tabName === 'crafting') TownUI.renderCrafting();
    if (tabName === 'crafting') TownUI.renderCrafting();
    if (tabName === 'trainer') TownUI.renderTrainer();
    if (tabName === 'quest-log') renderQuestLog();
    if (tabName === 'character') {
        renderInventory();
        renderSpells();
        renderEquipment();
        // renderTitleSelection() removed - now handled via header button modal
    }
}


// --- PLAYER-SPECIFIC RENDERING ---

export function renderHeader() {
    const charInfo = document.getElementById('character-info');
    const avatarEl = document.getElementById('character-avatar-display');
    const nameEl = document.getElementById('character-name-display');
    const titleEl = document.getElementById('character-title-display');
    const defaultTitleEl = document.getElementById('default-header-title');

    if (gameState.characterName) {
        nameEl.textContent = gameState.characterName;
        titleEl.textContent = gameState.title;
        charInfo.style.display = 'flex';
        defaultTitleEl.style.display = 'none';

        if (gameState.characterIcon && gameState.characterIcon.includes('/')) {
            avatarEl.src = gameState.characterIcon;
            avatarEl.style.display = 'block';
        } else {
            avatarEl.style.display = 'none';
        }

        // Attach listeners if not already attached (simple check or re-attach safely)
        const changeAvatarBtn = document.getElementById('change-avatar-btn');
        const changeTitleBtn = document.getElementById('change-title-btn');

        // Use onclick to prevent multiple listeners accumulation on re-render
        if (changeAvatarBtn) {
            changeAvatarBtn.onclick = () => UIParty.showAvatarSelectionModal();
        }
        if (changeTitleBtn) {
            changeTitleBtn.onclick = () => showTitleSelectionModal();
        }

    } else {
        charInfo.style.display = 'none';
        defaultTitleEl.style.display = 'block';
    }
}

export function updateDisplay() {
    const bonuses = getBonusStats();
    gameState.maxHealth = 10 + bonuses.maxHealth;
    if (gameState.currentZone === null && !gameState.inDuel) {
        gameState.health = gameState.maxHealth;
    } else if (gameState.health > gameState.maxHealth) {
        gameState.health = gameState.maxHealth;
    }

    const calculatedStats = {
        strength: gameState.strength + bonuses.strength,
        wisdom: gameState.wisdom + bonuses.wisdom,
        agility: gameState.agility + bonuses.agility,
        defense: gameState.defense + bonuses.defense,
        physicalResistance: (gameState.physicalResistance || 0) + (bonuses.physicalResistance || 0)
    };

    const mainStatsContainer = document.getElementById('main-stats-display');
    mainStatsContainer.innerHTML = `
        <div class="compact-stat">❤️ Health: <span>${gameState.health} / ${gameState.maxHealth}</span></div>
        <div class="compact-stat">💪 Str: <span>${calculatedStats.strength}</span></div>
        <div class="compact-stat">🏃 Agi: <span>${calculatedStats.agility}</span></div>
        <div class="compact-stat">🧠 Wis: <span>${calculatedStats.wisdom}</span></div>
        <div class="compact-stat">🛡️ Def: <span>${calculatedStats.defense}</span></div>
        <div class="compact-stat">💰 Gold: <span>${gameState.gold}</span></div>
        <div class="compact-stat">⭐ QP: <span>${gameState.questPoints}</span></div>
    `;

    const adventureHUD = document.getElementById('adventure-hud');
    if (adventureHUD && (gameState.currentZone || gameState.inDuel)) {
        let currentHealth, currentMaxHealth, currentAP;
        let localPlayerState = null;

        // Handle PvP encounter state
        if (gameState.pvpEncounter && gameState.pvpEncounter.playerStates) {
            localPlayerState = gameState.pvpEncounter.playerStates.find(p => p.playerId === Network.socket?.id);
            if (localPlayerState) {
                currentHealth = localPlayerState.health;
                currentMaxHealth = localPlayerState.maxHealth;
                currentAP = localPlayerState.actionPoints;
            }
        } else if (gameState.partyId && gameState.partyMemberStates) {
            localPlayerState = gameState.partyMemberStates.find(p => p.playerId === Network.socket?.id);
            if (localPlayerState) {
                currentHealth = localPlayerState.health;
                currentMaxHealth = localPlayerState.maxHealth;
                currentAP = localPlayerState.actionPoints;
            }
        } else if (gameState.inDuel && gameState.duelState) {
            localPlayerState = gameState.duelState.player1.id === Network.socket?.id ? gameState.duelState.player1 : gameState.duelState.player2;
            if (localPlayerState) {
                currentHealth = localPlayerState.health;
                currentMaxHealth = localPlayerState.maxHealth;
                currentAP = localPlayerState.actionPoints;
            }
        } else {
            // Fallback for solo or if state isn't synced yet
            localPlayerState = gameState; // Use gameState as local state for fallback
            currentHealth = gameState.health;
            currentMaxHealth = gameState.maxHealth;
            currentAP = gameState.actionPoints;
        }

        const hudHealthBar = document.getElementById('hud-health-bar');
        const healthPercentage = (currentHealth / currentMaxHealth) * 100;
        hudHealthBar.style.width = `${healthPercentage}%`;

        // --- Shield Logic (Safe) ---
        let currentShield = 0;
        try {
            if (localPlayerState && Array.isArray(localPlayerState.buffs)) {
                const barrierBuff = localPlayerState.buffs.find(b => b && b.type === 'Magic Barrier');
                if (barrierBuff) currentShield = barrierBuff.value || 0;
            } else if (gameState.shield) {
                currentShield = gameState.shield; // Fallback to deprecated prop if needed
            }
        } catch (e) { console.error("Error determining shield value", e); }

        const container = document.querySelector('.hud-health-bar-container');
        if (container) {
            let shieldBar = container.querySelector('.hud-shield-bar');
            if (!shieldBar) {
                shieldBar = document.createElement('div');
                shieldBar.className = 'hud-shield-bar';
                container.appendChild(shieldBar);
            }

            if (currentShield > 0) {
                const shieldPercentage = (currentShield / currentMaxHealth) * 100;
                shieldBar.style.width = `${shieldPercentage}%`;
                shieldBar.style.display = 'block';
                hudHealthBar.textContent = `${Math.round(currentHealth)} / ${currentMaxHealth} (+${currentShield})`;
            } else {
                shieldBar.style.display = 'none';
                hudHealthBar.textContent = `${Math.round(currentHealth)} / ${currentMaxHealth}`;
            }
        } else {
            hudHealthBar.textContent = `${Math.round(currentHealth)} / ${currentMaxHealth}`;
        }

        const apDisplay = document.getElementById('hud-action-points');
        if (apDisplay) apDisplay.textContent = currentAP;

        const shieldDisplay = document.getElementById('player-shield-display');
        if (shieldDisplay) shieldDisplay.style.display = 'none'; // Always hide old display logic
    }
}

export function renderInventory() {
    const container = document.getElementById('inventory-grid');
    container.innerHTML = '';

    for (let i = 0; i < 28; i++) {
        const slot = document.createElement('div');
        slot.className = 'inventory-item';

        const item = gameState.inventory[i];
        if (item) {
            // Determine what equipment slot this item could go in for comparison
            let compareWith = null;
            if (item.slot) {
                const targetSlot = Array.isArray(item.slot) ? item.slot[0] : item.slot;
                compareWith = gameState.equipment[targetSlot];
                // Don't compare item to itself if somehow in both places
                if (compareWith && compareWith.name === item.name) compareWith = null;
            }

            const tooltipContent = buildItemTooltip(item, {
                compareWith,
                action: 'Click ... for actions'
            });
            slot.onmouseover = () => showTooltip(tooltipContent);
            slot.onmouseout = () => hideTooltip();

            let itemText = `<div class="item-icon">${item.icon || '❓'}</div>`;
            if (item.quantity > 1) {
                itemText += ` <div class="item-quantity">${item.quantity}</div>`
            }
            if (item.charges) {
                itemText += ` <div class="item-quantity">${item.charges}</div>`
            }
            slot.innerHTML = `
                ${itemText}
                <button class="btn btn-primary btn-sm item-action-btn" data-index="${i}">...</button>
            `;
        } else {
            slot.innerHTML = '';
            slot.classList.add('empty');
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
        const localPlayerState = gameState.partyMemberStates.find(p => p.playerId === Network.socket?.id);
        if (localPlayerState) {
            spellCooldowns = localPlayerState.spellCooldowns;
        }
    } else if (gameState.inDuel && gameState.duelState) {
        const localPlayerState = gameState.duelState.player1.id === Network.socket?.id ? gameState.duelState.player1 : gameState.duelState.player2;
        if (localPlayerState) spellCooldowns = localPlayerState.spellCooldowns;
    }

    // --- RENDER EQUIPPED SPELLS ---
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
                <div class="spell-details">
                    <div>Cost: ${spell.cost || 0} AP | CD: ${spell.cooldown}${cooldown > 0 ? ` <span style="color:#e74c3c">(${cooldown} left)</span>` : ''}</div>
                </div>
                ${swapButton}
            `;

            // Add tooltip
            const tooltipContent = buildSpellTooltip(spell, cooldown);
            slot.onmouseover = (e) => {
                if (e.target.closest('button')) return;
                showTooltip(tooltipContent);
            };
            slot.onmouseout = () => hideTooltip();
        } else {
            slot.className = 'spell-card';
            slot.innerHTML = 'Empty Spell Slot';
            slot.style.opacity = '0.3';
        }
        equippedContainer.appendChild(slot);
    }

    // --- RENDER SPELLBOOK TABS ---
    const tabsContainer = document.getElementById('spellbook-tabs');
    const availableCategories = [...new Set(gameState.spellbook.map(s => s.school || 'Physical'))];
    availableCategories.sort();

    // Ensure active category is valid
    if (!availableCategories.includes(activeSpellbookCategory) && availableCategories.length > 0) {
        activeSpellbookCategory = availableCategories[0];
    }

    // Always clear container to avoid duplicates
    tabsContainer.innerHTML = '';

    availableCategories.forEach(category => {
        const tab = document.createElement('button');
        tab.className = `tab-btn ${activeSpellbookCategory === category ? 'active' : ''}`;
        tab.textContent = category;
        tab.onclick = () => {
            activeSpellbookCategory = category;
            renderSpells(); // Re-render to update grid
        };
        tabsContainer.appendChild(tab);
    });

    // --- PAGINATION LOGIC ---
    const ITEMS_PER_PAGE = 6;
    const totalPages = Math.ceil(spellsToDisplay.length / ITEMS_PER_PAGE);

    // Ensure current page is valid
    if (window.spellbookPage === undefined) window.spellbookPage = 1;
    if (window.spellbookPage > totalPages) window.spellbookPage = totalPages || 1;
    if (window.spellbookPage < 1) window.spellbookPage = 1;

    const startIndex = (window.spellbookPage - 1) * ITEMS_PER_PAGE;
    const endIndex = startIndex + ITEMS_PER_PAGE;
    const spellsOnPage = spellsToDisplay.slice(startIndex, endIndex);

    if (spellsOnPage.length === 0 && gameState.spellbook.length > 0) {
        if (spellsToDisplay.length === 0) {
            spellbookContainer.innerHTML = '<p>No spells in this category.</p>';
        } else {
            // Should not happen if logic is correct, but fallback
            spellbookContainer.innerHTML = '<p>Page empty.</p>';
        }
    } else if (gameState.spellbook.length === 0) {
        spellbookContainer.innerHTML = '<p>You have not learned any spells yet.</p>';
    }

    spellsOnPage.forEach((spell) => {
        // Find original index in full spellbook for the equip action
        const originalIndex = gameState.spellbook.indexOf(spell);

        const card = document.createElement('div');
        card.className = `spell-card ${spell.type}`;
        let equipButton = '';
        if (canSwap && gameState.equippedSpells.length < 5) {
            equipButton = `<button class="btn btn-success btn-sm" data-spell-action="equip" data-index="${originalIndex}">Equip</button>`;
        }
        card.innerHTML = `
            <div><strong>${spell.icon || '✨'} ${spell.name}</strong></div>
            <div class="spell-details">
                <div>${spell.cost || 0} AP | CD: ${spell.cooldown}</div>
            </div>
            ${equipButton}
        `;

        // Add tooltip
        const tooltipContent = buildSpellTooltip(spell, 0);
        card.onmouseover = (e) => {
            if (e.target.closest('button')) return;
            showTooltip(tooltipContent);
        };
        card.onmouseout = () => hideTooltip();

        spellbookContainer.appendChild(card);
    });

    // --- RENDER PAGINATION CONTROLS ---
    if (totalPages > 1) {
        const paginationControls = document.createElement('div');
        paginationControls.className = 'spellbook-pagination';
        paginationControls.style.display = 'flex';
        paginationControls.style.justifyContent = 'center';
        paginationControls.style.alignItems = 'center';
        paginationControls.style.gap = '10px';
        paginationControls.style.marginTop = '10px';

        paginationControls.innerHTML = `
            <button class="btn btn-sm" id="prev-page-btn" ${window.spellbookPage === 1 ? 'disabled' : ''}>Prev</button>
            <span>Page ${window.spellbookPage} of ${totalPages}</span>
            <button class="btn btn-sm" id="next-page-btn" ${window.spellbookPage === totalPages ? 'disabled' : ''}>Next</button>
        `;

        spellbookContainer.appendChild(paginationControls);

        // Attach listeners (using manual binding to avoid inline onclick issues with scope)
        // We use setTimeout to ensure elements are in DOM or just direct bind
        const prevBtn = paginationControls.querySelector('#prev-page-btn');
        const nextBtn = paginationControls.querySelector('#next-page-btn');

        if (prevBtn) prevBtn.onclick = () => {
            window.spellbookPage--;
            renderSpells();
        };
        if (nextBtn) nextBtn.onclick = () => {
            window.spellbookPage++;
            renderSpells();
        };
    }
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

        if (item && item.hands === 2 && slotKey === 'offHand') {
            slotEl.classList.add('filled');
            slotEl.innerHTML = `<div><strong>${slotNames[slotKey]}</strong></div><div>(Blocked by 2H)</div>`;
        } else if (item) {
            slotEl.classList.add('filled');
            let itemText = `<div class="item-icon">${item.icon || '❓'}</div><div><strong>${item.name}</strong></div>`;
            if (item.quantity > 1) {
                itemText += ` <div class="item-quantity">${item.quantity}</div>`;
            }

            // Gem slot display
            let gemSlotHTML = '';
            if (item.gemSlot) {
                if (item.socketedGem) {
                    gemSlotHTML = `
                        <div class="gem-slot socketed" title="Socketed: ${item.socketedGem.name}">
                            <span class="gem-icon">${item.socketedGem.icon || '💎'}</span>
                            <button class="btn btn-sm gem-unsocket-btn" data-equipment-action="unsocketGem" data-slot="${slotKey}">✕</button>
                        </div>
                    `;
                } else {
                    gemSlotHTML = `
                        <div class="gem-slot empty" title="Empty gem slot - click to socket a gem">
                            <button class="btn btn-sm gem-socket-btn" data-equipment-action="socketGem" data-slot="${slotKey}">💎+</button>
                        </div>
                    `;
                }
            }

            slotEl.innerHTML = `<div><strong>${slotNames[slotKey]}</strong></div>${itemText}${gemSlotHTML}<button class="btn btn-danger btn-sm" data-equipment-action="unequip" data-slot="${slotKey}">Unequip</button>`;

            // Add tooltip using enhanced buildItemTooltip
            const tooltipContent = buildItemTooltip(item);
            slotEl.onmouseover = (e) => {
                // Don't show tooltip if hovering over buttons
                if (e.target.closest('button')) return;
                showTooltip(tooltipContent);
            };
            slotEl.onmouseout = () => hideTooltip();

        } else {
            slotEl.innerHTML = `<div><strong>${slotNames[slotKey]}</strong></div><div>Empty</div>`;
        }

        container.appendChild(slotEl);
    });
}

export function showGemSocketModal(equipmentSlot) {
    const equippedItem = gameState.equipment[equipmentSlot];
    if (!equippedItem || !equippedItem.gemSlot) return;

    // Find all gems in inventory
    const gemsInInventory = [];
    gameState.inventory.forEach((item, index) => {
        if (item && item.type === 'gem') {
            gemsInInventory.push({ gem: item, index });
        }
    });

    let modalContent = `<h2>Socket Gem into ${equippedItem.name}</h2>`;

    if (gemsInInventory.length === 0) {
        modalContent += '<p>You have no gems in your inventory.</p>';
    } else {
        modalContent += '<div class="gem-selection-grid">';
        gemsInInventory.forEach(({ gem, index }) => {
            const bonusText = Object.entries(gem.gemBonus || {}).map(([stat, val]) => `+${val} ${stat}`).join(', ');
            modalContent += `
                <div class="gem-option" data-gem-socket-action="socket" data-gem-index="${index}" data-equipment-slot="${equipmentSlot}">
                    <span class="gem-icon">${gem.icon}</span>
                    <div class="gem-info">
                        <strong>${gem.name}</strong>
                        <small>${bonusText}</small>
                    </div>
                </div>
            `;
        });
        modalContent += '</div>';
    }

    modalContent += '<div class="action-buttons" style="margin-top: 20px;"><button class="btn" onclick="document.getElementById(\'modal\').classList.add(\'hidden\')">Cancel</button></div>';
    showModal(modalContent);
}

function generateQuestLogHTML() {
    const activeQuests = gameState.quests.filter(q => q.status === 'active' || q.status === 'readyToTurnIn');
    let html = '<h2>Quest Log</h2>';

    if (activeQuests.length === 0) {
        html += '<p>You have no active quests.</p>';
        return html;
    }

    const questGiverMap = new Map();
    // Safely iterate cardPools
    if (gameData.cardPools) {
        Object.values(gameData.cardPools).flat().forEach(poolItem => {
            if (poolItem && poolItem.card && poolItem.card.quests) {
                poolItem.card.quests.forEach(quest => {
                    questGiverMap.set(quest.id, poolItem.card.name);
                });
            }
        });
    }

    activeQuests.forEach(quest => {
        let progressText = '';
        if (quest.status === 'readyToTurnIn') {
            const giver = questGiverMap.get(quest.details.id) || 'Quest Giver';
            progressText = `<span style="color: var(--success-color);">(Ready to turn in to ${giver})</span>`;
        } else if (quest.details.target) {
            progressText = `(${quest.progress} / ${quest.details.required} ${quest.details.target}s defeated)`;
        } else if (quest.details.turnInItems) {
            const itemName = Object.keys(quest.details.turnInItems)[0];
            const requiredAmount = quest.details.turnInItems[itemName];
            const currentAmount = gameState.inventory.filter(i => i && i.name === itemName).reduce((total, item) => total + (item.quantity || 1), 0);
            progressText = `(${currentAmount} / ${requiredAmount} ${itemName}s collected)`;
        }

        html += `<div class="quest-entry" style="margin-bottom: 15px; padding: 10px; background: rgba(0,0,0,0.2); border-radius: 4px;">
            <strong>${quest.details.title}</strong><br>
            <small>${progressText}</small>
        </div>`;
    });

    return html;
}

export function renderQuestLog() {
    const container = document.getElementById('quest-log-tab');
    if (container) container.innerHTML = generateQuestLogHTML();
}

export function showQuestLogModal() {
    const content = generateQuestLogHTML() + `<div class="action-buttons" style="margin-top: 20px;"><button class="btn" onclick="document.getElementById('modal').classList.add('hidden')">Close</button></div>`;
    showModal(content);
}

export function showTitleSelectionModal() {
    if (!gameState.characterName) return;

    let modalContent = '<h2>Select Title</h2><div class="action-buttons">';

    gameState.unlockedTitles.forEach(title => {
        const isCurrent = title === gameState.title;
        modalContent += `
            <button class="btn ${isCurrent ? 'btn-success' : 'btn-primary'}" 
                ${isCurrent ? 'disabled' : ''} 
                onclick="window.setPlayerTitle('${title}')">
                ${title}
            </button>
        `;
    });

    modalContent += '</div>';
    modalContent += `<div class="action-buttons" style="margin-top: 20px;"><button class="btn" onclick="document.getElementById('modal').classList.add('hidden')">Close</button></div>`;

    showModal(modalContent);
}

// Global helper for the onclick
window.setPlayerTitle = (title) => {
    Network.emitPlayerAction('setTitle', { title }); // Assuming this event exists or needs to be handled
    // Optimistic update
    gameState.title = title;
    renderHeader();
    showTitleSelectionModal(); // Re-render modal to update buttons
};