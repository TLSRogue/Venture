'use strict';

// Dice Roll Visualization Module
// Shows animated dice rolls when players or enemies make dice rolls

const DICE_FACES = ['⚀', '⚁', '⚂', '⚃', '⚄', '⚅'];
const D20_DISPLAY = '🎲';

let isRolling = false;
let rollQueue = [];

/**
 * Shows a dice roll animation
 * @param {string} label - Who is rolling (e.g., "Player attacks")
 * @param {number} roll - The raw d20 roll value (1-20)
 * @param {number} modifier - The modifier being added
 * @param {number} total - The total result
 * @param {number} target - The target number to beat (optional)
 * @param {boolean} isSuccess - Whether the roll succeeded (optional)
 */
export function showDiceRoll(label, roll, modifier, total, target = null, isSuccess = null) {
    const rollData = { label, roll, modifier, total, target, isSuccess };

    if (isRolling) {
        rollQueue.push(rollData);
        return;
    }

    executeRoll(rollData);
}

function executeRoll(rollData) {
    const { label, roll, modifier, total, target, isSuccess } = rollData;

    isRolling = true;

    const container = document.getElementById('dice-roll-container');
    const labelEl = document.getElementById('dice-roller-label');
    const diceEl = document.getElementById('dice-face');
    const resultEl = document.getElementById('dice-result');

    if (!container || !labelEl || !diceEl || !resultEl) {
        isRolling = false;
        processNextRoll();
        return;
    }

    // Reset state
    labelEl.textContent = label || 'Rolling...';
    diceEl.textContent = D20_DISPLAY;
    diceEl.classList.add('rolling');
    resultEl.textContent = '';
    resultEl.className = 'dice-result';

    // Show the container
    container.classList.remove('hidden');

    // Simulate rolling animation with random numbers
    let rollCount = 0;
    const rollInterval = setInterval(() => {
        diceEl.textContent = Math.floor(Math.random() * 20) + 1;
        rollCount++;
        if (rollCount >= 10) {
            clearInterval(rollInterval);
            finishRoll(roll, modifier, total, target, isSuccess, diceEl, resultEl, container);
        }
    }, 80);
}

function finishRoll(roll, modifier, total, target, isSuccess, diceEl, resultEl, container) {
    // Show final roll value
    diceEl.classList.remove('rolling');
    diceEl.textContent = roll;

    // Build result text
    let resultText = `${roll}`;
    if (modifier !== 0) {
        resultText += modifier > 0 ? ` + ${modifier}` : ` - ${Math.abs(modifier)}`;
    }
    resultText += ` = ${total}`;

    if (target !== null) {
        resultText += ` (vs ${target}+)`;
    }

    resultEl.textContent = resultText;

    // Apply result styling
    if (roll === 20) {
        resultEl.classList.add('crit');
    } else if (roll === 1) {
        resultEl.classList.add('fail');
    } else if (isSuccess !== null) {
        resultEl.classList.add(isSuccess ? 'success' : 'fail');
    }

    // Hide after delay
    setTimeout(() => {
        container.classList.add('hidden');
        isRolling = false;
        processNextRoll();
    }, 1200);
}

function processNextRoll() {
    if (rollQueue.length > 0) {
        const nextRoll = rollQueue.shift();
        setTimeout(() => executeRoll(nextRoll), 200);
    }
}

/**
 * Parses a log message to extract dice roll data
 * Matches patterns like: "15(d20) + 3 = 18"
 * @param {string} message - The log message
 * @returns {object|null} - Roll data or null if no roll found
 */
export function parseRollFromMessage(message) {
    // Pattern: matches "X(d20) + Y = Z" or "X(d20) - Y = Z" or "X(d20) = Z"
    const rollPattern = /(\d+)\(d20\)\s*([+-]\s*\d+)?(?:\s*[+-]\s*\d+)*\s*=\s*(\d+)/i;
    const match = message.match(rollPattern);

    if (match) {
        const roll = parseInt(match[1]);
        let modifier = 0;

        // Extract the first modifier if present
        if (match[2]) {
            modifier = parseInt(match[2].replace(/\s/g, ''));
        }

        const total = parseInt(match[3]);

        // Try to extract target from message "(Target: X+)" pattern
        const targetMatch = message.match(/\(Target:\s*(\d+)\+?\)/i);
        const target = targetMatch ? parseInt(targetMatch[1]) : null;

        // Determine success based on result and target, or message content
        let isSuccess = null;
        if (target !== null) {
            isSuccess = total >= target;
        } else if (message.toLowerCase().includes('success')) {
            isSuccess = true;
        } else if (message.toLowerCase().includes('miss') || message.toLowerCase().includes('failure')) {
            isSuccess = false;
        }

        // Extract the action label (who/what is rolling)
        const labelMatch = message.match(/^([^:]+?)(?:'s\s+\w+:|attacks|casts|gathering)/i);
        const label = labelMatch ? labelMatch[1].trim() : 'Roll';

        return {
            roll,
            modifier,
            total,
            target,
            isSuccess,
            label
        };
    }

    return null;
}

/**
 * Attempts to show a dice roll animation for a log message if it contains dice roll data
 * @param {string} message - The log message
 * @returns {boolean} - Whether a dice roll was shown
 */
export function tryShowDiceRollFromMessage(message) {
    const rollData = parseRollFromMessage(message);

    if (rollData) {
        showDiceRoll(
            rollData.label,
            rollData.roll,
            rollData.modifier,
            rollData.total,
            rollData.target,
            rollData.isSuccess
        );
        return true;
    }

    return false;
}
