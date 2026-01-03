'use strict';

// This file contains core, reusable UI utility functions.

let tooltipTimeout = null;

// --- SECURITY HELPER ---
export function escapeHTML(str) {
    if (typeof str !== 'string') return str;
    return str
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

/**
 * Shows the main modal overlay.
 * @param {string|HTMLElement} content - The HTML string or Element to display.
 * @param {string} [className] - Optional CSS class to add to modal-content (e.g., 'modal-wide').
 */
export function showModal(content, className = '') {
    const modal = document.getElementById('modal');
    const modalContent = document.getElementById('modal-content');
    
    // Reset classes to base state then add optional class
    modalContent.className = 'modal-content';
    if (className) {
        modalContent.classList.add(className);
    }
    
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
            // Reset to default width when closing
            content.className = 'modal-content';
        }
    }
}

export function showInfoModal(message) {
    const safeMessage = escapeHTML(message);
    const modalContent = `<p>${safeMessage}</p><div class="action-buttons"><button class="btn btn-primary" id="info-ok-btn">OK</button></div>`;
    showModal(modalContent);
    
    // Defer binding to ensure element exists
    setTimeout(() => {
        const btn = document.getElementById('info-ok-btn');
        if(btn) btn.onclick = hideModal;
    }, 0);
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
    yesButton.onclick = () => {
        onConfirmCallback();
        hideModal();
    };

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
    yesButton.onclick = () => {
        onYesCallback();
        hideModal();
    };

    const noButton = document.createElement('button');
    noButton.className = 'btn btn-danger';
    noButton.textContent = 'No';
    noButton.onclick = () => {
        onNoCallback();
        hideModal();
    };

    buttonContainer.appendChild(yesButton);
    buttonContainer.appendChild(noButton);
    fragment.appendChild(buttonContainer);

    showModal(fragment);
}

export function showTooltip(content) {
    if (tooltipTimeout) { clearTimeout(tooltipTimeout); tooltipTimeout = null; }
    const tooltip = document.getElementById('tooltip');
    tooltip.innerHTML = content;
    tooltip.style.display = 'block';
    tooltip.style.pointerEvents = 'auto';
    setTimeout(() => tooltip.style.opacity = '1', 10);
}

export function hideTooltip() {
    tooltipTimeout = setTimeout(() => {
        const tooltip = document.getElementById('tooltip');
        tooltip.style.opacity = '0';
        tooltip.style.pointerEvents = 'none';
        setTimeout(() => { if (tooltip.style.opacity === '0') { tooltip.style.display = 'none'; } }, 400);
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
    document.querySelectorAll('.tab').forEach(tab => { tab.disabled = isDisabled; });
}