'use strict';

import { gameData } from '../data/index.js';
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
    
    // Grouped Action Bar Rendering
    renderEquipment(); 
    renderSpells();
    
    // NOTE: TownUI calls are triggered by user interaction, not automatically on every render.
    // They are left here in the original code logic, but usually we just update the display.
    
    renderTitleSelection();
    
    if (gameState.currentZone || gameState.inDuel) {
        AdventureUI.renderAdventureScreen();
    } else {
        document.getElementById('adventure-tab').style.display = 'none';
    }
}

// --- TAB MANAGEMENT ---

export function showTab(tabName) {
    document.querySelectorAll('.tab-content').forEach(el => el.style.display = 'none');
    document.querySelectorAll('.tab-btn').forEach(el => el.classList.remove('active'));
    
    const activeContent = document.getElementById(`${tabName}-tab`);
    if (activeContent) activeContent.style.display = 'block';
    
    const activeBtn = document.querySelector(`.tab-btn[onclick="showTab('${tabName}')"]`);
    if (activeBtn) activeBtn.classList.add('active');
}
window.showTab = showTab; // Expose globally for HTML onclicks

// --- HEADER & STATS ---

export function renderHeader() {
    const nameDisplay = document.getElementById('character-name-display');
    const titleDisplay = document.getElementById('character-title-display');
    const infoContainer = document.getElementById('character-info');
    const defaultHeader = document.getElementById('default-header-title');

    if (gameState.characterName) {
        infoContainer.style.display = 'block';
        defaultHeader.style.display = 'none';
        nameDisplay.textContent = `${gameState.characterIcon} ${gameState.characterName}`;
        titleDisplay.textContent = gameState.title || "The Novice";
    }
}

export function updateDisplay() {
    if (!gameState.characterName) return;

    const bonuses = getBonusStats();
    const currentHealth = gameState.health;
    const maxHealth = 10 + bonuses.maxHealth;
    const healthPercent = Math.max(0, Math.min(100, (currentHealth / maxHealth) * 100));

    // Update Bars
    const hpBar = document.getElementById('hp-bar-fill');
    if (hpBar) {
        hpBar.style.width = `${healthPercent}%`;
        document.getElementById('hp-text').textContent = `${currentHealth} / ${maxHealth}`;
    }
    
    const xpBar = document.getElementById('xp-bar-fill');
    if (xpBar) {
        // Simple XP visual logic (assuming 1000 xp per level for visualization)
        // Adjust based on your actual leveling formula if exists
        const xpPercent = (gameState.experience % 1000) / 10; 
        xpBar.style.width = `${xpPercent}%`;
    }

    const apDisplay = document.getElementById('action-points-display');
    if (apDisplay) apDisplay.textContent = gameState.actionPoints;

    const goldDisplay = document.getElementById('gold-display');
    if (goldDisplay) goldDisplay.textContent = gameState.gold;

    const mainStats = document.getElementById('main-stats-display');
    if (mainStats) {
        const str = gameState.strength + bonuses.strength;
        const agi = gameState.agility + bonuses.agility;
        const wis = gameState.wisdom + bonuses.wisdom;
        const def = gameState.defense + bonuses.defense;
        
        mainStats.innerHTML = `
            <div title="Strength">💪 ${str}</div>
            <div title="Agility">🦶 ${agi}</div>
            <div title="Wisdom">✨ ${wis}</div>
            <div title="Defense">🛡️ ${def}</div>
        `;
    }
}

// --- ACTION BAR: EQUIPMENT ---

export function renderEquipment() {
    const container = document.getElementById('equipment-bar');
    container.innerHTML = '';

    // Create Group Container
    const group = document.createElement('div');
    group.className = 'action-bar-group';
    
    const label = document.createElement('div');
    label.className = 'action-bar-label';
    label.textContent = "Weapons & Gear";
    group.appendChild(label);

    const row = document.createElement('div');
    row.className = 'action-bar-row';

    const slots = [
        { key: 'mainHand', icon: '⚔️' },
        { key: 'offHand', icon: '🛡️' },
        { key: 'helmet', icon: '🪖' },
        { key: 'armor', icon: '👕' },
        { key: 'boots', icon: '👢' },
        { key: 'accessory', icon: '💍' }
    ];

    // Check for Ammo Slot unlock
    if (gameState.equipment.accessory && gameState.equipment.accessory.grantsSlot === 'ammo') {
        slots.push({ key: 'ammo', icon: '🏹' });
    }

    slots.forEach(slotInfo => {
        const item = gameState.equipment[slotInfo.key];
        const slotEl = document.createElement('div');
        slotEl.className = 'action-slot';
        
        if (item) {
            slotEl.textContent = item.icon || slotInfo.icon;
            
            // Interaction: Select or Use Ability
            slotEl.onclick = () => {
                if (item.activatedAbility) {
                    // Logic to use ability handled via data-attributes or direct call
                    // Here we emit directly via Combat or just highlight
                    // For now, simpler is creating the DOM data for the event listener in game.js
                    slotEl.dataset.action = 'useAbility';
                    slotEl.dataset.slot = slotInfo.key;
                } else if (item.type === 'weapon') {
                    // Select weapon for attack
                    const action = {
                        type: 'weapon',
                        slot: slotInfo.key,
                        data: item
                    };
                    slotEl.dataset.action = 'select';
                    slotEl.dataset.actionData = JSON.stringify(action);
                }
            };
            
            // Cooldown overlay
            if (gameState.itemCooldowns && gameState.itemCooldowns[item.name] > 0) {
                slotEl.classList.add('cooldown');
                const cdText = document.createElement('div');
                cdText.className = 'cooldown-text';
                cdText.textContent = gameState.itemCooldowns[item.name];
                slotEl.appendChild(cdText);
            } else if (gameState.weaponCooldowns && gameState.weaponCooldowns[item.name] > 0) {
                slotEl.classList.add('cooldown');
                const cdText = document.createElement('div');
                cdText.className = 'cooldown-text';
                cdText.textContent = gameState.weaponCooldowns[item.name];
                slotEl.appendChild(cdText);
            }

            // Tooltip
            slotEl.addEventListener('mouseenter', () => showTooltip(`<strong>${item.name}</strong><br>${item.description}`));
            slotEl.addEventListener('mouseleave', hideTooltip);
            
            // Highlight if selected
            if (gameState.turnState?.selectedAction?.slot === slotInfo.key) {
                slotEl.style.borderColor = '#f1c40f';
                slotEl.style.boxShadow = '0 0 10px #f1c40f';
            }

        } else {
            slotEl.textContent = slotInfo.icon;
            slotEl.style.opacity = '0.3';
        }
        
        row.appendChild(slotEl);
    });

    group.appendChild(row);
    container.appendChild(group);
}

// --- ACTION BAR: SPELLS ---

export function renderSpells() {
    const container = document.getElementById('spell-bar');
    container.innerHTML = '';

    // Create Group Container
    const group = document.createElement('div');
    group.className = 'action-bar-group';
    
    const label = document.createElement('div');
    label.className = 'action-bar-label';
    label.textContent = "Spellbook";
    group.appendChild(label);

    const row = document.createElement('div');
    row.className = 'action-bar-row';

    for (let i = 0; i < 5; i++) {
        const spell = gameState.equippedSpells[i];
        const slotEl = document.createElement('div');
        slotEl.className = 'action-slot';

        if (spell) {
            slotEl.textContent = spell.icon || '📜';
            
            // Click Logic
            slotEl.onclick = () => {
                if (spell.type === 'buff' || spell.type === 'heal' && !spell.damage) {
                     // Self cast implicit for pure buffs/heals often
                     slotEl.dataset.action = 'castSelf';
                     slotEl.dataset.spellIndex = i;
                } else {
                    const action = {
                        type: 'spell',
                        index: i,
                        data: spell
                    };
                    slotEl.dataset.action = 'select';
                    slotEl.dataset.actionData = JSON.stringify(action);
                }
            };
            
            // Cooldowns
            if (gameState.spellCooldowns && gameState.spellCooldowns[spell.name] > 0) {
                slotEl.classList.add('cooldown');
                const cdText = document.createElement('div');
                cdText.className = 'cooldown-text';
                cdText.textContent = gameState.spellCooldowns[spell.name];
                slotEl.appendChild(cdText);
            }

            // Tooltip
            slotEl.addEventListener('mouseenter', () => showTooltip(`<strong>${spell.name}</strong><br>${spell.description}`));
            slotEl.addEventListener('mouseleave', hideTooltip);

            // Highlight
            if (gameState.turnState?.selectedAction?.index === i && gameState.turnState?.selectedAction?.type === 'spell') {
                slotEl.style.borderColor = '#3498db';
                slotEl.style.boxShadow = '0 0 10px #3498db';
            }

        } else {
            slotEl.style.opacity = '0.2';
        }
        row.appendChild(slotEl);
    }

    group.appendChild(row);
    container.appendChild(group);
}

// --- INVENTORY GRID ---

export function renderInventory() {
    const container = document.getElementById('inventory-list'); // Usually inside the Home Tab
    if (!container) return; // Might not exist if on adventure screen

    container.innerHTML = '';
    const grid = document.createElement('div');
    grid.className = 'inventory-grid';

    gameState.inventory.forEach((item, index) => {
        const itemEl = document.createElement('div');
        itemEl.className = 'inventory-item';
        
        if (item) {
            let qty = item.quantity > 1 ? `<span class="item-quantity">${item.quantity}</span>` : '';
            itemEl.innerHTML = `
                <div style="font-size: 1.5em;">${item.icon || '📦'}</div>
                <strong>${item.name}</strong>
                ${qty}
            `;
            
            // Click to Equip or Use
            itemEl.onclick = () => {
                if (item.type === 'consumable') {
                    Network.emitPlayerAction('useConsumable', { inventoryIndex: index });
                } else if (['weapon', 'armor', 'shield', 'accessory', 'tool', 'arrows'].includes(item.type)) {
                    Network.emitPlayerAction('equipItem', { inventoryIndex: index });
                }
            };

            itemEl.addEventListener('mouseenter', () => showTooltip(`<strong>${item.name}</strong><br>${item.description}`));
            itemEl.addEventListener('mouseleave', hideTooltip);
        } else {
            itemEl.innerHTML = '<small style="opacity:0.3">Empty</small>';
            itemEl.style.cursor = 'default';
        }
        
        grid.appendChild(itemEl);
    });

    container.appendChild(grid);
}

// --- QUEST LOG ---

export function renderQuestLog() {
    const container = document.getElementById('quest-list');
    if (!container) return;
    container.innerHTML = '';
    
    if (gameState.quests.length === 0) {
        container.innerHTML = '<p style="color:#7f8c8d; font-style:italic;">No active quests.</p>';
        return;
    }

    gameState.quests.forEach(quest => {
        if (quest.status === 'completed') return;
        
        const questEl = document.createElement('div');
        questEl.className = 'quest-item';
        questEl.style.cssText = "background: rgba(0,0,0,0.2); padding: 10px; margin-bottom: 5px; border-radius: 4px; border-left: 3px solid #f1c40f;";
        
        let progressText = '';
        if (quest.status === 'readyToTurnIn') {
             questEl.style.borderLeftColor = '#2ecc71';
             progressText = '<span style="color:#2ecc71; font-weight:bold;">Ready to Turn In!</span>';
        } else if (quest.details.target) {
            progressText = `(${quest.progress} / ${quest.details.required} ${quest.details.target}s)`;
        } else if (quest.details.turnInItems) {
            const itemName = Object.keys(quest.details.turnInItems)[0];
            const requiredAmount = quest.details.turnInItems[itemName];
            const currentAmount = gameState.inventory.filter(i => i && i.name === itemName).reduce((total, item) => total + (item.quantity || 1), 0);
            progressText = `(${currentAmount} / ${requiredAmount} ${itemName})`;
        }

        questEl.innerHTML = `
            <strong>${quest.details.title}</strong>
            <div style="font-size:0.85em; margin-top:3px;">${progressText}</div>
        `;
        
        container.appendChild(questEl);
    });
}

// --- TITLES ---

export function renderTitleSelection() {
    const container = document.getElementById('title-selection-container');
    const section = document.getElementById('title-management-section');
    if (!gameState.characterName || !container || !section) return;
    
    section.style.display = 'block';
    container.innerHTML = '';
    
    gameState.unlockedTitles.forEach(title => {
        const btn = document.createElement('button');
        btn.className = `btn btn-sm ${title === gameState.title ? 'btn-success' : 'btn-primary'}`;
        btn.textContent = title;
        if (title === gameState.title) {
            btn.disabled = true;
        } else {
            btn.onclick = () => Network.emitUpdateCharacter({ title });
        }
        btn.style.marginRight = '5px';
        btn.style.marginBottom = '5px';
        container.appendChild(btn);
    });
}