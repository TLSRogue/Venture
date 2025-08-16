// handlersAdventure.js

import { players, parties, duels, pvpEncounters } from './serverState.js';
import { gameData } from './data/index.js';
import { broadcastAdventureUpdate, broadcastPartyUpdate } from './utilsBroadcast.js';
import { buildZoneDeckForServer, drawCardsForServer, getBonusStatsForPlayer } from './utilsHelpers.js';

import * as actions from './adventure/adventure-actions.js';
import * as interactions from './adventure/adventure-interactions.js';
import * as state from './adventure/adventure-state.js';

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
                    equipment: memberCharacter.equipment,
                    equippedSpells: memberCharacter.equippedSpells,
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
                if (!sharedState.pvpEncounterId || party.leaderId !== name) {
                    return;
                }
                const encounter = pvpEncounters[sharedState.pvpEncounterId];
                if (!encounter) return;

                const fleeingPartyId = (party.id === encounter.partyAId) ? encounter.partyBId : encounter.partyAId;
                const opponentParty = parties[fleeingPartyId];
                
                if (!opponentParty) return;

                if (action.payload.allow) {
                    // Log messages for both parties
                    party.sharedState.log.push({ message: `You have shown mercy. The other party has returned home.`, type: 'info' });
                    opponentParty.sharedState.log.push({ message: `Your plea was accepted! The encounter ends peacefully.`, type: 'success' });

                    // **BUG FIX START**: Directly end the adventure for the fleeing party (`opponentParty`)
                    opponentParty.members.forEach(memberName => {
                        const memberPlayer = players[memberName];
                        const memberCharacter = memberPlayer?.character;
                        if (memberCharacter) {
                            const memberState = opponentParty.sharedState.partyMemberStates.find(p => p.name === memberName);
                            if (!memberState?.isDead) {
                                const bonuses = getBonusStatsForPlayer(memberCharacter, null);
                                memberCharacter.health = 10 + bonuses.maxHealth;
                            }
                            if (memberPlayer.id) {
                                io.to(memberPlayer.id).emit('characterUpdate', memberCharacter);
                                io.to(memberPlayer.id).emit('party:adventureEnded');
                            }
                        }
                    });

                    if (opponentParty.isSoloParty) {
                        if (players[opponentParty.leaderId]?.character) {
                            players[opponentParty.leaderId].character.partyId = null;
                        }
                        delete parties[opponentParty.id];
                    } else {
                        opponentParty.sharedState = null;
                        broadcastPartyUpdate(io, opponentParty.id);
                    }
                    // **BUG FIX END**

                    // Clean up the PvP state for the party that remains (`party`)
                    party.sharedState.pvpEncounterId = null;
                    delete pvpEncounters[encounter.id]; // Clean up the encounter object
                    party.sharedState.zoneCards = [];
                    party.sharedState.log.push({ message: "Combat has ended!", type: 'success' });
                    party.sharedState.partyMemberStates.forEach(p => {
                        if (!p.isDead) {
                            p.actionPoints = 3;
                            p.turnEnded = false;
                        }
                    });

                    broadcastAdventureUpdate(io, party);

                } else {
                    party.sharedState.log.push({ message: `You have denied their request for mercy.`, type: 'damage' });
                    opponentParty.sharedState.log.push({ message: `Your plea for mercy was denied!`, type: 'damage' });
                    broadcastAdventureUpdate(io, party);
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
    
            let actingPlayerState;
            if (party.sharedState.pvpEncounterId) {
                const encounter = pvpEncounters[party.sharedState.pvpEncounterId];
                if (!encounter) return;
                actingPlayerState = encounter.playerStates.find(p => p.name === name);
                if (encounter.activeTeam !== actingPlayerState?.team) return;
            } else {
                actingPlayerState = party.sharedState.partyMemberStates.find(p => p.name === name);
            }
            
            if (!actingPlayerState || actingPlayerState.isDead) return;
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
                    actingPlayerState.turnEnded = true;
                    const logTarget = party.sharedState.pvpEncounterId ? pvpEncounters[party.sharedState.pvpEncounterId] : party.sharedState;
                    logTarget.log.push({ message: `${player.character.characterName} has ended their turn.`, type: 'info' });

                    if (party.sharedState.pvpEncounterId) {
                        const encounter = pvpEncounters[party.sharedState.pvpEncounterId];
                        if (encounter) {
                            const teamMembers = encounter.playerStates.filter(p => p.team === encounter.activeTeam);
                            const allTurnsEnded = teamMembers.every(p => p.turnEnded || p.isDead);
                            if (allTurnsEnded) {
                                state.startNextPvpTeamTurn(io, encounter.id);
                            }
                        }
                    } else {
                        const allTurnsEnded = party.sharedState.partyMemberStates.every(p => p.turnEnded || p.isDead);
                        if (allTurnsEnded) {
                            await state.runEnemyPhaseForParty(io, partyId);
                        }
                    }
                    break;
            }
    
            broadcastAdventureUpdate(io, party);
            
        } catch (error) {
            console.error(`!!! PLAYER ACTION ERROR !!! A server crash was prevented. Action:`, action);
            console.error(error);
            socket.emit('partyError', 'A server error occurred. Your action may not have completed.');
        }
    });
};