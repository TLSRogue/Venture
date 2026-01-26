
import { processDialogueChoice } from '../adventure/adventure-interactions.js';


const mockIo = {
    to: (id) => ({
        emit: (event, payload) => console.log(`Emit to ${id}: ${event}`, payload)
    })
};

const mockPlayer = {
    id: 'player1',
    character: {
        characterName: 'Tester',
        agility: 10,
        inventory: [],
        quests: [],
        knownRecipes: [],
        equipment: {},
        equippedSpells: []
    }
};

const mockParty = {
    members: ['player1'],
    sharedState: {
        partyMemberStates: [
            {
                playerId: 'player1',
                name: 'Tester',
                buffs: []
            }
        ],
        log: [],
        zoneCards: [],
        groundLoot: []
    }
};

async function testSpiritCall() {
    console.log("Testing Spirit Call Buff Application...");

    const payload = {
        action: 'spiritCallBuff',
        buff: 'Panther',
        choice: { // The payload in processDialogueChoice is the payload object itself, which contains 'choice' usually? 
            // Wait, processDialogueChoice(io, player, party, payload)
            // payload usually comes from the socket event. 
            // looking at the code: const { cardIndex, choice } = payload;
            // And inside: if (choice.action === 'spiritCallBuff')
        },
        cardIndex: -1
    };

    // Construct correct payload found in adventure-interactions.js
    const correctPayload = {
        cardIndex: -1,
        choice: {
            action: 'spiritCallBuff',
            buff: 'Panther',
            next: 'farewell'
        }
    };

    await processDialogueChoice(mockIo, mockPlayer, mockParty, correctPayload);

    const playerState = mockParty.sharedState.partyMemberStates[0];
    console.log("Player Buffs:", JSON.stringify(playerState.buffs, null, 2));

    const pantherBuff = playerState.buffs.find(b => b.type === 'Panther Spirit');

    if (pantherBuff) {
        console.log("SUCCESS: Panther Spirit buff applied.");
        if (pantherBuff.bonus && pantherBuff.bonus.agility >= 1) {
            console.log("SUCCESS: Bonus applied.");
        } else {
            console.log("FAILURE: Bonus missing or incorrect.");
        }
    } else {
        console.log("FAILURE: Panther Spirit buff NOT applied.");
    }
}

testSpiritCall().catch(console.error);
