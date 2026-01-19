
import { players, parties } from '../serverState.js';
import { addItemToInventoryServer } from '../utilsHelpers.js';
import { broadcastAdventureUpdate } from '../utilsBroadcast.js';
import { LOOT_ROLL_DURATION_MS } from '../constants.js';

export function determineLootWinnerAndDistribute(io, partyId) {
    const party = parties[partyId];
    if (!party || !party.sharedState || !party.sharedState.pendingLootRoll) {
        return;
    }
    const rollData = party.sharedState.pendingLootRoll;
    let winner = null;
    const needRolls = rollData.rolls.filter(r => r.choice === 'need');
    const greedRolls = rollData.rolls.filter(r => r.choice === 'greed');

    // Build consolidated roll summary
    const rollSummary = rollData.rolls
        .filter(r => r.choice !== 'pass')
        .map(r => `${r.playerName}: ${r.roll} (${r.choice})`)
        .join(', ');

    if (rollSummary) {
        party.sharedState.log.push({ message: `Loot Rolls for [${rollData.item.name}] — ${rollSummary}`, type: 'info' });
    }

    if (needRolls.length > 0) {
        winner = needRolls.reduce((highest, current) => (current.roll > highest.roll ? current : highest), needRolls[0]);
    } else if (greedRolls.length > 0) {
        winner = greedRolls.reduce((highest, current) => (current.roll > highest.roll ? current : highest), greedRolls[0]);
    }
    if (winner) {
        const winnerPlayer = players[winner.playerName];
        if (winnerPlayer && addItemToInventoryServer(winnerPlayer.character, rollData.item, 1, party.sharedState.groundLoot)) {
            party.sharedState.log.push({ message: `${winner.playerName} won ${rollData.item.name} with ${winner.roll}!`, type: 'success' });
            io.to(winnerPlayer.id).emit('characterUpdate', winnerPlayer.character);
        } else if (winnerPlayer) {
            party.sharedState.log.push({ message: `${winner.playerName} won ${rollData.item.name}, but their inventory was full! The item was dropped on the ground.`, type: 'damage' });
        }
    } else {
        // Nobody rolled - drop to ground so it's not lost
        party.sharedState.groundLoot.push({ ...rollData.item, quantity: 1 });
        party.sharedState.log.push({ message: `Nobody rolled for ${rollData.item.name}. It was left on the ground.`, type: 'info' });
    }
    party.sharedState.pendingLootRoll = null;
    party.members.forEach(memberName => {
        const member = players[memberName];
        if (member && member.id) {
            io.to(member.id).emit('party:lootRollEnded');
        }
    });

    // Broadcast the log updates to all party members
    broadcastAdventureUpdate(io, party);

    // Process next item in the queue if any
    processNextLootRoll(io, party);
}

// Start the next loot roll from the queue
export function processNextLootRoll(io, party) {
    const { sharedState } = party;
    if (!sharedState.lootRollQueue || sharedState.lootRollQueue.length === 0) {
        return;
    }

    const nextItem = sharedState.lootRollQueue.shift();
    sharedState.log.push({ message: `Party found: [${nextItem.name}]! A roll will begin.`, type: 'success' });
    sharedState.pendingLootRoll = {
        item: nextItem,
        rolls: [],
        endTime: Date.now() + LOOT_ROLL_DURATION_MS,
    };
    party.members.forEach(memberName => {
        const member = players[memberName];
        if (member && member.id) {
            io.to(member.id).emit('party:lootRollStarted', sharedState.pendingLootRoll);
        }
    });
    setTimeout(() => {
        determineLootWinnerAndDistribute(io, party.id);
    }, LOOT_ROLL_DURATION_MS);
}
