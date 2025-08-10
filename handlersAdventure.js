// handlersAdventure.js

import { players, parties, duels } from './serverState.js';
import { gameData } from './game-data.js';
import { broadcastAdventureUpdate, broadcastPartyUpdate } from './utilsBroadcast.js';
import { buildZoneDeckForServer, drawCardsForServer, getBonusStatsForPlayer } from './utilsHelpers.js';

// --- MODIFICATION START: We now import the specific function we need. ---
import * as actions from './adventure/adventure-actions.js';
import * as interactions from './adventure/adventure-interactions.js';
import * as state from './adventure/adventure-state.js';
// --- MODIFICATION END ---

export const registerAdventureHandlers = (io, socket) => {
    socket.on('party:enterZone', (zoneName) => {
        const name = socket.characterName;
        const player = players[name];
        if (!player) return;
        
        if (player.character.duelId && duels[player.character.duelId]) {
            return; 
        }

        let partyId = player.character.partyId;
        let party;

        if (partyId && parties[partyId]) {
            party = parties[partyId];
            if (party.leaderId !== name) {
                return socket.emit('partyError', 'Only the party leader can start an adventure.');
            }
        } else {
            partyId = `SOLO-${Math.random().toString(36).substr(2, 6).toUpperCase()}`;
            party = { id: partyId, leaderId: name, members: [name], sharedState: null, isSoloParty: true };
            parties[partyId] = party;
            player.character.partyId = partyId;
            socket.emit('partyUpdate', { partyId: partyId, leaderId: name, members: [{ name: name, id: socket.id, isLeader: true }], isPartyLeader: true });
            console.log(`Player ${name} created temporary solo party ${partyId}`);
        }
        
        const deck = buildZoneDeckForServer(zoneName); 
        party.sharedState = {
            currentZone: zoneName,
            zoneDeck: deck,
            zoneCards: [],
            groundLoot: [],
            turnNumber: 0,
            isPlayerTurn: true,
            partyMemberStates: party.members.map(memberName => {
                const memberPlayer = players[memberName];
                const memberCharacter = memberPlayer.character;
                const bonuses = getBonusStatsForPlayer(memberCharacter, null);
                const maxHealth = 10 + bonuses.maxHealth;
                return { 
                    playerId: memberPlayer.id, 
                    name: memberCharacter.characterName,
                    icon: memberCharacter.characterIcon,
                    health: maxHealth,
                    maxHealth: maxHealth,
                    actionPoints: 3,
                    turnEnded: false,
                    isDead: false,
                    lootableInventory: [],
                    buffs: [],
                    debuffs: [],
                    weaponCooldowns: {},
                    spellCooldowns: {},
                    itemCooldowns: {},
                    threat: 0,
                    focus: 0,
                };
            }),
            log: [{ message: `Party has entered the ${zoneName}!`, type: 'info' }],
            pendingReaction: null,
            pendingLootRoll: null,
        };
        
        if (zoneName === 'arena') {
            const bossIndex = party.sharedState.zoneDeck.findIndex(card => card.name === 'Pulvis Cadus');
            if (bossIndex !== -1) {
                const [bossCard] = party.sharedState.zoneDeck.splice(bossIndex, 1);
                bossCard.id = Date.now();
                bossCard.debuffs = [];
                party.sharedState.zoneCards = [null, bossCard, null];
            } else {
                drawCardsForServer(party.sharedState, 1);
            }
        } else {
            drawCardsForServer(party.sharedState, 3);
        }
        
        party.members.forEach(memberName => {
            const member = players[memberName];
            if(member && member.id) io.to(member.id).emit('party:adventureStarted', party.sharedState);
        });
    });
  
    socket.on('party:playerAction', async (action) => {
        const name = socket.characterName;
        const player = players[name];
        if (!player || !player.character) return;
        
        const partyId = player.character.partyId;
        const party = parties[partyId];
        if (!party) return;

        try {
            if (action.type === 'resolvePvpFlee') {
                const { sharedState } = party;
                if (!sharedState.pvpEncounter || party.leaderId !== name) {
                    return;
                }

                const opponentParty = parties[sharedState.pvpEncounter.opponentPartyId];
                if (!opponentParty) return;

                if (action.payload.allow) {
                    // --- NEW, ROBUST FIX START ---
                    // This new logic handles sending both parties home safely without race conditions.
                    
                    party.sharedState.log.push({ message: `You have shown mercy. The encounter ends peacefully, and both parties return home.`, type: 'info' });
                    opponentParty.sharedState.log.push({ message: `Your plea was accepted! The encounter ends peacefully, and both parties return home.`, type: 'success' });

                    // Broadcast the final log messages before ending the adventure.
                    broadcastAdventureUpdate(io, party.id);
                    broadcastAdventureUpdate(io, opponentParty.id);

                    // 1. Combine all players from both parties into a single list.
                    const allPlayersInvolved = [
                        ...party.members.map(name => players[name]),
                        ...opponentParty.members.map(name => players[name])
                    ];

                    // 2. Notify all players and reset their server-side character health.
                    allPlayersInvolved.forEach(playerInstance => {
                        if (playerInstance && playerInstance.character) {
                            const char = playerInstance.character;
                            const bonuses = getBonusStatsForPlayer(char, null);
                            char.health = 10 + bonuses.maxHealth;
                            
                            if (playerInstance.id) {
                                io.to(playerInstance.id).emit('characterUpdate', char);
                                io.to(playerInstance.id).emit('party:adventureEnded');
                            }
                        }
                    });

                    // 3. Clean up the server state for both parties.
                    const cleanupPartyState = (p) => {
                        if (!p) return;
                        if (p.isSoloParty) {
                            const leader = players[p.leaderId];
                            if (leader && leader.character) {
                                leader.character.partyId = null;
                            }
                            delete parties[p.id];
                        } else {
                            p.sharedState = null;
                        }
                    };
                    
                    cleanupPartyState(party);
                    cleanupPartyState(opponentParty);

                    // 4. Update party UI for non-solo parties that are returning to the lobby.
                    if (party && parties[party.id] && !party.isSoloParty) {
                        broadcastPartyUpdate(io, party.id);
                    }
                    if (opponentParty && parties[opponentParty.id] && !opponentParty.isSoloParty) {
                        broadcastPartyUpdate(io, opponentParty.id);
                    }
                    
                    return; // End of new logic block.
                    // --- NEW, ROBUST FIX END ---

                } else {
                    // This is the logic for denying the flee request.
                    sharedState.log.push({ message: `You have denied their request for mercy.`, type: 'damage' });
                    opponentParty.sharedState.log.push({ message: `Your plea for mercy was denied!`, type: 'damage' });
                    broadcastAdventureUpdate(io, partyId);
                    broadcastAdventureUpdate(io, opponentParty.id);
                }
                return;
            }

            if (action.type === 'submitLootRoll') {
                const { sharedState } = party;
                const rollData = sharedState.pendingLootRoll;

                if (!rollData || rollData.rolls.some(r => r.playerName === name)) {
                    return;
                }
                
                const choice = action.payload.choice;
                const rollValue = choice === 'pass' ? 0 : Math.floor(Math.random() * 100) + 1;

                rollData.rolls.push({ playerName: name, choice, roll: rollValue });
                
                if (choice !== 'pass') {
                    sharedState.log.push({ message: `${name} rolls ${rollValue} (${choice}) for [${rollData.item.name}].`, type: 'info' });
                } else {
                    sharedState.log.push({ message: `${name} passes on [${rollData.item.name}].`, type: 'info' });
                }
                
                const livingPlayers = sharedState.partyMemberStates.filter(p => !p.isDead).length;
                if (rollData.rolls.length >= livingPlayers) {
                    state.determineLootWinnerAndDistribute(io, partyId);
                }
                
                broadcastAdventureUpdate(io, partyId);
                return;
            }
            
            if (action.type === 'resolveReaction') {
                await state.handleResolveReaction(io, socket, action.payload);
                return; 
            }
            
            if (!party.sharedState || party.sharedState.pendingReaction) return;
    
            if (action.type === 'returnHome' || action.type === 'ventureDeeper') {
                if (name === party.leaderId) {
                     if (action.type === 'returnHome') await state.processEndAdventure(io, player, party);
                     if (action.type === 'ventureDeeper') await state.processVentureDeeper(io, player, party);
                }
                return;
            }
    
            const actingPlayerState = party.sharedState.partyMemberStates.find(p => p.name === name);
            if (!actingPlayerState || actingPlayerState.isDead) return;
            if (!party.sharedState.isPlayerTurn) return;
            if (actingPlayerState.turnEnded && action.type !== 'dialogueChoice') return;
            if (action.type === 'dialogueChoice' && name !== party.leaderId) return;
    
            switch(action.type) {
                case 'weaponAttack':
                    await actions.processWeaponAttack(io, party, player, action.payload);
                    break;
                case 'castSpell':
                    await actions.processCastSpell(io, party, player, action.payload);
                    break;
                case 'useItemAbility':
                    await actions.processUseItemAbility(io, party, player, action.payload);
                    break;
                case 'useConsumable':
                    await actions.processUseConsumable(io, party, player, action.payload);
                    break;
                case 'equipItem':
                    await actions.processEquipItem(io, party, player, action.payload);
                    break;
                case 'interactWithCard':
                    await interactions.processInteractWithCard(io, party, player, action.payload);
                    break;
                case 'dropItem':
                    interactions.processDropItem(io, party, player, action.payload);
                    break;
                case 'takeGroundLoot':
                    interactions.processTakeGroundLoot(io, party, player, action.payload);
                    break;
                case 'dialogueChoice':
                    interactions.processDialogueChoice(io, player, party, action.payload);
                    break; 
                case 'lootPlayer':
                    interactions.processLootPlayer(io, player, party, action.payload);
                    break;
                case 'endTurn':
                    // --- MODIFICATION START: This block now calls the correct function. ---
                    actingPlayerState.turnEnded = true;
                    party.sharedState.log.push({ message: `${player.character.characterName} has ended their turn.`, type: 'info' });

                    const { sharedState } = party;
                    const activeTeam = sharedState.pvpEncounter ? sharedState.pvpEncounter.activeTeam : null;
                    const teamMembers = activeTeam ? sharedState.partyMemberStates.filter(p => p.team === activeTeam) : sharedState.partyMemberStates;
                    const allTurnsEnded = teamMembers.every(p => p.turnEnded || p.isDead);

                    if (allTurnsEnded) {
                        if (sharedState.pvpEncounter) {
                            // In PvP, we directly call the function to pass the turn to the next team.
                            state.startNextPvpTeamTurn(io, party);
                        } else {
                            // In PvE, we run the enemy phase.
                            await state.runEnemyPhaseForParty(io, partyId);
                        }
                    }
                    // --- MODIFICATION END ---
                    break;
            }
    
            if (party.sharedState) {
                broadcastAdventureUpdate(io, partyId);
            }
        } catch (error) {
            console.error(`!!! PLAYER ACTION ERROR !!! A server crash was prevented. Action:`, action);
            console.error(error);
            socket.emit('partyError', 'A server error occurred. Your action may not have completed.');
        }
    });
};