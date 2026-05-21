'use strict';

// This file contains core, reusable UI utility functions.

let tooltipTimeout = null;

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
  if (modal) {
    modal.classList.add('hidden');
    const content = modal.querySelector('.modal-content');
    if (content) {
      content.classList.remove('modal-wide');
    }
  }
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

/**
 * NEW: A modal for decisions where both Yes and No have a consequence.
 * @param {string} message The text to display in the modal.
 * @param {function} onYesCallback The function to call when "Yes" is clicked.
 * @param {function} onNoCallback The function to call when "No" is clicked.
 */
export function showDecisionModal(message, onYesCallback, onNoCallback) {
  const fragment = document.createDocumentFragment();

  const messageEl = document.createElement('p');
  messageEl.textContent = message;
  fragment.appendChild(messageEl);

  const buttonContainer = document.createElement('div');
  buttonContainer.className = 'action-buttons';

  const yesButton = document.createElement('button');
  yesButton.className = 'btn btn-success';
  yesButton.textContent = 'Yes';
  yesButton.onclick = onYesCallback;

  const noButton = document.createElement('button');
  noButton.className = 'btn btn-danger';
  noButton.textContent = 'No';
  noButton.onclick = onNoCallback;

  buttonContainer.appendChild(yesButton);
  buttonContainer.appendChild(noButton);
  fragment.appendChild(buttonContainer);

  showModal(fragment);
}

export function showTooltip(content) {
  if (tooltipTimeout) {
    clearTimeout(tooltipTimeout);
    tooltipTimeout = null;
  }
  const tooltip = document.getElementById('tooltip');
  tooltip.innerHTML = content;
  tooltip.style.display = 'block';
  tooltip.style.pointerEvents = 'auto';
  setTimeout(() => (tooltip.style.opacity = '1'), 10);
}

export function hideTooltip() {
  tooltipTimeout = setTimeout(() => {
    const tooltip = document.getElementById('tooltip');
    tooltip.style.opacity = '0';
    tooltip.style.pointerEvents = 'none';
    setTimeout(() => {
      if (tooltip.style.opacity === '0') {
        tooltip.style.display = 'none';
      }
    }, 400);
  }, 300);
}

export function addToLog(message, type = 'info') {
  const log = document.getElementById('adventure-log');
  if (!log) return;
  const entry = document.createElement('div');
  entry.className = `log-entry ${type}`;
  entry.innerHTML = message;
  log.prepend(entry);
}

export function setTabsDisabled(isDisabled) {
  document.querySelectorAll('.tab').forEach((tab) => {
    tab.disabled = isDisabled;
  });
}

/**
 * Build a comprehensive tooltip for items with full stats display
 * @param {Object} item The item object
 * @param {Object} options Optional overrides { showPrice: true, action: 'Click to Buy', compareWith: equippedItem }
 * @returns {string} HTML tooltip content
 */
export function buildItemTooltip(item, options = {}) {
  if (!item) return '';

  // Tier badge with color
  const tierColors = { 1: '#aaa', 2: '#2ecc71', 3: '#3498db', 4: '#9b59b6', 5: '#f39c12' };
  const tierColor = tierColors[item.tier] || '#aaa';
  const tierBadge = item.tier ? `<span style="color:${tierColor};font-weight:bold;">T${item.tier}</span> ` : '';

  // Rarity color
  const rarityColors = {
    common: '#9e9e9e',
    uncommon: '#4caf50',
    rare: '#2196f3',
    epic: '#9c27b0',
    legendary: '#ff9800',
    quest: '#f1c40f',
  };
  const rarityColor = rarityColors[item.rarity] || '#9e9e9e';

  let tooltip = `<strong style="color:${rarityColor}">${tierBadge}${item.name}</strong>`;

  // Type line with more detail
  if (item.type && item.type !== 'material') {
    let typeLabel = item.weaponType || item.type.charAt(0).toUpperCase() + item.type.slice(1);
    if (item.hands === 2) typeLabel += ' (Two-Handed)';
    tooltip += `<br><em style="color:#888">${typeLabel}</em>`;
  }

  // === WEAPON STATS ===
  if (item.type === 'weapon' || item.type === 'shield') {
    const damageTypeColors = {
      Physical: '#ddd',
      Fire: '#e74c3c',
      Frost: '#3498db',
      Arcane: '#9b59b6',
      Holy: '#f1c40f',
      Nature: '#2ecc71',
      Shadow: '#8e44ad',
    };
    const dmgColor = damageTypeColors[item.damageType] || '#ddd';

    tooltip += `<br><span style="color:${dmgColor}">⚔️ ${item.weaponDamage} ${item.damageType} Damage</span>`;

    // Hit requirement and stat
    const statNames = { strength: 'Str', agility: 'Agi', wisdom: 'Wis', defense: 'Def' };
    const statName = statNames[item.stat] || item.stat;
    tooltip += `<br><span style="color:#888">D20+${statName} (${item.hit}+ to hit)</span>`;

    // Cost and cooldown
    tooltip += `<br><span style="color:#888">${item.cost} AP | ${item.cooldown} Turn CD</span>`;

    // Range
    if (item.range) {
      tooltip += `<br><span style="color:#888">${item.range.charAt(0).toUpperCase() + item.range.slice(1)} Range</span>`;
    }
  }

  // === SHIELD BLOCK ===
  if (item.reaction) {
    tooltip += `<br><span style="color:#3498db">🛡️ Block: Reduces ${item.reaction.value} damage (${item.reaction.hit}+ to block)</span>`;
  }

  // === ARMOR/CONSUMABLE STATS ===
  if (item.heal) {
    tooltip += `<br><span style="color:#2ecc71">❤️ Heals ${item.heal} HP</span>`;
  }

  // === STAT BONUSES ===
  if (item.bonus) {
    const bonusLines = [];
    const statLabels = {
      strength: '💪 Strength',
      agility: '🏃 Agility',
      wisdom: '🧠 Wisdom',
      defense: '🛡️ Defense',
      maxHealth: '❤️ Max Health',
      physicalResistance: '🔰 Physical Resistance',
      magicalResistance: '✨ Magical Resistance',
      firePower: '🔥 Fire Power',
      frostPower: '❄️ Frost Power',
      holyPower: '✨ Holy Power',
      shadowPower: '🌑 Shadow Power',
      rollBonus: '🎯 Attack Roll',
    };

    for (const [stat, value] of Object.entries(item.bonus)) {
      const label = statLabels[stat] || stat;
      const sign = value >= 0 ? '+' : '';
      const color = value >= 0 ? '#2ecc71' : '#e74c3c';
      bonusLines.push(`<span style="color:${color}">${sign}${value} ${label}</span>`);
    }

    if (bonusLines.length > 0) {
      tooltip += '<br>' + bonusLines.join('<br>');
    }
  }

  // === BUFFS FROM CONSUMABLES ===
  if (item.buff && item.type === 'consumable') {
    tooltip += `<br><span style="color:#9b59b6">✨ Grants ${item.buff.type} (${item.buff.duration} turns)</span>`;
  }

  // === ON-HIT EFFECTS ===
  if (item.onHit?.debuff) {
    tooltip += `<br><span style="color:#e67e22">💥 On Hit: Applies ${item.onHit.debuff.type}</span>`;
  }
  if (item.onCrit?.debuff) {
    tooltip += `<br><span style="color:#e67e22">⚡ On Crit: Applies ${item.onCrit.debuff.type}</span>`;
  }

  // === ACTIVATED ABILITY ===
  if (item.activatedAbility) {
    const ability = item.activatedAbility;
    tooltip += `<hr style="margin: 5px 0; border-color: #444;">`;
    tooltip += `<strong style="color:#f1c40f">⚡ ${ability.name}</strong>`;
    tooltip += `<br><span style="color:#888">${ability.cost} AP | ${ability.cooldown} Turn CD</span>`;
    tooltip += `<br><em>${ability.description}</em>`;
  }

  // === TRAITS ===
  if (item.traits && item.traits.length > 0) {
    tooltip += `<br><span style="color:#888; font-size: 0.9em">[${item.traits.join(', ')}]</span>`;
  }

  // === GEM SLOT ===
  if (item.gemSlot && !item.socketedGem) {
    tooltip += `<br><span style="color:#9b59b6">💎 Has empty gem slot</span>`;
  }

  // === SOCKETED GEM ===
  if (item.socketedGem) {
    tooltip += `<hr style="margin: 5px 0; border-color: #444;"><strong>Socketed:</strong><br>`;
    tooltip += `<span class="gem-icon">${item.socketedGem.icon}</span> <strong>${item.socketedGem.name}</strong><br>`;
    tooltip += `<small>${item.socketedGem.description}</small>`;
  }

  // === CHARGES ===
  if (item.charges) {
    tooltip += `<br><span style="color:#888">Charges: ${item.charges}</span>`;
  }

  // === DESCRIPTION (if not already shown in weapon stats) ===
  if (item.description && item.type !== 'weapon' && item.type !== 'shield') {
    tooltip += `<br><em style="color:#bbb; font-size: 0.9em">${item.description}</em>`;
  }

  // === COMPARISON (if provided) ===
  if (options.compareWith) {
    tooltip += buildComparisonSection(item, options.compareWith);
  }

  // === PRICE ===
  if (options.showPrice && item.price) {
    tooltip += `<br><span style="color:#f1c40f">💰 ${item.price}g</span>`;
  }

  // === ACTION HINT ===
  if (options.action) {
    tooltip += `<br><br><em style="color:#aaa">${options.action}</em>`;
  }

  return tooltip;
}

/**
 * Build comparison section showing stat differences
 */
function buildComparisonSection(newItem, equippedItem) {
  if (!equippedItem) return '';

  let comparison = `<hr style="margin: 5px 0; border-color: #555;"><strong style="color:#888">vs Equipped:</strong>`;

  // Compare weapon damage
  if (newItem.weaponDamage && equippedItem.weaponDamage) {
    const diff = newItem.weaponDamage - equippedItem.weaponDamage;
    if (diff !== 0) {
      const color = diff > 0 ? '#2ecc71' : '#e74c3c';
      const sign = diff > 0 ? '+' : '';
      comparison += `<br><span style="color:${color}">${sign}${diff} Damage</span>`;
    }
  } else if (newItem.weaponDamage && !equippedItem.weaponDamage) {
    comparison += `<br><span style="color:#2ecc71">+${newItem.weaponDamage} Damage</span>`;
  }

  // Compare bonuses
  const allStats = new Set([...Object.keys(newItem.bonus || {}), ...Object.keys(equippedItem.bonus || {})]);

  const statLabels = {
    strength: 'Str',
    agility: 'Agi',
    wisdom: 'Wis',
    defense: 'Def',
    maxHealth: 'Max HP',
    physicalResistance: 'Phys Res',
    magicalResistance: 'Magic Res',
    firePower: 'Fire',
    frostPower: 'Frost',
    holyPower: 'Holy',
    shadowPower: 'Shadow',
  };

  for (const stat of allStats) {
    const newVal = (newItem.bonus || {})[stat] || 0;
    const oldVal = (equippedItem.bonus || {})[stat] || 0;
    const diff = newVal - oldVal;

    if (diff !== 0) {
      const color = diff > 0 ? '#2ecc71' : '#e74c3c';
      const sign = diff > 0 ? '+' : '';
      const label = statLabels[stat] || stat;
      comparison += `<br><span style="color:${color}">${sign}${diff} ${label}</span>`;
    }
  }

  return comparison;
}

/**
 * Build a comprehensive tooltip for spells
 * @param {Object} spell The spell object
 * @param {number} cooldownRemaining Current cooldown turns remaining
 * @returns {string} HTML tooltip content
 */
export function buildSpellTooltip(spell, cooldownRemaining = 0) {
  if (!spell) return '';

  // School colors
  const schoolColors = {
    Fire: '#e74c3c',
    Frost: '#3498db',
    Holy: '#f1c40f',
    Shadow: '#8e44ad',
    Nature: '#2ecc71',
    Arcane: '#9b59b6',
    Physical: '#ddd',
    Combat: '#e67e22',
  };
  const schoolColor = schoolColors[spell.school] || '#888';

  // Type colors
  const typeColors = {
    attack: '#e74c3c',
    heal: '#2ecc71',
    buff: '#3498db',
    versatile: '#9b59b6',
    revive: '#f1c40f',
    utility: '#888',
  };
  const typeColor = typeColors[spell.type] || '#888';

  let tooltip = `<strong style="color:#fff">${spell.icon || '✨'} ${spell.name}</strong>`;
  tooltip += `<br><span style="color:${schoolColor}">${spell.school}</span>`;
  tooltip += ` <span style="color:${typeColor}">[${spell.type.charAt(0).toUpperCase() + spell.type.slice(1)}]</span>`;

  // Cost and Cooldown
  tooltip += `<br><span style="color:#888">${spell.cost || 0} AP | ${spell.cooldown} Turn CD</span>`;

  // Current cooldown status
  if (cooldownRemaining > 0) {
    tooltip += `<br><span style="color:#e74c3c">⏱️ On Cooldown: ${cooldownRemaining} turn${cooldownRemaining > 1 ? 's' : ''}</span>`;
  }

  // Hit requirement
  if (spell.hit) {
    const statNames = { strength: 'Str', agility: 'Agi', wisdom: 'Wis', defense: 'Def' };
    const statName = statNames[spell.stat] || spell.stat || 'Wis';
    tooltip += `<br><span style="color:#888">D20+${statName} (${spell.hit}+ to hit)</span>`;
  }

  // Range
  if (spell.range) {
    tooltip += `<br><span style="color:#888">${spell.range.charAt(0).toUpperCase() + spell.range.slice(1)} Range</span>`;
  }

  tooltip += `<hr style="margin: 5px 0; border-color: #444;">`;

  // === DAMAGE/HEAL INFO ===
  if (spell.damage) {
    const dmgColor = schoolColors[spell.damageType] || '#ddd';
    tooltip += `<span style="color:${dmgColor}">⚔️ Deals ${spell.damage} ${spell.damageType || spell.school} damage</span><br>`;
  }
  if (spell.heal) {
    tooltip += `<span style="color:#2ecc71">❤️ Heals ${spell.heal} HP</span><br>`;
  }
  if (spell.baseEffect) {
    tooltip += `<span style="color:#9b59b6">✨ Base Effect: ${spell.baseEffect}</span><br>`;
  }

  // === BUFF/DEBUFF INFO ===
  if (spell.buff) {
    tooltip += `<span style="color:#3498db">🛡️ Grants ${spell.buff.type} for ${spell.buff.duration} turn${spell.buff.duration > 1 ? 's' : ''}</span><br>`;
    if (spell.buff.value) {
      tooltip += `<span style="color:#888">&nbsp;&nbsp;Value: ${spell.buff.value}</span><br>`;
    }
  }
  if (spell.debuff) {
    tooltip += `<span style="color:#e67e22">💥 Applies ${spell.debuff.type} for ${spell.debuff.duration} turn${spell.debuff.duration > 1 ? 's' : ''}</span><br>`;
  }

  // === AOE INFO ===
  if (spell.aoeTargeting) {
    const aoeLabels = { all: 'Hits all enemies', adjacent: 'Hits target and adjacent enemies' };
    tooltip += `<span style="color:#f39c12">🌊 ${aoeLabels[spell.aoeTargeting] || spell.aoeTargeting}</span><br>`;
  }

  // === REQUIREMENTS ===
  if (spell.requires?.weaponType) {
    const weapons = Array.isArray(spell.requires.weaponType)
      ? spell.requires.weaponType.join(' or ')
      : spell.requires.weaponType;
    tooltip += `<span style="color:#888">⚠️ Requires: ${weapons}</span><br>`;
  }

  // === DESCRIPTION ===
  tooltip += `<em style="color:#bbb; font-size: 0.9em">${spell.description}</em>`;

  return tooltip;
}

/**
 * Display a full-screen transition overlay for Victory or Defeat.
 * @param {string} outcome 'win' or 'loss'
 * @param {string} message The message to display under the title
 * @param {function} onContinueCallback Function to run when Continue is clicked
 * @param {Array} logs Optional array of recent log entries to display
 */
export function showTransitionScreen(outcome, message, onContinueCallback, logs = []) {
  const screen = document.getElementById('transition-screen');
  const title = document.getElementById('transition-title');
  const msg = document.getElementById('transition-message');
  const logsContainer = document.getElementById('transition-logs');
  const btn = document.getElementById('transition-continue-btn');

  if (!screen || !title || !msg || !btn) return;

  // Remove old classes
  screen.classList.remove('victory', 'defeat', 'hidden');

  if (outcome === 'win') {
    screen.classList.add('victory');
    title.textContent = 'VICTORY';
  } else {
    screen.classList.add('defeat');
    title.textContent = 'DEFEAT';
  }

  msg.textContent = message;

  // Add logs
  if (logsContainer) {
    logsContainer.innerHTML = '';
    if (logs && logs.length > 0) {
      logsContainer.style.display = 'block';
      // Show the last 5 logs for context
      const recentLogs = logs.slice(-5);
      recentLogs.forEach((entry) => {
        const p = document.createElement('p');
        p.innerHTML = entry.message;
        p.className = `log-${entry.type || 'info'}`;
        logsContainer.appendChild(p);
      });
      // Scroll to bottom
      logsContainer.scrollTop = logsContainer.scrollHeight;
    } else {
      logsContainer.style.display = 'none';
    }
  }

  // Reset button listener to prevent duplicates
  const newBtn = btn.cloneNode(true);
  btn.parentNode.replaceChild(newBtn, btn);

  newBtn.addEventListener('click', () => {
    screen.classList.add('hidden');
    if (onContinueCallback) onContinueCallback();
  });
}
