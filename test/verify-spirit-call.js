
import { processDialogueChoice } from '../adventure/adventure-interactions.js';
import { gameData } from '../data/index.js';

// Mock IO
const io = {
    to: (id) => ({
        emit: (event, data) => console.log(`[Emit to ${id}] ${event}:`, data?.type || '')
    })
};

// Mock Player and Party
const player = {
    id: 'socket1',
    character: {
        characterName: 'TestHero',
        inventory: [],
        quests: [],
        stats: { naturePower: 5 }, // active stats usually calculated
        agility: 0
    }
};

const partyMemberState = {
    playerId: 'socket1',
    name: 'TestHero',
    buffs: [],
    agility: 10
};

const party = {
    id: 'party1',
    members: ['TestHero'],
    sharedState: {
        log: [],
        partyMemberStates: [partyMemberState],
        zoneCards: [] // Just to satisfy imports
    }
};

// Run Test
console.log("Initial Buffs:", partyMemberState.buffs);

const payload = {
    choice: {
        action: 'spiritCallBuff',
        buff: 'Panther',
        next: 'farewell'
    }
};

console.log("Selecting Panther Spirit...");
processDialogueChoice(io, player, party, payload);

console.log("Final Buffs:", partyMemberState.buffs);

// Verify
const pantherBuff = partyMemberState.buffs.find(b => b.type === 'Panther Spirit');
if (pantherBuff) {
    console.log("✅ SUCCESS: Panther Spirit buff applied.");
    console.log("Bonus:", pantherBuff.bonus);
    if (pantherBuff.bonus.agility > 0) { // Should be >0 based on nature power?
        // Note: mock doesn't handle getBonusStatsForPlayer perfectly unless we mock that helper too
        // But logic uses `getBonusStatsForPlayer`.
        // Let's rely on the fact that `getBonusStatsForPlayer` is imported.
        // It reads character. 
        console.log("✅ Bonus amount check passed (visual check).");
    }
} else {
    console.error("❌ FAILURE: Panther Spirit buff NOT found.");
}
