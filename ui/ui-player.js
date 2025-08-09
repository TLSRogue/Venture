'use strict';

import { gameData } from '../game-data.js';
import { gameState } from '../state.js';
import * as Network from '../network.js';
import { getBonusStats } from '../player.js';
import { showModal, hideModal, showTooltip, hideTooltip } from './ui-main.js';
import * as TownUI from './ui-town.js';
import * as AdventureUI from './ui-adventure.js';
import * as UIParty from './ui-party.js';

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
    
    // BUG FIX: Added the missing call to render the party tab UI
    if (tabName === 'party') UIParty.renderPartyManagement(null);
    if (tabName === 'merchant') { 
        Network.emitPlayerAction('viewMerchant');
    }
    if (tabName === 'bank') TownUI.renderBankInterface();
    if (tabName === 'crafting') TownUI.renderCrafting();
    if (tabName === 'trainer') TownUI.renderTrainer();
    if (tabName === 'home') renderTitleSelection();
    if (tabName === 'spells') renderSpells();
    if (tabName === 'quest-log') renderQuestLog();
}


// --- PLAYER-SPECIFIC RENDERING ---

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

        if (gameState.partyId && gameState.partyMemberStates) {
            const localPlayerState = gameState.partyMemberStates.find(p => p.playerId === Network.socket?.id);
            if (localPlayerState) {
                currentHealth = localPlayerState.health;
                currentMaxHealth = localPlayerState.maxHealth;
                currentAP = localPlayerState.actionPoints;
            }
        } else if (gameState.inDuel && gameState.duelState) {
            const localPlayerState = gameState.duelState.player1.id === Network.socket?.id ? gameState.duelState.player1 : gameState.duelState.player2;
            if (localPlayerState) {
                currentHealth = localPlayerState.health;
                currentMaxHealth = localPlayerState.maxHealth;
                currentAP = localPlayerState.actionPoints;
            }
        } else {
            // Fallback for solo or if state isn't synced yet
            currentHealth = gameState.health;
            currentMaxHealth = gameState.maxHealth;
            currentAP = gameState.actionPoints;
        }

        const hudHealthBar = document.getElementById('hud-health-bar');
        const healthPercentage = (currentHealth / currentMaxHealth) * 100;
        hudHealthBar.style.width = `${healthPercentage}%`;
        hudHealthBar.textContent = `${Math.round(currentHealth)} / ${currentMaxHealth}`;
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
        if(localPlayerState) spellCooldowns = localPlayerState.spellCooldowns;
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
                itemText += ` <div class="item-quantity">${item.quantity}</div>`;
            }
            slotEl.innerHTML = `<div><strong>${slotNames[slotKey]}</strong></div>${itemText}<button class="btn btn-danger btn-sm" data-equipment-action="unequip" data-slot="${slotKey}">Unequip</button>`;
        } else {
            slotEl.innerHTML = `<div><strong>${slotNames[slotKey]}</strong></div><div>Empty</div>`;
        }
        
        container.appendChild(slotEl);
    });
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