// adventure/enemy-handlers.js
// Extracted enemy special action handlers for cleaner combat flow management

import { players } from '../serverState.js';
import { gameData } from '../data/index.js';
import { getBonusStatsForPlayer } from '../utilsHelpers.js';
import {
  applyDamage,
  applyDoTEffects,
  decrementEnemyReactionCooldowns,
  getEffectiveResistance,
  setThreat,
} from './combat-core.js';
import { rollD20 } from '../shared.js';

/**
 * Summonable enemy types - pulled from canonical specialCards data.
 * These getters ensure summoned enemies always match the card pool definitions.
 */
function getRatTypes() {
  return [gameData.specialCards.sewerRat, gameData.specialCards.plagueRat];
}

function getGoblinTypes() {
  return [gameData.specialCards.goblinWarrior, gameData.specialCards.goblinArcher, gameData.specialCards.goblinShaman];
}

/**
 * Handler result type:
 * {
 *   handled: boolean - True if this handler processed the action
 *   skipEndOfTurn?: boolean - Skip DOT/buff processing for this enemy
 *   removeEnemy?: boolean - Remove this enemy from the zone
 *   continueLoop?: boolean - Continue to next enemy in the loop
 *   rerollAttack?: boolean - Re-roll attack for this enemy (e.g., Raging Bull)
 * }
 */

// --- RAT KING HANDLERS ---
function handleRatKingSummon(enemy, sharedState, _target, _attack, _ctx) {
  const ratTypes = getRatTypes();
  const randomRat = ratTypes[Math.floor(Math.random() * ratTypes.length)];

  // First try empty slots, then overlay non-enemy cards (but NOT other enemies)
  let spawnIndex = sharedState.zoneCards.findIndex((c) => c === null);
  let overlayedCard = null;

  if (spawnIndex === -1) {
    // No empty slot - try to find a non-enemy card to overlay
    spawnIndex = sharedState.zoneCards.findIndex((c) => c && c.type !== 'enemy');
    if (spawnIndex !== -1) {
      overlayedCard = sharedState.zoneCards[spawnIndex];
    }
  }

  if (spawnIndex !== -1) {
    const ratCard = {
      ...randomRat,
      id: Date.now(),
      debuffs: [],
      overlayedCard: overlayedCard, // Store original card to restore on death
    };
    sharedState.zoneCards[spawnIndex] = ratCard;
    if (overlayedCard) {
      sharedState.log.push({
        message: `A ${randomRat.name} emerges from the ${overlayedCard.name}!`,
        type: 'reaction',
      });
    } else {
      sharedState.log.push({ message: `A ${randomRat.name} scurries into the battle!`, type: 'reaction' });
    }
  } else {
    sharedState.log.push({ message: `The Rat King shrieks, but there's no room for more rats!`, type: 'info' });
  }
  return { handled: true };
}

// --- GORBON HANDLERS ---
function handleGorbonRally(enemy, sharedState, _target, _attack, _ctx) {
  const goblins = sharedState.zoneCards.filter(
    (c) => c && c.type === 'enemy' && c.name.includes('Goblin') && c !== enemy
  );
  if (goblins.length > 0) {
    goblins.forEach((goblin) => {
      if (!goblin.buffs) goblin.buffs = [];
      goblin.buffs = goblin.buffs.filter((b) => b.type !== 'Rallied');
      goblin.buffs.push({ type: 'Rallied', duration: 2, bonus: { damageBonus: 2 } });
    });
    sharedState.log.push({ message: `All goblins gain +2 damage for 2 turns!`, type: 'reaction' });
  } else {
    // No goblins to rally - spawn a random goblin reinforcement
    // First try empty slots, then overlay non-enemy cards (but NOT other enemies)
    let spawnIndex = sharedState.zoneCards.findIndex((c) => c === null);
    let overlayedCard = null;

    if (spawnIndex === -1) {
      // No empty slot - try to find a non-enemy card to overlay
      spawnIndex = sharedState.zoneCards.findIndex((c) => c && c.type !== 'enemy');
      if (spawnIndex !== -1) {
        overlayedCard = sharedState.zoneCards[spawnIndex];
      }
    }

    if (spawnIndex !== -1) {
      const goblinTypes = getGoblinTypes();
      const randomGoblin = goblinTypes[Math.floor(Math.random() * goblinTypes.length)];
      const newGoblin = {
        ...randomGoblin,
        type: 'enemy',
        debuffs: [],
        buffs: [{ type: 'Rallied', duration: 2, bonus: { damageBonus: 2 } }],
        id: Date.now(),
        overlayedCard: overlayedCard, // Store original card to restore on death
      };
      sharedState.zoneCards[spawnIndex] = newGoblin;
      if (overlayedCard) {
        sharedState.log.push({
          message: `Gorbon roars "FOR THE HORDE!" and a ${randomGoblin.name} emerges from the ${overlayedCard.name}!`,
          type: 'reaction',
        });
      } else {
        sharedState.log.push({
          message: `Gorbon roars "FOR THE HORDE!" and a ${randomGoblin.name} answers his call!`,
          type: 'reaction',
        });
      }
    } else {
      sharedState.log.push({ message: `Gorbon roars, but there's no room for reinforcements!`, type: 'info' });
    }
  }
  return { handled: true };
}

// --- GOBLIN SHAMAN HANDLERS ---
function handleGoblinShamanHeal(enemy, sharedState, _target, _attack, _ctx) {
  const woundedAllies = sharedState.zoneCards
    .filter((c) => c && c.type === 'enemy' && c !== enemy && c.health < c.maxHealth)
    .sort((a, b) => a.health / a.maxHealth - b.health / b.maxHealth);

  if (woundedAllies.length > 0) {
    const healTarget = woundedAllies[0];
    const healAmount = 5;
    const oldHealth = healTarget.health;
    healTarget.health = Math.min(healTarget.maxHealth, healTarget.health + healAmount);
    const actualHeal = healTarget.health - oldHealth;
    sharedState.log.push({ message: `The Shaman heals ${healTarget.name} for ${actualHeal} HP!`, type: 'heal' });
  } else {
    if (enemy.health < enemy.maxHealth) {
      const healAmount = 5;
      const oldHealth = enemy.health;
      enemy.health = Math.min(enemy.maxHealth, enemy.health + healAmount);
      const actualHeal = enemy.health - oldHealth;
      sharedState.log.push({ message: `The Shaman heals itself for ${actualHeal} HP!`, type: 'heal' });
    } else {
      sharedState.log.push({ message: `Goblin Shaman searches for wounded allies but finds none!`, type: 'info' });
    }
  }
  return { handled: true };
}

// --- PULVIS CADUS HANDLERS ---
function handlePulvisQuickFix(enemy, sharedState, _target, _attack, _ctx) {
  if (enemy.health < enemy.maxHealth) {
    const healAmount = 8 + (enemy.arenaDamageBonus || 0);
    const oldHealth = enemy.health;
    enemy.health = Math.min(enemy.maxHealth, enemy.health + healAmount);
    const actualHeal = enemy.health - oldHealth;
    sharedState.log.push({ message: `Pulvis Cadus patches up his armor, restoring ${actualHeal} HP!`, type: 'heal' });
  } else {
    if (!enemy.buffs) enemy.buffs = [];
    enemy.buffs = enemy.buffs.filter((b) => b.type !== 'Enraged');
    enemy.buffs.push({ type: 'Enraged', duration: 2, bonus: { rollBonus: 3, damageBonus: 2 } });
    sharedState.log.push({
      message: `Pulvis Cadus is fully repaired and becomes ENRAGED! (+3 to rolls, +2 damage)`,
      type: 'reaction',
    });
  }
  return { handled: true };
}

function handlePulvisUnstableKegs(enemy, sharedState, _target, _attack, _ctx) {
  const kegCount = 2;
  let spawned = 0;
  for (let k = 0; k < kegCount; k++) {
    // Find a slot that is empty or allows spawning over (like Area cards or specific generic cards)
    const emptySlotIndex = sharedState.zoneCards.findIndex(
      (c) => c === null || (c && (c.allowSpawnOver || c.type === 'area'))
    );
    if (emptySlotIndex !== -1) {
      const kegCard = {
        ...gameData.specialCards.powderKeg,
        id: Date.now() + k,
        kegTimer: 2,
        maxHealth: 6,
        health: 6,
        overlayedCard: sharedState.zoneCards[emptySlotIndex] !== null ? sharedState.zoneCards[emptySlotIndex] : null,
      };
      sharedState.zoneCards[emptySlotIndex] = kegCard;
      spawned++;
    }
  }
  if (spawned > 0) {
    sharedState.log.push({
      message: `${spawned} Powder Keg(s) land in the arena! They look like they're about to blow!`,
      type: 'reaction',
    });
  }
  return { handled: true };
}

// --- POWDER KEG HANDLERS ---
function handlePowderKegDetonate(enemy, sharedState, _target, _attack, _ctx) {
  if (typeof enemy.kegTimer === 'undefined') enemy.kegTimer = 2;
  enemy.kegTimer--;

  if (enemy.kegTimer <= 0) {
    sharedState.log.push({ message: `BOOM! The Powder Keg DETONATES!`, type: 'damage' });

    // Damage all players
    sharedState.partyMemberStates.forEach((p) => {
      if (!p.isDead) {
        const playerObj = players[p.name];
        if (playerObj) {
          const bonuses = getBonusStatsForPlayer(playerObj.character, p);
          const resistance = getEffectiveResistance(bonuses, 'Fire');
          const damage = Math.max(1, 4 + (enemy.arenaDamageBonus || 0) - resistance);

          applyDamage(p, damage);
          let msg = `${p.name} takes ${damage} Fire damage!`;
          if (damage < 4) msg += ` (${4 - damage} resisted)`;
          sharedState.log.push({ message: msg, type: 'damage' });

          if (p.health <= 0) {
            p.health = 0;
            p.isDead = true;
            sharedState.log.push({ message: `${p.name} has been defeated by the explosion!`, type: 'damage' });
          }
        }
      }
    });

    // Signal to remove the keg
    return { handled: true, removeEnemy: true };
  } else {
    sharedState.log.push({
      message: `The Powder Keg fizzes ominously... (${enemy.kegTimer} turns remaining)`,
      type: 'reaction',
    });
  }
  return { handled: true };
}

// --- ANGRY FARMHAND HANDLERS ---
// Now only handles the flee check - Pitchfork attack is in the attack table as a regular attack
function handleFarmhandTactics(enemy, sharedState, _target, _attack, _ctx) {
  const allEffects = (enemy.buffs || []).concat(enemy.debuffs || []);
  const isTrapped = allEffects.some((b) =>
    ['trapped', 'root', 'stun', 'daze', 'entangling roots'].includes(b.type.toLowerCase())
  );

  if (enemy.health <= 2 && !isTrapped) {
    sharedState.log.push({ message: 'The Farmhand panics and runs away!', type: 'reaction' });
    return { handled: true, removeEnemy: true, skipEndOfTurn: true };
  } else {
    // If not fleeing, just log and let the turn pass (no damage from special)
    sharedState.log.push({ message: 'The Farmhand sizes you up...', type: 'info' });
    return { handled: true };
  }
}

// --- VEXOR HANDLERS ---
function handleVexorSlash(enemy, sharedState, _target, _attack, _ctx) {
  const sortedPlayers = [...sharedState.partyMemberStates]
    .filter((p) => !p.isDead)
    .sort((a, b) => (b.threat || 0) - (a.threat || 0));
  if (sortedPlayers.length > 0) {
    const targetPlayer = sortedPlayers[0];
    const playerObj = players[targetPlayer.name];
    if (playerObj) {
      const bonuses = getBonusStatsForPlayer(playerObj.character, targetPlayer);
      const resistance = bonuses.physicalResistance || 0;
      const damage = Math.max(1, 5 + (enemy.arenaDamageBonus || 0) - resistance);
      applyDamage(targetPlayer, damage);
      sharedState.log.push({
        message: `Vexor slashes ${targetPlayer.name} for ${damage} Physical damage!`,
        type: 'damage',
      });
      if (targetPlayer.health <= 0) {
        targetPlayer.isDead = true;
        targetPlayer.health = 0;
      }
    }
  }
  return { handled: true };
}

function handleVexorShieldBash(enemy, sharedState, _target, _attack, _ctx) {
  const sortedPlayers = [...sharedState.partyMemberStates]
    .filter((p) => !p.isDead)
    .sort((a, b) => (a.threat || 0) - (b.threat || 0));
  if (sortedPlayers.length > 0) {
    const targetPlayer = sortedPlayers[0];
    const playerObj = players[targetPlayer.name];
    if (playerObj) {
      const bonuses = getBonusStatsForPlayer(playerObj.character, targetPlayer);
      const resistance = bonuses.physicalResistance || 0;
      const damage = Math.max(1, 4 + (enemy.arenaDamageBonus || 0) - resistance);
      applyDamage(targetPlayer, damage);

      if (!targetPlayer.debuffs) targetPlayer.debuffs = [];
      targetPlayer.debuffs.push({ type: 'stun', duration: 1 });

      sharedState.log.push({
        message: `Vexor bashes ${targetPlayer.name} for ${damage} damage and Stuns them!`,
        type: 'damage',
      });
      if (targetPlayer.health <= 0) {
        targetPlayer.isDead = true;
        targetPlayer.health = 0;
      }
    }
  }
  return { handled: true };
}

function handleVexorTaunt(enemy, sharedState, _target, _attack, _ctx) {
  enemy.health = Math.min(enemy.maxHealth, enemy.health + (5 + (enemy.arenaDamageBonus || 0)));
  sharedState.log.push({ message: `Vexor heals for 5 HP!`, type: 'heal' });

  const sortedPlayers = [...sharedState.partyMemberStates]
    .filter((p) => !p.isDead)
    .sort((a, b) => (a.threat || 0) - (b.threat || 0));
  if (sortedPlayers.length > 0) {
    const targetPlayer = sortedPlayers[0];
    setThreat(targetPlayer, 10);
    sharedState.log.push({ message: `${targetPlayer.name} is taunted! Threat increased to 10!`, type: 'info' });
  }
  return { handled: true };
}

function handleVexorWhirlwind(enemy, sharedState, _target, _attack, _ctx) {
  sharedState.partyMemberStates.forEach((p) => {
    if (!p.isDead) {
      const playerObj = players[p.name];
      if (playerObj) {
        const bonuses = getBonusStatsForPlayer(playerObj.character, p);
        const resistance = bonuses.physicalResistance || 0;
        const damage = Math.max(1, 5 + (enemy.arenaDamageBonus || 0) - resistance);
        applyDamage(p, damage);

        if (!p.debuffs) p.debuffs = [];
        p.debuffs.push({ type: 'bleed', duration: 2, damage: 2 });

        sharedState.log.push({
          message: `Vexor hits ${p.name} for ${damage} damage and applies Bleed!`,
          type: 'damage',
        });
        if (p.health <= 0) {
          p.isDead = true;
          p.health = 0;
        }
      }
    }
  });
  return { handled: true };
}

// --- BLACK WIDOW HANDLERS ---
function handleBlackWidowConsume(enemy, sharedState, _target, _attack, _ctx) {
  const trappedPlayers = sharedState.partyMemberStates.filter(
    (p) => !p.isDead && (p.debuffs || []).some((d) => d.type.toLowerCase() === 'trap')
  );

  if (trappedPlayers.length > 0) {
    const targetPlayer = trappedPlayers[Math.floor(Math.random() * trappedPlayers.length)];
    const playerObj = players[targetPlayer.name];
    if (playerObj) {
      const bonuses = getBonusStatsForPlayer(playerObj.character, targetPlayer);
      const resistance = bonuses.physicalResistance || 0;
      const damage = Math.max(1, 4 - resistance);
      applyDamage(targetPlayer, damage);

      // Heal the spider
      const healAmount = 4;
      enemy.health = Math.min(enemy.maxHealth, enemy.health + healAmount);

      sharedState.log.push({
        message: `The Black Widow consumes the trapped ${targetPlayer.name} for ${damage} damage and heals for ${healAmount} HP!`,
        type: 'damage',
      });
      if (targetPlayer.health <= 0) {
        targetPlayer.isDead = true;
        targetPlayer.health = 0;
      }
    }
  } else {
    // No trapped targets, just do a normal bite
    const validTargets = sharedState.partyMemberStates.filter((p) => !p.isDead);
    if (validTargets.length > 0) {
      const targetPlayer = validTargets[Math.floor(Math.random() * validTargets.length)];
      const playerObj = players[targetPlayer.name];
      if (playerObj) {
        const bonuses = getBonusStatsForPlayer(playerObj.character, targetPlayer);
        const resistance = bonuses.physicalResistance || 0;
        const damage = Math.max(1, 4 - resistance);
        applyDamage(targetPlayer, damage);
        sharedState.log.push({
          message: `The Black Widow bites ${targetPlayer.name} for ${damage} Physical damage!`,
          type: 'damage',
        });
        if (targetPlayer.health <= 0) {
          targetPlayer.isDead = true;
          targetPlayer.health = 0;
        }
      }
    }
  }
  return { handled: true };
}

// --- GRAY WOLF HANDLERS ---
function handleGrayWolfHowl(enemy, sharedState, _target, _attack, _ctx) {
  // First try empty slots, then overlay non-enemy cards (but NOT other enemies)
  let spawnIndex = sharedState.zoneCards.findIndex((c) => c === null);
  let overlayedCard = null;

  if (spawnIndex === -1) {
    // No empty slot - try to find a non-enemy card to overlay
    spawnIndex = sharedState.zoneCards.findIndex((c) => c && c.type !== 'enemy');
    if (spawnIndex !== -1) {
      overlayedCard = sharedState.zoneCards[spawnIndex];
    }
  }

  if (spawnIndex !== -1) {
    const newWolf = {
      ...gameData.specialCards.grayWolf,
      id: Date.now(),
      debuffs: [],
      buffs: [],
      overlayedCard: overlayedCard, // Store original card to restore on death
    };
    sharedState.zoneCards[spawnIndex] = newWolf;
    if (overlayedCard) {
      sharedState.log.push({
        message: `A Gray Wolf emerges from the ${overlayedCard.name} and joins the fight!`,
        type: 'reaction',
      });
    } else {
      sharedState.log.push({ message: `A Gray Wolf answers the call and joins the fight!`, type: 'reaction' });
    }
  } else {
    sharedState.log.push({
      message: `The howl echoes through the forest, but no wolves can join the fight!`,
      type: 'info',
    });
  }
  return { handled: true };
}

// --- VAMPIRE HANDLERS ---
function handleVampireTakeFlight(enemy, sharedState, _target, _attack, _ctx) {
  if (!enemy.buffs) enemy.buffs = [];
  enemy.buffs = enemy.buffs.filter((b) => b.type !== 'Flying' && b.type !== 'Aerial Strike');
  enemy.buffs.push({ type: 'Flying', duration: 2 });
  enemy.buffs.push({ type: 'Aerial Strike', duration: 1, bonus: { rollBonus: 5 } });
  sharedState.log.push({
    message: `The Vampire takes flight! He cannot be hit by melee attacks and his next attack has +5 to hit!`,
    type: 'reaction',
  });
  return { handled: true };
}

function handleVampireBloodFountain(enemy, sharedState, _target, _attack, _ctx) {
  const bleedingPlayers = sharedState.partyMemberStates.filter(
    (p) => !p.isDead && (p.debuffs || []).some((d) => d.type.toLowerCase() === 'bleed')
  );

  if (bleedingPlayers.length > 0) {
    bleedingPlayers.forEach((targetPlayer) => {
      const playerObj = players[targetPlayer.name];
      if (playerObj) {
        const bonuses = getBonusStatsForPlayer(playerObj.character, targetPlayer);
        const resistance = bonuses.physicalResistance || 0;
        const damage = Math.max(1, 8 - resistance);
        applyDamage(targetPlayer, damage);
        sharedState.log.push({
          message: `Blood Fountain drains ${targetPlayer.name} for ${damage} Physical damage!`,
          type: 'damage',
        });
        if (targetPlayer.health <= 0) {
          targetPlayer.isDead = true;
          targetPlayer.health = 0;
        }
      }
    });
  } else {
    // No bleeding players, apply Bleed to all
    sharedState.partyMemberStates.forEach((p) => {
      if (!p.isDead) {
        if (!p.debuffs) p.debuffs = [];
        p.debuffs.push({ type: 'bleed', duration: 2, damage: 2, damageType: 'Physical' });
      }
    });
    sharedState.log.push({
      message: `The Vampire's blood magic cuts everyone! All players are now Bleeding!`,
      type: 'damage',
    });
  }
  return { handled: true };
}

// --- VAMPIRE'S ASSISTANT HANDLERS ---
function handleAssistantSpawnVictim(enemy, sharedState, _target, _attack, _ctx) {
  // First try empty slots, then overlay non-enemy cards (but NOT other enemies)
  let spawnIndex = sharedState.zoneCards.findIndex((c) => c === null);
  let overlayedCard = null;

  if (spawnIndex === -1) {
    // No empty slot - try to find a non-enemy card to overlay
    spawnIndex = sharedState.zoneCards.findIndex((c) => c && c.type !== 'enemy');
    if (spawnIndex !== -1) {
      overlayedCard = sharedState.zoneCards[spawnIndex];
    }
  }

  if (spawnIndex !== -1) {
    const newVictim = {
      ...gameData.specialCards.humanVictim,
      id: Date.now(),
      debuffs: [],
      buffs: [],
      turnsUntilConsumed: 2,
      overlayedCard: overlayedCard, // Store original card to restore on death
    };
    sharedState.zoneCards[spawnIndex] = newVictim;
    if (overlayedCard) {
      sharedState.log.push({
        message: `The Assistant drags in a helpless Human Victim from the ${overlayedCard.name}! The Vampire will consume them in 2 turns!`,
        type: 'reaction',
      });
    } else {
      sharedState.log.push({
        message: `The Assistant drags in a helpless Human Victim! The Vampire will consume them in 2 turns!`,
        type: 'reaction',
      });
    }
  } else {
    sharedState.log.push({ message: `The Assistant tries to bring in a victim, but there's no room!`, type: 'info' });
  }
  return { handled: true };
}

// --- HUMAN VICTIM HANDLERS ---
function handleHumanVictimCountdown(enemy, sharedState, _target, _attack, _ctx) {
  if (typeof enemy.turnsUntilConsumed === 'undefined') enemy.turnsUntilConsumed = 2;
  enemy.turnsUntilConsumed--;

  if (enemy.turnsUntilConsumed <= 0) {
    // Vampire consumes the victim
    const vampire = sharedState.zoneCards.find((c) => c && c.name === 'Vampire');
    if (vampire) {
      const healAmount = 20;
      vampire.health = Math.min(vampire.maxHealth, vampire.health + healAmount);
      sharedState.log.push({
        message: `The Vampire consumes the Human Victim and heals for ${healAmount} HP!`,
        type: 'heal',
      });
    }
    // Signal to remove the victim
    return { handled: true, removeEnemy: true };
  } else {
    sharedState.log.push({
      message: `The Human Victim whimpers helplessly... (${enemy.turnsUntilConsumed} turns until consumed)`,
      type: 'info',
    });
  }
  return { handled: true };
}

// --- LOOT GOBLIN HANDLERS ---
function handleLootGoblinPickpocket(enemy, sharedState, _target, _attack, ctx) {
  const { io } = ctx;
  const alivePlayers = sharedState.partyMemberStates.filter((p) => !p.isDead);
  if (alivePlayers.length > 0) {
    const victim = alivePlayers[Math.floor(Math.random() * alivePlayers.length)];
    const victimPlayer = players[victim.name];
    if (victimPlayer && victimPlayer.character) {
      const stealAmount = Math.min(rollD20(), victimPlayer.character.gold);
      if (stealAmount > 0) {
        victimPlayer.character.gold -= stealAmount;
        enemy.stolenGold = (enemy.stolenGold || 0) + stealAmount;
        sharedState.log.push({
          message: `The Loot Goblin steals ${stealAmount}g from ${victim.name}! (Total stolen: ${enemy.stolenGold}g)`,
          type: 'damage',
        });
        if (victimPlayer.id) io.to(victimPlayer.id).emit('characterUpdate', victimPlayer.character);
      } else {
        sharedState.log.push({
          message: `The Loot Goblin rummages through ${victim.name}'s pockets but finds nothing!`,
          type: 'info',
        });
      }
    }
  }
  return { handled: true };
}

function handleLootGoblinEscape(enemy, sharedState, _target, _attack, _ctx) {
  const stolenMsg = enemy.stolenGold > 0 ? ` with ${enemy.stolenGold}g of stolen treasure!` : '!';
  sharedState.log.push({ message: `The Loot Goblin escaped${stolenMsg}`, type: 'damage' });
  return { handled: true, removeEnemy: true };
}

// --- RAGING BULL HANDLERS ---
function handleRagingBullThickHide(enemy, sharedState, target, _attack, ctx) {
  const { targetPlayerObject } = ctx;
  const targetPlayerState = target;

  const hasThickHide = enemy.buffs && enemy.buffs.some((b) => b.type === 'Thick Hide');
  if (hasThickHide || enemy.usedThickHideThisTurn) {
    // Already has the buff or used it this turn - do a Charge attack instead
    sharedState.log.push({ message: `${enemy.name} roars and Charges!`, type: 'reaction' });

    let damageToDeal = 3;
    const bonuses = getBonusStatsForPlayer(targetPlayerObject.character, targetPlayerState);
    const resistance = bonuses.physicalResistance || 0;
    damageToDeal = Math.max(1, damageToDeal - resistance);

    applyDamage(targetPlayerState, damageToDeal);
    let attackMessage = `${enemy.name} hits ${targetPlayerState.name} for ${damageToDeal} damage!`;
    if (damageToDeal < 3) {
      attackMessage += ` (${3 - damageToDeal} resisted)`;
    }
    sharedState.log.push({ message: attackMessage, type: 'damage' });
    return { handled: true };
  } else {
    // First time using Thick Hide this turn - apply the buff and reroll
    if (!enemy.buffs) enemy.buffs = [];
    const buff = { type: 'Thick Hide', duration: 2, bonus: { physicalResistance: 1 } };

    enemy.buffs = enemy.buffs.filter((b) => b.type !== 'Thick Hide');
    enemy.buffs.push(buff);
    enemy.usedThickHideThisTurn = true;

    return { handled: true, rerollAttack: true };
  }
}

// --- ANGRY ROOSTER HANDLERS ---
function handleAngryRoosterEnrage(enemy, sharedState, _target, _attack, _ctx) {
  if (!enemy.buffs) enemy.buffs = [];
  // Remove existing Enraged buff if present to reset duration
  enemy.buffs = enemy.buffs.filter((b) => b.type !== 'Enraged');
  enemy.buffs.push({ type: 'Enraged', duration: 3, extraAttacks: 1 });
  sharedState.log.push({
    message: `The Angry Rooster becomes ENRAGED! It will make 2 attacks each turn for 3 turns!`,
    type: 'reaction',
  });
  return { handled: true };
}

// --- FILL KEGS SPECIAL (Pulvis Cadus) ---
function handlePulvisFillKegs(enemy, sharedState, _target, _attack, _ctx) {
  const emptyIndices = sharedState.zoneCards
    .map((card, idx) => (card === null || (card && (card.allowSpawnOver || card.type === 'area')) ? idx : -1))
    .filter((idx) => idx !== -1);
  emptyIndices.forEach((idx) => {
    const kegCard = { ...gameData.specialCards.powderKeg };
    kegCard.id = Date.now() + idx;
    kegCard.debuffs = [];
    kegCard.kegTimer = 2; // Add timer for consistency
    kegCard.overlayedCard = sharedState.zoneCards[idx] !== null ? sharedState.zoneCards[idx] : null;
    sharedState.zoneCards[idx] = kegCard;
  });
  if (emptyIndices.length > 0) {
    sharedState.log.push({ message: `Unstable kegs fill the empty spaces!`, type: 'reaction' });
  }
  return { handled: true };
}

/**
 * Registry of special enemy action handlers
 * Maps enemy name -> message pattern -> handler function
 */
export const EnemySpecialHandlers = {
  'The Rat King': {
    'rat appears': handleRatKingSummon,
  },
  'Gorbon the Goblin King': {
    'rallies his minions': handleGorbonRally,
  },
  'Goblin Shaman': {
    'heals an ally': handleGoblinShamanHeal,
  },
  'Pulvis Cadus': {
    'A Quick Fix!': handlePulvisQuickFix,
    'unstable kegs': handlePulvisUnstableKegs,
    kegs: handlePulvisFillKegs, // Special action variant
  },
  'Powder Keg': {
    fizzes: handlePowderKegDetonate,
  },
  'Angry Farmhand': {
    'weighs his options': handleFarmhandTactics,
  },
  'Vexor, Lord of the Arena': {
    'biggest threat': handleVexorSlash,
    'weakest foe': handleVexorShieldBash,
    'taunts his enemies': handleVexorTaunt,
    Whirlwind: handleVexorWhirlwind,
  },
  'Black Widow': {
    Consume: handleBlackWidowConsume,
  },
  'Gray Wolf': {
    Howl: handleGrayWolfHowl,
  },
  Vampire: {
    'Take Flight': handleVampireTakeFlight,
    'Blood Fountain': handleVampireBloodFountain,
    // 'From The Shadows': handleVampireFromTheShadows // Handled in adventure-state.js for reaction logic
  },
  "Vampire's Assistant": {
    'human victim': handleAssistantSpawnVictim,
  },
  'Human Victim': {
    dying: handleHumanVictimCountdown,
  },
  'Loot Goblin': {
    Pickpocket: handleLootGoblinPickpocket,
    escapes: handleLootGoblinEscape,
  },
  'Raging Bull': {
    'Thick Hide': handleRagingBullThickHide,
  },
  'Angry Rooster': {
    Enrage: handleAngryRoosterEnrage,
  },
  'BB Rhino': {
    'Daze and Stun': handleRhinoDazeStun,
    'remove all Threat': handleRhinoClearThreat,
    'Stun to all Players': handleRhinoAoEStun,
    'Daze to the Player': handleRhinoDazeStun, // Fallback for the simpler daze version
  },
  'BB Tiger': {
    'Bleed to the Player': handleTigerBleed,
    'Heals self or Rhino': handleTigerHeal,
    'Deal 4 Physical Damage and Stun': handleTigerStun,
  },
};
// --- BB RHINO HANDLERS ---
function handleRhinoDazeStun(enemy, sharedState, _target, attack, ctx) {
  const alivePlayers = sharedState.partyMemberStates.filter((p) => !p.isDead);
  if (alivePlayers.length > 0) {
    const sortedPlayers = [...alivePlayers].sort((a, b) => (b.threat || 0) - (a.threat || 0));
    const targetPlayer = sortedPlayers[0];
    const playerObj = ctx.players[targetPlayer.name];
    if (playerObj) {
      const bonuses = getBonusStatsForPlayer(playerObj.character, targetPlayer);
      const resistance = bonuses.physicalResistance || 0;
      const damage = Math.max(1, 4 + (enemy.arenaDamageBonus || 0) - resistance);
      applyDamage(targetPlayer, damage);

      if (!targetPlayer.debuffs) targetPlayer.debuffs = [];
      // Check if stun is mentioned in message
      if (attack.message.includes('Stun')) {
        targetPlayer.debuffs.push({ type: 'stun', duration: 1 });
        sharedState.log.push({
          message: `BB Rhino charges ${targetPlayer.name} for ${damage} Physical damage, Dazing and Stunning them!`,
          type: 'damage',
        });
      } else {
        sharedState.log.push({
          message: `BB Rhino charges ${targetPlayer.name} for ${damage} Physical damage and Dazes them!`,
          type: 'damage',
        });
      }
      targetPlayer.debuffs.push({ type: 'daze', duration: 2 });

      if (targetPlayer.health <= 0) {
        targetPlayer.isDead = true;
        targetPlayer.health = 0;
      }
    }
  }
  return { handled: true };
}

function handleRhinoClearThreat(enemy, sharedState, _target, _attack, ctx) {
  const alivePlayers = sharedState.partyMemberStates.filter((p) => !p.isDead);
  if (alivePlayers.length > 0) {
    const sortedPlayers = [...alivePlayers].sort((a, b) => (b.threat || 0) - (a.threat || 0));
    const targetPlayer = sortedPlayers[0];
    const playerObj = ctx.players[targetPlayer.name];
    if (playerObj) {
      const bonuses = getBonusStatsForPlayer(playerObj.character, targetPlayer);
      const resistance = bonuses.physicalResistance || 0;
      const damage = Math.max(1, 5 + (enemy.arenaDamageBonus || 0) - resistance);
      applyDamage(targetPlayer, damage);

      setThreat(targetPlayer, 0);

      sharedState.log.push({
        message: `BB Rhino slams ${targetPlayer.name} for ${damage} Physical damage and removes all their threat!`,
        type: 'damage',
      });
      if (targetPlayer.health <= 0) {
        targetPlayer.isDead = true;
        targetPlayer.health = 0;
      }
    }
  }
  return { handled: true };
}

function handleRhinoAoEStun(enemy, sharedState, _target, _attack, ctx) {
  sharedState.partyMemberStates.forEach((p) => {
    if (!p.isDead) {
      const playerObj = ctx.players[p.name];
      if (playerObj) {
        const bonuses = getBonusStatsForPlayer(playerObj.character, p);
        const resistance = bonuses.physicalResistance || 0;
        const damage = Math.max(1, 5 + (enemy.arenaDamageBonus || 0) - resistance);
        applyDamage(p, damage);

        if (!p.debuffs) p.debuffs = [];
        p.debuffs.push({ type: 'stun', duration: 1 });

        sharedState.log.push({
          message: `BB Rhino's ground slam hits ${p.name} for ${damage} Physical damage and STUNS them!`,
          type: 'damage',
        });
        if (p.health <= 0) {
          p.isDead = true;
          p.health = 0;
        }
      }
    }
  });
  return { handled: true };
}

// --- BB TIGER HANDLERS ---
function handleTigerBleed(enemy, sharedState, _target, _attack, ctx) {
  const alivePlayers = sharedState.partyMemberStates.filter((p) => !p.isDead);
  if (alivePlayers.length > 0) {
    const sortedPlayers = [...alivePlayers].sort((a, b) => (b.threat || 0) - (a.threat || 0));
    const targetPlayer = sortedPlayers[0];
    const playerObj = ctx.players[targetPlayer.name];
    if (playerObj) {
      const bonuses = getBonusStatsForPlayer(playerObj.character, targetPlayer);
      const resistance = bonuses.physicalResistance || 0;
      const damage = Math.max(1, 3 + (enemy.arenaDamageBonus || 0) - resistance);
      applyDamage(targetPlayer, damage);

      const roundCount = sharedState.arenaState?.round || 1;
      const bleedDamage = 1 + (roundCount - 1); // scaling bleed

      if (!targetPlayer.debuffs) targetPlayer.debuffs = [];
      targetPlayer.debuffs.push({ type: 'bleed', duration: 3, damage: bleedDamage, damageType: 'Physical' });

      sharedState.log.push({
        message: `BB Tiger lunges at ${targetPlayer.name} for ${damage} Physical damage and causes Bleeding (${bleedDamage})!`,
        type: 'damage',
      });
      if (targetPlayer.health <= 0) {
        targetPlayer.isDead = true;
        targetPlayer.health = 0;
      }
    }
  }
  return { handled: true };
}

function handleTigerHeal(enemy, sharedState, _target, _attack, _ctx) {
  const rhino = sharedState.zoneCards.find((c) => c && c.name === 'BB Rhino');
  const roundCount = sharedState.arenaState?.round || 1;
  const healAmount = 5 + roundCount;

  let healTarget = null;
  if (rhino && rhino.health > 0) {
    if (enemy.health < rhino.health) {
      healTarget = enemy;
    } else {
      healTarget = rhino;
    }
  } else {
    healTarget = enemy;
  }

  if (healTarget) {
    const oldHealth = healTarget.health;
    healTarget.health = Math.min(healTarget.maxHealth, healTarget.health + healAmount);
    const actualHeal = healTarget.health - oldHealth;
    sharedState.log.push({
      message: `BB Tiger heals ${healTarget.name === enemy.name ? 'itself' : healTarget.name} for ${actualHeal} HP!`,
      type: 'heal',
    });
  }
  return { handled: true };
}

function handleTigerStun(enemy, sharedState, _target, _attack, ctx) {
  const alivePlayers = sharedState.partyMemberStates.filter((p) => !p.isDead);
  if (alivePlayers.length > 0) {
    const sortedPlayers = [...alivePlayers].sort((a, b) => (b.threat || 0) - (a.threat || 0));
    const targetPlayer = sortedPlayers[0];
    const playerObj = ctx.players[targetPlayer.name];
    if (playerObj) {
      const bonuses = getBonusStatsForPlayer(playerObj.character, targetPlayer);
      const resistance = bonuses.physicalResistance || 0;
      const damage = Math.max(1, 4 + (enemy.arenaDamageBonus || 0) - resistance);
      applyDamage(targetPlayer, damage);

      if (!targetPlayer.debuffs) targetPlayer.debuffs = [];
      targetPlayer.debuffs.push({ type: 'stun', duration: 1 });

      sharedState.log.push({
        message: `BB Tiger swipes ${targetPlayer.name} for ${damage} Physical damage and STUNS them!`,
        type: 'damage',
      });
      if (targetPlayer.health <= 0) {
        targetPlayer.isDead = true;
        targetPlayer.health = 0;
      }
    }
  }
  return { handled: true };
}
/**
 * Main dispatch function - finds and executes the appropriate handler
 * @param {Object} enemy - The enemy card
 * @param {Object} sharedState - Party shared state
 * @param {Object} targetPlayerState - The target player state (may be null for some actions)
 * @param {Object} attack - The attack object from the roll
 * @param {Object} ctx - Additional context (io, party, enemyIndex, targetPlayerObject, etc.)
 * @returns {Object} Handler result with flags: { handled, skipEndOfTurn, removeEnemy, rerollAttack }
 */
export function handleEnemySpecialAction(enemy, sharedState, targetPlayerState, attack, ctx) {
  if (!attack || !attack.message) {
    return { handled: false };
  }

  const handlers = EnemySpecialHandlers[enemy.name];
  if (!handlers) {
    return { handled: false };
  }

  // Find matching handler by checking if attack message contains the pattern
  for (const [pattern, handler] of Object.entries(handlers)) {
    if (attack.message.includes(pattern)) {
      return handler(enemy, sharedState, targetPlayerState, attack, ctx);
    }
  }

  return { handled: false };
}

/**
 * Process end-of-turn effects for an enemy (DOT damage and buff/debuff duration)
 * @param {Object} enemy - The enemy card
 * @param {Object} sharedState - Party shared state
 * @returns {boolean} True if enemy died from DOT effects
 */
export function processEnemyEndOfTurn(enemy, sharedState) {
  if (!enemy || enemy.health <= 0) return true;

  // Process DOT effects using shared function
  applyDoTEffects(enemy, sharedState.log);

  // Check if enemy died from DOT
  if (enemy.health <= 0) {
    return true;
  }

  // Decrement buff/debuff durations
  if (enemy.buffs) {
    enemy.buffs.forEach((b) => b.duration--);
    enemy.buffs = enemy.buffs.filter((b) => b.duration > 0);
  }
  if (enemy.debuffs) {
    enemy.debuffs.forEach((d) => d.duration--);
    enemy.debuffs = enemy.debuffs.filter((d) => d.duration > 0);
  }

  // Decrement enemy reaction cooldowns
  decrementEnemyReactionCooldowns(enemy);

  return false;
}
