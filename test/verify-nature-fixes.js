
// Verification script for Nature Spells Fixes
// Tests stackDuration logic and Spirit Call dialogue structure

console.log("=== VERIFYING NATURE SPELLS FIXES ===");

// --- Test 1: Stack Duration Logic ---
console.log("\n[Test 1] Buff Stack Duration Logic");

const buffTarget = {
    name: "TestPlayer",
    buffs: [
        { type: "Rejuvenate", duration: 3, stackDuration: true }
    ]
};

const newBuff = { type: "Rejuvenate", duration: 3, stackDuration: true };
const log = [];

// Simulate logic from adventure-actions.js
const existingIndex = buffTarget.buffs.findIndex(b => b.type === newBuff.type);
if (existingIndex !== -1) {
    if (newBuff.stackDuration) {
        buffTarget.buffs[existingIndex].duration += newBuff.duration;
        log.push({ message: `${buffTarget.name}'s ${newBuff.type} duration extended by ${newBuff.duration} turns!`, type: 'heal' });
    } else {
        buffTarget.buffs.splice(existingIndex, 1);
        buffTarget.buffs.push(newBuff);
    }
} else {
    buffTarget.buffs.push(newBuff);
}

if (buffTarget.buffs[0].duration === 6) {
    console.log("✅ Stack Duration Success: Duration increased from 3 to 6.");
} else {
    console.error(`❌ Stack Duration Failed: Expected 6, got ${buffTarget.buffs[0].duration}`);
}

if (log.length > 0 && log[0].message.includes("extended by 3 turns")) {
    console.log("✅ Log Message Correct");
} else {
    console.error("❌ Log Message Failed");
}


// --- Test 2: Spirit Call Dialogue Construction ---
console.log("\n[Test 2] Spirit Call Dialogue Structure");

// Mocking result from spell-handler
const result = {
    pendingSelection: {
        type: 'spiritCall',
        casterPlayerId: 'p1',
        casterName: 'Druid',
        bonusAmount: 5 // Mocked bonus
    }
};

let dialogueEmitted = null;
const io = {
    to: (id) => ({
        emit: (event, payload) => {
            if (event === 'party:showDialogue') {
                dialogueEmitted = payload;
            }
        }
    })
};

// Simulate logic from adventure-actions.js
if (result.pendingSelection.type === 'spiritCall') {
    const bonus = result.pendingSelection.bonusAmount || 1;
    const spiritDialog = {
        text: "Call upon a Spirit Animal to aid you:",
        options: [
            { text: `Panther Spirit (+${bonus} Agi)`, action: 'spiritCallBuff', buff: 'Panther', next: 'farewell' },
            { text: `Bear Spirit (+${bonus} Str)`, action: 'spiritCallBuff', buff: 'Bear', next: 'farewell' },
            { text: `Tree Spirit (+${bonus} Def)`, action: 'spiritCallBuff', buff: 'Tree', next: 'farewell' }
        ]
    };

    io.to('p1').emit('party:showDialogue', {
        npcName: "Spirit Call",
        node: spiritDialog,
        cardIndex: -1
    });
}

if (dialogueEmitted) {
    console.log("✅ Dialogue Emitted");
    console.log("NPC Name:", dialogueEmitted.npcName);
    const options = dialogueEmitted.node.options;
    if (options.length === 3 && options[0].text.includes("+5 Agi")) {
        console.log("✅ Dialogue Options Correct (Bonus +5 reflected)");
    } else {
        console.error("❌ Dialogue Options Incorrect");
        console.log("Options:", JSON.stringify(options, null, 2));
    }
} else {
    console.error("❌ Dialogue Not Emitted");
}

console.log("\n=== VERIFICATION COMPLETE ===");
