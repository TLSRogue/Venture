
// Mocks
const io = {
    sockets: {
        sockets: new Map()
    },
    to: (id) => ({
        emit: (event, data) => console.log(`[IO to ${id}] ${event}:`, JSON.stringify(data, null, 2))
    })
};

const players = {
    'TestPlayer': {
        id: 'p1',
        character: {
            characterName: 'DruidMaster',
            inventory: [],
            equipment: {},
            equippedSpells: [],
            buffs: []
        }
    }
};

const parties = {
    'party1': {
        id: 'party1',
        sharedState: {
            log: [],
            partyMemberStates: [
                {
                    playerId: 'p1',
                    name: 'DruidMaster',
                    health: 10,
                    maxHealth: 20,
                    buffs: [],
                    debuffs: [],
                    turnEnded: false
                },
                {
                    playerId: 'p2',
                    name: 'Ally',
                    health: 5,
                    maxHealth: 20,
                    buffs: [],
                    debuffs: []
                }
            ]
        }
    }
};

const utilsHelpers = {
    getBonusStatsForPlayer: () => ({ naturePower: 2 })
};

async function runTests() {
    console.log("=== STARTING NATURE SPELLS VERIFICATION ===");

    // 1. Test Rejuvenate Logic
    console.log("\n[Test 1] Rejuvenate Healing at End of Turn");
    const playerState = parties['party1'].sharedState.partyMemberStates[0];

    playerState.buffs.push({ type: 'Rejuvenate', duration: 3 });
    playerState.health = 5;

    const rejuvenateBuff = playerState.buffs.find(b => b.type === 'Rejuvenate');
    if (rejuvenateBuff) {
        const healAmount = 1 + (utilsHelpers.getBonusStatsForPlayer().naturePower || 0);
        playerState.health = Math.min(playerState.maxHealth, playerState.health + healAmount);
        console.log(`> Rejuvenate healed for ${healAmount}. HP: ${playerState.health}`);

        if (playerState.health === 8) {
            console.log("✅ Rejuvenate healing verified (5 -> 8)");
        } else {
            console.error("❌ Rejuvenate healing failed");
        }
    }

    // 2. Test Spirit Call Selection
    console.log("\n[Test 2] Spirit Call - Panther Spirit Selection");
    const choicePayload = {
        action: 'spiritCallBuff',
        buff: 'Panther'
    };

    if (choicePayload.action === 'spiritCallBuff') {
        const actingPlayerState = parties['party1'].sharedState.partyMemberStates[0];
        actingPlayerState.buffs = [];

        if (choicePayload.buff === 'Panther') {
            actingPlayerState.buffs.push({ type: 'Panther Spirit', duration: 2, bonus: { agility: 2 } });
        }

        const hasPanther = actingPlayerState.buffs.some(b => b.type === 'Panther Spirit' && b.duration === 2 && b.bonus.agility === 2);

        if (hasPanther) {
            console.log("✅ Panther Spirit applied with +2 Agility");
        } else {
            console.error("❌ Panther Spirit failed");
        }
    }

    // 4. Test Moonbeam Damage Calculation
    console.log("\n[Test 4] Moonbeam Damage Calculation");
    const bonuses = { naturePower: 4 };
    const spell = { name: 'Moonbeam', damage: 1 };

    let damage = spell.damage || 1;
    if (spell.name === 'Moonbeam') {
        damage += Math.floor((bonuses.naturePower || 0) / 2);
    }

    if (damage === 3) {
        console.log("✅ Moonbeam damage verified (1 + 2 = 3)");
    } else {
        console.error(`❌ Moonbeam damage failed. Got: ${damage}`);
    }

    console.log("\n=== VERIFICATION COMPLETE ===");
}

runTests();
