import { gameData } from './data/index.js';
import { runEnemyPhaseForParty } from './adventure/adventure-state.js';
import { parties, players } from './serverState.js';

// Setup mock io
const mockIo = {
    to: () => ({ emit: () => {} }),
    emit: () => {}
};

// Setup mock player
players['TestPlayer'] = {
    id: 'mock-socket-id',
    character: {
        characterName: 'TestPlayer',
        equipment: {},
        inventory: [],
        bank: [],
        buffs: [],
        debuffs: []
    }
};

// Setup mock party
parties['test-party'] = {
    id: 'test-party',
    members: ['TestPlayer'],
    leaderId: 'TestPlayer',
    sharedState: {
        currentZone: 'farmlands',
        zoneCards: [
            { type: 'area', name: 'Field' },
            { type: 'area', name: 'Field' },
            { type: 'area', name: 'Field' },
            { type: 'enemy', name: 'Angry Farmhand', health: 4, buffs: [], debuffs: [] }
        ],
        zoneEffects: [],
        log: [],
        partyMemberStates: [
            {
                name: 'TestPlayer',
                playerId: 'mock-socket-id',
                isDead: false,
                health: 100,
                maxHealth: 100,
                actionPoints: 3,
                turnEnded: true,
                buffs: [],
                debuffs: [],
                weaponCooldowns: {},
                spellCooldowns: {},
                itemCooldowns: {},
                threat: 0
            }
        ],
        defenseQuest: {
            active: true,
            turnCount: 4,
            maxTurns: 5,
            spawningComplete: false,
            questId: "FARMHAND_DEFENSE"
        }
    }
};

async function test() {
    try {
        console.log("Simulating Turn 5 (Revolter should spawn).");
        await runEnemyPhaseForParty(mockIo, 'test-party');
        console.log("Turn 5 successful.");
        console.log("Revolter Spawned?", parties['test-party'].sharedState.zoneCards.some(c => c && c.name === 'Farmhand Revolter'));
        
        console.log("Simulating Next Turn where Revolter attacks.");
        parties['test-party'].sharedState.partyMemberStates[0].turnEnded = true;
        await runEnemyPhaseForParty(mockIo, 'test-party');
        console.log("Next turn successful.");
    } catch (e) {
        console.error("CRASH DETECTED:");
        console.error(e);
    }
}

test();
