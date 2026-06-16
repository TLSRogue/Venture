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
    const existingTx = Object.values(trades).find(
      (t) =>
        t.player1.name === senderName ||
        t.player2.name === senderName ||
        t.player1.name === targetName ||
        t.player2.name === targetName
    );

    if (existingTx) {
      return socket.emit('trade:error', 'One of the players is already in a trade.');
    }

    // Create a temporary trade offer (not yet a full session)
    // For simplicity, we just send the offer immediately.
    io.to(target.id).emit('trade:receiveOffer', {
      offererName: senderName,
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
        confirmed: false,
      },
      player2: {
        name: accepteeName,
        socketId: acceptee.id,
        offer: { gold: 0, items: [] },
        locked: false,
        confirmed: false,
      },
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

  // --- VALIDATION: Ensure both players still own the offered items and gold ---
  if (!validateOffer(c1, offer1) || !validateOffer(c2, offer2)) {
    return false;
  }

  // Validate that both players have enough inventory space to receive the trade incoming items
  if (!hasSpaceForIncoming(c1, offer1.items, offer2.items) || !hasSpaceForIncoming(c2, offer2.items, offer1.items)) {
    return false;
  }

  // Step 1: Remove Offer 1 from P1
  if (offer1.gold > 0) c1.gold -= offer1.gold;
  removeItems(c1, offer1.items);

  // Step 2: Remove Offer 2 from P2
  if (offer2.gold > 0) c2.gold -= offer2.gold;
  removeItems(c2, offer2.items);

  // Step 3: P1 receives Offer 2
  c1.gold += offer2.gold;
  addItems(c1, offer2.items);

  // Step 4: P2 receives Offer 1
  c2.gold += offer1.gold;
  addItems(c2, offer1.items);

  return true;
}

/**
 * Simulates a trade to verify if a player has enough inventory/bank slots
 * to receive the incoming items after removing their offered items.
 */
function hasSpaceForIncoming(character, offeredItems, incomingItems) {
  const tempInventory = [...character.inventory];
  const tempBank = [...character.bank];

  // Simulate removal of offered items
  offeredItems.forEach((req) => {
    if (req.type === 'inventory') {
      tempInventory[req.index] = null;
    } else if (req.type === 'bank') {
      tempBank[req.index] = null;
    }
  });

  // Simulate adding incoming items
  for (const req of incomingItems) {
    let added = false;
    for (let i = 0; i < tempInventory.length; i++) {
      if (!tempInventory[i]) {
        tempInventory[i] = req.item;
        added = true;
        break;
      }
    }
    if (added) continue;

    for (let i = 0; i < tempBank.length; i++) {
      if (!tempBank[i]) {
        tempBank[i] = req.item;
        added = true;
        break;
      }
    }

    if (!added) return false; // Inventory and bank full
  }
  return true;
}

/**
 * Validates that a player's offer is legitimate before executing a trade.
 * Checks: gold sufficiency, item ownership at claimed indices, no duplicate indices.
 */
function validateOffer(character, offer) {
  // 1. Verify gold sufficiency
  if (offer.gold > 0 && character.gold < offer.gold) {
    console.log(`[Trade Validation] Player doesn't have enough gold. Has: ${character.gold}, Offered: ${offer.gold}`);
    return false;
  }

  // 2. Check for duplicate item indices (prevents trading same item slot twice)
  const seenIndices = new Set();
  for (const req of offer.items) {
    const key = `${req.type}:${req.index}`;
    if (seenIndices.has(key)) {
      console.log(`[Trade Validation] Duplicate item index detected: ${key}`);
      return false;
    }
    seenIndices.add(key);
  }

  // 3. Verify each item exists at the claimed index and matches the expected item
  for (const req of offer.items) {
    const source = req.type === 'inventory' ? character.inventory : character.bank;
    if (!source || req.index < 0 || req.index >= source.length) {
      console.log(`[Trade Validation] Invalid index ${req.index} for ${req.type}`);
      return false;
    }
    const actualItem = source[req.index];
    if (!actualItem) {
      console.log(`[Trade Validation] No item at ${req.type}[${req.index}]`);
      return false;
    }
    // Verify item identity matches what was shown in the trade window
    if (req.item && req.item.name && actualItem.name !== req.item.name) {
      console.log(
        `[Trade Validation] Item mismatch at ${req.type}[${req.index}]: expected ${req.item.name}, found ${actualItem.name}`
      );
      return false;
    }
  }

  return true;
}

function removeItems(character, items) {
  // items is array of { type: 'inventory'|'bank', index: number, item: url/obj }
  // Sort by index descending to avoid shift issues if we were splicing, but we are just nulling likely.

  items.forEach((req) => {
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
