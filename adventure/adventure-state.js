// adventure/adventure-state.js

import { players, parties, pvpZoneQueues, pvpEncounters } from '../serverState.js';
import { gameData } from '../data/index.js';
import { broadcastAdventureUpdate, broadcastPartyUpdate } from '../utilsBroadcast.js';
import { getBonusStatsForPlayer, addItemToInventoryServer, drawCardsForServer, createStateForClient } from '../utilsHelpers.js';
import { applyDamage } from './combat-core.js';
import { PVP_TURN_DURATION_MS, LOOT_ROLL_DURATION_MS, REACTION_TIMER_MS, PVP_QUEUE_TIMEOUT_MS } from '../constants.js';
import * as PartyManager from '../party/party-manager.js';

const PVP_ZONES = ['blighted_wastes'];

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

    character.inventory = Array(28).fill(null);
    character.equipment = { mainHand: null, offHand: null, helmet: null, armor: null, boots: null, accessory: null, ammo: null };

    io.to(defeatedPlayer.id).emit('characterUpdate', character);
    encounter.log.push({ message: `${character.characterName} has been slain and dropped all of their items!`, type: 'damage' });
}

function checkPvpWinCondition(io, encounter, defeatedPlayerState) {
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

function endPvpEncounter(io, winningParty, losingParty) {
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
                io.to(memberPlayer.id).emit('duel:end', { outcome: 'win', reward: null });
                io.to(memberPlayer.id).emit('party:adventureEnded');
            }
        });

        // Notify losers
        losingParty.members.forEach(memberName => {
            const memberPlayer = players[memberName];
            if (memberPlayer && memberPlayer.id) {
                io.to(memberPlayer.id).emit('duel:end', { outcome: 'loss', reward: null });
                io.to(memberPlayer.id).emit('party:adventureEnded');
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
            io.to(memberPlayer.id).emit('party:adventureEnded');
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
            p.actionPoints = 3;
            p.turnEnded = false;
        }
    });

    broadcastAdventureUpdate(io, winningParty);
}

// Exported version specifically for duel surrender - handles timer cleanup and ending
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
            io.to(memberPlayer.id).emit('duel:end', { outcome: 'win', reward: null });
            io.to(memberPlayer.id).emit('party:adventureEnded');
        }
    });

    // Notify losers
    losingParty.members.forEach(memberName => {
        const memberPlayer = players[memberName];
        if (memberPlayer && memberPlayer.id) {
            io.to(memberPlayer.id).emit('duel:end', { outcome: 'loss', reward: null });
            io.to(memberPlayer.id).emit('party:adventureEnded');
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
                    p.actionPoints = 2; // 3 - 1 = 2 AP due to stun
                    encounter.log.push({ message: `${p.name} is stunned and starts with reduced Action Points!`, type: 'reaction' });
                } else {
                    p.actionPoints = 3;
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

export function determineLootWinnerAndDistribute(io, partyId) {
    const party = parties[partyId];
    if (!party || !party.sharedState || !party.sharedState.pendingLootRoll) {
        return;
    }
    const rollData = party.sharedState.pendingLootRoll;
    let winner = null;
    const needRolls = rollData.rolls.filter(r => r.choice === 'need');
    const greedRolls = rollData.rolls.filter(r => r.choice === 'greed');
    if (needRolls.length > 0) {
        winner = needRolls.reduce((highest, current) => (current.roll > highest.roll ? current : highest), needRolls[0]);
    } else if (greedRolls.length > 0) {
        winner = greedRolls.reduce((highest, current) => (current.roll > highest.roll ? current : highest), greedRolls[0]);
    }
    if (winner) {
        const winnerPlayer = players[winner.playerName];
        if (winnerPlayer && addItemToInventoryServer(winnerPlayer.character, rollData.item, 1, party.sharedState.groundLoot)) {
            party.sharedState.log.push({ message: `${winner.playerName} won ${rollData.item.name} with a roll of ${winner.roll} (${winner.choice}).`, type: 'success' });
            io.to(winnerPlayer.id).emit('characterUpdate', winnerPlayer.character);
        } else if (winnerPlayer) {
            party.sharedState.log.push({ message: `${winner.playerName} won ${rollData.item.name}, but their inventory was full! The item was dropped on the ground.`, type: 'damage' });
        }
    } else {
        party.sharedState.log.push({ message: `Nobody rolled for ${rollData.item.name}.`, type: 'info' });
    }
    party.sharedState.pendingLootRoll = null;
    party.members.forEach(memberName => {
        const member = players[memberName];
        if (member && member.id) {
            io.to(member.id).emit('party:lootRollEnded');
        }
    });
}

export async function checkAndEndTurnForPlayer(io, party, player) {
    const { sharedState } = party;
    if (sharedState.pvpEncounterId) {
        const encounter = pvpEncounters[sharedState.pvpEncounterId];
        if (!encounter) return;
        const actingPlayerState = encounter.playerStates.find(p => p.playerId === player.id);
        if (actingPlayerState && actingPlayerState.actionPoints <= 0 && !actingPlayerState.turnEnded) {
            actingPlayerState.turnEnded = true;
            encounter.log.push({ message: `${player.character.characterName} is out of Action Points and their turn ends.`, type: 'info' });
            const teamMembers = encounter.playerStates.filter(p => p.team === encounter.activeTeam);
            const allTurnsEnded = teamMembers.every(p => p.turnEnded || p.isDead);
            if (allTurnsEnded) {
                startNextPvpTeamTurn(io, encounter.id);
            }
        }
        return;
    }
    const actingPlayerState = sharedState.partyMemberStates.find(p => p.playerId === player.id);
    if (actingPlayerState && actingPlayerState.actionPoints <= 0 && !actingPlayerState.turnEnded) {
        actingPlayerState.turnEnded = true;
        sharedState.log.push({ message: `${player.character.characterName} is out of Action Points and their turn ends.`, type: 'info' });
        const allTurnsEnded = sharedState.partyMemberStates.every(p => p.turnEnded || p.isDead);
        if (allTurnsEnded) {
            await runEnemyPhaseForParty(io, party.id);
        }
    }
}

export function defeatEnemyInParty(io, party, enemy, enemyIndex) {
    const { sharedState } = party;
    if (sharedState.pvpEncounterId) {
        const encounter = pvpEncounters[sharedState.pvpEncounterId];
        if (!encounter) return;
        const defeatedPlayerState = encounter.playerStates.find(p => p.playerId === enemy.playerId);
        if (defeatedPlayerState && !defeatedPlayerState.isDead) {
            defeatedPlayerState.isDead = true;
            const defeatedPlayerObject = players[defeatedPlayerState.name];
            if (defeatedPlayerObject) {
                handlePvpPlayerDeath(io, defeatedPlayerObject, encounter);
            }
            checkPvpWinCondition(io, encounter, defeatedPlayerState);
        }
        return;
    }
    sharedState.log.push({ message: `${enemy.name} has been defeated!`, type: 'success' });
    let lootToDistribute = [];
    if (enemy.lootTable && enemy.lootTable.length > 0) {
        const roll = Math.floor(Math.random() * 20) + 1;
        const lootDrop = enemy.lootTable.find(entry => roll >= entry.range[0] && roll <= entry.range[1]);
        if (lootDrop) {
            if (lootDrop.items && lootDrop.items.length > 0) {
                lootDrop.items.forEach(itemName => {
                    const itemData = gameData.allItems.find(i => i.name === itemName);
                    if (itemData) lootToDistribute.push(itemData);
                });
            }
            if (lootDrop.randomItems && lootDrop.randomItems.pool) {
                for (let i = 0; i < lootDrop.randomItems.count; i++) {
                    const randomItemName = lootDrop.randomItems.pool[Math.floor(Math.random() * lootDrop.randomItems.pool.length)];
                    const itemData = gameData.allItems.find(i => i.name === randomItemName);
                    if (itemData) lootToDistribute.push(itemData);
                }
            }
        }
    }
    if (enemy.guaranteedLoot && enemy.guaranteedLoot.items) {
        enemy.guaranteedLoot.items.forEach(itemName => {
            const itemData = gameData.allItems.find(i => i.name === itemName);
            if (itemData) lootToDistribute.push(itemData);
        });
    }
    lootToDistribute.forEach(itemData => {
        if (itemData.rarity === 'uncommon' || itemData.rarity === 'rare') {
            if (sharedState.pendingLootRoll) {
                sharedState.groundLoot.push(itemData);
                sharedState.log.push({ message: `Found ${itemData.name}, but a roll is in progress. Item dropped to the ground.`, type: 'info' });
            } else {
                sharedState.log.push({ message: `Party found: [${itemData.name}]! A roll will begin.`, type: 'success' });
                sharedState.pendingLootRoll = {
                    item: itemData,
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
        } else {
            party.members.forEach(memberName => {
                const member = players[memberName];
                if (member && member.character) {
                    if (!addItemToInventoryServer(member.character, itemData, 1, sharedState.groundLoot)) {
                        sharedState.log.push({ message: `${itemData.name} dropped, but ${memberName}'s inventory is full! It was left on the ground.`, type: 'damage' });
                    }
                }
            });
            sharedState.log.push({ message: `${enemy.name} dropped: ${itemData.name}! (Distributed to all)`, type: 'success' });
        }
    });
    party.members.forEach(memberName => {
        const member = players[memberName];
        if (!member || !member.character) return;
        const character = member.character;
        character.quests.forEach(quest => {
            if (quest.status === 'active' && (quest.details.target === enemy.name || (quest.details.target === 'Goblin' && enemy.name.includes('Goblin')))) {
                quest.progress++;
                if (quest.progress >= quest.details.required) {
                    quest.status = 'readyToTurnIn';
                    if (member.id) io.to(member.id).emit('questObjectiveComplete', quest.details.title);
                }
            }
        });
        if (enemy.guaranteedLoot && enemy.guaranteedLoot.gold) {
            let goldAmount;
            if (enemy.guaranteedLoot.minGold !== undefined && enemy.guaranteedLoot.maxGold !== undefined) {
                goldAmount = Math.floor(Math.random() * (enemy.guaranteedLoot.maxGold - enemy.guaranteedLoot.minGold + 1)) + enemy.guaranteedLoot.minGold;
            } else {
                goldAmount = (Math.floor(Math.random() * 20) + 1) + (Math.floor(Math.random() * 20) + 1);
            }
            const goldPerPlayer = Math.floor(goldAmount / party.members.length);
            character.gold += goldPerPlayer;
        }
        if (member.id) io.to(member.id).emit('characterUpdate', character);
    });
    if (enemy.guaranteedLoot && enemy.guaranteedLoot.gold) {
        sharedState.log.push({ message: `${enemy.name} dropped gold, which was split among the party.`, type: 'success' });
    }
    sharedState.zoneCards[enemyIndex] = null;
    if (!sharedState.zoneCards.some(c => c && c.type === 'enemy')) {
        sharedState.log.push({ message: "Combat has ended! Action Points restored.", type: "success" });
        sharedState.partyMemberStates.forEach(p => { if (!p.isDead) p.actionPoints = 3; });
    }
}

export async function processEndAdventure(io, player, party) {
    const { sharedState } = party;
    if (!sharedState) return;

    // Check if any party member is trapped - cannot flee while trapped
    const trappedPlayer = sharedState.partyMemberStates?.find(p => !p.isDead && p.debuffs?.some(d => d.type === 'trap'));
    if (trappedPlayer) {
        sharedState.log.push({ message: `${trappedPlayer.name} is trapped and cannot flee!`, type: 'reaction' });
        broadcastAdventureUpdate(io, party);
        return;
    }

    if (sharedState.pvpEncounterId) {
        const encounter = pvpEncounters[sharedState.pvpEncounterId];
        if (!encounter) return;
        const actingPlayerState = encounter.playerStates.find(p => p.playerId === player.id);

        if (actingPlayerState && !actingPlayerState.turnEnded) {
            actingPlayerState.turnEnded = true;
            encounter.log.push({ message: `${player.character.characterName} forfeits their turn to request mercy...`, type: 'reaction' });

            const opponentPartyId = (party.id === encounter.partyAId) ? encounter.partyBId : encounter.partyAId;
            const opponentParty = parties[opponentPartyId];

            if (opponentParty) {
                const opponentLeader = players[opponentParty.leaderId];
                if (opponentLeader && opponentLeader.id) {
                    io.to(opponentLeader.id).emit('party:pvpFleeRequest', { fleeingPartyName: party.id });
                    encounter.log.push({ message: `A plea for mercy has been sent to the opposing party leader.`, type: 'info' });
                }
            }
            broadcastAdventureUpdate(io, party);
        }
        return;
    }

    const endTheAdventure = () => {
        party.members.forEach(memberName => {
            const memberPlayer = players[memberName];
            const memberCharacter = memberPlayer?.character;
            if (memberCharacter) {
                if (!sharedState.partyMemberStates.find(p => p.name === memberName)?.isDead) {
                    const bonuses = getBonusStatsForPlayer(memberCharacter, null);
                    memberCharacter.health = 10 + bonuses.maxHealth;
                }
                if (memberPlayer.id) {
                    io.to(memberPlayer.id).emit('characterUpdate', memberCharacter);
                    io.to(memberPlayer.id).emit('party:adventureEnded');
                }
            }
        });
        if (party.isSoloParty) {
            PartyManager.cleanupSoloParty(io, party, player);
        } else {
            PartyManager.endPartyAdventure(io, party.id);
        }
    };
    const inCombat = sharedState.zoneCards.some(c => c && c.type === 'enemy');
    if (inCombat) {
        sharedState.log.push({ message: "The party tries to flee combat to return home. Enemies get a final attack!", type: 'reaction' });
        broadcastAdventureUpdate(io, party);
        await runEnemyPhaseForParty(io, party.id, true);
        const alivePlayers = sharedState.partyMemberStates.filter(p => p.health > 0);
        if (alivePlayers.length > 0) {
            sharedState.log.push({ message: "They escaped and returned home safely!", type: 'success' });
            endTheAdventure();
        } else {
            sharedState.log.push({ message: "The party was wiped out while trying to return home!", type: 'damage' });
            endTheAdventure();
        }
    } else {
        sharedState.log.push({ message: "The party returns home.", type: 'info' });
        endTheAdventure();
    }
}

export async function processVentureDeeper(io, player, party) {
    if (player.character.characterName !== party.leaderId || !party.sharedState) return;
    const { sharedState } = party;
    const zoneName = sharedState.currentZone;

    // Check if any party member is trapped - cannot flee while trapped
    const trappedPlayer = sharedState.partyMemberStates?.find(p => !p.isDead && p.debuffs?.some(d => d.type === 'trap'));
    if (trappedPlayer) {
        sharedState.log.push({ message: `${trappedPlayer.name} is trapped and cannot flee!`, type: 'reaction' });
        broadcastAdventureUpdate(io, party);
        return;
    }
    const proceedToNextArea = () => {
        sharedState.isLoadingNextArea = false;
        sharedState.zoneCards = [];
        sharedState.groundLoot = [];
        drawCardsForServer(sharedState, 3);
        sharedState.partyMemberStates.forEach(p => {
            if (!p.isDead) {
                p.actionPoints = 3;
                p.turnEnded = false;
            }
            p.weaponCooldowns = {};
            p.spellCooldowns = {};
            p.itemCooldowns = {};
            p.threat = 0;
        });
        sharedState.turnNumber = 0;
        sharedState.isPlayerTurn = true;
    };

    sharedState.isLoadingNextArea = true;
    broadcastAdventureUpdate(io, party);

    if (PVP_ZONES.includes(zoneName)) {
        if (!pvpZoneQueues[zoneName]) {
            pvpZoneQueues[zoneName] = [];
        }
        const opponentQueueEntry = pvpZoneQueues[zoneName].shift();
        if (opponentQueueEntry) {
            clearTimeout(opponentQueueEntry.timerId);
            const opponentParty = parties[opponentQueueEntry.partyId];
            if (opponentParty) {
                startPvpEncounter(io, party, opponentParty);
            }
        } else {
            sharedState.log.push({ message: "You venture deeper, wary of your surroundings...", type: 'info' });
            const timerId = setTimeout(() => {
                const myEntryIndex = pvpZoneQueues[zoneName].findIndex(entry => entry.partyId === party.id);
                if (myEntryIndex !== -1) {
                    pvpZoneQueues[zoneName].splice(myEntryIndex, 1);
                    sharedState.log.push({ message: "The path ahead is clear... for now.", type: 'info' });
                    proceedToNextArea();
                    broadcastAdventureUpdate(io, party);
                }
            }, PVP_QUEUE_TIMEOUT_MS);
            pvpZoneQueues[zoneName].push({ partyId: party.id, timerId });
        }
        return;
    }
    const inCombat = sharedState.zoneCards.some(c => c && c.type === 'enemy');
    if (inCombat) {
        sharedState.log.push({ message: "The party attempts to flee, but the enemies get one last attack!", type: 'reaction' });
        await runEnemyPhaseForParty(io, party.id, true);
        const alivePlayers = sharedState.partyMemberStates.filter(p => p.health > 0);
        if (alivePlayers.length > 0) {
            sharedState.log.push({ message: "They successfully escaped to a new area!", type: 'success' });
            proceedToNextArea();
        } else {
            sharedState.log.push({ message: "The party was wiped out while trying to flee!", type: 'damage' });
        }
    } else {
        sharedState.log.push({ message: "The party ventures deeper into the zone!", type: 'info' });
        proceedToNextArea();
    }
    broadcastAdventureUpdate(io, party);
}

export async function runEnemyPhaseForParty(io, partyId, isFleeing = false, startIndex = 0) {
    const party = parties[partyId];
    if (!party || !party.sharedState || party.sharedState.pendingReaction) return;
    const { sharedState } = party;
    if (startIndex === 0) {
        sharedState.isPlayerTurn = false;
        if (!isFleeing) {
            sharedState.log.push({ message: "--- Zone's Turn ---", type: 'info' });
        }
        broadcastAdventureUpdate(io, party);
    }
    const enemies = sharedState.zoneCards.map((card, index) => ({ card, index })).filter(e => e.card && e.card.type === 'enemy');
    for (let i = startIndex; i < enemies.length; i++) {
        const { card: enemy, index: enemyIndex } = enemies[i];

        delete enemy.usedThickHideThisTurn;

        if (!enemy || enemy.health <= 0) continue;
        try {

            // Helper for End of Turn (Damage + Decrement)
            const processEndOfTurn = () => {
                let damageTaken = false;
                ['bleed', 'burn', 'poison', 'entangling roots'].forEach(type => {
                    const debuff = enemy.debuffs.find(d => d.type.toLowerCase() === type);
                    if (debuff) {
                        applyDamage(enemy, debuff.damage);
                        let typeName = type.charAt(0).toUpperCase() + type.slice(1);
                        let dmgType = debuff.damageType || (type === 'burn' ? 'Fire' : (type === 'poison' ? 'Nature' : 'Physical'));
                        sharedState.log.push({ message: `${enemy.name} takes ${debuff.damage} ${dmgType} damage from ${typeName}.`, type: 'damage' });
                        damageTaken = true;
                    }
                });

                if (enemy.health <= 0) {
                    defeatEnemyInParty(io, party, enemy, enemyIndex);
                    broadcastAdventureUpdate(io, party);
                    return true; // Dead
                }

                if (enemy.buffs) { enemy.buffs.forEach(b => b.duration--); enemy.buffs = enemy.buffs.filter(b => b.duration > 0); }
                if (enemy.debuffs) { enemy.debuffs.forEach(d => d.duration--); enemy.debuffs = enemy.debuffs.filter(d => d.duration > 0); }

                if (damageTaken) broadcastAdventureUpdate(io, party);
                return false;
            };

            if (enemy.debuffs.some(d => d.type === 'stun')) {
                sharedState.log.push({ message: `${enemy.name} is stunned and cannot act!`, type: 'reaction' });
                processEndOfTurn();
                broadcastAdventureUpdate(io, party);
                continue;
            }
            const alivePlayers = sharedState.partyMemberStates.filter(p => !p.isDead);
            if (alivePlayers.length === 0) continue;
            let targetPlayerState;
            if (alivePlayers.length > 0) {
                const maxThreat = Math.max(...alivePlayers.map(p => p.threat));
                const topThreatPlayers = alivePlayers.filter(p => p.threat === maxThreat);
                targetPlayerState = topThreatPlayers[Math.floor(Math.random() * topThreatPlayers.length)];
            } else {
                continue;
            }
            const targetPlayerObject = players[targetPlayerState.name];
            if (!targetPlayerObject) continue;

            // Apply Daze modifier to enemy roll (-3 to attack roll)
            const dazeDebuff = enemy.debuffs.find(d => d.type === 'daze');
            const dazeModifier = dazeDebuff ? -3 : 0;
            // Apply Stealth modifier (-5 to attack roll if target is stealthed)
            const stealthBuff = targetPlayerState.buffs.find(b => b.type === 'Stealth');
            const stealthModifier = stealthBuff ? -5 : 0;

            let roll = Math.floor(Math.random() * 20) + 1;
            const modifiedRoll = Math.max(1, roll + dazeModifier + stealthModifier); // Minimum roll of 1

            if (dazeDebuff && dazeModifier !== 0) {
                sharedState.log.push({ message: `${enemy.name} is dazed! (-3 to attack roll)`, type: 'info' });
            }
            if (stealthBuff) {
                sharedState.log.push({ message: `${enemy.name}'s attack is hindered by shadows! (-5 to hit)`, type: 'info' });
            }
            const attack = enemy.attackTable ? enemy.attackTable.find(a => modifiedRoll >= a.range[0] && modifiedRoll <= a.range[1]) : null;
            if (attack && attack.action === 'attack') {
                const targetCharacter = targetPlayerObject.character;
                let damageToDeal = attack.damage;

                // Apply Rallied buff damage bonus (from Gorbon's rally)
                const ralliedBuff = enemy.buffs?.find(b => b.type === 'Rallied' && b.bonus?.damageBonus);
                if (ralliedBuff) {
                    damageToDeal += ralliedBuff.bonus.damageBonus;
                }

                if (attack.damageType === 'Physical') {
                    const bonuses = getBonusStatsForPlayer(targetCharacter, targetPlayerState);
                    const resistance = bonuses.physicalResistance || 0;
                    damageToDeal = Math.max(1, damageToDeal - resistance);
                }
                const availableReactions = [];
                // --- REACTION LOGIC MODIFIED FOR EVASIVE SHOT ---
                let isWearingHeavy = false;
                if (targetCharacter.equipment) {
                    for (const slot in targetCharacter.equipment) {
                        const item = targetCharacter.equipment[slot];
                        if (item && item.traits && item.traits.includes('Heavy')) {
                            isWearingHeavy = true;
                            break;
                        }
                    }
                }

                if (targetCharacter.equippedSpells && Array.isArray(targetCharacter.equippedSpells)) {
                    const dodgeSpell = targetCharacter.equippedSpells.find(s => s.name === "Dodge");
                    if (dodgeSpell && (targetPlayerState.spellCooldowns[dodgeSpell.name] || 0) <= 0) {
                        if (isWearingHeavy) {
                            sharedState.log.push({ message: `${targetPlayerState.name} could have Dodged, but their heavy gear prevented it!`, type: 'info' });
                        } else {
                            availableReactions.push({ name: 'Dodge' });
                        }
                    }

                    const evasiveShotSpell = targetCharacter.equippedSpells.find(s => s.name === "Evasive Shot");
                    if (evasiveShotSpell && (targetPlayerState.spellCooldowns[evasiveShotSpell.name] || 0) <= 0) {
                        const mainHand = targetCharacter.equipment.mainHand;
                        const offHand = targetCharacter.equipment.offHand;
                        const requiredTypes = evasiveShotSpell.requires?.weaponType || [];
                        const hasRangedWeapon = (mainHand && requiredTypes.includes(mainHand.weaponType)) ||
                            (offHand && requiredTypes.includes(offHand.weaponType));

                        if (hasRangedWeapon) {
                            if (isWearingHeavy) {
                                sharedState.log.push({ message: `${targetPlayerState.name} could have used Evasive Shot, but their heavy gear prevented it!`, type: 'info' });
                            } else {
                                availableReactions.push({ name: 'Evasive Shot' });
                            }
                        }
                    }

                    // Check for Parry - only works against melee attacks and requires melee weapon
                    const parrySpell = targetCharacter.equippedSpells.find(s => s.name === "Parry");
                    if (parrySpell && (targetPlayerState.spellCooldowns[parrySpell.name] || 0) <= 0) {
                        const isMeleeAttack = attack.attackRange === 'melee';
                        const mainHand = targetCharacter.equipment.mainHand;
                        // Check for melee weapon: explicitly melee, or type weapon that isn't ranged (bow/staff)
                        const rangedWeaponTypes = ['Two-Hand Bow', 'Two-Hand Staff'];
                        const hasMeleeWeapon = mainHand && mainHand.type === 'weapon' &&
                            (mainHand.range === 'melee' || (!mainHand.range && !rangedWeaponTypes.includes(mainHand.weaponType)));
                        if (isMeleeAttack && hasMeleeWeapon) {
                            availableReactions.push({ name: 'Parry' });
                        } else if (!isMeleeAttack && hasMeleeWeapon) {
                            // Don't show message for ranged attacks, just don't offer
                        } else if (isMeleeAttack && !hasMeleeWeapon) {
                            sharedState.log.push({ message: `${targetPlayerState.name} could have Parried, but needs a melee weapon!`, type: 'info' });
                        }
                    }
                }

                if (targetCharacter.equipment) {
                    const shield = targetCharacter.equipment.offHand;
                    if (shield && shield.type === 'shield' && shield.reaction && (targetPlayerState.itemCooldowns[shield.name] || 0) <= 0) {
                        availableReactions.push({ name: 'Block' });
                    }
                }
                // --- END OF REACTION LOGIC MODIFICATION ---
                if (availableReactions.length > 0 && !isFleeing) {
                    sharedState.pendingReaction = {
                        attackerName: enemy.name,
                        attackerIndex: enemyIndex,
                        targetName: targetPlayerState.name,
                        damage: attack.damage,
                        damageType: attack.damageType,
                        attackRange: attack.attackRange || 'melee',
                        debuff: attack.debuff || null,
                        message: attack.message,
                        isFleeing: isFleeing
                    };
                    const reactionPayload = {
                        damage: attack.damage,
                        attacker: enemy.name,
                        availableReactions: availableReactions.map(r => ({ name: r.name })),
                        timer: REACTION_TIMER_MS
                    };
                    io.to(targetPlayerState.playerId).emit('party:requestReaction', reactionPayload);
                    party.reactionTimeout = setTimeout(() => {
                        const playerSocket = io.sockets.sockets.get(targetPlayerState.playerId);
                        if (playerSocket) {
                            handleResolveReaction(io, playerSocket, { reactionType: 'take_damage' });
                        }
                    }, REACTION_TIMER_MS);
                    return;
                } else {
                    applyDamage(targetPlayerState, damageToDeal);
                    let attackMessage = `${enemy.name} ${attack.message} It hits ${targetPlayerState.name} for ${damageToDeal} damage! [id:${targetPlayerState.playerId}]`;
                    if (damageToDeal < attack.damage) {
                        attackMessage += ` (${attack.damage - damageToDeal} resisted)`;
                    }
                    if (attack.debuff) {
                        const debuff = attack.debuff;
                        const existingIndex = targetPlayerState.debuffs.findIndex(d => d.type === debuff.type);
                        if (existingIndex !== -1) targetPlayerState.debuffs.splice(existingIndex, 1);
                        targetPlayerState.debuffs.push({ ...debuff });
                        attackMessage += ` ${targetPlayerState.name} is now ${debuff.type}!`;
                    }
                    sharedState.log.push({ message: attackMessage, type: 'damage' });
                }
            } else if (attack && attack.action === 'special') {
                sharedState.log.push({ message: `${enemy.name} uses a special ability: ${attack.message}`, type: 'reaction' });
                if (enemy.name === 'Loot Goblin' && attack.message.includes('escapes')) {
                    sharedState.log.push({ message: `The Loot Goblin escaped with its treasure!`, type: 'damage' });
                    sharedState.zoneCards[enemyIndex] = null;
                }
                if (enemy.name === 'Pulvis Cadus' && attack.message.includes('kegs')) {
                    const emptyIndices = sharedState.zoneCards.map((card, idx) => card === null ? idx : -1).filter(idx => idx !== -1);
                    emptyIndices.forEach(idx => {
                        const kegCard = { ...gameData.specialCards.powderKeg };
                        kegCard.id = Date.now() + idx;
                        kegCard.debuffs = [];
                        sharedState.zoneCards[idx] = kegCard;
                    });
                    if (emptyIndices.length > 0) {
                        sharedState.log.push({ message: `Unstable kegs fill the empty spaces!`, type: 'reaction' });
                    }
                }
                if (enemy.name === 'Raging Bull' && attack.message.includes('Thick Hide')) {
                    // Check if Thick Hide buff is already active - if so, do a Charge instead
                    const hasThickHide = enemy.buffs && enemy.buffs.some(b => b.type === 'Thick Hide');
                    if (hasThickHide || enemy.usedThickHideThisTurn) {
                        // Already has the buff or used it this turn - do a Charge attack instead
                        sharedState.log.push({ message: `${enemy.name} roars and Charges!`, type: 'reaction' });

                        const targetCharacter = targetPlayerObject.character;
                        let damageToDeal = 3;
                        const bonuses = getBonusStatsForPlayer(targetCharacter, targetPlayerState);
                        const resistance = bonuses.physicalResistance || 0;
                        damageToDeal = Math.max(1, damageToDeal - resistance);


                        applyDamage(targetPlayerState, damageToDeal);
                        let attackMessage = `${enemy.name} hits ${targetPlayerState.name} for ${damageToDeal} damage!`;
                        if (damageToDeal < 3) {
                            attackMessage += ` (${3 - damageToDeal} resisted)`;
                        }
                        sharedState.log.push({ message: attackMessage, type: 'damage' });

                    } else {
                        // First time using Thick Hide this turn - apply the buff and reroll
                        if (!enemy.buffs) enemy.buffs = [];
                        const buff = { type: 'Thick Hide', duration: 2, bonus: { physicalResistance: 1 } };

                        enemy.buffs = enemy.buffs.filter(b => b.type !== 'Thick Hide');
                        enemy.buffs.push(buff);

                        enemy.usedThickHideThisTurn = true;
                        i--;
                    }
                    continue;
                }
                // --- RAT KING: Summon Rat ---
                // --- RAT KING: Summon Rat ---
                if (enemy.name === 'The Rat King' && attack.message.includes('rat appears')) {
                    // Randomly choose Sewer Rat or Plague Rat
                    const ratTypes = [
                        {
                            name: "Sewer Rat", type: "enemy", health: 6, maxHealth: 6, icon: "🐀",
                            imageUrl: '/assets/sewer-rat.jpg',
                            attackTable: [
                                { range: [1, 8], action: 'miss', message: "Miss!" },
                                { range: [9, 20], action: 'attack', attackRange: 'melee', damage: 2, damageType: 'Physical', message: "Bite! Deals 2 Physical Damage!" }
                            ],
                            lootTable: [
                                { range: [1, 10], items: ["Rat Meat"] },
                                { range: [11, 18], items: ["Rat Tail"] },
                                { range: [19, 20], items: ["Rat Eye"] }
                            ]
                        },
                        {
                            name: "Plague Rat", type: "enemy", health: 10, maxHealth: 10, icon: "🐀",
                            imageUrl: '/assets/plague-rat.jpg',
                            attackTable: [
                                { range: [1, 8], action: 'miss', message: "Miss!" },
                                { range: [9, 16], action: 'attack', attackRange: 'melee', damage: 3, damageType: 'Physical', message: "Maul! Deals 3 Physical Damage!" },
                                { range: [17, 20], action: 'attack', attackRange: 'melee', damage: 2, damageType: 'Nature', debuff: { type: 'poison', duration: 2, damage: 1, damageType: 'Nature' }, message: "Infectious Bite! Deals 2 Nature Damage and Poisons!" }
                            ],
                            lootTable: [
                                { range: [1, 10], items: ["Rat Meat", "Rat Eye"] },
                                { range: [11, 18], items: ["Rat Tail"] },
                                { range: [19, 20], items: ["Plague Essence"] }
                            ]
                        }
                    ];
                    const randomRat = ratTypes[Math.floor(Math.random() * ratTypes.length)];
                    const ratCard = {
                        ...randomRat,
                        id: Date.now(),
                        debuffs: []
                    };

                    // Find an empty slot to place the rat
                    const emptySlotIndex = sharedState.zoneCards.findIndex(c => c === null);
                    if (emptySlotIndex !== -1) {
                        sharedState.zoneCards[emptySlotIndex] = ratCard;
                        sharedState.log.push({ message: `A ${randomRat.name} scurries into the battle!`, type: 'reaction' });
                    } else {
                        sharedState.log.push({ message: `The Rat King shrieks, but there's no room for more rats!`, type: 'info' });
                    }
                }
                // --- GOBLIN KING GORBON: Rally ---
                if (enemy.name === 'Gorbon the Goblin King' && attack.message.includes('rallies his minions')) {
                    // Buff all other goblins in the zone
                    const goblins = sharedState.zoneCards.filter(c => c && c.type === 'enemy' && c.name.includes('Goblin') && c !== enemy);
                    if (goblins.length > 0) {
                        goblins.forEach(goblin => {
                            if (!goblin.buffs) goblin.buffs = [];
                            // Remove existing rally buff and add fresh one
                            goblin.buffs = goblin.buffs.filter(b => b.type !== 'Rallied');
                            goblin.buffs.push({ type: 'Rallied', duration: 2, bonus: { damageBonus: 2 } });
                        });
                        sharedState.log.push({ message: `All goblins gain +2 damage for 2 turns!`, type: 'reaction' });
                    } else {
                        // No goblins to rally - spawn a random goblin reinforcement
                        const emptySlotIndex = sharedState.zoneCards.findIndex(c => c === null);
                        if (emptySlotIndex !== -1) {
                            const goblinTypes = [
                                {
                                    name: "Goblin Warrior", health: 10, maxHealth: 10, icon: "👺", attackTable: [
                                        { range: [1, 3], action: 'miss', message: "The warrior swings wildly. Miss!" },
                                        { range: [4, 12], action: 'attack', attackRange: 'melee', damage: 4, damageType: 'Physical', message: "Brutal Swing! Deals 4 Physical Damage!" },
                                        { range: [13, 17], action: 'attack', attackRange: 'melee', damage: 3, damageType: 'Physical', debuff: { type: 'daze', duration: 2 }, message: "Headbutt! Deals 3 Physical Damage and Dazes!" },
                                        { range: [18, 20], action: 'attack', attackRange: 'melee', damage: 5, damageType: 'Physical', message: "Overhead Smash! Deals 5 Physical Damage!" }
                                    ]
                                },
                                {
                                    name: "Goblin Archer", health: 8, maxHealth: 8, icon: "👺", attackTable: [
                                        { range: [1, 3], action: 'miss', message: "The arrow whizzes past. Miss!" },
                                        { range: [4, 12], action: 'attack', attackRange: 'ranged', damage: 3, damageType: 'Physical', message: "Barbed Arrow! Deals 3 Physical Damage!" },
                                        { range: [13, 17], action: 'attack', attackRange: 'ranged', damage: 2, damageType: 'Physical', debuff: { type: 'bleed', duration: 2, damage: 1, damageType: 'Physical' }, message: "Serrated Arrow! Deals 2 Physical Damage and causes Bleed!" },
                                        { range: [18, 20], action: 'attack', attackRange: 'ranged', damage: 4, damageType: 'Physical', debuff: { type: 'trap', duration: 1 }, message: "Net Trap! Deals 4 Physical Damage and Traps you!" }
                                    ]
                                },
                                {
                                    name: "Goblin Shaman", health: 8, maxHealth: 8, icon: "👺", attackTable: [
                                        { range: [1, 3], action: 'miss', message: "The Shaman's hex fizzles. Miss!" },
                                        { range: [4, 12], action: 'attack', attackRange: 'ranged', damage: 3, damageType: 'Nature', message: "Hex! Deals 3 Nature Damage!" },
                                        { range: [13, 17], action: 'attack', attackRange: 'ranged', damage: 2, damageType: 'Nature', debuff: { type: 'poison', duration: 2, damage: 1, damageType: 'Nature' }, message: "Toxic Curse! Deals 2 Nature Damage and Poisons!" },
                                        { range: [18, 20], action: 'special', message: "The Shaman chants and heals an ally!" }
                                    ]
                                }
                            ];
                            const randomGoblin = goblinTypes[Math.floor(Math.random() * goblinTypes.length)];
                            const newGoblin = {
                                ...randomGoblin,
                                type: 'enemy',
                                debuffs: [],
                                buffs: [{ type: 'Rallied', duration: 2, bonus: { damageBonus: 2 } }],
                                id: Date.now()
                            };
                            sharedState.zoneCards[emptySlotIndex] = newGoblin;
                            sharedState.log.push({ message: `Gorbon roars "FOR THE HORDE!" and a ${randomGoblin.name} answers his call!`, type: 'reaction' });
                        } else {
                            sharedState.log.push({ message: `Gorbon roars, but there's no room for reinforcements!`, type: 'info' });
                        }
                    }
                }
                // --- GOBLIN SHAMAN: Heal Ally ---
                if (enemy.name === 'Goblin Shaman' && attack.message.includes('heals an ally')) {
                    // Find the most wounded goblin ally (excluding self)
                    const woundedAllies = sharedState.zoneCards
                        .filter(c => c && c.type === 'enemy' && c !== enemy && c.health < c.maxHealth)
                        .sort((a, b) => (a.health / a.maxHealth) - (b.health / b.maxHealth));

                    if (woundedAllies.length > 0) {
                        const healTarget = woundedAllies[0];
                        const healAmount = 5;
                        const oldHealth = healTarget.health;
                        healTarget.health = Math.min(healTarget.maxHealth, healTarget.health + healAmount);
                        const actualHeal = healTarget.health - oldHealth;
                        sharedState.log.push({ message: `The Shaman heals ${healTarget.name} for ${actualHeal} HP!`, type: 'heal' });
                    } else {
                        // No wounded allies, heal self
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
                }
                // --- PULVIS CADUS: A Quick Fix! ---
                if (enemy.name === 'Pulvis Cadus' && attack.message.includes('A Quick Fix!')) {
                    if (enemy.health < enemy.maxHealth) {
                        const healAmount = 8;
                        const oldHealth = enemy.health;
                        enemy.health = Math.min(enemy.maxHealth, enemy.health + healAmount);
                        const actualHeal = enemy.health - oldHealth;
                        sharedState.log.push({ message: `Pulvis Cadus patches up his armor, restoring ${actualHeal} HP!`, type: 'heal' });
                    } else {
                        // Enrage if full health
                        if (!enemy.buffs) enemy.buffs = [];
                        // Remove existing rage if any
                        enemy.buffs = enemy.buffs.filter(b => b.type !== 'Enraged');
                        enemy.buffs.push({ type: 'Enraged', duration: 2, bonus: { rollBonus: 3, damageBonus: 2 } });
                        sharedState.log.push({ message: `Pulvis Cadus is fully repaired and becomes ENRAGED! (+3 to rolls, +2 damage)`, type: 'reaction' });
                    }
                }
                // --- PULVIS CADUS: Unstable Kegs ---
                if (enemy.name === 'Pulvis Cadus' && attack.message.includes('unstable kegs')) {
                    const kegCount = 2;
                    let spawned = 0;
                    for (let k = 0; k < kegCount; k++) {
                        const emptySlotIndex = sharedState.zoneCards.findIndex(c => c === null);
                        if (emptySlotIndex !== -1) {
                            const kegCard = {
                                ...gameData.specialCards.powderKeg,
                                id: Date.now() + k,
                                kegTimer: 2,
                                maxHealth: 4,
                                health: 4
                            };
                            sharedState.zoneCards[emptySlotIndex] = kegCard;
                            spawned++;
                        }
                    }
                    if (spawned > 0) {
                        sharedState.log.push({ message: `${spawned} Powder Keg(s) land in the arena! They look like they're about to blow!`, type: 'reaction' });
                    }
                }

                // --- POWDER KEG: Detonation Logic ---
                if (enemy.name === 'Powder Keg' && attack.message.includes('fizzes')) {
                    if (typeof enemy.kegTimer === 'undefined') enemy.kegTimer = 2;
                    enemy.kegTimer--;

                    if (enemy.kegTimer <= 0) {
                        sharedState.log.push({ message: `BOOM! The Powder Keg DETONATES!`, type: 'damage' });

                        // Damage all players
                        sharedState.partyMemberStates.forEach(p => {
                            if (!p.isDead) {
                                const playerObj = players[p.name];
                                if (playerObj) {
                                    const bonuses = getBonusStatsForPlayer(playerObj.character, p);
                                    const resistance = bonuses.fireResistance || 0;
                                    const damage = Math.max(1, 4 - resistance);


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
                        // Retrieve the current index to remove the keg
                        const currentKegIndex = sharedState.zoneCards.findIndex(c => c && c.id === enemy.id);
                        if (currentKegIndex !== -1) {
                            defeatEnemyInParty(io, party, enemy, currentKegIndex);
                        }
                    } else {
                        sharedState.log.push({ message: `The Powder Keg fizzes ominously... (${enemy.kegTimer} turns remaining)`, type: 'reaction' });
                    }
                }


                // --- ANGRY FARMHAND: Pitchfork Tactics ---
                if (enemy.name === 'Angry Farmhand' && attack.message.includes('weighs his options')) {
                    const allEffects = (enemy.buffs || []).concat(enemy.debuffs || []);
                    const isTrapped = allEffects.some(b => ['trapped', 'root', 'stun', 'daze', 'entangling roots'].includes(b.type.toLowerCase()));
                    if (enemy.health <= 2 && !isTrapped) {
                        sharedState.log.push({ message: "The Farmhand panics and runs away!", type: 'reaction' });
                        sharedState.zoneCards.splice(enemyIndex, 1);
                        return;
                    } else {
                        const targetCharacter = targetPlayerObject.character;
                        const bonuses = getBonusStatsForPlayer(targetCharacter, targetPlayerState);
                        const resistance = bonuses.physicalResistance || 0;
                        const damageToDeal = Math.max(1, 2 - resistance);


                        applyDamage(targetPlayerState, damageToDeal);
                        if (!targetPlayerState.debuffs) targetPlayerState.debuffs = [];
                        targetPlayerState.debuffs.push({ type: 'bleed', duration: 2, damage: 1, damageType: 'Physical' });

                        let msg = `Pitchfork Jab: Deals ${damageToDeal} Physical Damage and Bleeds!`;
                        if (enemy.health <= 2 && isTrapped) msg = `Trapped! The Farmhand fights in desperation! ${msg}`;

                        sharedState.log.push({ message: msg, type: 'damage' });
                    }
                }

                // --- VEXOR: Slash (High Threat) ---
                if (enemy.name === 'Vexor, Lord of the Arena' && attack.message.includes('biggest threat')) {
                    const sortedPlayers = [...sharedState.partyMemberStates].filter(p => !p.isDead).sort((a, b) => (b.threat || 0) - (a.threat || 0));
                    if (sortedPlayers.length > 0) {
                        const target = sortedPlayers[0];
                        const playerObj = players[target.name];
                        if (playerObj) {
                            const bonuses = getBonusStatsForPlayer(playerObj.character, target);
                            const resistance = bonuses.physicalResistance || 0;
                            const damage = Math.max(1, 5 - resistance);
                            applyDamage(target, damage);
                            sharedState.log.push({ message: `Vexor slashes ${target.name} for ${damage} Physical damage!`, type: 'damage' });
                            if (target.health <= 0) { target.isDead = true; target.health = 0; }
                        }
                    }
                }

                // --- VEXOR: Shield Bash (Low Threat + Stun) ---
                if (enemy.name === 'Vexor, Lord of the Arena' && attack.message.includes('weakest foe')) {
                    const sortedPlayers = [...sharedState.partyMemberStates].filter(p => !p.isDead).sort((a, b) => (a.threat || 0) - (b.threat || 0));
                    if (sortedPlayers.length > 0) {
                        const target = sortedPlayers[0];
                        const playerObj = players[target.name];
                        if (playerObj) {
                            const bonuses = getBonusStatsForPlayer(playerObj.character, target);
                            const resistance = bonuses.physicalResistance || 0;
                            const damage = Math.max(1, 4 - resistance);
                            applyDamage(target, damage);

                            if (!target.debuffs) target.debuffs = [];
                            target.debuffs.push({ type: 'stun', duration: 1 });

                            sharedState.log.push({ message: `Vexor bashes ${target.name} for ${damage} damage and Stuns them!`, type: 'damage' });
                            if (target.health <= 0) { target.isDead = true; target.health = 0; }
                        }
                    }
                }

                // --- VEXOR: Heal/Taunt ---
                if (enemy.name === 'Vexor, Lord of the Arena' && attack.message.includes('taunts his enemies')) {
                    enemy.health = Math.min(enemy.maxHealth, enemy.health + 5);
                    sharedState.log.push({ message: `Vexor heals for 5 HP!`, type: 'heal' });

                    const sortedPlayers = [...sharedState.partyMemberStates].filter(p => !p.isDead).sort((a, b) => (a.threat || 0) - (b.threat || 0));
                    if (sortedPlayers.length > 0) {
                        const target = sortedPlayers[0];
                        target.threat = 10;
                        sharedState.log.push({ message: `${target.name} is taunted! Threat increased to 10!`, type: 'info' });
                    }
                }

                // --- VEXOR: Whirlwind ---
                if (enemy.name === 'Vexor, Lord of the Arena' && attack.message.includes('Whirlwind')) {
                    sharedState.partyMemberStates.forEach(p => {
                        if (!p.isDead) {
                            const playerObj = players[p.name];
                            if (playerObj) {
                                const bonuses = getBonusStatsForPlayer(playerObj.character, p);
                                const resistance = bonuses.physicalResistance || 0;
                                const damage = Math.max(1, 5 - resistance);
                                applyDamage(p, damage);

                                if (!p.debuffs) p.debuffs = [];
                                p.debuffs.push({ type: 'bleed', duration: 2, damage: 2 });

                                sharedState.log.push({ message: `Vexor hits ${p.name} for ${damage} damage and applies Bleed!`, type: 'damage' });
                                if (p.health <= 0) { p.isDead = true; p.health = 0; }
                            }
                        }
                    });
                }
            } else {
                sharedState.log.push({ message: `${enemy.name} misses its attack.`, type: 'info' });
            }
            if (targetPlayerState.health <= 0) {
                targetPlayerState.health = 0;
                targetPlayerState.isDead = true;
                if (party.sharedState.pvpEncounter) {
                    handlePvpPlayerDeath(io, targetPlayerObject, party);
                } else {
                    if (targetPlayerObject.character) {
                        targetPlayerState.lootableInventory = [...targetPlayerObject.character.inventory.filter(Boolean)];
                        targetPlayerObject.character.inventory = Array(28).fill(null);
                        if (targetPlayerObject.id) io.to(targetPlayerObject.id).emit('characterUpdate', targetPlayerObject.character);
                    }
                }
                sharedState.log.push({ message: `${targetPlayerState.name} has been defeated!`, type: 'damage' });
            }

            // --- END OF TURN PROCESSING (DoT + Decrement) ---
            if (processEndOfTurn()) continue;

            // Broadcast and delay so players see each enemy act sequentially
            broadcastAdventureUpdate(io, party);
            await new Promise(resolve => setTimeout(resolve, 1200));
        } catch (error) {
            console.error(`Error processing turn for enemy ${enemy.name}:`, error);
        }
    }
    if (!isFleeing) {
        await new Promise(resolve => setTimeout(resolve, 1000));
        startNextPlayerTurn(io, party.id);
    }
}

export function startNextPlayerTurn(io, partyId) {
    const party = parties[partyId];
    if (!party || !party.sharedState) return;
    const { sharedState } = party;
    sharedState.turnNumber++;
    sharedState.isPlayerTurn = true;
    sharedState.log.push({ message: "--- Players' Turn ---", type: 'info' });
    sharedState.partyMemberStates.forEach(p => {
        if (p.isDead) {
            p.turnEnded = true;
        } else {
            // DoT Damage processed at END of turn now.

            // Check if DOT killed the player
            if (p.health <= 0) {
                p.isDead = true;
                p.turnEnded = true;
                sharedState.log.push({ message: `${p.name} has succumbed to their wounds!`, type: 'damage' });
                return;
            }

            // Check for Stun - reduces AP by 1
            const stunDebuff = p.debuffs.find(d => d.type === 'stun');
            if (stunDebuff) {
                p.actionPoints = 2; // 3 - 1 = 2 AP due to stun
                sharedState.log.push({ message: `${p.name} is stunned and starts with reduced Action Points!`, type: 'reaction' });
            } else {
                p.actionPoints = 3;
            }
            p.turnEnded = false;
        }
        // Buff/Debuff decrement processed at END of turn now.
        Object.keys(p.weaponCooldowns).forEach(k => { if (p.weaponCooldowns[k] > 0) p.weaponCooldowns[k]--; });
        Object.keys(p.spellCooldowns).forEach(k => { if (p.spellCooldowns[k] > 0) p.spellCooldowns[k]--; });
        Object.keys(p.itemCooldowns).forEach(k => { if (p.itemCooldowns[k] > 0) p.itemCooldowns[k]--; });
    });
    broadcastAdventureUpdate(io, party);
}

export async function processPlayerEndTurn(io, partyId, playerName) {
    const party = parties[partyId];
    if (!party || !party.sharedState) return;
    const { sharedState } = party;
    const playerState = sharedState.partyMemberStates.find(p => p.name === playerName);
    if (!playerState) return;

    // 1. Process DoT Damage
    const tookDotDamage = applyDoTEffects(playerState, sharedState.log);

    if (playerState.health <= 0) {
        playerState.health = 0;
        playerState.isDead = true;
        sharedState.log.push({ message: `${playerState.name} has succumbed to their wounds!`, type: 'damage' });
    }

    // 2. Decrement Buffs/Debuffs (Tick duration)
    // Note: Decrement happens AFTER damage, or same tick.
    if (playerState.buffs) {
        playerState.buffs.forEach(b => b.duration--);
        playerState.buffs = playerState.buffs.filter(b => b.duration > 0);
    }
    if (playerState.debuffs) {
        playerState.debuffs.forEach(d => d.duration--);
        playerState.debuffs = playerState.debuffs.filter(d => d.duration > 0);
    }

    // 3. Set turnEnded
    playerState.turnEnded = true;

    // 4. Reduce Threat if unused AP (PvE Logic)
    if (!party.sharedState.pvpEncounterId && playerState.actionPoints > 0) {
        const threatReduction = playerState.actionPoints;
        playerState.threat = Math.max(0, (playerState.threat || 0) - threatReduction);
        // Log optional? Handler did it. We can do it here.
        // Get character name? playerState.name is character name.
        sharedState.log.push({ message: `${playerState.name} reduces threat by ${threatReduction} (${playerState.actionPoints} unused AP).`, type: 'info' });
    }

    // 5. Check All Ends
    broadcastAdventureUpdate(io, party);

    const allTurnsEnded = sharedState.partyMemberStates.every(p => p.turnEnded || p.isDead);
    if (allTurnsEnded) {
        await runEnemyPhaseForParty(io, partyId);
    }
}

function applyDoTEffects(playerState, logTarget) {
    if (playerState.isDead) return false;
    let tookDamage = false;
    ['bleed', 'burn', 'poison', 'entangling roots'].forEach(type => {
        const debuff = playerState.debuffs.find(d => d.type.toLowerCase() === type);
        if (debuff) {
            applyDamage(playerState, debuff.damage);
            let typeName = type.charAt(0).toUpperCase() + type.slice(1);
            let dmgType = debuff.damageType || (type === 'burn' ? 'Fire' : (type === 'poison' ? 'Nature' : 'Physical'));
            logTarget.push({ message: `${playerState.name} takes ${debuff.damage} ${dmgType} damage from ${typeName}.`, type: 'damage' });
            tookDamage = true;
        }
    });
    return tookDamage;
}

export async function processPvpPlayerEndTurn(io, encounter, playerState) {
    if (!playerState || playerState.turnEnded) return;

    // Apply DoT
    applyDoTEffects(playerState, encounter.log);

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

    // Decrement Durations
    if (playerState.buffs) {
        playerState.buffs.forEach(b => b.duration--);
        playerState.buffs = playerState.buffs.filter(b => b.duration > 0);
    }
    if (playerState.debuffs) {
        playerState.debuffs.forEach(d => d.duration--);
        playerState.debuffs = playerState.debuffs.filter(d => d.duration > 0);
    }

    playerState.turnEnded = true;
}

export async function handleResolveReaction(io, socket, payload) {
    const name = socket.characterName;
    const player = players[name];
    if (!player) return;
    let party = parties[player.character.partyId];
    if (!party || !party.sharedState) return;
    const isPvp = !!party.sharedState.pvpEncounterId;
    const encounter = isPvp ? pvpEncounters[party.sharedState.pvpEncounterId] : null;
    const stateObject = isPvp ? encounter : party.sharedState;
    if (!stateObject || !stateObject.pendingReaction) return;
    const reaction = stateObject.pendingReaction;
    if (reaction.targetName !== name) return;
    if (stateObject.reactionTimeout) {
        clearTimeout(stateObject.reactionTimeout);
        stateObject.reactionTimeout = null;
    }
    const { reactionType } = payload;
    const reactingPlayerState = isPvp ? encounter.playerStates.find(p => p.name === name) : party.sharedState.partyMemberStates.find(p => p.name === name);
    const reactingPlayer = players[name];
    let finalDamage = reaction.damage;
    let dodged = false;
    let blocked = false;
    let logMessage = '';

    if (reactionType === 'Dodge') {
        const dodgeSpell = reactingPlayer.character.equippedSpells.find(s => s.name === "Dodge");
        if (dodgeSpell && (reactingPlayerState.spellCooldowns[dodgeSpell.name] || 0) <= 0) {
            reactingPlayerState.spellCooldowns[dodgeSpell.name] = dodgeSpell.cooldown;
            const bonuses = getBonusStatsForPlayer(reactingPlayer.character, reactingPlayerState);
            const statValue = reactingPlayer.character.agility + bonuses.agility;
            const roll = Math.floor(Math.random() * 20) + 1;
            const total = roll + statValue;
            const isSuccess = roll !== 1 && total >= dodgeSpell.hit;
            const rollColor = isSuccess ? '#2ecc71' : '#e74c3c';
            const rollDisplay = `<span style="color:${rollColor}">🎲${roll}</span>`;
            if (roll === 1) {
                logMessage = `${name}'s Dodge: ${rollDisplay} Critical Failure!`;
            } else if (isSuccess) {
                finalDamage = 0;
                dodged = true;
                logMessage = `${name}'s Dodge: ${rollDisplay} Avoided!`;
            } else {
                logMessage = `${name}'s Dodge: ${rollDisplay} Failed!`;
            }
        } else {
            logMessage = `${name} tries to Dodge, but fails!`;
        }
    } else if (reactionType === 'Block') {
        const shield = reactingPlayer.character.equipment.offHand;
        if (shield && shield.reaction && (reactingPlayerState.itemCooldowns[shield.name] || 0) <= 0) {
            reactingPlayerState.itemCooldowns[shield.name] = shield.cooldown;
            const bonuses = getBonusStatsForPlayer(reactingPlayer.character, reactingPlayerState);
            const statValue = reactingPlayer.character.defense + bonuses.defense;
            const roll = Math.floor(Math.random() * 20) + 1;
            const total = roll + statValue;
            const isSuccess = roll !== 1 && total >= shield.reaction.hit;
            const rollColor = isSuccess ? '#2ecc71' : '#e74c3c';
            const rollDisplay = `<span style="color:${rollColor}">🎲${roll}</span>`;
            if (roll === 1) {
                logMessage = `${name}'s Block: ${rollDisplay} Critical Failure!`;
            } else if (isSuccess) {
                const damageReduction = shield.reaction.value;
                finalDamage = Math.max(1, finalDamage - damageReduction);
                blocked = true;
                logMessage = `${name}'s Block: ${rollDisplay} Blocked ${damageReduction} damage!`;
            } else {
                logMessage = `${name}'s Block: ${rollDisplay} Failed!`;
            }
        } else {
            logMessage = `${name} tries to Block, but fails!`;
        }
    }
    // --- NEW LOGIC FOR EVASIVE SHOT REACTION ---
    else if (reactionType === 'Evasive Shot') {
        const evasiveShotSpell = reactingPlayer.character.equippedSpells.find(s => s.name === "Evasive Shot");
        const mainHand = reactingPlayer.character.equipment.mainHand;

        if (evasiveShotSpell && mainHand && (reactingPlayerState.spellCooldowns[evasiveShotSpell.name] || 0) <= 0) {
            reactingPlayerState.spellCooldowns[evasiveShotSpell.name] = evasiveShotSpell.cooldown;
            const bonuses = getBonusStatsForPlayer(reactingPlayer.character, reactingPlayerState);
            const statValue = reactingPlayer.character.agility + bonuses.agility;
            const roll = Math.floor(Math.random() * 20) + 1;
            const total = roll + statValue;
            const { avoidHit, counterHit } = evasiveShotSpell.reactionDetails;

            const isSuccess = roll !== 1 && total >= avoidHit;
            const rollColor = isSuccess ? '#2ecc71' : '#e74c3c';
            const rollDisplay = `<span style="color:${rollColor}">🎲${roll}</span>`;

            if (roll === 1) {
                logMessage = `${name}'s Evasive Shot: ${rollDisplay} Critical Failure!`;
            } else if (isSuccess) {
                finalDamage = 0;
                dodged = true;
                logMessage = `${name}'s Evasive Shot: ${rollDisplay} Avoided!`;

                if (total >= counterHit) {
                    let counterDamage = mainHand.weaponDamage;

                    if (isPvp) {
                        // PVP counter-attack - target is another player
                        const attackerPlayerState = encounter.playerStates.find(p => p.playerId === reaction.attackerPlayerId);
                        if (attackerPlayerState && !attackerPlayerState.isDead) {
                            const attackerCharacter = players[attackerPlayerState.name]?.character;
                            let damageToDeal = counterDamage;

                            if (attackerCharacter) {
                                const attackerBonuses = getBonusStatsForPlayer(attackerCharacter, attackerPlayerState);
                                const resistance = attackerBonuses.physicalResistance || 0;
                                damageToDeal = Math.max(1, counterDamage - resistance);
                            }

                            applyDamage(attackerPlayerState, damageToDeal);

                            let counterLog = ` They counter-attack, dealing ${damageToDeal} damage to ${attackerPlayerState.name}!`;
                            if (damageToDeal < counterDamage) counterLog += ` (${counterDamage - damageToDeal} resisted)`;
                            stateObject.log.push({ message: logMessage + counterLog, type: 'success' });

                            if (attackerPlayerState.health <= 0) {
                                defeatEnemyInParty(io, party, { playerId: attackerPlayerState.playerId }, null);
                            }
                            logMessage = ''; // Clear message to prevent double logging
                        }
                    } else {
                        // PVE counter-attack - target is an enemy card
                        const attackerEnemy = stateObject.zoneCards[reaction.attackerIndex];
                        if (attackerEnemy && attackerEnemy.health > 0) {
                            const resistance = attackerEnemy.buffs?.find(b => b.bonus && b.bonus.physicalResistance)?.bonus.physicalResistance || 0;
                            let damageToDeal = Math.max(1, counterDamage - resistance);

                            applyDamage(attackerEnemy, damageToDeal);

                            let counterLog = ` They counter-attack, dealing ${damageToDeal} damage to ${attackerEnemy.name}!`;
                            stateObject.log.push({ message: logMessage + counterLog, type: 'success' });

                            if (attackerEnemy.health <= 0) {
                                defeatEnemyInParty(io, party, attackerEnemy, reaction.attackerIndex);
                            }
                            logMessage = ''; // Clear message to prevent double logging
                        }
                    }
                }
            } else {
                logMessage = `${name}'s Evasive Shot: ${rollDisplay} Failed!`;
            }
        } else {
            logMessage = `${name} tries to use Evasive Shot, but fails!`;
        }
    }
    // --- END OF NEW LOGIC ---
    // --- PARRY REACTION LOGIC ---
    else if (reactionType === 'Parry') {
        const parrySpell = reactingPlayer.character.equippedSpells.find(s => s.name === "Parry");
        const mainHand = reactingPlayer.character.equipment.mainHand;
        const rangedWeaponTypes = ['Two-Hand Bow', 'Two-Hand Staff'];
        const hasMeleeWeapon = mainHand && mainHand.type === 'weapon' &&
            (mainHand.range === 'melee' || (!mainHand.range && !rangedWeaponTypes.includes(mainHand.weaponType)));

        if (parrySpell && hasMeleeWeapon && (reactingPlayerState.spellCooldowns[parrySpell.name] || 0) <= 0) {
            reactingPlayerState.spellCooldowns[parrySpell.name] = parrySpell.cooldown;
            const bonuses = getBonusStatsForPlayer(reactingPlayer.character, reactingPlayerState);

            // Use defense stat
            const statValue = reactingPlayer.character.defense + (bonuses.defense || 0);

            const roll = Math.floor(Math.random() * 20) + 1;
            const total = roll + statValue;
            const { avoidHit, counterHit } = parrySpell.reactionDetails;

            const isSuccess = roll !== 1 && total >= avoidHit;
            const rollColor = isSuccess ? '#2ecc71' : '#e74c3c';
            const rollDisplay = `<span style="color:${rollColor}">🎲${roll}</span>`;

            if (roll === 1) {
                logMessage = `${name}'s Parry: ${rollDisplay} Critical Failure!`;
            } else if (isSuccess) {
                finalDamage = 0;
                dodged = true;
                logMessage = `${name}'s Parry: ${rollDisplay} Deflected!`;

                if (total >= counterHit) {
                    let counterDamage = mainHand.weaponDamage;

                    if (isPvp) {
                        // PVP counter-attack - target is another player
                        const attackerPlayerState = encounter.playerStates.find(p => p.playerId === reaction.attackerPlayerId);
                        if (attackerPlayerState && !attackerPlayerState.isDead) {
                            const attackerCharacter = players[attackerPlayerState.name]?.character;
                            let damageToDeal = counterDamage;

                            if (attackerCharacter) {
                                const attackerBonuses = getBonusStatsForPlayer(attackerCharacter, attackerPlayerState);
                                const resistance = attackerBonuses.physicalResistance || 0;
                                damageToDeal = Math.max(1, counterDamage - resistance);
                            }

                            applyDamage(attackerPlayerState, damageToDeal);

                            let counterLog = ` They riposte, dealing ${damageToDeal} damage to ${attackerPlayerState.name}!`;
                            if (damageToDeal < counterDamage) counterLog += ` (${counterDamage - damageToDeal} resisted)`;
                            stateObject.log.push({ message: logMessage + counterLog, type: 'success' });

                            if (attackerPlayerState.health <= 0) {
                                defeatEnemyInParty(io, party, { playerId: attackerPlayerState.playerId }, null);
                            }
                            logMessage = ''; // Clear message to prevent double logging
                        }
                    } else {
                        // PVE counter-attack - target is an enemy card
                        const attackerEnemy = stateObject.zoneCards[reaction.attackerIndex];
                        if (attackerEnemy && attackerEnemy.health > 0) {
                            const resistance = attackerEnemy.buffs?.find(b => b.bonus && b.bonus.physicalResistance)?.bonus.physicalResistance || 0;
                            let damageToDeal = Math.max(1, counterDamage - resistance);

                            applyDamage(attackerEnemy, damageToDeal);

                            let counterLog = ` They riposte, dealing ${damageToDeal} damage to ${attackerEnemy.name}!`;
                            stateObject.log.push({ message: logMessage + counterLog, type: 'success' });

                            if (attackerEnemy.health <= 0) {
                                defeatEnemyInParty(io, party, attackerEnemy, reaction.attackerIndex);
                            }
                            logMessage = ''; // Clear message to prevent double logging
                        }
                    }
                }
            } else {
                logMessage = `${name}'s Parry: ${rollDisplay} Failed!`;
            }
        } else {
            logMessage = `${name} tries to Parry, but fails!`;
        }
    }
    // --- END PARRY LOGIC ---
    else {
        logMessage = `${name} braces for the attack!`;
    }

    if (logMessage) stateObject.log.push({ message: logMessage, type: dodged || blocked ? 'success' : 'reaction' });

    if ((finalDamage > 0 || (reaction.debuff && !dodged))) {
        let damageToDeal = 0;
        let damageMessage = `${reaction.attackerName} ${reaction.message}`;

        if (finalDamage > 0) {
            damageToDeal = finalDamage;
            if (reaction.damageType === 'Physical') {
                const bonuses = getBonusStatsForPlayer(reactingPlayer.character, reactingPlayerState);
                const resistance = bonuses.physicalResistance || 0;
                damageToDeal = Math.max(1, finalDamage - resistance);
            }
            applyDamage(reactingPlayerState, damageToDeal);
            damageMessage += ` It hits ${name} for ${damageToDeal} damage! [id:${reactingPlayerState.playerId}]`;
            if (damageToDeal < finalDamage) {
                damageMessage += ` (${finalDamage - damageToDeal} resisted)`;
            }
        }

        if (reaction.debuff && !dodged) {
            const debuff = reaction.debuff;
            const existingIndex = reactingPlayerState.debuffs.findIndex(d => d.type.toLowerCase() === debuff.type.toLowerCase());
            if (existingIndex !== -1) reactingPlayerState.debuffs.splice(existingIndex, 1);
            reactingPlayerState.debuffs.push({ ...debuff });
            damageMessage += ` ${name} is now ${debuff.type}!`;
        }
        stateObject.log.push({ message: damageMessage, type: 'damage' });
    }
    if (reactingPlayerState.health <= 0) {
        reactingPlayerState.health = 0;
        reactingPlayerState.isDead = true;
        if (isPvp) {
            handlePvpPlayerDeath(io, reactingPlayer, encounter);
        } else {
            if (reactingPlayer.character) {
                reactingPlayerState.lootableInventory = [...reactingPlayer.character.inventory.filter(Boolean)];
                reactingPlayer.character.inventory = Array(28).fill(null);
                if (reactingPlayer.id) io.to(reactingPlayer.id).emit('characterUpdate', reactingPlayer.character);
            }
        }
        stateObject.log.push({ message: `${name} has been defeated!`, type: 'damage' });
    }
    const wasFleeing = reaction.isFleeing || false;
    stateObject.pendingReaction = null;
    if (isPvp) {
        const duration = encounter.turnTimeRemaining;
        if (duration > 0) {
            const timerEndsAt = Date.now() + duration;
            encounter.turnTimerId = setTimeout(() => {
                const currentEncounter = pvpEncounters[encounter.id];
                if (currentEncounter) {
                    currentEncounter.log.push({ message: `Team ${currentEncounter.activeTeam}'s time expired! Turn ends.`, type: 'damage' });
                    currentEncounter.playerStates.forEach(p => {
                        if (p.team === currentEncounter.activeTeam && !p.isDead) p.turnEnded = true;
                    });
                    startNextPvpTeamTurn(io, currentEncounter.id);
                }
            }, duration);
            encounter.turnTimerEndsAt = timerEndsAt;
        }
        const defendingTeam = reactingPlayerState.team;
        const allDefendersDead = encounter.playerStates.filter(p => p.team === defendingTeam).every(p => p.isDead);
        if (allDefendersDead) {
            const winningTeam = defendingTeam === 'A' ? 'B' : 'A';
            const winningParty = (winningTeam === 'A') ? parties[encounter.partyAId] : parties[encounter.partyBId];
            const losingParty = (winningTeam === 'A') ? parties[encounter.partyBId] : parties[encounter.partyAId];
            endPvpEncounter(io, winningParty, losingParty);
        } else {
            broadcastAdventureUpdate(io, party);
        }
        return;
    }
    const lastAttackerIndex = reaction.attackerIndex;
    const enemies = party.sharedState.zoneCards.map((c, i) => ({ card: c, index: i })).filter(e => e.card && e.card.type === 'enemy');
    const lastEnemyListIndex = enemies.findIndex(e => e.index === lastAttackerIndex);
    await runEnemyPhaseForParty(io, party.id, wasFleeing, lastEnemyListIndex + 1);
}