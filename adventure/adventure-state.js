// adventure/adventure-state.js

import { players, parties, pvpZoneQueues } from '../serverState.js';
import { gameData } from '../game-data.js';
import { broadcastAdventureUpdate, broadcastPartyUpdate } from '../utilsBroadcast.js';
import { getBonusStatsForPlayer, addItemToInventoryServer, drawCardsForServer } from '../utilsHelpers.js';

const PVP_ZONES = ['blighted_wastes'];

// --- BUG FIX START: New helper function to remove circular references for the client ---
function createStateForClient(sharedState) {
    if (!sharedState) return null;
    
    // Create a shallow copy of the main state object.
    const clientState = { ...sharedState };

    // Deep copy zoneCards and remove the circular reference (_playerStateRef).
    clientState.zoneCards = sharedState.zoneCards.map(card => {
        if (card && card._playerStateRef) {
            // Use object destructuring to create a new card object omitting the ref.
            const { _playerStateRef, ...safeCard } = card; 
            return safeCard;
        }
        return card; // Return non-player cards as-is.
    });

    return clientState;
}
// --- BUG FIX END ---


// --- PVP HELPER FUNCTIONS ---

export function handlePvpPlayerDeath(io, defeatedPlayer, party) {
    const { sharedState } = party;
    const character = defeatedPlayer.character;

    const allLoot = [...character.inventory.filter(Boolean)];
    for (const slot in character.equipment) {
        if (character.equipment[slot]) {
            if (slot === 'offHand' && character.equipment[slot] === character.equipment.mainHand) {
                continue;
            }
            allLoot.push(character.equipment[slot]);
        }
    }

    sharedState.groundLoot.push(...allLoot);

    character.inventory = Array(24).fill(null);
    character.equipment = { mainHand: null, offHand: null, helmet: null, armor: null, boots: null, accessory: null, ammo: null };
    
    io.to(defeatedPlayer.id).emit('characterUpdate', character);
    sharedState.log.push({ message: `${character.characterName} has been slain and dropped all of their items!`, type: 'damage' });
}

function endPvpEncounter(io, winningParty, losingParty) {
    if (winningParty.sharedState && winningParty.sharedState.turnTimerId) {
        clearTimeout(winningParty.sharedState.turnTimerId);
    }
    if (losingParty.sharedState && losingParty.sharedState.turnTimerId) {
        clearTimeout(losingParty.sharedState.turnTimerId);
    }

    losingParty.members.forEach(memberName => {
        const memberPlayer = players[memberName];
        if (memberPlayer && memberPlayer.id) {
            io.to(memberPlayer.id).emit('party:adventureEnded');
        }
    });

    if (losingParty.isSoloParty) {
        delete parties[losingParty.id];
    } else {
        losingParty.sharedState = null;
        broadcastPartyUpdate(io, losingParty.id);
    }

    const { sharedState } = winningParty;
    sharedState.pvpEncounter = null;
    sharedState.zoneCards = [];
    sharedState.log.push({ message: "Combat has ended! You may now loot the spoils of victory.", type: 'success' });
    
    sharedState.partyMemberStates.forEach(p => {
        if (!p.isDead) {
            p.actionPoints = 3;
            p.turnEnded = false;
        }
    });

    broadcastAdventureUpdate(io, winningParty.id);
}


function startPvpEncounter(io, partyA, partyB) {
    if (!partyA.sharedState || !partyB.sharedState) {
        console.error("Attempted to start PvP encounter with a party that is missing a sharedState.");
        return;
    }

    const allPlayerStates = [...partyA.sharedState.partyMemberStates, ...partyB.sharedState.partyMemberStates];
    for (const playerState of allPlayerStates) {
        if (!playerState.buffs) playerState.buffs = [];
        if (!playerState.debuffs) playerState.debuffs = [];
    }

    const partyAStates = partyA.sharedState.partyMemberStates;
    const partyBStates = partyB.sharedState.partyMemberStates;

    partyAStates.forEach(p => p.team = 'A');
    partyBStates.forEach(p => p.team = 'B');

    const startingTeam = Math.random() < 0.5 ? 'A' : 'B';
    const firstTurnLogMessage = `Team ${startingTeam} will go first, but with only 1 AP!`;

    if (startingTeam === 'A') {
        partyAStates.forEach(p => p.actionPoints = 1);
    } else {
        partyBStates.forEach(p => p.actionPoints = 1);
    }

    const createPlayerCard = (playerState) => ({
        type: 'enemy',
        playerId: playerState.playerId,
        id: playerState.playerId,
        name: playerState.name,
        icon: playerState.icon,
        health: playerState.health,
        maxHealth: playerState.maxHealth,
        debuffs: playerState.debuffs,
        _playerStateRef: playerState, 
    });
    
    const sharedLoot = [];
    partyA.sharedState.groundLoot = sharedLoot;
    partyB.sharedState.groundLoot = sharedLoot;

    partyA.sharedState.pvpEncounter = { opponentPartyId: partyB.id, activeTeam: startingTeam };
    partyA.sharedState.log.push({ message: `You have encountered an opposing party! Battle begins!`, type: 'damage' });
    partyA.sharedState.log.push({ message: firstTurnLogMessage, type: 'info' });
    partyA.sharedState.zoneCards = partyBStates.map(createPlayerCard);
    
    partyB.sharedState.pvpEncounter = { opponentPartyId: partyA.id, activeTeam: startingTeam };
    partyB.sharedState.log.push({ message: `You have encountered an opposing party! Battle begins!`, type: 'damage' });
    partyB.sharedState.log.push({ message: firstTurnLogMessage, type: 'info' });
    partyB.sharedState.zoneCards = partyAStates.map(createPlayerCard);
    
    const duration = 60000;
    const timerEndsAt = Date.now() + duration;

    const timerId = setTimeout(() => {
        const currentPartyA = parties[partyA.id];
        const currentPartyB = parties[partyB.id];

        if (currentPartyA && currentPartyB && currentPartyA.sharedState && currentPartyA.sharedState.pvpEncounter) {
            const activeParty = startingTeam === 'A' ? currentPartyA : currentPartyB;
            activeParty.sharedState.log.push({ message: `Team ${startingTeam}'s time expired! Turn ends.`, type: 'damage' });
            activeParty.sharedState.partyMemberStates.forEach(p => {
                if (p.team === startingTeam && !p.isDead) p.turnEnded = true;
            });
            startNextPvpTeamTurn(io, activeParty);
        }
    }, duration);

    partyA.sharedState.turnTimerEndsAt = timerEndsAt;
    partyA.sharedState.turnTimerDuration = duration;
    partyA.sharedState.turnTimerId = timerId;
    partyB.sharedState.turnTimerEndsAt = timerEndsAt;
    partyB.sharedState.turnTimerDuration = duration;
    partyB.sharedState.turnTimerId = timerId;

    // --- BUG FIX START: Use the helper function to send a clean state to each party ---
    const stateForPartyA = createStateForClient(partyA.sharedState);
    const stateForPartyB = createStateForClient(partyB.sharedState);

    partyA.members.forEach(memberName => {
        const member = players[memberName];
        if(member && member.id) io.to(member.id).emit('party:adventureStarted', stateForPartyA);
    });
    partyB.members.forEach(memberName => {
        const member = players[memberName];
        if(member && member.id) io.to(member.id).emit('party:adventureStarted', stateForPartyB);
    });
    // --- BUG FIX END ---
}


export function startNextPvpTeamTurn(io, currentParty) {
    if (!currentParty || !currentParty.sharedState || !currentParty.sharedState.pvpEncounter) return; 
    
    const opponentParty = parties[currentParty.sharedState.pvpEncounter.opponentPartyId];
    if (!opponentParty || !opponentParty.sharedState) return;

    if (currentParty.sharedState.turnTimerId) {
        clearTimeout(currentParty.sharedState.turnTimerId);
        currentParty.sharedState.turnTimerId = null;
    }
    if (opponentParty.sharedState.turnTimerId) {
        clearTimeout(opponentParty.sharedState.turnTimerId);
        opponentParty.sharedState.turnTimerId = null;
    }

    const currentTeam = currentParty.sharedState.pvpEncounter.activeTeam;
    const nextTeam = currentTeam === 'A' ? 'B' : 'A';

    const applyTurnStart = (state, newActiveTeam) => {
        state.pvpEncounter.activeTeam = newActiveTeam;
        state.log.push({ message: `--- Team ${newActiveTeam}'s Turn ---`, type: 'info' });
        
        state.partyMemberStates.forEach(p => {
            if (!p.buffs) p.buffs = [];
            if (!p.debuffs) p.debuffs = [];

            if (p.team === newActiveTeam) {
                 if (!p.isDead) {
                    p.actionPoints = 3;
                    p.turnEnded = false;
                }
            }
            p.buffs.forEach(b => b.duration--);
            p.debuffs.forEach(d => d.duration--);
            p.buffs = p.buffs.filter(b => b.duration > 0);
            p.debuffs = p.debuffs.filter(d => d.duration > 0);
            Object.keys(p.weaponCooldowns).forEach(k => { if (p.weaponCooldowns[k] > 0) p.weaponCooldowns[k]--; });
            Object.keys(p.spellCooldowns).forEach(k => { if (p.spellCooldowns[k] > 0) p.spellCooldowns[k]--; });
            Object.keys(p.itemCooldowns).forEach(k => { if (p.itemCooldowns[k] > 0) p.itemCooldowns[k]--; });
        });
    };

    applyTurnStart(currentParty.sharedState, nextTeam);
    applyTurnStart(opponentParty.sharedState, nextTeam);

    const duration = 60000;
    const timerEndsAt = Date.now() + duration;

    const timerId = setTimeout(() => {
        const partyForTimer = parties[currentParty.id];
        const opponentForTimer = parties[opponentParty.id];

        if (partyForTimer && opponentForTimer && partyForTimer.sharedState && partyForTimer.sharedState.pvpEncounter) {
            const activeParty = (partyForTimer.sharedState.partyMemberStates[0].team === nextTeam) ? partyForTimer : opponentForTimer;
            activeParty.sharedState.log.push({ message: `Team ${nextTeam}'s time expired! Turn ends.`, type: 'damage' });
            activeParty.sharedState.partyMemberStates.forEach(p => {
                if (p.team === nextTeam && !p.isDead) p.turnEnded = true;
            });
            startNextPvpTeamTurn(io, activeParty);
        }
    }, duration);

    currentParty.sharedState.turnTimerEndsAt = timerEndsAt;
    currentParty.sharedState.turnTimerDuration = duration;
    currentParty.sharedState.turnTimerId = timerId;
    opponentParty.sharedState.turnTimerEndsAt = timerEndsAt;
    opponentParty.sharedState.turnTimerDuration = duration;
    opponentParty.sharedState.turnTimerId = timerId;

    broadcastAdventureUpdate(io, currentParty.id);
    broadcastAdventureUpdate(io, opponentParty.id);
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
    const partyId = party.id;
    const { sharedState } = party;
    const actingPlayerState = sharedState.partyMemberStates.find(p => p.playerId === player.id);

    if (actingPlayerState && actingPlayerState.actionPoints <= 0 && !actingPlayerState.turnEnded) {
        actingPlayerState.turnEnded = true;
        sharedState.log.push({ message: `${player.character.characterName} is out of Action Points and their turn ends.`, type: 'info' });
        
        const activeTeam = sharedState.pvpEncounter ? sharedState.pvpEncounter.activeTeam : null;
        const teamMembers = activeTeam ? sharedState.partyMemberStates.filter(p => p.team === activeTeam) : sharedState.partyMemberStates;
        const allTurnsEnded = teamMembers.every(p => p.turnEnded || p.isDead);

        if (allTurnsEnded) {
            if (sharedState.pvpEncounter) {
                startNextPvpTeamTurn(io, party);
            } else {
                await runEnemyPhaseForParty(io, partyId);
            }
        }
    }
}


export function defeatEnemyInParty(io, party, enemy, enemyIndex) {
    const { sharedState } = party;

    if (enemy.playerId) {
        const defeatedPlayerState = enemy._playerStateRef;
        if (defeatedPlayerState && !defeatedPlayerState.isDead) {
            defeatedPlayerState.isDead = true;
            enemy.isDead = true; 
            const defeatedPlayerObject = players[defeatedPlayerState.name];
            if (defeatedPlayerObject) {
                const opponentParty = parties[sharedState.pvpEncounter.opponentPartyId];
                handlePvpPlayerDeath(io, defeatedPlayerObject, opponentParty);
            }
        }
        
        const opponentParty = parties[sharedState.pvpEncounter.opponentPartyId];
        const allOpponentsDead = opponentParty.sharedState.partyMemberStates.every(p => p.isDead);

        if (allOpponentsDead) {
            sharedState.log.push({ message: "All opponents have been defeated! You are victorious!", type: 'success' });
            endPvpEncounter(io, party, opponentParty);
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
                    endTime: Date.now() + 60000,
                };
                
                party.members.forEach(memberName => {
                    const member = players[memberName];
                    if (member && member.id) {
                        io.to(member.id).emit('party:lootRollStarted', sharedState.pendingLootRoll);
                    }
                });

                setTimeout(() => {
                    determineLootWinnerAndDistribute(io, party.id);
                }, 60000);
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
                    if(member.id) io.to(member.id).emit('questObjectiveComplete', quest.details.title);
                }
            }
        });

        if (enemy.guaranteedLoot && enemy.guaranteedLoot.gold) {
            const goldAmount = (Math.floor(Math.random() * 20) + 1) + (Math.floor(Math.random() * 20) + 1);
            const goldPerPlayer = Math.floor(goldAmount / party.members.length);
            character.gold += goldPerPlayer;
        }
        
        if (member.id) io.to(member.id).emit('characterUpdate', character);
    });
    
    if (enemy.guaranteedLoot && enemy.guaranteedLoot.gold) {
        sharedState.log.push({ message: `${enemy.name} dropped gold, which was split among the party.`, type: 'success'});
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

    if (sharedState.pvpEncounter) {
        const actingPlayerState = sharedState.partyMemberStates.find(p => p.playerId === player.id);
        if (actingPlayerState && !actingPlayerState.turnEnded) {
            actingPlayerState.turnEnded = true; // Forfeit turn
            sharedState.log.push({ message: `${player.character.characterName} forfeits their turn to request mercy...`, type: 'reaction' });
            
            const opponentParty = parties[sharedState.pvpEncounter.opponentPartyId];
            if (opponentParty) {
                const opponentLeader = players[opponentParty.leaderId];
                if (opponentLeader && opponentLeader.id) {
                    io.to(opponentLeader.id).emit('party:pvpFleeRequest', { fleeingPartyName: party.id });
                    sharedState.log.push({ message: `A plea for mercy has been sent to the opposing party leader.`, type: 'info' });
                }
            }
            broadcastAdventureUpdate(io, party.id);
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
                if(memberPlayer.id) {
                    io.to(memberPlayer.id).emit('characterUpdate', memberCharacter);
                    io.to(memberPlayer.id).emit('party:adventureEnded');
                }
            }
        });

        if (party.isSoloParty) {
            if (player && player.character) {
                player.character.partyId = null;
                if(player.id) io.to(player.id).emit('partyUpdate', null);
            }
            delete parties[party.id];
        } else {
           party.sharedState = null;
           broadcastPartyUpdate(io, party.id);
        }
    };

    const inCombat = sharedState.zoneCards.some(c => c && c.type === 'enemy');
    if (inCombat) {
        sharedState.log.push({ message: "The party tries to flee combat to return home. Enemies get a final attack!", type: 'reaction' });
        broadcastAdventureUpdate(io, party.id);
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

    const proceedToNextArea = () => {
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
            broadcastAdventureUpdate(io, party.id);

            const timerId = setTimeout(() => {
                const myEntryIndex = pvpZoneQueues[zoneName].findIndex(entry => entry.partyId === party.id);
                if (myEntryIndex !== -1) {
                    pvpZoneQueues[zoneName].splice(myEntryIndex, 1);
                    sharedState.log.push({ message: "The path ahead is clear... for now.", type: 'info' });
                    proceedToNextArea();
                    broadcastAdventureUpdate(io, party.id);
                }
            }, 5000);

            pvpZoneQueues[zoneName].push({ partyId: party.id, timerId });
        }
        return;
    }
    
    const inCombat = sharedState.zoneCards.some(c => c && c.type === 'enemy');
    if (inCombat) {
        sharedState.log.push({ message: "The party attempts to flee, but the enemies get one last attack!", type: 'reaction' });
        broadcastAdventureUpdate(io, party.id);
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
    broadcastAdventureUpdate(io, party.id);
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
        broadcastAdventureUpdate(io, partyId);
    }

    const enemies = sharedState.zoneCards.map((card, index) => ({ card, index })).filter(e => e.card && e.card.type === 'enemy');

    for (let i = startIndex; i < enemies.length; i++) {
        const { card: enemy, index: enemyIndex } = enemies[i];
        if (!enemy || enemy.health <= 0) continue;
        
        try {
            await new Promise(resolve => setTimeout(resolve, 1000));
            
            let tookDotDamage = false;
            const burnDebuff = enemy.debuffs.find(d => d.type === 'burn');
            if (burnDebuff) {
                enemy.health -= burnDebuff.damage;
                sharedState.log.push({ message: `${enemy.name} takes ${burnDebuff.damage} damage from Burn.`, type: 'damage' });
                burnDebuff.duration--;
                tookDotDamage = true;
            }
            if (enemy.health <= 0) {
                defeatEnemyInParty(io, party, enemy, enemyIndex);
                broadcastAdventureUpdate(io, partyId);
                continue;
            }
            enemy.debuffs = enemy.debuffs.filter(d => d.duration > 0);
            if(tookDotDamage) broadcastAdventureUpdate(io, partyId);

            if (enemy.debuffs.some(d => d.type === 'stun')) {
                sharedState.log.push({ message: `${enemy.name} is stunned and cannot act!`, type: 'reaction' });
                enemy.debuffs = enemy.debuffs.filter(d => d.type !== 'stun');
                broadcastAdventureUpdate(io, partyId);
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
            
            const roll = Math.floor(Math.random() * 20) + 1;
            const attack = enemy.attackTable ? enemy.attackTable.find(a => roll >= a.range[0] && roll <= a.range[1]) : null;

            if (attack && attack.action === 'attack') {
                const targetCharacter = targetPlayerObject.character;
                let damageToDeal = attack.damage;
                if (attack.damageType === 'Physical') {
                    const bonuses = getBonusStatsForPlayer(targetCharacter, targetPlayerState);
                    const resistance = bonuses.physicalResistance || 0;
                    damageToDeal = Math.max(0, attack.damage - resistance);
                }

                const availableReactions = [];

                if (targetCharacter.equippedSpells && Array.isArray(targetCharacter.equippedSpells)) {
                    const dodgeSpell = targetCharacter.equippedSpells.find(s => s.name === "Dodge");
                    if (dodgeSpell && (targetPlayerState.spellCooldowns[dodgeSpell.name] || 0) <= 0) {
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
                        if (isWearingHeavy) {
                            sharedState.log.push({ message: `${targetPlayerState.name} could have Dodged, but their heavy gear prevented it!`, type: 'info' });
                        } else {
                            availableReactions.push({ name: 'Dodge' });
                        }
                    }
                }

                if (targetCharacter.equipment) {
                    const shield = targetCharacter.equipment.offHand;
                    if (shield && shield.type === 'shield' && shield.reaction && (targetPlayerState.itemCooldowns[shield.name] || 0) <= 0) {
                        availableReactions.push({ name: 'Block' });
                    }
                }
                
                if (availableReactions.length > 0 && !isFleeing) {
                    sharedState.pendingReaction = {
                        attackerName: enemy.name,
                        attackerIndex: enemyIndex,
                        targetName: targetPlayerState.name,
                        damage: attack.damage,
                        damageType: attack.damageType,
                        debuff: attack.debuff || null,
                        message: attack.message,
                        isFleeing: isFleeing
                    };
                    
                    const reactionPayload = {
                        damage: attack.damage,
                        attacker: enemy.name,
                        availableReactions: availableReactions.map(r => ({ name: r.name })),
                        timer: 15000
                    };

                    io.to(targetPlayerState.playerId).emit('party:requestReaction', reactionPayload);
                    
                    party.reactionTimeout = setTimeout(() => {
                        const playerSocket = io.sockets.sockets.get(targetPlayerState.playerId);
                        if (playerSocket) {
                            handleResolveReaction(io, playerSocket, { reactionType: 'take_damage' });
                        }
                    }, 15000);

                    return;
                } else {
                    targetPlayerState.health -= damageToDeal;
                    let attackMessage = `${enemy.name} ${attack.message} It hits ${targetPlayerState.name} for ${damageToDeal} damage!`;
                    if (damageToDeal < attack.damage) {
                        attackMessage += ` (${attack.damage - damageToDeal} resisted)`;
                    }
                    if (attack.debuff) {
                        targetPlayerState.debuffs.push({ ...attack.debuff });
                        attackMessage += ` ${targetPlayerState.name} is now ${attack.debuff.type}!`;
                    }
                    sharedState.log.push({ message: attackMessage, type: 'damage'});
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
                    if (!enemy.buffs) enemy.buffs = [];
                    enemy.buffs.push({ type: 'Thick Hide', duration: 2, bonus: { physicalResistance: 1 }});
                    i--; 
                    continue;
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
                        targetPlayerObject.character.inventory = Array(24).fill(null);
                        if(targetPlayerObject.id) io.to(targetPlayerObject.id).emit('characterUpdate', targetPlayerObject.character);
                    }
                }

                sharedState.log.push({ message: `${targetPlayerState.name} has been defeated!`, type: 'damage' });
            }
            
            broadcastAdventureUpdate(io, partyId);

        } catch (error) {
            console.error(`Error processing turn for enemy ${enemy.name}:`, error);
        }
    }
    
    if (!isFleeing) {
        await new Promise(resolve => setTimeout(resolve, 1000));
        startNextPlayerTurn(io, partyId);
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
            p.actionPoints = 3;
            p.turnEnded = false;
        }
        p.buffs.forEach(b => b.duration--);
        p.debuffs.forEach(d => d.duration--);
        p.buffs = p.buffs.filter(b => b.duration > 0);
        p.debuffs = p.debuffs.filter(d => d.duration > 0);

        Object.keys(p.weaponCooldowns).forEach(k => { if (p.weaponCooldowns[k] > 0) p.weaponCooldowns[k]--; });
        Object.keys(p.spellCooldowns).forEach(k => { if (p.spellCooldowns[k] > 0) p.spellCooldowns[k]--; });
        Object.keys(p.itemCooldowns).forEach(k => { if (p.itemCooldowns[k] > 0) p.itemCooldowns[k]--; });
    });
    broadcastAdventureUpdate(io, partyId);
}

export async function handleResolveReaction(io, socket, payload) {
    const name = socket.characterName;
    const player = players[name];
    if (!player) return;

    let partyId = player.character.partyId;
    let party = parties[partyId];
    if (!party || !party.sharedState || !party.sharedState.pendingReaction) return;
    
    const reaction = party.sharedState.pendingReaction;

    if (reaction.targetName !== name) return;

    const isPvp = !!party.sharedState.pvpEncounter;
    let opponentParty;
    if (isPvp) {
        opponentParty = parties[party.sharedState.pvpEncounter.opponentPartyId];
    }
    
    clearTimeout(party.reactionTimeout);
    party.reactionTimeout = null;
    if(opponentParty) opponentParty.reactionTimeout = null;


    const { reactionType } = payload;
    const reactingPlayerState = party.sharedState.partyMemberStates.find(p => p.name === name);
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

            if (roll === 1) {
                logMessage = `${name}'s Dodge: ${roll}(d20) + ${statValue} = ${total}. Critical Failure!`;
            } else if (total >= dodgeSpell.hit) {
                finalDamage = 0;
                dodged = true;
                logMessage = `${name}'s Dodge: ${roll}(d20) + ${statValue} = ${total}. Success! They avoid the attack!`;
            } else {
                logMessage = `${name}'s Dodge: ${roll}(d20) + ${statValue} = ${total}. Failure!`;
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

            if (roll === 1) {
                logMessage = `${name}'s Block: ${roll}(d20) + ${statValue} = ${total}. Critical Failure!`;
            } else if (total >= shield.reaction.hit) {
                const damageReduction = shield.reaction.value;
                finalDamage = Math.max(0, finalDamage - damageReduction);
                blocked = true;
                logMessage = `${name}'s Block: ${roll}(d20) + ${statValue} = ${total}. Success! They block ${damageReduction} damage.`;
            } else {
                 logMessage = `${name}'s Block: ${roll}(d20) + ${statValue} = ${total}. Failure!`;
            }
        } else {
            logMessage = `${name} tries to Block, but fails!`;
        }
    } else { // 'take_damage'
        logMessage = `${name} braces for the attack!`;
    }
    
    party.sharedState.log.push({ message: logMessage, type: dodged || blocked ? 'success' : 'reaction' });
    if(opponentParty) opponentParty.sharedState.log.push({ message: logMessage, type: dodged || blocked ? 'success' : 'reaction' });


    if (finalDamage > 0) {
        let damageToDeal = finalDamage;
        if (reaction.damageType === 'Physical') {
            const bonuses = getBonusStatsForPlayer(reactingPlayer.character, reactingPlayerState);
            const resistance = bonuses.physicalResistance || 0;
            damageToDeal = Math.max(0, finalDamage - resistance);
        }

        reactingPlayerState.health -= damageToDeal;
        let damageMessage = `${reaction.attackerName} ${reaction.message} It hits ${name} for ${damageToDeal} damage!`;
        if (damageToDeal < finalDamage) {
            damageMessage += ` (${finalDamage - damageToDeal} resisted)`;
        }
        if (reaction.debuff && !dodged) {
            reactingPlayerState.debuffs.push({ ...reaction.debuff });
            damageMessage += ` ${name} is now ${reaction.debuff.type}!`;
        }
        party.sharedState.log.push({ message: damageMessage, type: 'damage' });
        if(opponentParty) opponentParty.sharedState.log.push({ message: damageMessage, type: 'damage' });
    }

    if (reactingPlayerState.health <= 0) {
        reactingPlayerState.health = 0;
        reactingPlayerState.isDead = true;

        if (party.sharedState.pvpEncounter) {
            handlePvpPlayerDeath(io, reactingPlayer, party);
        } else {
            if (reactingPlayer.character) {
                reactingPlayerState.lootableInventory = [...reactingPlayer.character.inventory.filter(Boolean)];
                reactingPlayer.character.inventory = Array(24).fill(null);
                if(reactingPlayer.id) io.to(reactingPlayer.id).emit('characterUpdate', reactingPlayer.character);
            }
        }
        
        party.sharedState.log.push({ message: `${name} has been defeated!`, type: 'damage' });
        if(opponentParty) opponentParty.sharedState.log.push({ message: `${name} has been defeated!`, type: 'damage' });
    }

    const wasFleeing = reaction.isFleeing || false;

    party.sharedState.pendingReaction = null;
    if (opponentParty) opponentParty.sharedState.pendingReaction = null;
    
    if (isPvp) {
        const attackerParty = parties[reaction.attackerPartyId];
        
        const duration = attackerParty.sharedState.turnTimeRemaining;
        if (duration > 0) {
            const timerEndsAt = Date.now() + duration;
            const timerId = setTimeout(() => {
                const currentAttackerParty = parties[attackerParty.id];
                if (currentAttackerParty && currentAttackerParty.sharedState && currentAttackerParty.sharedState.pvpEncounter) {
                    const activeTeam = currentAttackerParty.sharedState.pvpEncounter.activeTeam;
                    currentAttackerParty.sharedState.log.push({ message: `Team ${activeTeam}'s time expired! Turn ends.`, type: 'damage' });
                    currentAttackerParty.sharedState.partyMemberStates.forEach(p => {
                        if (p.team === activeTeam && !p.isDead) p.turnEnded = true;
                    });
                    startNextPvpTeamTurn(io, currentAttackerParty);
                }
            }, duration);

            party.sharedState.turnTimerEndsAt = timerEndsAt;
            party.sharedState.turnTimerId = timerId;
            opponentParty.sharedState.turnTimerEndsAt = timerEndsAt;
            opponentParty.sharedState.turnTimerId = timerId;
        }

        broadcastAdventureUpdate(io, party.id);
        broadcastAdventureUpdate(io, opponentParty.id);
        return;
    }
    
    const lastAttackerIndex = reaction.attackerIndex;
    const enemies = party.sharedState.zoneCards.map((c, i) => ({card: c, index: i})).filter(e => e.card && e.card.type === 'enemy');
    const lastEnemyListIndex = enemies.findIndex(e => e.index === lastAttackerIndex);
    
    await runEnemyPhaseForParty(io, partyId, wasFleeing, lastEnemyListIndex + 1);
}