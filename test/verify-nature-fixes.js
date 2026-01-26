
import { allSpells } from '../data/spells.js';
import { getBonusStatsForPlayer } from '../utilsHelpers.js';

console.log("=== NATURE SPELLS VERIFICATION ===");

// 1. Verify Moonbeam
const moonbeam = allSpells.find(s => s.name === 'Moonbeam');
console.log("\n[Moonbeam]");
console.log(`Damage Type: ${moonbeam.damageType} (Expected: Nature)`);
console.log(`AP Cost: ${moonbeam.cost} (Expected: 1)`);
console.log(`Cooldown: ${moonbeam.cooldown} (Expected: 0)`);

if (moonbeam.damageType === 'Nature' && moonbeam.cost === 1 && moonbeam.cooldown === 0) {
    console.log("✅ Moonbeam basic stats verified.");
} else {
    console.error("❌ Moonbeam basic stats failed.");
}

// 2. Verify Rejuvenate
const rejuvenate = allSpells.find(s => s.name === 'Rejuvenate');
console.log("\n[Rejuvenate]");
console.log(`AP Cost: ${rejuvenate.cost} (Expected: 1)`);
console.log(`Cooldown: ${rejuvenate.cooldown} (Expected: 3)`);
console.log(`Duration: ${rejuvenate.buff.duration} (Expected: 2)`);
console.log(`Range: ${rejuvenate.range} (Expected: ranged)`);

if (rejuvenate.cost === 1 && rejuvenate.cooldown === 3 && rejuvenate.buff.duration === 2 && rejuvenate.range === 'ranged') {
    console.log("✅ Rejuvenate basic stats verified.");
} else {
    console.error("❌ Rejuvenate basic stats failed.");
}

// 3. Verify Spirit Call
const spiritCall = allSpells.find(s => s.name === 'Spirit Call');
console.log("\n[Spirit Call]");
console.log(`Cooldown: ${spiritCall.cooldown} (Expected: 6)`);

if (spiritCall.cooldown === 6) {
    console.log("✅ Spirit Call cooldown verified.");
} else {
    console.error("❌ Spirit Call cooldown failed.");
}

// 4. Verify Entangling Roots
const roots = allSpells.find(s => s.name === 'Entangling Roots');
console.log("\n[Entangling Roots]");
console.log(`AP Cost: ${roots.cost} (Expected: 2)`);

if (roots.cost === 2) {
    console.log("✅ Entangling Roots cost verified.");
} else {
    console.error("❌ Entangling Roots cost failed.");
}

console.log("\n=== VERIFICATION COMPLETE ===");
