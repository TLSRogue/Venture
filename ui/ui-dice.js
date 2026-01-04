'use strict';

// Dice Roll Visualization Module
// Shows animated dice rolls when players or enemies make dice rolls

const D20_DISPLAY = '🎲';
const ROLL_ANIMATION_DURATION = 800; // How long to show rolling animation before auto-hiding if no result
const RESULT_DISPLAY_DURATION = 1200; // How long to show result

let currentRollTimeout = null;
let currentAnimationInterval = null;
let isCurrentlyRolling = false; // Tracks if we're in "rolling" state waiting for result

/**
 * Shows the dice rolling animation (anticipatory, before result is known)
 * @param {string} label - Who is rolling (e.g., "Player attacks")
 */
export function showRolling(label) {
    // Clear any existing animation
    cleanup();
    isCurrentlyRolling = true;

    const container = document.getElementById('dice-roll-container');
    const labelEl = document.getElementById('dice-roller-label');
    const diceEl = document.getElementById('dice-face');
    const resultEl = document.getElementById('dice-result');

    if (!container || !labelEl || !diceEl || !resultEl) return;

    // Reset state
    labelEl.textContent = label || 'Rolling...';
    diceEl.textContent = D20_DISPLAY;
    diceEl.classList.add('rolling');
    resultEl.textContent = '';
    resultEl.className = 'dice-result';

    // Show the container
    container.classList.remove('hidden');

    // Animate random numbers
    currentAnimationInterval = setInterval(() => {
        diceEl.textContent = Math.floor(Math.random() * 20) + 1;
    }, 80);

    // Auto-hide if no result arrives within timeout
    currentRollTimeout = setTimeout(() => {
        if (isCurrentlyRolling) {
            hideDice();
        }
    }, ROLL_ANIMATION_DURATION + 2000); // Give extra time for result to arrive
}

/**
 * Shows the dice roll result (after rolling animation)
 * @param {number} roll - The raw d20 roll value (1-20)
 * @param {number} modifier - The modifier being added
 * @param {number} total - The total result
 * @param {number} target - The target number to beat (optional)
 * @param {boolean} isSuccess - Whether the roll succeeded (optional)
 */
export function showResult(roll, modifier, total, target = null, isSuccess = null) {
    const container = document.getElementById('dice-roll-container');
    const diceEl = document.getElementById('dice-face');
    const resultEl = document.getElementById('dice-result');

    if (!container || !diceEl || !resultEl) return;

    // Stop rolling animation
    if (currentAnimationInterval) {
        clearInterval(currentAnimationInterval);
        currentAnimationInterval = null;
    }

    // Show final roll value
    diceEl.classList.remove('rolling');
    diceEl.textContent = roll;

    // Build result text
    let resultText = `${roll}`;
    if (modifier && modifier !== 0) {
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
    currentRollTimeout = setTimeout(() => {
        hideDice();
    }, RESULT_DISPLAY_DURATION);
}

/**
 * Combined function: shows rolling animation, then reveals result
 * @param {string} label - Who is rolling
 * @param {number} roll - The raw d20 roll value (1-20)
 * @param {number} modifier - The modifier being added  
 * @param {number} total - The total result
 * @param {number} target - The target number to beat (optional)
 * @param {boolean} isSuccess - Whether the roll succeeded (optional)
 */
export function showDiceRoll(label, roll, modifier, total, target = null, isSuccess = null) {
    showRolling(label);

    // After animation, show result
    currentRollTimeout = setTimeout(() => {
        showResult(roll, modifier, total, target, isSuccess);
    }, ROLL_ANIMATION_DURATION);
}

function hideDice() {
    const container = document.getElementById('dice-roll-container');
    if (container) {
        container.classList.add('hidden');
    }
    cleanup();
}

function cleanup() {
    isCurrentlyRolling = false;
    if (currentRollTimeout) {
        clearTimeout(currentRollTimeout);
        currentRollTimeout = null;
    }
    if (currentAnimationInterval) {
        clearInterval(currentAnimationInterval);
        currentAnimationInterval = null;
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
        // If we're already rolling (from dice:rolling event), just show the result
        if (isCurrentlyRolling) {
            showResult(
                rollData.roll,
                rollData.modifier,
                rollData.total,
                rollData.target,
                rollData.isSuccess
            );
        } else {
            // Otherwise, show the full animation
            showDiceRoll(
                rollData.label,
                rollData.roll,
                rollData.modifier,
                rollData.total,
                rollData.target,
                rollData.isSuccess
            );
        }
        return true;
    }

    return false;
}
