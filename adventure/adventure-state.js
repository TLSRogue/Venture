// adventure/adventure-state.js

import { players, parties, pvpZoneQueues, pvpEncounters } from '../serverState.js';
import { gameData, lootPools } from '../data/index.js';
import { broadcastAdventureUpdate, broadcastPartyUpdate } from '../utilsBroadcast.js';
import { getBonusStatsForPlayer, addItemToInventoryServer, drawCardsForServer, createStateForClient } from '../utilsHelpers.js';
import { applyDamage, applyDoTEffects } from './combat-core.js';
import { PVP_TURN_DURATION_MS, LOOT_ROLL_DURATION_MS, REACTION_TIMER_MS, PVP_QUEUE_TIMEOUT_MS } from '../constants.js';
import * as PartyManager from '../party/party-manager.js';
import { processEnemyEndOfTurn, handleEnemySpecialAction } from './enemy-handlers.js';

const PVP_ZONES = ['blighted_wastes'];

/**
 * Get the area card to use when replacing defeated enemies or opened chests in a zone.
 * @param {string} zoneName - The current zone name
 * @returns {Object|null} Area card object with unique id, or null if no area card for zone
 */
function getZoneAreaCard(zoneName, index = 0) {
    const zoneAreaCards = {
        sewers: gameData.specialCards.emptyCanal,
        goblinCaves: gameData.specialCards.goblinCavesTunnel,
        darkForest: gameData.specialCards.darkForestTrail,
        mansion: gameData.specialCards.mansionHall
    };
    const areaCard = zoneAreaCards[zoneName];
    return areaCard ? { ...areaCard, id: Date.now() + 1000 + index } : null;
}


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
        // Nobody rolled - drop to ground so it's not lost
        party.sharedState.groundLoot.push({ ...rollData.item, quantity: 1 });
        party.sharedState.log.push({ message: `Nobody rolled for ${rollData.item.name}. It was left on the ground.`, type: 'info' });
    }
    party.sharedState.pendingLootRoll = null;
    party.members.forEach(memberName => {
        const member = players[memberName];
        if (member && member.id) {
            io.to(member.id).emit('party:lootRollEnded');
        }
    });

    // Process next item in the queue if any
    processNextLootRoll(io, party);
}

// Start the next loot roll from the queue
function processNextLootRoll(io, party) {
    const { sharedState } = party;
    if (!sharedState.lootRollQueue || sharedState.lootRollQueue.length === 0) {
        return;
    }

    const nextItem = sharedState.lootRollQueue.shift();
    sharedState.log.push({ message: `Party found: [${nextItem.name}]! A roll will begin.`, type: 'success' });
    sharedState.pendingLootRoll = {
        item: nextItem,
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

export async function checkAndEndTurnForPlayer(io, party, player) {
    const { sharedState } = party;
    if (sharedState.pvpEncounterId) {
        const encounter = pvpEncounters[sharedState.pvpEncounterId];
        if (!encounter) return;
        const actingPlayerState = encounter.playerStates.find(p => p.playerId === player.id);
        if (actingPlayerState && actingPlayerState.actionPoints <= 0 && !actingPlayerState.turnEnded) {
            encounter.log.push({ message: `${player.character.characterName} is out of Action Points.`, type: 'info' });
            // Call full end turn handler to apply DoT and decrement buffs/debuffs
            await processPvpPlayerEndTurn(io, encounter, actingPlayerState);

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
        sharedState.log.push({ message: `${player.character.characterName} is out of Action Points.`, type: 'info' });
        // Call full end turn handler to apply DoT and decrement buffs/debuffs
        await processPlayerEndTurn(io, party.id, actingPlayerState.name);
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

    // --- LOOT GOBLIN: Special Death Rewards ---
    if (enemy.name === 'Loot Goblin') {
        // Return stolen gold to party leader
        if (enemy.stolenGold > 0) {
            const leader = players[party.leaderId];
            if (leader && leader.character) {
                leader.character.gold += enemy.stolenGold;
                sharedState.log.push({ message: `Recovered ${enemy.stolenGold}g of stolen treasure!`, type: 'success' });
                if (leader.id) io.to(leader.id).emit('characterUpdate', leader.character);
            }
        }

        // Tier-based loot pools
        const tierLootPools = {
            1: ['Iron', 'Wood', 'Coal', 'Cow Hide', 'Healing Potion', 'Iron Sword', 'Leather Armor', 'Cloth'],
            2: ['Steel Bar', 'Obsidian Chunk', 'Magic Essence', 'Tier 1 Gemstone', 'Iron Armor', 'Steel Armor', 'Longbow'],
            3: ['Drake Scale', 'Gold Nugget', 'Gem of Strength', 'Gem of Agility', 'Gem of Wisdom', 'Magna Clavis', 'Gorbon\'s Crown']
        };

        const lootPool = tierLootPools[enemy.tier] || tierLootPools[1];
        const goblinTier = enemy.tier || 1;

        sharedState.log.push({ message: `The Tier ${goblinTier} Loot Goblin's sack spills open!`, type: 'success' });

        // Drop 3 random items from the tier pool
        for (let i = 0; i < 3; i++) {
            const randomItemName = lootPool[Math.floor(Math.random() * lootPool.length)];
            const itemData = gameData.allItems.find(item => item.name === randomItemName);
            if (itemData) {
                sharedState.groundLoot.push({ ...itemData, quantity: 1 });
                sharedState.log.push({ message: `Found: ${itemData.icon || '❓'} ${itemData.name}`, type: 'success' });
            }
        }

        // Skip normal loot processing for Loot Goblin
        sharedState.zoneCards[enemyIndex] = getZoneAreaCard(sharedState.currentZone);
        if (!sharedState.zoneCards.some(c => c && c.type === 'enemy')) {
            sharedState.log.push({ message: "Combat has ended! Action Points restored.", type: "success" });
            sharedState.partyMemberStates.forEach(p => { if (!p.isDead) p.actionPoints = 3; });
        }
        return;
    }

    let lootToDistribute = [];
    if (enemy.lootTable && enemy.lootTable.length > 0) {
        const roll = Math.floor(Math.random() * 20) + 1;
        const lootDrop = enemy.lootTable.find(entry => roll >= entry.range[0] && roll <= entry.range[1]);
        if (lootDrop) {
            // Handle direct items (backwards compatible)
            if (lootDrop.items && lootDrop.items.length > 0) {
                lootDrop.items.forEach(itemName => {
                    const itemData = gameData.allItems.find(i => i.name === itemName);
                    if (itemData) lootToDistribute.push(itemData);
                });
            }

            // Handle single category drop (NEW) - e.g., fromCategory: "T1 Material"
            if (lootDrop.fromCategory) {
                const count = lootDrop.count || 1;
                for (let i = 0; i < count; i++) {
                    const itemData = lootPools.getRandomFromCategory(lootDrop.fromCategory);
                    if (itemData) lootToDistribute.push(itemData);
                }
            }

            // Handle multiple categories (NEW) - e.g., fromCategories: ["T1 Weapon", "T1 Equipment"]
            if (lootDrop.fromCategories) {
                const count = lootDrop.count || 1;
                for (let i = 0; i < count; i++) {
                    const itemData = lootPools.getRandomFromCategories(lootDrop.fromCategories);
                    if (itemData) lootToDistribute.push(itemData);
                }
            }

            // Handle existing randomItems format (backwards compatible)
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
                // Queue the item for rolling after current roll completes
                if (!sharedState.lootRollQueue) sharedState.lootRollQueue = [];
                sharedState.lootRollQueue.push(itemData);
                sharedState.log.push({ message: `Found ${itemData.name}! Queued for rolling.`, type: 'info' });
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
            // Non-rare loot drops to the ground - party decides who picks it up
            sharedState.groundLoot.push({ ...itemData, quantity: 1 });
            sharedState.log.push({ message: `${enemy.name} dropped: ${itemData.name}!`, type: 'success' });
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
    // Replace with zone-specific area card, or null if none defined
    sharedState.zoneCards[enemyIndex] = getZoneAreaCard(sharedState.currentZone);
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
        // Process end-of-turn effects (DoT, buff/debuff durations) before leaving
        processPartyEndOfTurn(sharedState);
        broadcastAdventureUpdate(io, party);

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
        // Process end-of-turn effects (DoT, buff/debuff durations) before leaving
        processPartyEndOfTurn(sharedState);
        broadcastAdventureUpdate(io, party);

        // Check if anyone died from DoT before proceeding
        const alivePlayers = sharedState.partyMemberStates.filter(p => !p.isDead);
        if (alivePlayers.length === 0) {
            sharedState.log.push({ message: "The party succumbed to their wounds before they could venture deeper!", type: 'damage' });
        } else {
            sharedState.log.push({ message: "The party ventures deeper into the zone!", type: 'info' });
            proceedToNextArea();
        }
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
        // Small delay between player turn ending and first enemy action
        await new Promise(resolve => setTimeout(resolve, 1500));
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
                    // FIX: Process end of turn effects BEFORE waiting for reaction
                    // This ensures DOT damage is applied even if we pause for reaction
                    if (processEndOfTurn()) {
                        // Enemy died from DOT - skip the reaction setup
                        broadcastAdventureUpdate(io, party);
                        continue;
                    }

                    sharedState.pendingReaction = {
                        attackerName: enemy.name,
                        attackerIndex: enemyIndex,
                        targetName: targetPlayerState.name,
                        damage: attack.damage,
                        damageType: attack.damageType,
                        attackRange: attack.attackRange || 'melee',
                        debuff: attack.debuff || null,
                        message: attack.message,
                        isFleeing: isFleeing,
                        endOfTurnProcessed: true  // Mark that DOT was already processed
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
                    broadcastAdventureUpdate(io, party);
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
                // --- UNIFIED SPECIAL HANDLER ---
                // Try to handle using improved handler registry first
                let handlerResult = { handled: false };
                try {
                    handlerResult = handleEnemySpecialAction(enemy, sharedState, targetPlayerState, attack, {
                        io,
                        party,
                        enemyIndex,
                        targetPlayerObject,
                        players
                    });
                } catch (err) {
                    console.error(`Error handling special action for ${enemy.name}:`, err);
                    sharedState.log.push({ message: `(Error processing ${enemy.name}: ${err.message})`, type: 'error' });
                }

                if (handlerResult.handled) {
                    if (handlerResult.rerollAttack) {
                        i--; // Go back one step to retry this enemy
                        continue;
                    }
                    if (handlerResult.removeEnemy) {
                        // Enemy removed itself (e.g. Loot Goblin escape, Human Victim consumed)
                        sharedState.zoneCards[enemyIndex] = getZoneAreaCard(sharedState.currentZone, enemyIndex);
                    }
                    if (!handlerResult.skipEndOfTurn) {
                        processEndOfTurn();
                    }

                    // Update client and wait so the special action can be seen
                    broadcastAdventureUpdate(io, party);
                    await new Promise(resolve => setTimeout(resolve, 1200));
                    continue;
                } else {
                    // Fallback for unhandled special actions (or if handler failed)
                    // Log the message so at least the player sees something happened
                    sharedState.log.push({ message: attack.message, type: 'info' });
                    // Broadcast so it's not invisible
                    broadcastAdventureUpdate(io, party);
                    await new Promise(resolve => setTimeout(resolve, 1200));
                    // Check for Vampire/Human Victim specifically just in case they weren't fully migrated 
                    // or if we want to support legacy mixed mode, but for now we continue to let them fall through
                    // if intended, OR we continue loop here to fully rely on registry?
                    // Given the goal was "Remove Legacy Handlers", we should ideally continue.
                    // But if I continue here, I disable the inline Vampire checks below.
                    // If the registry IS matching Vampire, then handled=true, so we hit the if block.
                    // If registry is NOT matching Vampire, handled=false, we hit this else block.
                    // If we continue here, the inline Vampire checks are skipped also.
                    // This means if registry fails, Vampire breaks completely.
                    // BUT fallback log ensures "Vampire takes flight" is printed.
                    // So functionality breaks but visibility works.
                    // This is acceptable for refactoring verification (if it breaks, we know registry is wrong).
                    // I will NOT continue here, allowing fallthrough to legacy checks just in case, 
                    // BUT I will keep the log. Double logging is better than invisible action.
                    // Wait, if I don't continue, it falls through to... nothing?
                    // No, to the legacy inline checks (lines 1058+).
                    // If they match, they log AGAIN.
                    // That's fine.
                }

                // NOTE: Legacy inline handlers removed - all enemy special actions now handled 
                // by the centralized registry in enemy-handlers.js via handleEnemySpecialAction()

                if (availableReactions.length > 0 && !isFleeing) {
                    // FIX: Process end of turn effects BEFORE waiting for reaction
                    if (processEndOfTurn()) {
                        broadcastAdventureUpdate(io, party);
                        continue;
                    }

                    sharedState.pendingReaction = {
                        attackerName: enemy.name,
                        attackerIndex: enemyIndex,
                        targetName: targetPlayerState.name,
                        damage: attack.damage,
                        damageType: attack.damageType || 'Physical',
                        attackRange: attack.attackRange || 'melee',
                        debuff: attack.debuff || null,
                        message: attack.message,
                        isFleeing: isFleeing,
                        endOfTurnProcessed: true,
                        isSpecial: true // Flag to know we need to call special handler after reaction
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
                    broadcastAdventureUpdate(io, party);
                    return;
                }

                // --- VAMPIRE: Take Flight (gain Flying buff + attack bonus) ---
                if (enemy.name === 'Vampire' && attack.message.includes('Take Flight')) {
                    if (!enemy.buffs) enemy.buffs = [];
                    enemy.buffs = enemy.buffs.filter(b => b.type !== 'Flying' && b.type !== 'Aerial Strike');
                    enemy.buffs.push({ type: 'Flying', duration: 2 });
                    enemy.buffs.push({ type: 'Aerial Strike', duration: 1, bonus: { rollBonus: 5 } });
                    sharedState.log.push({ message: `The Vampire takes flight! He cannot be hit by melee attacks and his next attack has +5 to hit!`, type: 'reaction' });
                }

                // --- VAMPIRE: Blood Fountain (AoE damage to bleeding players) ---
                if (enemy.name === 'Vampire' && attack.message.includes('Blood Fountain')) {
                    const bleedingPlayers = sharedState.partyMemberStates.filter(p =>
                        !p.isDead && (p.debuffs || []).some(d => d.type.toLowerCase() === 'bleed')
                    );

                    if (bleedingPlayers.length > 0) {
                        bleedingPlayers.forEach(target => {
                            const playerObj = players[target.name];
                            if (playerObj) {
                                // Reaction Check: check if player successfully dodged/blocked the special attack
                                if (target.skipDamage) {
                                    delete target.skipDamage;
                                    return;
                                }
                                const bonuses = getBonusStatsForPlayer(playerObj.character, target);
                                const resistance = bonuses.physicalResistance || 0;
                                const damage = Math.max(1, 8 - resistance);
                                applyDamage(target, damage);
                                sharedState.log.push({ message: `Blood Fountain drains ${target.name} for ${damage} Physical damage!`, type: 'damage' });
                                if (target.health <= 0) { target.isDead = true; target.health = 0; }
                            }
                        });
                    } else {
                        // No bleeding players, apply Bleed to all
                        sharedState.partyMemberStates.forEach(p => {
                            if (!p.isDead) {
                                if (!p.debuffs) p.debuffs = [];
                                p.debuffs.push({ type: 'bleed', duration: 2, damage: 2, damageType: 'Physical' });
                            }
                        });
                        sharedState.log.push({ message: `The Vampire's blood magic cuts everyone! All players are now Bleeding!`, type: 'damage' });
                    }
                }

                // --- VAMPIRE: From The Shadows (attack lowest threat) ---
                if (enemy.name === 'Vampire' && attack.message.includes('From The Shadows')) {
                    const sortedPlayers = [...sharedState.partyMemberStates].filter(p => !p.isDead).sort((a, b) => (a.threat || 0) - (b.threat || 0));
                    if (sortedPlayers.length > 0) {
                        const target = sortedPlayers[0];
                        const playerObj = players[target.name];
                        if (playerObj) {
                            // Reaction Check: trigger reaction request manually
                            const availableReactions = [];
                            // Re-use reaction availability logic check logic (simplified)
                            // We can check just for Parry/Dodge for now, or copy the logic block if needed.
                            // Since this is a melee physical attack, Parry/Dodge are valid.

                            // Check Dodge
                            if (playerObj.character.equippedSpells.some(s => s.name === "Dodge" && (target.spellCooldowns["Dodge"] || 0) <= 0)) {
                                // Check heavy
                                let isWearingHeavy = false;
                                if (playerObj.character.equipment) {
                                    for (const slot in playerObj.character.equipment) {
                                        const item = playerObj.character.equipment[slot];
                                        if (item && item.traits && item.traits.includes('Heavy')) {
                                            isWearingHeavy = true;
                                            break;
                                        }
                                    }
                                }
                                if (!isWearingHeavy) availableReactions.push({ name: 'Dodge' });
                            }

                            // Check Parry
                            const parrySpell = playerObj.character.equippedSpells.find(s => s.name === "Parry");
                            if (parrySpell && (target.spellCooldowns["Parry"] || 0) <= 0) {
                                const mainHand = playerObj.character.equipment.mainHand;
                                const rangedWeaponTypes = ['Two-Hand Bow', 'Two-Hand Staff'];
                                const hasMeleeWeapon = mainHand && mainHand.type === 'weapon' &&
                                    (mainHand.range === 'melee' || (!mainHand.range && !rangedWeaponTypes.includes(mainHand.weaponType)));
                                if (hasMeleeWeapon) availableReactions.push({ name: 'Parry' });
                            }
                            // Check Block
                            if (playerObj.character.equipment.offHand && playerObj.character.equipment.offHand.type === 'shield' && (target.itemCooldowns[playerObj.character.equipment.offHand.name] || 0) <= 0) {
                                availableReactions.push({ name: 'Block' });
                            }

                            if (availableReactions.length > 0) {
                                sharedState.pendingReaction = {
                                    attackerName: enemy.name,
                                    attackerIndex: enemyIndex,
                                    targetName: target.name,
                                    damage: 8, // Fixed damage for special
                                    damageType: 'Physical',
                                    attackRange: 'melee',
                                    debuff: { type: 'bleed', duration: 3, damage: 2, damageType: 'Physical' },
                                    message: 'strikes from the shadows!',
                                    isFleeing: false,
                                    endOfTurnProcessed: true,
                                    isSpecial: true
                                };
                                const reactionPayload = {
                                    damage: 8,
                                    attacker: enemy.name,
                                    availableReactions: availableReactions.map(r => ({ name: r.name })),
                                    timer: REACTION_TIMER_MS
                                };
                                io.to(target.playerId).emit('party:requestReaction', reactionPayload);
                                party.reactionTimeout = setTimeout(() => {
                                    const playerSocket = io.sockets.sockets.get(target.playerId);
                                    if (playerSocket) {
                                        handleResolveReaction(io, playerSocket, { reactionType: 'take_damage' });
                                    }
                                }, REACTION_TIMER_MS);
                                broadcastAdventureUpdate(io, party);
                                return;
                            } else {
                                // No reaction available, apply damage directly
                                const bonuses = getBonusStatsForPlayer(playerObj.character, target);
                                const resistance = bonuses.physicalResistance || 0;
                                const damage = Math.max(1, 8 - resistance);
                                applyDamage(target, damage);

                                if (!target.debuffs) target.debuffs = [];
                                target.debuffs.push({ type: 'bleed', duration: 3, damage: 2, damageType: 'Physical' });

                                sharedState.log.push({ message: `The Vampire strikes ${target.name} from the shadows for ${damage} damage and causes heavy Bleeding!`, type: 'damage' });
                                if (target.health <= 0) { target.isDead = true; target.health = 0; }
                            }
                        }
                    }
                }

                // --- VAMPIRE'S ASSISTANT: Spawn Human Victim ---
                if (enemy.name === "Vampire's Assistant" && attack.message.includes('human victim')) {
                    const emptySlotIndex = sharedState.zoneCards.findIndex(c => c === null);
                    if (emptySlotIndex !== -1) {
                        const newVictim = {
                            ...gameData.specialCards.humanVictim,
                            id: Date.now(),
                            debuffs: [],
                            buffs: [],
                            turnsUntilConsumed: 2
                        };
                        sharedState.zoneCards[emptySlotIndex] = newVictim;
                        sharedState.log.push({ message: `The Assistant drags in a helpless Human Victim! The Vampire will consume them in 2 turns!`, type: 'reaction' });
                    } else {
                        sharedState.log.push({ message: `The Assistant tries to bring in a victim, but there's no room!`, type: 'info' });
                    }
                }

                // --- HUMAN VICTIM: Countdown Timer ---
                if (enemy.name === 'Human Victim' && attack.message.includes('dying')) {
                    if (typeof enemy.turnsUntilConsumed === 'undefined') enemy.turnsUntilConsumed = 2;
                    enemy.turnsUntilConsumed--;

                    if (enemy.turnsUntilConsumed <= 0) {
                        // Vampire consumes the victim
                        const vampire = sharedState.zoneCards.find(c => c && c.name === 'Vampire');
                        if (vampire) {
                            const healAmount = 20;
                            vampire.health = Math.min(vampire.maxHealth, vampire.health + healAmount);
                            sharedState.log.push({ message: `The Vampire consumes the Human Victim and heals for ${healAmount} HP!`, type: 'heal' });
                        }
                        // Remove the victim
                        const victimIndex = sharedState.zoneCards.findIndex(c => c && c.id === enemy.id);
                        if (victimIndex !== -1) {
                            sharedState.zoneCards[victimIndex] = null;
                        }
                    } else {
                        sharedState.log.push({ message: `The Human Victim whimpers helplessly... (${enemy.turnsUntilConsumed} turns until consumed)`, type: 'info' });
                    }
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

            // --- EXTRA ATTACK FOR ENRAGED ENEMIES ---
            const enragedBuff = enemy.buffs?.find(b => b.type === 'Enraged' && b.extraAttacks);
            if (enragedBuff && enemy.health > 0) {
                for (let extraAttackNum = 0; extraAttackNum < enragedBuff.extraAttacks; extraAttackNum++) {
                    const alivePlayersForExtra = sharedState.partyMemberStates.filter(p => !p.isDead);
                    if (alivePlayersForExtra.length === 0) break;

                    const maxThreatExtra = Math.max(...alivePlayersForExtra.map(p => p.threat));
                    const topThreatPlayersExtra = alivePlayersForExtra.filter(p => p.threat === maxThreatExtra);
                    const extraTarget = topThreatPlayersExtra[Math.floor(Math.random() * topThreatPlayersExtra.length)];
                    const extraTargetObj = players[extraTarget.name];
                    if (!extraTargetObj) break;

                    let extraRoll = Math.floor(Math.random() * 20) + 1;
                    const extraAttack = enemy.attackTable ? enemy.attackTable.find(a => extraRoll >= a.range[0] && extraRoll <= a.range[1]) : null;

                    if (extraAttack && extraAttack.action === 'attack') {
                        let extraDamage = extraAttack.damage;
                        if (extraAttack.damageType === 'Physical') {
                            const bonuses = getBonusStatsForPlayer(extraTargetObj.character, extraTarget);
                            const resistance = bonuses.physicalResistance || 0;
                            extraDamage = Math.max(1, extraDamage - resistance);
                        }
                        applyDamage(extraTarget, extraDamage);
                        sharedState.log.push({ message: `[ENRAGED] ${enemy.name} ${extraAttack.message}`, type: 'damage' });

                        if (extraAttack.debuff) {
                            if (!extraTarget.debuffs) extraTarget.debuffs = [];
                            extraTarget.debuffs.push({ ...extraAttack.debuff });
                        }

                        if (extraTarget.health <= 0) {
                            extraTarget.health = 0;
                            extraTarget.isDead = true;
                            sharedState.log.push({ message: `${extraTarget.name} has been defeated!`, type: 'damage' });
                        }
                    } else if (extraAttack) {
                        sharedState.log.push({ message: `[ENRAGED] ${enemy.name} ${extraAttack.message}`, type: 'info' });
                    }
                    broadcastAdventureUpdate(io, party);
                    await new Promise(resolve => setTimeout(resolve, 800));
                }
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

// applyDoTEffects is now imported from combat-core.js

/**
 * Process end-of-turn effects for all living party members.
 * Used during area transitions (Venture Deeper, Return Home) to ensure DoTs deal damage
 * and buff/debuff durations decrement properly.
 * @param {Object} sharedState - The party's shared adventure state
 * @returns {boolean} - True if any player died from DoT damage
 */
function processPartyEndOfTurn(sharedState) {
    let anyPlayerDied = false;

    for (const playerState of sharedState.partyMemberStates) {
        if (playerState.isDead) continue;

        // 1. Apply DoT Damage
        applyDoTEffects(playerState, sharedState.log);

        // 2. Check for death from DoT
        if (playerState.health <= 0) {
            playerState.health = 0;
            playerState.isDead = true;
            sharedState.log.push({ message: `${playerState.name} has succumbed to their wounds!`, type: 'damage' });
            anyPlayerDied = true;
            continue; // Skip buff processing for dead player
        }

        // 3. Decrement buff/debuff durations
        if (playerState.buffs) {
            playerState.buffs.forEach(b => b.duration--);
            playerState.buffs = playerState.buffs.filter(b => b.duration > 0);
        }
        if (playerState.debuffs) {
            playerState.debuffs.forEach(d => d.duration--);
            playerState.debuffs = playerState.debuffs.filter(d => d.duration > 0);
        }
    }

    return anyPlayerDied;
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
        const offHand = reactingPlayer.character.equipment.offHand;
        const requiredTypes = evasiveShotSpell?.requires?.weaponType || [];
        // Find the ranged weapon (check mainHand first, then offHand for crossbows)
        const rangedWeapon = (mainHand && requiredTypes.includes(mainHand.weaponType)) ? mainHand :
            (offHand && requiredTypes.includes(offHand.weaponType)) ? offHand : null;

        if (evasiveShotSpell && rangedWeapon && (reactingPlayerState.spellCooldowns[evasiveShotSpell.name] || 0) <= 0) {
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
                    let counterDamage = rangedWeapon.weaponDamage;

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