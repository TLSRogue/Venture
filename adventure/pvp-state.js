// adventure/pvp-state.js
/**
 * PvP and Duel encounter state management.
 * Handles all PvP-specific logic including encounter lifecycle, turns, and player deaths.
 */

import { players, parties, pvpEncounters } from '../serverState.js';
import { broadcastAdventureUpdate } from '../utilsBroadcast.js';
import { createStateForClient, getBonusStatsForPlayer } from '../utilsHelpers.js';
import { applyDamage, applyDoTEffects, processEndOfTurnEffects } from './combat-core.js';
import { PVP_TURN_DURATION_MS, INVENTORY_SIZE, DEFAULT_ACTION_POINTS } from '../constants.js';
import * as PartyManager from '../party/party-manager.js';
import { processZoneEffects } from './adventure-state.js';

/**
 * Handle player death in PvP combat.
 * Strips inventory/equipment in non-duel PvP and adds to ground loot.
 */
export function handlePvpPlayerDeath(io, defeatedPlayer, encounter) {
    const character = defeatedPlayer.character;

    // Skip loot stripping for duels
    if (encounter.isDuel) {
        encounter.log.push({ message: `${character.characterName} has been defeated!`, type: 'damage' });
        return;
    }

    const allLoot = [...character.inventory.filter(Boolean)];
    for (const slot in character.equipment) {
        if (character.equipment[slot]) {
            if (slot === 'offHand' && character.equipment[slot] === character.equipment.mainHand) {
                continue;
            }
            allLoot.push(character.equipment[slot]);
        }
    }

    encounter.groundLoot.push(...allLoot);

    character.inventory = Array(INVENTORY_SIZE).fill(null);
    character.equipment = { mainHand: null, offHand: null, helmet: null, armor: null, boots: null, accessory: null, ammo: null };

    io.to(defeatedPlayer.id).emit('characterUpdate', character);
    encounter.log.push({ message: `${character.characterName} has been slain and dropped all of their items!`, type: 'damage' });
}

/**
 * Check if a team has won the PvP encounter.
 * Returns true if the encounter ended.
 */
export function checkPvpWinCondition(io, encounter, defeatedPlayerState) {
    const opponentTeam = defeatedPlayerState.team === 'A' ? 'B' : 'A';
    const teammates = encounter.playerStates.filter(p => p.team === defeatedPlayerState.team);
    const allTeammatesDead = teammates.every(p => p.isDead);

    if (allTeammatesDead) {
        encounter.log.push({ message: "All opponents have been defeated! You are victorious!", type: 'success' });
        const winningParty = (opponentTeam === 'A') ? parties[encounter.partyAId] : parties[encounter.partyBId];
        const losingParty = (opponentTeam === 'A') ? parties[encounter.partyBId] : parties[encounter.partyAId];

        // Safety check if parties exist (they might have disconnected)
        if (winningParty && losingParty) {
            endPvpEncounter(io, winningParty, losingParty);
        } else {
            // Fallback cleanup if a party is missing
            delete pvpEncounters[encounter.id];
        }
        return true;
    }
    return false;
}

/**
 * End a PvP encounter and clean up state.
 */
export function endPvpEncounter(io, winningParty, losingParty) {
    const encounterId = winningParty.sharedState.pvpEncounterId;
    const encounter = pvpEncounters[encounterId];

    if (encounter && encounter.turnTimerId) {
        clearTimeout(encounter.turnTimerId);
    }

    const isDuel = encounter?.isDuel || false;

    if (encounterId) {
        delete pvpEncounters[encounterId];
    }

    // For duels, handle differently - no loot/gold, just clean up both sides
    if (isDuel) {
        // Notify winners (no gold reward)
        winningParty.members.forEach(memberName => {
            const memberPlayer = players[memberName];
            if (memberPlayer && memberPlayer.id) {
                io.to(memberPlayer.id).emit('duel:end', { outcome: 'win', reward: null, finalLog: encounter.log });
                io.to(memberPlayer.id).emit('party:adventureEnded', { finalLog: encounter.log });
            }
        });

        // Notify losers
        losingParty.members.forEach(memberName => {
            const memberPlayer = players[memberName];
            if (memberPlayer && memberPlayer.id) {
                io.to(memberPlayer.id).emit('duel:end', { outcome: 'loss', reward: null, finalLog: encounter.log });
                io.to(memberPlayer.id).emit('party:adventureEnded', { finalLog: encounter.log });
            }
        });

        // Clean up duel parties via centralized party manager
        [winningParty, losingParty].forEach(party => {
            party.members.forEach(memberName => {
                const memberPlayer = players[memberName];
                if (memberPlayer?.character) {
                    memberPlayer.character.duelId = null;
                }
            });
            PartyManager.disbandParty(io, party.id);
        });

        return;
    }

    // Normal PvP handling (non-duel)
    losingParty.members.forEach(memberName => {
        const memberPlayer = players[memberName];
        if (memberPlayer && memberPlayer.id) {
            io.to(memberPlayer.id).emit('party:adventureEnded', { outcome: 'loss', message: 'Your party was defeated by another player!', finalLog: encounter.log });
        }
    });

    if (losingParty.isSoloParty) {
        PartyManager.cleanupSoloParty(io, losingParty);
    } else {
        PartyManager.endPartyAdventure(io, losingParty.id);
    }

    const { sharedState } = winningParty;
    sharedState.pvpEncounterId = null;
    sharedState.zoneCards = [];
    sharedState.log.push({ message: "Combat has ended! You may now loot the spoils of victory.", type: 'success' });

    sharedState.partyMemberStates.forEach(p => {
        if (!p.isDead) {
            p.actionPoints = DEFAULT_ACTION_POINTS;
            p.turnEnded = false;
        }
    });

    broadcastAdventureUpdate(io, winningParty);
}

/**
 * End a duel encounter specifically (for surrender scenarios).
 * Exported for use by duel handlers.
 */
export function endDuelEncounter(io, winningParty, losingParty, encounter) {
    if (encounter && encounter.turnTimerId) {
        clearTimeout(encounter.turnTimerId);
    }

    if (encounter?.id) {
        delete pvpEncounters[encounter.id];
    }

    // Notify winners (no gold reward)
    winningParty.members.forEach(memberName => {
        const memberPlayer = players[memberName];
        if (memberPlayer && memberPlayer.id) {
            io.to(memberPlayer.id).emit('duel:end', { outcome: 'win', reward: null, finalLog: encounter.log });
            io.to(memberPlayer.id).emit('party:adventureEnded', { finalLog: encounter.log });
        }
    });

    // Notify losers
    losingParty.members.forEach(memberName => {
        const memberPlayer = players[memberName];
        if (memberPlayer && memberPlayer.id) {
            io.to(memberPlayer.id).emit('duel:end', { outcome: 'loss', reward: null, finalLog: encounter.log });
            io.to(memberPlayer.id).emit('party:adventureEnded', { finalLog: encounter.log });
        }
    });

    // Clean up duel parties via centralized party manager
    [winningParty, losingParty].forEach(party => {
        party.members.forEach(memberName => {
            const memberPlayer = players[memberName];
            if (memberPlayer?.character) {
                memberPlayer.character.duelId = null;
            }
        });
        PartyManager.disbandParty(io, party.id);
    });
}

/**
 * Start a PvP encounter between two parties.
 */
export function startPvpEncounter(io, partyA, partyB, isDuel = false) {
    if (!partyA.sharedState || !partyB.sharedState) {
        console.error("Attempted to start PvP encounter with a party that is missing a sharedState.");
        return;
    }

    partyA.sharedState.isLoadingNextArea = false;
    partyB.sharedState.isLoadingNextArea = false;

    const encounterId = `PVP-${Date.now()}`;
    const startingTeam = Math.random() < 0.5 ? 'A' : 'B';

    const createPlayerStatesForTeam = (party, team) => {
        return party.sharedState.partyMemberStates.map(p => ({
            ...p,
            team,
            actionPoints: (team === startingTeam) ? 1 : 3
        }));
    };

    const playerStatesA = createPlayerStatesForTeam(partyA, 'A');
    const playerStatesB = createPlayerStatesForTeam(partyB, 'B');

    const duration = PVP_TURN_DURATION_MS;
    const timerEndsAt = Date.now() + duration;

    const timerId = setTimeout(() => {
        const currentEncounter = pvpEncounters[encounterId];
        if (currentEncounter) {
            currentEncounter.log.push({ message: `Team ${currentEncounter.activeTeam}'s time expired! Turn ends.`, type: 'damage' });
            currentEncounter.playerStates.forEach(p => {
                if (p.team === currentEncounter.activeTeam && !p.isDead) p.turnEnded = true;
            });
            startNextPvpTeamTurn(io, encounterId);
        }
    }, duration);

    const encounterState = {
        id: encounterId,
        partyAId: partyA.id,
        partyBId: partyB.id,
        playerStates: [...playerStatesA, ...playerStatesB],
        activeTeam: startingTeam,
        groundLoot: [],
        isDuel: isDuel,
        log: [
            { message: isDuel ? `Duel has begun!` : `You have encountered an opposing party! Battle begins!`, type: 'damage' },
            { message: `Team ${startingTeam} will go first, but with only 1 AP!`, type: 'info' }
        ],
        turnTimerEndsAt: timerEndsAt,
        turnTimerDuration: duration,
        turnTimerId: timerId,
        pendingReaction: null
    };

    pvpEncounters[encounterId] = encounterState;

    partyA.sharedState.pvpEncounterId = encounterId;
    partyB.sharedState.pvpEncounterId = encounterId;

    partyA.sharedState.zoneCards = [];
    partyB.sharedState.zoneCards = [];
    partyA.sharedState.groundLoot = encounterState.groundLoot;
    partyB.sharedState.groundLoot = encounterState.groundLoot;
    partyA.sharedState.log = encounterState.log;
    partyB.sharedState.log = encounterState.log;
    // Share zoneEffects between both parties so either team's Blizzard is visible to all
    const sharedZoneEffects = [];
    partyA.sharedState.zoneEffects = sharedZoneEffects;
    partyB.sharedState.zoneEffects = sharedZoneEffects;

    const stateForClients = createStateForClient(partyA.sharedState, encounterState);

    // ** BUG FIX: Include partyId in the state sent to each party's members **
    // Without partyId, the client-side combat.js won't emit actions because it checks gameState.partyId
    partyA.members.forEach(memberName => {
        const member = players[memberName];
        if (member && member.id) {
            io.to(member.id).emit('party:adventureStarted', { ...stateForClients, partyId: partyA.id });
        }
    });
    partyB.members.forEach(memberName => {
        const member = players[memberName];
        if (member && member.id) {
            io.to(member.id).emit('party:adventureStarted', { ...stateForClients, partyId: partyB.id });
        }
    });
}

/**
 * Start the next PvP team's turn.
 */
export function startNextPvpTeamTurn(io, encounterId) {
    const encounter = pvpEncounters[encounterId];
    if (!encounter) return;

    if (encounter.turnTimerId) {
        clearTimeout(encounter.turnTimerId);
        encounter.turnTimerId = null;
    }

    // 1. Force End Turn for Stragglers (Timeout)
    encounter.playerStates.forEach(p => {
        if (p.team === encounter.activeTeam && !p.turnEnded && !p.isDead) {
            processPvpPlayerEndTurn(io, encounter, p);
        }
    });

    // Process zone effects (e.g., Blizzard) between turns
    const party = parties[encounter.partyAId];
    if (party) {
        processZoneEffects(io, party, encounter, encounter.activeTeam);
    }

    const nextTeam = encounter.activeTeam === 'A' ? 'B' : 'A';
    encounter.activeTeam = nextTeam;
    encounter.log.push({ message: `--- Team ${nextTeam}'s Turn ---`, type: 'info' });

    encounter.playerStates.forEach(p => {
        if (p.team === nextTeam) {
            if (!p.isDead) {
                p.turnEnded = false;
                // Check for Stun - reduces AP by 1
                const stunDebuff = p.debuffs.find(d => d.type === 'stun');
                if (stunDebuff) {
                    p.actionPoints = DEFAULT_ACTION_POINTS - 1; // Lose 1 AP due to stun
                    encounter.log.push({ message: `${p.name} is stunned and starts with reduced Action Points!`, type: 'reaction' });
                } else {
                    p.actionPoints = DEFAULT_ACTION_POINTS;
                }
            }
            // Cooldowns decrement at Start of Turn
            Object.keys(p.weaponCooldowns).forEach(k => { if (p.weaponCooldowns[k] > 0) p.weaponCooldowns[k]--; });
            Object.keys(p.spellCooldowns).forEach(k => { if (p.spellCooldowns[k] > 0) p.spellCooldowns[k]--; });
            Object.keys(p.itemCooldowns).forEach(k => { if (p.itemCooldowns[k] > 0) p.itemCooldowns[k]--; });
        }
    });

    const duration = PVP_TURN_DURATION_MS;
    const timerEndsAt = Date.now() + duration;

    encounter.turnTimerId = setTimeout(() => {
        const currentEncounter = pvpEncounters[encounterId];
        if (currentEncounter) {
            currentEncounter.log.push({ message: `Team ${nextTeam}'s time expired! Turn ends.`, type: 'damage' });
            currentEncounter.playerStates.forEach(p => {
                if (p.team === nextTeam && !p.isDead) p.turnEnded = true;
            });
            startNextPvpTeamTurn(io, encounterId);
        }
    }, duration);

    encounter.turnTimerEndsAt = timerEndsAt;
    encounter.turnTimerDuration = duration;

    broadcastAdventureUpdate(io, parties[encounter.partyAId]);
}

/**
 * Process end of turn for a PvP player (DoT, buff/debuff decrements).
 */
export async function processPvpPlayerEndTurn(io, encounter, playerState) {
    if (!playerState || playerState.turnEnded) return;

    // UNIFIED: Use shared end-of-turn effects
    processEndOfTurnEffects(playerState, encounter.log);

    // PvP: Rejuvenate healing
    const rejuvenateBuff = (playerState.buffs || []).find(b => b.type === 'Rejuvenate');
    if (rejuvenateBuff && !playerState.isDead) {
        const playerChar = players[playerState.name]?.character;
        if (playerChar) {
            const bonuses = getBonusStatsForPlayer(playerChar, playerState);
            const healAmount = Number(rejuvenateBuff.healAmount || Math.max(1, 1 + (bonuses.naturePower || 0)));
            const currentHealth = Number(playerState.health || 0);
            const maxHealth = Number(playerState.maxHealth || 10);
            playerState.health = Math.min(maxHealth, currentHealth + (isNaN(healAmount) ? 0 : healAmount));
            encounter.log.push({ message: `${playerState.name}'s Rejuvenate heals for ${healAmount} HP.`, type: 'heal' });

            const playerObj = players[playerState.name];
            if (playerObj && playerObj.id) io.to(playerObj.id).emit('characterUpdate', playerChar);
        }
    }

    // Check Death
    if (playerState.health <= 0) {
        playerState.health = 0;
        playerState.isDead = true;
        encounter.log.push({ message: `${playerState.name} has succumbed to their wounds!`, type: 'damage' });

        const defeatedPlayerObject = players[playerState.name];
        if (defeatedPlayerObject) {
            handlePvpPlayerDeath(io, defeatedPlayerObject, encounter);
        }
        checkPvpWinCondition(io, encounter, playerState);
    }

    playerState.turnEnded = true;
}

/**
 * Apply DoT effects to a player state (PvP version).
 */
// applyDoTEffects is now imported from combat-core.js
