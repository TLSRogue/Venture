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
    entry.textContent = message;
    log.prepend(entry);
}

export function setTabsDisabled(isDisabled) {
    document.querySelectorAll('.tab').forEach(tab => { tab.disabled = isDisabled; });
}