// handlersTrade.js

import { players, trades, parties } from './serverState.js';

export const registerTradeHandlers = (io, socket) => {

    socket.on('trade:offer', (targetName) => {
        const senderName = socket.characterName;
        const sender = players[senderName];
        const target = players[targetName];

        if (!sender || !target || !target.id) {
            return socket.emit('trade:error', 'Player not found or offline.');
        }

        if (senderName === targetName) {
            return socket.emit('trade:error', 'You cannot trade with yourself.');
        }

        // Check if either is busy (in duel, party adventure, or existing trade)
        if (sender.character.duelId || target.character.duelId) {
            return socket.emit('trade:error', 'Cannot trade while in a duel.');
        }

        const senderParty = parties[sender.character.partyId];
        const targetParty = parties[target.character.partyId];

        if ((senderParty && senderParty.sharedState) || (targetParty && targetParty.sharedState)) {
            return socket.emit('trade:error', 'Cannot trade while in an adventure.');
        }

        // Check for existing active trades
        const existingTx = Object.values(trades).find(t =>
            (t.player1.name === senderName || t.player2.name === senderName) ||
            (t.player1.name === targetName || t.player2.name === targetName)
        );

        if (existingTx) {
            return socket.emit('trade:error', 'One of the players is already in a trade.');
        }

        // Create a temporary trade offer (not yet a full session)
        // For simplicity, we just send the offer immediately.
        io.to(target.id).emit('trade:receiveOffer', {
            offererName: senderName
        });

        socket.emit('trade:offerSent', { targetName });
    });

    socket.on('trade:accept', (offererName) => {
        const accepteeName = socket.characterName;
        const offerer = players[offererName];
        const acceptee = players[accepteeName];

        if (!offerer || !offerer.id || !acceptee) {
            return socket.emit('trade:error', 'Player no longer available.');
        }

        // Re-check availability
        if (offerer.character.duelId || acceptee.character.duelId) return;

        // Initialize Trade Session
        const tradeId = `TRADE-${Math.random().toString(36).substr(2, 9)}`;

        trades[tradeId] = {
            id: tradeId,
            player1: {
                name: offererName,
                socketId: offerer.id,
                offer: { gold: 0, items: [] },
                locked: false,
                confirmed: false
            },
            player2: {
                name: accepteeName,
                socketId: acceptee.id,
                offer: { gold: 0, items: [] },
                locked: false,
                confirmed: false
            }
        };

        // Notify both players to open trade window
        const tradeState = trades[tradeId];
        io.to(offerer.id).emit('trade:start', { tradeId, otherPlayer: accepteeName, isPlayer1: true });
        io.to(acceptee.id).emit('trade:start', { tradeId, otherPlayer: offererName, isPlayer1: false });
    });

    socket.on('trade:cancel', ({ tradeId }) => {
        const trade = trades[tradeId];
        if (trade) {
            io.to(trade.player1.socketId).emit('trade:ended', 'Trade cancelled.');
            io.to(trade.player2.socketId).emit('trade:ended', 'Trade cancelled.');
            delete trades[tradeId];
        }
    });

    socket.on('trade:updateOffer', ({ tradeId, offer }) => {
        const trade = trades[tradeId];
        if (!trade) return;

        const senderName = socket.characterName;
        const isPlayer1 = trade.player1.name === senderName;
        const senderState = isPlayer1 ? trade.player1 : trade.player2;

        if (senderState.locked) return; // Cannot update if locked

        // Validate Offer (Basic check: does player have items?)
        // In a real secure system, we'd validate every item index against server inventory.
        // Trusted client for now, but should be wary.

        senderState.offer = offer;

        // Reset confirm/lock status on change
        trade.player1.locked = false;
        trade.player1.confirmed = false;
        trade.player2.locked = false;
        trade.player2.confirmed = false;

        io.to(trade.player1.socketId).emit('trade:update', trade);
        io.to(trade.player2.socketId).emit('trade:update', trade);
    });

    socket.on('trade:lock', ({ tradeId, locked }) => {
        const trade = trades[tradeId];
        if (!trade) return;

        const senderName = socket.characterName;
        if (trade.player1.name === senderName) trade.player1.locked = locked;
        else if (trade.player2.name === senderName) trade.player2.locked = locked;

        // If unlocked, unconfirm
        if (!locked) {
            if (trade.player1.name === senderName) trade.player1.confirmed = false;
            else trade.player2.confirmed = false;
        }

        io.to(trade.player1.socketId).emit('trade:update', trade);
        io.to(trade.player2.socketId).emit('trade:update', trade);
    });

    socket.on('trade:confirm', ({ tradeId }) => {
        const trade = trades[tradeId];
        if (!trade) return;

        const senderName = socket.characterName;
        if (trade.player1.name === senderName && trade.player1.locked) trade.player1.confirmed = true;
        if (trade.player2.name === senderName && trade.player2.locked) trade.player2.confirmed = true;

        io.to(trade.player1.socketId).emit('trade:update', trade);
        io.to(trade.player2.socketId).emit('trade:update', trade);

        // Check if both confirmed
        if (trade.player1.confirmed && trade.player2.confirmed) {
            finalizeTrade(io, trade);
        }
    });

    socket.on('trade:chat', ({ tradeId, message }) => {
        const trade = trades[tradeId];
        if (!trade) return;

        const senderName = socket.characterName;
        // Verify sender is in trade
        if (trade.player1.name !== senderName && trade.player2.name !== senderName) return;

        // Send to both players
        io.to(trade.player1.socketId).emit('trade:chat', { senderName, message });
        io.to(trade.player2.socketId).emit('trade:chat', { senderName, message });
    });
};

function finalizeTrade(io, trade) {
    const p1 = players[trade.player1.name];
    const p2 = players[trade.player2.name];

    if (!p1 || !p2) {
        // Just cancel if someone DC'd
        delete trades[trade.id];
        return;
    }

    // Execute swap
    // 1. Remove items/gold from P1
    // 2. Remove items/gold from P2
    // 3. Add items/gold to P1 (from P2's offer)
    // 4. Add items/gold to P2 (from P1's offer)

    if (processTradeTransfer(p1, trade.player1.offer, p2, trade.player2.offer)) {
        io.to(p1.id).emit('characterUpdate', p1.character);
        io.to(p2.id).emit('characterUpdate', p2.character);

        io.to(p1.id).emit('trade:complete', 'Trade successful!');
        io.to(p2.id).emit('trade:complete', 'Trade successful!');
    } else {
        io.to(p1.id).emit('trade:error', 'Trade failed (inventory full?).');
        io.to(p2.id).emit('trade:error', 'Trade failed (inventory full?).');
    }

    delete trades[trade.id];
}

function processTradeTransfer(p1, offer1, p2, offer2) {
    const c1 = p1.character;
    const c2 = p2.character;

    // TODO: Strict validation ensuring they still have the items
    // Function: remove items from inventory/bank arrays by setting to null or splicing
    // Then add new items to first null slot.

    // Step 1: Remove Offer 1 from P1
    if (offer1.gold > 0) c1.gold -= offer1.gold;
    removeItems(c1, offer1.items);

    // Step 2: Remove Offer 2 from P2
    if (offer2.gold > 0) c2.gold -= offer2.gold;
    removeItems(c2, offer2.items);

    // Step 3: P1 receives Offer 2
    c1.gold += offer2.gold;
    if (!addItems(c1, offer2.items)) return false; // This might happen ifinv full, but we should've checked before.

    // Step 4: P2 receives Offer 1
    c2.gold += offer1.gold;
    if (!addItems(c2, offer1.items)) return false;

    return true;
}

function removeItems(character, items) {
    // items is array of { type: 'inventory'|'bank', index: number, item: url/obj }
    // Sort by index descending to avoid shift issues if we were splicing, but we are just nulling likely.

    items.forEach(req => {
        if (req.type === 'inventory') character.inventory[req.index] = null;
        else if (req.type === 'bank') character.bank[req.index] = null;
    });
}

function addItems(character, items) {
    // Items here contains copies of the actual item objects
    for (let req of items) {
        // Try inventory first
        let added = false;
        // Find empty inventory slot
        for (let i = 0; i < character.inventory.length; i++) {
            if (!character.inventory[i]) {
                character.inventory[i] = req.item; // The item object
                added = true;
                break;
            }
        }
        if (added) continue;

        // Try bank
        for (let i = 0; i < character.bank.length; i++) {
            if (!character.bank[i]) {
                character.bank[i] = req.item;
                added = true;
                break;
            }
        }

        if (!added) return false; // Inventory full
    }
    return true;
}
