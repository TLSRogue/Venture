export function applyDamage(party, target, damageAmount, log, io) {
    if (damageAmount <= 0) return;
    if (target.state.health <= 0) return; // Already dead

    let remainingDamage = damageAmount;

    // Check for "Magic Barrier" or similar shield buffs
    const shieldBuff = target.state.buffs?.find(b => b.shield && b.currentShield > 0);

    if (shieldBuff) {
        if (shieldBuff.currentShield >= remainingDamage) {
            shieldBuff.currentShield -= remainingDamage;
            log.push({ message: `${target.name}'s shield absorbs ${remainingDamage} damage! (${shieldBuff.currentShield} remaining)`, type: 'info' });
            remainingDamage = 0;
        } else {
            remainingDamage -= shieldBuff.currentShield;
            log.push({ message: `${target.name}'s shield absorbs ${shieldBuff.currentShield} damage and breaks!`, type: 'info' });
            shieldBuff.currentShield = 0;
            // Shield broken - maybe remove buff? For now, we keep it until duration expires, but it has 0 shield.
        }
    }

    if (remainingDamage > 0) {
        target.state.health -= remainingDamage;
        // Visual feedback would happen here for HP loss if not handled by log/UI updates
    }
}
