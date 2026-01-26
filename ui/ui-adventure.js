'use strict';

import { gameState } from '../state.js';
import { socket } from '../network.js';
import { showModal, hideModal, showTooltip, hideTooltip, buildItemTooltip } from './ui-main.js';
import { getBonusStats } from '../player.js';

let reactionTimerInterval = null;

const effectDefinitions = {
    // Debuffs (Damage over Time)
    'bleed': { icon: '🩸', description: 'Bleeding: Takes Physical damage at the end of each turn.' },
    'burn': { icon: '🔥', description: 'Burning: Takes Fire damage at the end of each turn.' },
    'poison': { icon: '☠️', description: 'Poisoned: Takes Nature damage at the end of each turn.' },
    'entangling roots': { icon: '🌿', description: 'Rooted: Cannot move and takes Nature damage each turn.' },

    // Debuffs (Control)
    'stun': { icon: '💫', description: 'Stunned: Cannot take any actions this turn.' },
    'daze': { icon: '😵', description: 'Dazed: All attack rolls suffer a -3 penalty.' },
    'trap': { icon: '🕸️', description: 'Trapped: Cannot flee or move to a new area.' },
    'silence': { icon: '🔇', description: 'Silenced: Cannot cast spells or use magic abilities.' },

    // Buffs (Stat Bonuses)
    'stealth': { icon: '🤫', description: 'Stealthed: Enemies have -5 to hit. Breaks on attack.' },
    'warrior\'s might': { icon: '💪', description: 'Warrior\'s Might: +2 Strength bonus to attacks.' },
    'war cry': { icon: '🗣️', description: 'War Cry: +1 to attack rolls and damage.' },
    'thick hide': { icon: '🛡️', description: 'Thick Hide: +1 Physical Resistance until next turn.' },
    'focus': { icon: '🧘', description: 'Focused: Your next ability deals bonus damage.' },
    'enraged': { icon: '😡', description: 'Enraged: +3 damage but -2 to defense rolls.' },
    'rallied': { icon: '📢', description: 'Rallied: +2 bonus damage on all attacks.' },

    // Buffs (Defensive)
    'magic barrier': { icon: '💠', description: 'Magic Barrier: Absorbs incoming damage.' },
    'flying': { icon: '🦇', description: 'Flying: Immune to melee attacks while airborne.' },
    'aerial strike': { icon: '🎯', description: 'Aerial Strike: Next attack has +5 to hit.' },

    // Buffs (Food)
    'well fed (str)': { icon: '🍖', description: 'Well Fed: +1 Strength from hearty food.' },
    'well fed (agi)': { icon: '🐟', description: 'Well Fed: +1 Agility from light food.' },
    'well fed (wis)': { icon: '🥣', description: 'Well Fed: +1 Wisdom from nourishing food.' },

    // Utility
    'light source': { icon: '🔥', description: 'Light Source: Illuminates dark areas, revealing hidden enemies.' },

    // Nature Spells
    'rejuvenate': { icon: '🌱', description: 'Rejuvenate: Heals at the end of each turn.' },
    'panther spirit': { icon: '🐆', description: 'Panther Spirit: Increased Agility.' },
    'bear spirit': { icon: '🐻', description: 'Bear Spirit: Increased Strength.' },
    'tree spirit': { icon: '🌳', description: 'Tree Spirit: Increased Defense.' }
};

/**
 * Creates health bar HTML for cards, with optional threat bar for players.
 * @param {number} health - Current health
 * @param {number} maxHealth - Maximum health
 * @param {number|null} threat - Threat value (only for players in PvE, null otherwise)
 * @param {number} shield - Shield/Barrier value (default 0)
 * @returns {string} HTML string for the bar
 */
function createHealthBarHTML(health, maxHealth, threat = null, shield = 0) {
    const healthPercent = Math.max(0, Math.min(100, (health / maxHealth) * 100));

    let shieldHTML = '';
    if (shield > 0) {
        const shieldPercent = Math.min(100, (shield / maxHealth) * 100);
        shieldHTML = `<div class="card-shield-bar" style="width: ${shieldPercent}%"></div>`;
    }

    let html = `
        <div class="card-bars-container">
            <div class="card-health-bar-container">
                <div class="card-health-bar" style="width: ${healthPercent}%">${health}/${maxHealth}${shield > 0 ? ` (+${shield})` : ''}</div>
                ${shieldHTML}
            </div>`;

    if (threat !== null) {
        // Threat bar for players - shows aggro level to enemies (max 10)
        const threatPercent = Math.min(100, (threat / 10) * 100);
        html += `
            <div class="card-threat-bar-container" title="Threat: ${threat}">
                <div class="card-threat-bar" style="width: ${threatPercent}%"></div>
            </div>`;
    }

    html += `</div>`;
    return html;
}

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

export function cacheCardPositions() {
    const positions = {};
    const overlay = document.getElementById('combat-effects-overlay');
    if (!overlay) return positions;
    const overlayRect = overlay.getBoundingClientRect();

    // Cache all cards by ID and by name
    const allCards = document.querySelectorAll('#adventure-board .card, #party-cards-container .card');
    allCards.forEach(card => {
        const rect = card.getBoundingClientRect();
        const posData = {
            left: rect.left - overlayRect.left + rect.width / 2,
            top: rect.top - overlayRect.top + rect.height / 2
        };

        // Cache by ID
        const id = card.dataset.id || card.dataset.playerId;
        if (id) {
            positions[`id:${id}`] = posData;
        }

        // Cache by name
        const titleEl = card.querySelector('.card-title');
        if (titleEl) {
            positions[`name:${titleEl.textContent.trim()}`] = posData;
        }
    });
    return positions;
}

export function playEffectQueue(effects, cachedPositions = {}) {
    effects.forEach((effect, index) => {
        setTimeout(() => {
            showCombatFeedback(effect, cachedPositions);
        }, index * 600);
    });
}

export function showCombatFeedback({ targetName, targetId, type, text }, cachedPositions = {}) {
    const overlay = document.getElementById('combat-effects-overlay');
    if (!overlay) return;

    let position = null;

    // First, try to find the live card
    let targetCard = null;
    if (targetId) {
        targetCard = document.querySelector(`.card[data-id='${targetId}'], .card[data-player-id='${targetId}']`);
    }
    if (!targetCard && targetName) {
        const allCards = document.querySelectorAll('#adventure-board .card, #party-cards-container .card');
        for (const card of allCards) {
            const titleEl = card.querySelector('.card-title');
            if (titleEl && titleEl.textContent.trim() === targetName) {
                targetCard = card;
                break;
            }
        }
    }

    // If card is found, calculate position from it
    if (targetCard) {
        const overlayRect = overlay.getBoundingClientRect();
        const cardRect = targetCard.getBoundingClientRect();
        position = {
            left: cardRect.left - overlayRect.left + cardRect.width / 2,
            top: cardRect.top - overlayRect.top + cardRect.height / 2
        };
    } else {
        // Fallback to cached position for dead enemies
        if (targetId && cachedPositions[`id:${targetId}`]) {
            position = cachedPositions[`id:${targetId}`];
        } else if (targetName && cachedPositions[`name:${targetName}`]) {
            position = cachedPositions[`name:${targetName}`];
        }
    }

    if (!position) {
        return;
    }

    const popup = document.createElement('div');
    popup.className = `combat-feedback-popup popup-${type}`;
    popup.textContent = text;
    popup.style.left = `${position.left}px`;
    popup.style.top = `${position.top}px`;
    popup.style.transform = 'translate(-50%, -50%)';

    overlay.appendChild(popup);

    setTimeout(() => {
        popup.remove();
    }, 2200);

    if (targetCard && (type === 'damage' || type === 'resource')) {
        targetCard.classList.add('shake-effect');
        setTimeout(() => {
            targetCard.classList.remove('shake-effect');
        }, 500);
    }
}


export function renderAdventureScreen() {
    const adventureTab = document.getElementById('adventure-tab');
    const ventureArrow = document.getElementById('venture-deeper-arrow');
    const homeArrow = document.getElementById('return-home-arrow');

    // --- APPLY ZONE BACKGROUND ---
    // Remove existing zone background classes
    adventureTab.classList.remove('zone-bg', 'zone-farmlands', 'zone-goblinCaves', 'zone-town', 'zone-sewers', 'zone-arena', 'zone-blighted_wastes', 'zone-darkForest', 'zone-mansion', 'zone-duel', 'zone-theDocks');

    // Determine current zone and apply appropriate background
    let currentZone = null;
    if (gameState.inDuel || (gameState.pvpEncounter && gameState.pvpEncounter.isDuel)) {
        currentZone = 'duel';
    } else if (gameState.currentZone) {
        currentZone = gameState.currentZone;
    }

    if (currentZone) {
        adventureTab.classList.add('zone-bg', `zone-${currentZone}`);
    }
    // --- END ZONE BACKGROUND ---

    // ** FIX: Use the new isLoadingNextArea flag for consistent behavior **
    // Also disable during enemy turn (isPlayerTurn === false) to prevent clicking during enemy phase
    const duringEnemyTurn = gameState.isPlayerTurn === false;
    const shouldDisableVenture = gameState.pvpEncounter || gameState.isLoadingNextArea || duringEnemyTurn;
    const shouldDisableHome = duringEnemyTurn;
    ventureArrow.disabled = shouldDisableVenture;
    homeArrow.disabled = shouldDisableHome;

    ventureArrow.style.display = 'flex';
    homeArrow.style.display = 'flex';

    // Prioritize pvpEncounter over inDuel since duels now use the PvP system
    if (gameState.pvpEncounter) {
        renderPvpScreen();
    } else if (gameState.inDuel) {
        renderDuelScreen();
    } else if (gameState.partyId && gameState.partyMemberStates) {
        renderPartyScreen();
    }
    renderGroundLootButton();
    renderPlayerActionBars();
    updateActionUI();
}

function buildPlayerInspectTooltip(playerData) {
    let tooltip = `<strong>${playerData.name}</strong>`;

    const source = playerData.equipment ? playerData : gameState;

    if (source.equipment) {
        tooltip += '<hr style="margin: 5px 0;"><strong>Equipment:</strong>';
        let hasEquipment = false;
        for (const slot in source.equipment) {
            const item = source.equipment[slot];
            if (item) {
                if (slot === 'offHand' && source.equipment.mainHand?.hands === 2) continue;
                hasEquipment = true;
                tooltip += `<br>${item.icon} ${item.name}`;
            }
        }
        if (!hasEquipment) tooltip += '<br>None';
    }

    if (source.equippedSpells) {
        tooltip += '<hr style="margin: 5px 0;"><strong>Spells:</strong>';
        if (source.equippedSpells.length > 0) {
            source.equippedSpells.forEach(spell => {
                if (spell) tooltip += `<br>${spell.icon} ${spell.name}`;
            });
        } else {
            tooltip += '<br>None';
        }
    }

    return tooltip;
}

function createEntityCard(state, options = {}) {
    const {
        isAlly = true,
        isLocalPlayer = false,
        isActiveTurn = false,
        isDuelOpponent = false,
        showLootButton = false
    } = options;

    const cardEl = document.createElement('div');
    // Base classes
    const classes = ['card', 'player'];
    if (!isAlly) classes.push('enemy');
    if (isLocalPlayer) classes.push('is-local-player');
    if (isActiveTurn) classes.push('active-turn');
    cardEl.className = classes.join(' ');

    // Dataset attributes
    if (state.playerId) cardEl.dataset.playerId = state.playerId;
    if (state.id) cardEl.dataset.id = state.id;
    if (options.dataset) {
        Object.entries(options.dataset).forEach(([key, value]) => {
            cardEl.dataset[key] = value;
        });
    }

    // Dead state
    if (state.isDead) {
        cardEl.classList.add('dead');
        let deadContent = `
            <div class="card-icon">💀</div>
            <div class="card-title">${state.name}</div>
            <div>DEFEATED</div>
        `;
        if (showLootButton && state.lootableInventory && state.lootableInventory.length > 0) {
            deadContent += `<button class="btn btn-sm" data-action="lootPlayer">Loot Bag (${state.lootableInventory.length})</button>`;
        }
        cardEl.innerHTML = deadContent;
        return cardEl;
    }

    // Tooltip listeners
    cardEl.addEventListener('mousemove', (e) => {
        if (e.altKey) showTooltip(buildPlayerInspectTooltip(state));
    });
    cardEl.addEventListener('mouseleave', hideTooltip);

    // Visual Icon/Image
    let visualHTML;
    if (state.icon && state.icon.includes('/')) {
        visualHTML = `<img src="${state.icon}" class="card-image" style="border-radius: 4px;">`;
    } else {
        visualHTML = `<div class="card-icon">${state.icon || '👤'}</div>`;
    }

    // Shield/Barrier calculation
    let shield = 0;
    if (state.buffs) {
        const b = state.buffs.find(bu => bu.type === 'Magic Barrier');
        if (b) shield = b.value || 0;
    } else if (state.shield) {
        shield = state.shield;
    }

    // Health Bar
    // Only show threat for players in non-PvP party screen, or if specifically requested. 
    // Existing logic only showed threat in renderPartyScreen.
    const showThreat = options.showThreat && state.threat !== undefined;

    // Focus Display (Monk)
    let focusHTML = '';
    if (state.focus && state.focus > 0) {
        const focusDots = '🔸'.repeat(state.focus);
        focusHTML = `<div class="card-focus-bar" style="color: #f1c40f; text-align: center; font-size: 14px; margin-top: -5px; margin-bottom: 2px; text-shadow: 0 0 2px black;">${focusDots}</div>`;
    }

    cardEl.innerHTML = `
        <div class="card-title">${state.name}</div>
        ${visualHTML}
        ${focusHTML}
        ${createHealthBarHTML(state.health, state.maxHealth, showThreat ? state.threat : null, shield)}
    `;

    // Append effects
    cardEl.appendChild(createEffectsContainer(state));

    // Turn ended opacity (mostly for party screen)
    if (state.turnEnded) {
        cardEl.style.opacity = '0.6';
    }

    return cardEl;
}

function renderPvpScreen() {
    const partyContainer = document.getElementById('party-cards-container');
    const zoneContainer = document.getElementById('zone-cards');
    const surrenderBtn = document.getElementById('surrender-btn');
    partyContainer.innerHTML = '';
    zoneContainer.innerHTML = '';

    // Show surrender button for duels (currentZone === 'duel')
    if (surrenderBtn) {
        surrenderBtn.style.display = gameState.currentZone === 'duel' ? 'block' : 'none';
    }

    const localPlayerState = gameState.pvpEncounter.playerStates.find(p => p.playerId === socket.id);
    if (!localPlayerState) return;
    const localPlayerTeam = localPlayerState.team;

    gameState.pvpEncounter.playerStates.forEach(playerState => {
        const isAlly = playerState.team === localPlayerTeam;
        const container = isAlly ? partyContainer : zoneContainer;
        const isLocal = playerState.playerId === socket.id;
        const isActive = gameState.pvpEncounter.activeTeam === playerState.team;

        const cardEl = createEntityCard(playerState, {
            isAlly,
            isLocalPlayer: isLocal,
            isActiveTurn: isActive
        });

        container.appendChild(cardEl);
    });
}

function renderPartyScreen() {
    const partyContainer = document.getElementById('party-cards-container');
    partyContainer.innerHTML = '';

    gameState.partyMemberStates.forEach((playerState, index) => {
        const isLocal = playerState.playerId === socket.id;

        // Update local gameState health if it's the local player
        if (isLocal) {
            gameState.health = playerState.health;
            gameState.maxHealth = playerState.maxHealth;
        }

        const cardEl = createEntityCard(playerState, {
            isAlly: true,
            isLocalPlayer: isLocal,
            showLootButton: true,
            showThreat: true,
            dataset: { index: `p${index}` } // Preserving data-index="p0" format
        });

        // Add index dataset separately if needed or ensure createEntityCard handles it via options if generic
        // The helper above handles options.dataset

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

    // Render Local Player
    const localIsActive = gameState.duelState.activePlayerId === localPlayer.id && !gameState.duelState.ended;
    const localCard = createEntityCard(localPlayer, {
        isAlly: true,
        isLocalPlayer: true,
        isActiveTurn: localIsActive,
        dataset: { target: 'player' }
    });
    partyContainer.appendChild(localCard);

    // Render Opponent
    const oppIsActive = gameState.duelState.activePlayerId === opponent.id && !gameState.duelState.ended;
    const oppCard = createEntityCard(opponent, {
        isAlly: false,
        isActiveTurn: oppIsActive,
        dataset: { index: 0 }
    });
    zoneContainer.appendChild(oppCard);
}

function renderZoneCards(cards) {
    const zoneContainer = document.getElementById('zone-cards');
    zoneContainer.innerHTML = '';
    if (!cards) return;
    cards.forEach((card, index) => {
        const cardEl = document.createElement('div');
        if (!card) {
            cardEl.className = 'card empty';
            zoneContainer.appendChild(cardEl);
            return;
        };

        cardEl.className = `card ${card.type}`;
        cardEl.dataset.index = index;
        if (card.id) cardEl.dataset.id = card.id;

        if (card.isDead) {
            cardEl.classList.add('dead');
            cardEl.innerHTML = `
                <div class="card-icon">💀</div>
                <div class="card-title">${card.name}</div>
                <div>DEFEATED</div>
            `;
            zoneContainer.appendChild(cardEl);
            return;
        }

        if (card.type === 'enemy' || card.type === 'treasure' || card.type === 'npc') {
            let tooltipContent = `<strong>${card.name}</strong><br>${card.description || ''}`;

            // Add Passives to Tooltip
            if (card.physicalResistance) {
                tooltipContent += `<br><span style="color: #aaa; font-size: 0.9em;">🛡️ Physical Resistance: ${card.physicalResistance}</span>`;
            }

            if (card.attackTable) {
                tooltipContent += `<hr style="margin: 5px 0;"><strong>Attacks:</strong>`;
                card.attackTable.forEach(attack => {
                    tooltipContent += `<br>${attack.range[0]}-${attack.range[1]}: ${attack.message || 'Miss!'}`;
                });
            } else if (card.attackDesc) {
                tooltipContent += `<hr style="margin: 5px 0;">${card.attackDesc}`;
            }
            cardEl.addEventListener('mouseover', (e) => {
                if (!e.altKey) showTooltip(tooltipContent);
            });
            cardEl.addEventListener('mouseout', () => hideTooltip());
        }

        let visualHTML;
        if (card.imageUrl) {
            visualHTML = `<img src="${card.imageUrl}" class="card-image" alt="${card.name}">`;
        } else {
            visualHTML = `<div class="card-icon">${card.icon || '❓'}</div>`;
        }

        cardEl.innerHTML = `
            <div class="card-title">${card.name}</div>
            ${visualHTML}
        `;

        // Display Physical Resistance on Card
        if (card.physicalResistance) {
            const resistanceBadge = document.createElement('div');
            resistanceBadge.className = 'card-resistance-badge';
            resistanceBadge.innerHTML = `🛡️ ${card.physicalResistance}`;
            resistanceBadge.addEventListener('mouseover', (e) => {
                e.stopPropagation();
                showTooltip(`🛡️ <strong>Physical Resistance: ${card.physicalResistance}</strong><br><br>Reduces all Physical damage taken by ${card.physicalResistance}.<br><em>Use magic or elemental attacks to bypass!</em>`);
            });
            resistanceBadge.addEventListener('mouseout', () => hideTooltip());
            cardEl.appendChild(resistanceBadge);
        }

        if (card.type === 'enemy') {
            // Add health bar for enemies
            const barsDiv = document.createElement('div');
            let shield = 0;
            if (card.buffs) {
                const b = card.buffs.find(bu => bu.type === 'Magic Barrier');
                if (b) shield = b.value || 0;
            }
            barsDiv.innerHTML = createHealthBarHTML(card.health, card.maxHealth, null, shield);
            cardEl.appendChild(barsDiv);
            cardEl.appendChild(createEffectsContainer(card));
        } else if (card.type === 'resource' && card.charges !== undefined) {
            // Add green charge bar for resources
            const maxCharges = card.maxCharges || 3;
            const chargePercent = Math.max(0, Math.min(100, (card.charges / maxCharges) * 100));
            const barsDiv = document.createElement('div');
            barsDiv.innerHTML = `
                <div class="card-bars-container">
                    <div class="card-charge-bar-container">
                        <div class="card-charge-bar" style="width: ${chargePercent}%">${card.charges}/${maxCharges}</div>
                    </div>
                </div>`;
            cardEl.appendChild(barsDiv);
        }

        zoneContainer.appendChild(cardEl);
    });

    // Add Deck Counter Display
    if (gameState.zoneDeck) {
        const deckCount = gameState.zoneDeck.length;
        const deckCounterEl = document.createElement('div');
        deckCounterEl.className = 'zone-deck-counter';
        deckCounterEl.innerHTML = `<div class="deck-count-number">${deckCount}</div>`;
        deckCounterEl.title = "Remaining cards in zone deck";
        zoneContainer.appendChild(deckCounterEl);
    }
}

function createEffectsContainer(stateObject) {
    const effectsContainer = document.createElement('div');
    effectsContainer.className = 'player-card-effects';

    // Display reactions (for enemies)
    if (stateObject.reactions) {
        stateObject.reactions.forEach(reaction => {
            const cooldown = stateObject.reactionCooldowns?.[reaction.name] || 0;
            const isReady = cooldown <= 0;

            const reactionSpan = document.createElement('span');
            reactionSpan.className = `player-card-effect ${isReady ? 'buff' : 'debuff'}`;
            reactionSpan.textContent = '⚔️';
            reactionSpan.style.cssText = isReady ? '' : 'opacity: 0.5;';

            // Build detailed tooltip based on reaction properties
            let effectDetails = '';
            if (reaction.blockAmount) {
                effectDetails = `Blocks up to ${reaction.blockAmount} damage`;
            } else if (reaction.damage) {
                effectDetails = `Counter-attacks for ${reaction.damage} ${reaction.damageType || 'Physical'} damage`;
            }

            const triggerText = Array.isArray(reaction.triggerOn)
                ? reaction.triggerOn.join(' or ')
                : reaction.triggerOn;

            const tooltipText = isReady
                ? `⚔️ <strong>${reaction.name}</strong><br><em>${reaction.message || 'Reaction ability'}</em><br><br>Triggers on: ${triggerText} attacks<br>Success: Roll ${reaction.roll}+ on d20<br>${effectDetails}<br><br><span style="color:#2ecc71">✓ Ready!</span>`
                : `⚔️ <strong>${reaction.name}</strong><br><em>${reaction.message || 'Reaction ability'}</em><br><br>Triggers on: ${triggerText} attacks<br>Success: Roll ${reaction.roll}+ on d20<br>${effectDetails}<br><br><span style="color:#e74c3c">⏳ Cooldown: ${cooldown} turns</span>`;

            reactionSpan.addEventListener('mouseover', (e) => {
                e.stopPropagation();
                showTooltip(tooltipText);
            });
            reactionSpan.addEventListener('mouseout', () => hideTooltip());
            effectsContainer.appendChild(reactionSpan);
        });
    }

    if (stateObject.buffs) {
        stateObject.buffs.forEach(buff => {
            const buffSpan = document.createElement('span');
            const lowerType = buff.type.toLowerCase();
            const def = effectDefinitions[lowerType] || { icon: '✨', description: 'Beneficial effect' };

            buffSpan.className = 'player-card-effect buff';
            buffSpan.textContent = def.icon;
            buffSpan.addEventListener('mouseover', (e) => {
                e.stopPropagation();
                showTooltip(`${def.icon} <strong>${buff.type}</strong><br>${def.description}<br>Turns Remaining: ${buff.duration}`);
            });
            buffSpan.addEventListener('mouseout', () => hideTooltip());
            effectsContainer.appendChild(buffSpan);
        });
    }

    if (stateObject.debuffs) {
        stateObject.debuffs.forEach(debuff => {
            const debuffSpan = document.createElement('span');
            const lowerType = debuff.type.toLowerCase();
            const def = effectDefinitions[lowerType] || { icon: '❓', description: 'Harmful effect' };

            debuffSpan.className = 'player-card-effect debuff';
            debuffSpan.textContent = def.icon;
            debuffSpan.addEventListener('mouseover', (e) => {
                e.stopPropagation();
                showTooltip(`${def.icon} <strong>${debuff.type}</strong><br>${def.description}<br>Turns Remaining: ${debuff.duration}`);
            });
            debuffSpan.addEventListener('mouseout', () => hideTooltip());
            effectsContainer.appendChild(debuffSpan);
        });
    }

    return effectsContainer;
}

export function renderPlayerActionBars() {
    const equipmentContainer = document.getElementById('equipment-bar');
    const spellContainer = document.getElementById('spell-bar');
    equipmentContainer.innerHTML = '';
    spellContainer.innerHTML = '';

    let localPlayerState;
    if (gameState.pvpEncounter) {
        localPlayerState = gameState.pvpEncounter.playerStates.find(p => p.playerId === socket.id);
    } else if (gameState.partyId && gameState.partyMemberStates) {
        localPlayerState = gameState.partyMemberStates.find(p => p.playerId === socket.id);
    } else if (gameState.inDuel && gameState.duelState) {
        localPlayerState = gameState.duelState.player1.id === socket.id ? gameState.duelState.player1 : gameState.duelState.player2;
    }

    if (!localPlayerState) {
        document.getElementById('end-turn-btn').disabled = true;
        return;
    }

    const localPlayerAP = localPlayerState.actionPoints;
    const localPlayerTurnEnded = gameState.pvpEncounter ? (gameState.pvpEncounter.activeTeam !== localPlayerState.team || localPlayerState.turnEnded) : localPlayerState.turnEnded;
    const { weaponCooldowns, spellCooldowns, itemCooldowns } = localPlayerState;

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
                <div class="item-icon">${item.icon || '❓'}</div>
                <div class="item-name">${item.name}</div>
                <div class="item-details">
                    <span>⚡ ${item.activatedAbility.cost}</span>
                    <span>⏳ ${item.activatedAbility.cooldown}</span>
                </div>
                <div class="cooldown-overlay" style="height: ${cooldown > 0 ? '100' : '0'}%">${cooldown}</div>
            `;
        } else if (item && (item.type === 'weapon' || item.type === 'shield')) {
            if (item.hands === 2 && slotInfo.key === 'offHand') {
                slotEl.className = 'action-slot';
                slotEl.disabled = true;
                slotEl.innerHTML = `<div class="slot-name">(2H Weapon)</div>`;
            } else {
                const cooldown = weaponCooldowns[slotInfo.key] || 0;
                const canAttack = localPlayerAP >= item.cost && !localPlayerTurnEnded && cooldown <= 0;
                slotEl.className = 'action-slot active';
                slotEl.disabled = !canAttack;
                slotEl.dataset.action = 'select';
                slotEl.dataset.slot = slotInfo.key;
                slotEl.dataset.actionData = JSON.stringify({ type: 'weapon', data: item, slot: slotInfo.key });
                slotEl.innerHTML = `
                    <div class="item-icon">${item.icon || '⚔️'}</div>
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
            slotEl.innerHTML = `<div class="item-icon">${item.icon || '❓'}</div><div class="item-name">${itemText}</div><div class="slot-name">${slotInfo.name}</div>`;
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
                <div class="item-icon">${spell.icon || '✨'}</div>
                <div class="item-name">${spell.name}</div>
                <div class="item-details">
                    <span>⚡ ${spell.cost || 0}</span>
                    <span>⏳ ${spell.cooldown}</span>
                </div>
                <div class="cooldown-overlay" style="height: ${cooldown > 0 ? '100' : '0'}%">${cooldown}</div>
            `;

            if (spell.type === 'attack' || spell.type === 'aoe' || spell.type === 'versatile' || spell.type === 'revive' || spell.type === 'debuff' || spell.type === 'cleanse') {
                slotEl.dataset.action = 'select';
                slotEl.dataset.actionData = JSON.stringify({ type: 'spell', data: spell, index: i });
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
        const selectedAction = gameState.turnState.selectedAction;
        // For weapons, match by slot (mainHand/offHand) to handle dual-wielding identical weapons
        // For spells, match by index
        let selectedBtn = null;
        if (selectedAction.type === 'weapon' && selectedAction.slot) {
            selectedBtn = document.querySelector(`.action-slot[data-slot="${selectedAction.slot}"]`);
        } else if (selectedAction.type === 'spell' && selectedAction.index !== undefined) {
            const spellSlots = document.querySelectorAll('#spell-bar .action-slot');
            selectedBtn = spellSlots[selectedAction.index];
        }
        if (selectedBtn) selectedBtn.classList.add('selected');
    }

    document.querySelectorAll('.card').forEach(card => card.classList.remove('targetable'));
    if (gameState.turnState.selectedAction) {
        const action = gameState.turnState.selectedAction.data;
        const actionType = gameState.turnState.selectedAction.type;

        // Weapons and attack spells target enemies
        if (action.type === 'attack' || action.type === 'aoe' || action.type === 'versatile' || action.type === 'debuff' || action.weaponDamage) {
            document.querySelectorAll('#zone-cards .card.enemy').forEach(enemyCard => {
                enemyCard.classList.add('targetable');
            });
        }
        // Heal/buff/versatile/cleanse spells target allies (versatile can do both!)
        if (action.type === 'heal' || action.type === 'buff' || action.type === 'versatile' || action.type === 'cleanse') {
            document.querySelectorAll('#party-cards-container .card.player:not(.dead), #zone-cards .card.player:not(.dead)').forEach(playerCard => {
                playerCard.classList.add('targetable');
            });
        }
        // Revive spells target dead allies
        if (action.type === 'revive') {
            document.querySelectorAll('#party-cards-container .card.player.dead').forEach(deadCard => {
                deadCard.classList.add('targetable');
            });
        }
        // Targeted consumables (like Rotten Egg) target enemies
        if (actionType === 'consumable' && action.targetEnemy) {
            document.querySelectorAll('#zone-cards .card.enemy').forEach(enemyCard => {
                enemyCard.classList.add('targetable');
            });
        }
    }
}

export function showReactionModal({ damage, attacker, attackMessage, availableReactions, timer }) {
    if (reactionTimerInterval) clearInterval(reactionTimerInterval);

    let buttons = '';
    availableReactions.forEach(reaction => {
        buttons += `<button class="btn btn-primary" data-reaction="${reaction.name}">Use ${reaction.name}</button>`;
    });

    let timerHtml = '';
    if (timer) {
        timerHtml = `<div class="reaction-timer"><span id="reaction-timer-countdown">${timer / 1000}</span>s</div>`;
    }

    // Show attack message if available, otherwise just show damage
    const attackDescription = attackMessage
        ? `<p><strong>${attacker}</strong> ${attackMessage}</p><p>Incoming damage: <strong>${damage}</strong></p>`
        : `<p>${attacker} is about to deal ${damage} damage to you!</p>`;

    const modalContent = `
        <h2>Reaction!</h2>
        ${timerHtml}
        ${attackDescription}
        <div class="action-buttons" id="reaction-buttons">
            ${buttons}
            <button class="btn btn-danger" data-reaction="take_damage">Take Damage</button>
        </div>
    `;
    showModal(modalContent);

    if (timer) {
        const countdownEl = document.getElementById('reaction-timer-countdown');
        let secondsLeft = timer / 1000;
        reactionTimerInterval = setInterval(() => {
            secondsLeft--;
            if (countdownEl) {
                countdownEl.textContent = Math.max(0, secondsLeft);
            }
            if (secondsLeft <= 0) {
                clearInterval(reactionTimerInterval);
            }
        }, 1000);
    }
}

export function showInterveneModal({ attacker, target, damage, attackMessage, timer }) {
    import('../network.js').then(Network => {
        if (reactionTimerInterval) clearInterval(reactionTimerInterval);

        let timerHtml = '';
        if (timer) {
            timerHtml = `<div class="reaction-timer"><span id="intervene-timer-countdown">${timer / 1000}</span>s</div>`;
        }

        const attackDescription = attackMessage
            ? `<p><strong>${attacker}</strong> ${attackMessage}</p><p>Incoming damage: <strong>${damage}</strong></p>`
            : `<p>${attacker} is about to deal ${damage} damage to ${target}!</p>`;

        const modalContent = `
            <h2>🛡️ Intervene?</h2>
            ${timerHtml}
            <p><strong>${attacker}</strong> is attacking <strong>${target}</strong>!</p>
            ${attackDescription}
            <p>Do you want to intercept this attack?</p>
            <div class="action-buttons" id="intervene-buttons">
                <button class="btn btn-success" id="intervene-accept-btn">Intervene!</button>
                <button class="btn btn-danger" id="intervene-decline-btn">Decline</button>
            </div>
        `;
        showModal(modalContent);

        // Handle button clicks
        document.getElementById('intervene-accept-btn').addEventListener('click', () => {
            Network.emitPartyAction({ type: 'resolveIntervene', payload: { accept: true } });
            hideModal();
            if (reactionTimerInterval) clearInterval(reactionTimerInterval);
        });

        document.getElementById('intervene-decline-btn').addEventListener('click', () => {
            Network.emitPartyAction({ type: 'resolveIntervene', payload: { accept: false } });
            hideModal();
            if (reactionTimerInterval) clearInterval(reactionTimerInterval);
        });

        if (timer) {
            const countdownEl = document.getElementById('intervene-timer-countdown');
            let secondsLeft = timer / 1000;
            reactionTimerInterval = setInterval(() => {
                secondsLeft--;
                if (countdownEl) {
                    countdownEl.textContent = Math.max(0, secondsLeft);
                }
                if (secondsLeft <= 0) {
                    clearInterval(reactionTimerInterval);
                    // Auto-decline on timeout
                    Network.emitPartyAction({ type: 'resolveIntervene', payload: { accept: false } });
                    hideModal();
                }
            }, 1000);
        }
    });
}

export function showDebuffSelectionModal({ targetName, debuffs, maxSelectable, casterName }) {
    import('../network.js').then(Network => {
        const debuffCheckboxes = debuffs.map((debuff, i) => {
            const def = effectDefinitions[debuff.type.toLowerCase()] || { icon: '❓', description: 'Debuff' };
            return `
                <label class="debuff-option" style="display: flex; align-items: center; gap: 8px; padding: 8px; background: rgba(0,0,0,0.3); border-radius: 4px; margin-bottom: 5px; cursor: pointer;">
                    <input type="checkbox" value="${debuff.index}" class="debuff-checkbox" style="width: 18px; height: 18px;">
                    <span style="font-size: 1.5em;">${def.icon}</span>
                    <span><strong>${debuff.type}</strong> (${debuff.duration} turns)</span>
                </label>
            `;
        }).join('');

        const modalContent = `
            <h2>🌟 Cleanse - Select Debuffs</h2>
            <p>Choose up to <strong>${maxSelectable}</strong> debuff(s) to remove from <strong>${targetName}</strong>:</p>
            <div id="debuff-selection-list" style="max-height: 250px; overflow-y: auto; margin: 15px 0;">
                ${debuffCheckboxes}
            </div>
            <div class="action-buttons" id="debuff-selection-buttons">
                <button class="btn btn-primary" id="confirm-cleanse-btn">Cleanse Selected</button>
                <button class="btn btn-danger" id="cancel-cleanse-btn">Cancel</button>
            </div>
        `;
        showModal(modalContent);

        // Limit selections to maxSelectable
        const checkboxes = document.querySelectorAll('.debuff-checkbox');
        checkboxes.forEach(cb => {
            cb.addEventListener('change', () => {
                const checked = document.querySelectorAll('.debuff-checkbox:checked');
                if (checked.length >= maxSelectable) {
                    checkboxes.forEach(other => {
                        if (!other.checked) other.disabled = true;
                    });
                } else {
                    checkboxes.forEach(other => other.disabled = false);
                }
            });
        });

        // Confirm button
        document.getElementById('confirm-cleanse-btn').addEventListener('click', () => {
            const selected = Array.from(document.querySelectorAll('.debuff-checkbox:checked')).map(cb => parseInt(cb.value, 10));
            Network.emitPartyAction({ type: 'submitDebuffSelection', payload: { selectedIndices: selected } });
            hideModal();
        });

        // Cancel button
        document.getElementById('cancel-cleanse-btn').addEventListener('click', () => {
            Network.emitPartyAction({ type: 'submitDebuffSelection', payload: { selectedIndices: [] } });
            hideModal();
        });
    });
}

export function showBackpack() {
    const modalContentEl = document.createElement('div');
    modalContentEl.id = 'backpack-modal';
    modalContentEl.innerHTML = '<h2>Backpack</h2>';

    const itemsGrid = document.createElement('div');
    itemsGrid.className = 'inventory-grid';
    itemsGrid.style.maxWidth = '650px';
    itemsGrid.style.margin = '20px auto 0 auto';

    for (let i = 0; i < 28; i++) {
        const item = gameState.inventory[i];
        const slot = document.createElement('div');
        slot.className = 'inventory-item';

        if (item) {
            let tooltipContent = `<strong>${item.name}</strong><br>${item.description}`;
            if (item.socketedGem) {
                tooltipContent += `<hr style="margin: 5px 0;"><strong>Socketed:</strong><br>`;
                tooltipContent += `<span class="gem-icon">${item.socketedGem.icon}</span> <strong>${item.socketedGem.name}</strong><br>`;
                tooltipContent += `<small>${item.socketedGem.description}</small>`;
            }
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

    const slotNames = { mainHand: 'Main Hand', offHand: 'Off Hand', helmet: 'Helmet', armor: 'Armor', boots: 'Boots', accessory: 'Accessory', ammo: 'Ammo' };
    let equipmentHTML = '<h3>Equipment</h3><div class="char-sheet-equipment">';

    for (const slotKey in slotNames) {
        const item = gameState.equipment[slotKey];
        if (item) {
            if (slotKey === 'offHand' && gameState.equipment.mainHand?.hands === 2) continue;
            equipmentHTML += `
                <div class="equipped-item-row">
                    <span>${item.icon || '❓'} <strong>${slotNames[slotKey]}:</strong> ${item.name}</span>
                    <button class="btn btn-danger btn-sm" data-equipment-action="unequip" data-slot="${slotKey}">Unequip</button>
                </div>
            `;
        }
    }
    equipmentHTML += '</div>';

    const modalContent = `
        <h2>Character Sheet</h2>
        <style>
            .char-sheet-grid { display: flex; gap: 30px; text-align: left; }
            .char-sheet-grid > div { flex: 1; }
            .char-sheet-equipment { display: flex; flex-direction: column; gap: 8px; }
            .equipped-item-row { display: flex; justify-content: space-between; align-items: center; background: rgba(0,0,0,0.2); padding: 5px 8px; border-radius: 4px;}
            .equipped-item-row span { display: flex; align-items: center; gap: 8px; }
        </style>
        <div class="char-sheet-grid">
            <div>
                <h3>Attributes</h3>
                <p>💪 Strength: ${calculatedStats.strength}</p>
                <p>🏃 Agility: ${calculatedStats.agility}</p>
                <p>🧠 Wisdom: ${calculatedStats.wisdom}</p>
                <p>🛡️ Defense: ${calculatedStats.defense}</p>
                <p>🍀 Luck: ${calculatedStats.luck}</p>
                <hr>
                <h3>Resistances</h3>
                <p>💎 Physical Resistance: ${calculatedStats.physicalResistance}</p>
            </div>
            <div>
                ${equipmentHTML}
                <hr>
                <h3>Professions</h3>
                <p>⛏️ Mining: ${calculatedStats.mining}</p>
                <p>🌲 Woodcutting: ${calculatedStats.woodcutting}</p>
                <p>🎣 Fishing: ${calculatedStats.fishing}</p>
            </div>
        </div>
        <button class="btn btn-primary" style="margin-top: 20px;" onclick="this.closest('.modal-overlay').classList.add('hidden')">Close</button>
    `;
    showModal(modalContent);
}

function renderGroundLootButton() {
    const container = document.getElementById('ground-loot-container');
    if (!container) return;
    container.innerHTML = '';

    const groundLoot = gameState.pvpEncounter ? gameState.pvpEncounter.groundLoot : gameState.groundLoot;

    if (groundLoot && groundLoot.length > 0 && (gameState.currentZone || gameState.pvpEncounter)) {
        const button = document.createElement('button');
        button.id = 'ground-loot-btn';
        button.title = `View items on the ground (${groundLoot.length})`;
        button.innerHTML = `
            <div class="ground-loot-icon">💰</div>
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

    const groundLootSide = document.createElement('div');
    groundLootSide.innerHTML = '<h3>On The Ground</h3>';
    const groundGrid = document.createElement('div');
    groundGrid.className = 'inventory-grid';

    const groundLoot = gameState.pvpEncounter ? gameState.pvpEncounter.groundLoot : gameState.groundLoot;

    if (groundLoot && groundLoot.length > 0) {
        groundLoot.forEach((item, index) => {
            const itemEl = document.createElement('div');
            itemEl.className = 'inventory-item ground-loot-item';

            // Build tooltip using helper
            const tooltipContent = buildItemTooltip(item, { action: 'Click Take to pick up' });
            itemEl.onmouseover = () => showTooltip(tooltipContent);
            itemEl.onmouseout = () => hideTooltip();

            let itemHtml = `<div class="item-icon">${item.icon || '❓'}</div>`;
            if (item.quantity > 1) {
                itemHtml += `<div class="item-quantity">${item.quantity}</div>`;
            }
            itemHtml += `<button class="btn btn-success btn-sm ground-loot-take-btn" data-action="takeGroundLoot" data-index="${index}">Take</button>`;

            itemEl.innerHTML = itemHtml;
            groundGrid.appendChild(itemEl);
        });
    } else {
        groundGrid.innerHTML = '<p>Nothing on the ground.</p>';
    }
    groundLootSide.appendChild(groundGrid);

    const inventorySide = document.createElement('div');
    inventorySide.innerHTML = '<h3>Your Inventory</h3>';
    const inventoryGrid = document.createElement('div');
    inventoryGrid.className = 'inventory-grid';

    for (let i = 0; i < 28; i++) {
        const item = gameState.inventory[i];
        const itemEl = document.createElement('div');
        itemEl.className = 'inventory-item';
        if (item) {
            // Build tooltip using helper
            const tooltipContent = buildItemTooltip(item, { action: 'Click Drop to put on ground' });
            itemEl.onmouseover = () => showTooltip(tooltipContent);
            itemEl.onmouseout = () => hideTooltip();

            let itemHtml = `<div class="item-icon">${item.icon || '❓'}</div>`;
            if (item.quantity > 1) {
                itemHtml += `<div class="item-quantity">${item.quantity}</div>`;
            }
            itemHtml += `<button class="btn btn-danger btn-sm ground-loot-take-btn" data-inventory-action="dropItem" data-index="${i}">Drop</button>`;
            itemEl.innerHTML = itemHtml;
        } else {
            itemEl.classList.add('empty');
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