'use strict';

import { gameState } from '../state.js';
import { socket } from '../network.js';
import { showModal, hideModal, showTooltip, hideTooltip } from './ui-main.js';
import { getBonusStats } from '../player.js';

// --- NEW: Centralized map for all status effect icons ---
const effectIcons = {
    'bleed': '🩸',
    'burn': '🔥',
    'stun': '💫',
    'daze': '😵',
    'poison': '☠️',
    'Stealth': '🤫',
    "Warrior's Might": '💪',
    'War Cry': '🗣️',
    'Thick Hide': '🛡️',
    'Well Fed (Str)': '🍖',
    'Well Fed (Agi)': '🐟',
    'Well Fed (Wis)': '🥣',
    'Light Source': '🔥',
    'Focus': '🧘',
    'Magic Barrier': '💠'
};

// --- HELPER FUNCTION FOR DETAILED TOOLTIPS ---
function addActionTooltipListener(element, itemOrSpell) {
    element.addEventListener('mousemove', (e) => {
        if (e.altKey) {
            let breakdown = `<strong>${itemOrSpell.name}</strong><br>${itemOrSpell.description}`;
            if (itemOrSpell.bonus) {
                breakdown += '<hr style="margin: 5px 0;"><strong>Bonuses:</strong><br>';
                for (const stat in itemOrSpell.bonus) {
                    breakdown += `${stat.charAt(0).toUpperCase() + stat.slice(1)}: +${itemOrSpell.bonus[stat]}<br>`;
                }
            }
            if (itemOrSpell.type === 'weapon') {
                breakdown += `<hr style="margin: 5px 0;"><strong>Ability:</strong><br>`;
                breakdown += `Cost: ${itemOrSpell.cost} AP | CD: ${itemOrSpell.cooldown}<br>`;
                const statName = (itemOrSpell.stat || 'strength').charAt(0).toUpperCase() + (itemOrSpell.stat || 'strength').slice(1);
                breakdown += `Roll: D20 + ${statName} (${itemOrSpell.hit}+)<br>`;
                breakdown += `Deals ${itemOrSpell.weaponDamage} ${itemOrSpell.damageType} Damage.`;
                if (itemOrSpell.onCrit && itemOrSpell.onCrit.debuff) {
                    breakdown += `<br>On Crit (20): Apply ${itemOrSpell.onCrit.debuff.type}.`;
                }
            }
            if (itemOrSpell.school) { // It's a spell
                 breakdown += `<hr style="margin: 5px 0;">`;
                 breakdown += `<strong>Type:</strong> ${itemOrSpell.type.charAt(0).toUpperCase() + itemOrSpell.type.slice(1)}<br>`;
                 breakdown += `<strong>School:</strong> ${itemOrSpell.school}<br>`;
                 if (itemOrSpell.cost) breakdown += `<strong>Cost:</strong> ${itemOrSpell.cost} AP<br>`;
                 breakdown += `<strong>Cooldown:</strong> ${itemOrSpell.cooldown}`;
            }
            if (itemOrSpell.traits) {
                breakdown += `<hr style="margin: 5px 0;"><strong>Traits:</strong> ${itemOrSpell.traits.join(', ')}`;
            }
            showTooltip(breakdown);
        } else {
             showTooltip(`<strong>${itemOrSpell.name}</strong><br>${itemOrSpell.description}<br><em style='color: #aaa; font-size: 0.9em;'>Hold [Alt] for details</em>`);
        }
    });
    element.addEventListener('mouseleave', hideTooltip);
}

// --- ADVENTURE SCREEN RENDERING ---

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
            
            // Pass the full playerState to getEffectsHtml
            let effectsHtml = getEffectsHtml(playerState);

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
        ${getEffectsHtml(localPlayer)}
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
            ${getEffectsHtml(opponent)}
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
        let effectsDisplay = ''; // For buffs/debuffs

        if (card.type === 'enemy') {
            healthDisplay = `<div>❤️ ${card.health}/${card.maxHealth}</div>`;
            // Use the same logic as players for debuffs
            if (card.debuffs && card.debuffs.length > 0) {
                effectsDisplay = '<div class="player-card-effects">';
                card.debuffs.forEach(debuff => {
                    const icon = effectIcons[debuff.type] || '❓';
                    effectsDisplay += `<span class="player-card-effect debuff" onmouseover="showTooltip('<strong>${debuff.type}</strong><br>Turns Remaining: ${debuff.duration}')" onmouseout="hideTooltip()">${icon} ${debuff.type}</span>`;
                });
                effectsDisplay += '</div>';
            }
        } else if (card.type === 'resource') {
            healthDisplay = `<div>Charges: ${card.charges}</div>`;
        }
        
        cardEl.innerHTML = `
            <div class="card-icon">${card.icon || '❓'}</div>
            <div class="card-title">${card.name}</div>
            ${healthDisplay}
            ${effectsDisplay}
        `;
        
        zoneContainer.appendChild(cardEl);
    });
}

function getEffectsHtml(playerState) {
    let effectsHtml = '<div class="player-card-effects">';
    if (playerState.buffs) {
        playerState.buffs.forEach(buff => {
            const icon = effectIcons[buff.type] || '✨';
            effectsHtml += `<span class="player-card-effect buff" onmouseover="showTooltip('<strong>${buff.type}</strong><br>Turns Remaining: ${buff.duration -1}')" onmouseout="hideTooltip()">${icon} ${buff.type}</span>`;
        });
    }
    const debuffs = playerState.playerDebuffs || playerState.debuffs || [];
    if (debuffs) {
        debuffs.forEach(debuff => {
            const icon = effectIcons[debuff.type] || '❓';
            effectsHtml += `<span class="player-card-effect debuff" onmouseover="showTooltip('<strong>${debuff.type}</strong><br>Turns Remaining: ${debuff.duration}')" onmouseout="hideTooltip()">${icon} ${debuff.type}</span>`;
        });
    }
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
            addActionTooltipListener(slotEl, item);
        }

        if (item && item.activatedAbility) {
            const cooldown = itemCooldowns[item.name] || 0;
            const canUse = localPlayerAP >= item.activatedAbility.cost && !localPlayerTurnEnded && cooldown <= 0;
            slotEl.className = 'action-slot active';
            slotEl.disabled = !canUse;
            slotEl.dataset.action = 'useAbility';
            slotEl.dataset.slot = slotInfo.key;
            slotEl.innerHTML = `
                <div class="item-name">${item.name}</div>
                <div class="item-details">
                    <span>⚡ ${item.activatedAbility.cost}</span>
                    <span>⏳ ${item.activatedAbility.cooldown}</span>
                </div>
                <div class="cooldown-overlay" style="height: ${cooldown > 0 ? '100' : '0'}%">${cooldown}</div>
            `;
        } else if (item && item.type === 'weapon') {
            if(item.hands === 2 && slotInfo.key === 'offHand') {
                 slotEl.className = 'action-slot';
                 slotEl.disabled = true;
                 slotEl.innerHTML = `<div class="slot-name">(2H Weapon)</div>`;
            } else {
                const cooldown = weaponCooldowns[item.name] || 0;
                const canAttack = localPlayerAP >= item.cost && !localPlayerTurnEnded && cooldown <= 0;
                slotEl.className = 'action-slot active';
                slotEl.disabled = !canAttack;
                slotEl.dataset.action = 'select';
                slotEl.dataset.actionData = JSON.stringify({ type: 'weapon', data: item, slot: slotInfo.key });
                slotEl.innerHTML = `
                    <div class="item-name">${item.name}</div>
                    <div class="item-details">
                        <span>⚡ ${item.cost}</span>
                        <span>⏳ ${item.cooldown}</span>
                    </div>
                    <div class="cooldown-overlay" style="height: ${cooldown > 0 ? '100' : '0'}%">${cooldown}</div>
                `;
            }
        } else if (item) {
             slotEl.className = 'action-slot';
             slotEl.disabled = true;
             let itemText = item.name;
             if (item.quantity > 1) {
                 itemText += ` <div class="item-quantity">${item.quantity}</div>`;
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
            const cooldown = spellCooldowns[spell.name] || 0;
            addActionTooltipListener(slotEl, spell);

            const canCast = cooldown <= 0 && localPlayerAP >= (spell.cost || 0) && !localPlayerTurnEnded;
            slotEl.className = 'action-slot active';
            slotEl.disabled = !canCast;
            
            slotEl.innerHTML = `
                <div class="item-name">${spell.name}</div>
                <div class="item-details">
                    <span>⚡ ${spell.cost || 0}</span>
                    <span>⏳ ${spell.cooldown}</span>
                </div>
                <div class="cooldown-overlay" style="height: ${cooldown > 0 ? '100' : '0'}%">${cooldown}</div>
            `;

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

            let itemText = `<div class="item-icon">${item.icon || '❓'}</div>`;
            if (item.quantity > 1) {
                itemText += ` <div class="item-quantity">${item.quantity}</div>`;
            }
            if (item.charges) {
                itemText += ` <div class="item-quantity">${item.charges}</div>`;
            }

            let actionButtonsHTML = '';
            if (item.type === 'consumable') {
                actionButtonsHTML += `<button class="btn btn-primary btn-sm" data-inventory-action="useConsumable" data-index="${i}">Use</button>`;
            }
            if (item.slot) {
                actionButtonsHTML += `<button class="btn btn-success btn-sm" data-inventory-action="equipItem" data-index="${i}">Equip (1 AP)</button>`;
            }
            actionButtonsHTML += `<button class="btn btn-danger btn-sm" data-inventory-action="dropItem" data-index="${i}">Drop</button>`;

            slot.innerHTML = `
                ${itemText}
                <div class="action-buttons" style="margin-top: 5px; flex-direction: column; gap: 5px;">
                    ${actionButtonsHTML}
                </div>
            `;
        } else {
            slot.classList.add('empty');
            slot.textContent = '';
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

function renderGroundLootButton() {
    const container = document.getElementById('ground-loot-container');
    if (!container) return;
    container.innerHTML = '';

    if (gameState.groundLoot && gameState.groundLoot.length > 0 && gameState.currentZone) {
        const button = document.createElement('button');
        button.id = 'ground-loot-btn';
        button.title = `View items on the ground (${gameState.groundLoot.length})`;
        button.innerHTML = `
            <div class="ground-loot-icon">💰</div>
            <div class="ground-loot-text">GROUND LOOT (${gameState.groundLoot.length})</div>
        `;
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

    for (let i = 0; i < 24; i++) {
        const item = gameState.inventory[i];
        const itemEl = document.createElement('div');
        itemEl.className = 'inventory-item';
        if (item) {
            let itemText = `<strong>${item.name}</strong>`;
            if (item.quantity > 1) itemText += ` (x${item.quantity})`;
            itemEl.innerHTML = `
                <div>${itemText}</div>
                <button class="btn btn-danger btn-sm" data-inventory-action="dropItem" data-index="${i}">Drop to Ground</button>
            `;
        } else {
            itemEl.innerHTML = 'Empty';
            itemEl.style.opacity = '0.5';
        }
        inventoryGrid.appendChild(itemEl);
    }
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