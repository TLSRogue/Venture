// handlersAdventure.js

import { players, parties, duels, pvpEncounters } from './serverState.js';
import { gameData } from './data/index.js';
import { broadcastAdventureUpdate, broadcastPartyUpdate } from './utilsBroadcast.js';
import { buildZoneDeckForServer, drawCardsForServer, getBonusStatsForPlayer } from './utilsHelpers.js';
import { ARENA_ENTRY_FEE } from './constants.js';

import * as actions from './adventure/adventure-actions.js';
import * as interactions from './adventure/adventure-interactions.js';
import * as state from './adventure/adventure-state.js';
import * as PartyManager from './party/party-manager.js';

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
            // Create temporary solo party via centralized party manager
            party = PartyManager.createSoloParty(io, player, socket);
            partyId = party.id;
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
            lootRollQueue: [],
        };

        if (zoneName === 'arena') {
            if (player.character.gold < ARENA_ENTRY_FEE) {
                return socket.emit('partyError', `You need ${ARENA_ENTRY_FEE} gold to enter the Arena.`);
            }
            // Deduct gold from leader (player initiating)
            player.character.gold -= ARENA_ENTRY_FEE;
            socket.emit('characterUpdate', player.character);

            // Boss Selection
            const bossIndices = [];
            party.sharedState.zoneDeck.forEach((card, idx) => {
                if (card.arenaReward) bossIndices.push(idx); // Identify bosses by arenaReward property
            });

            if (bossIndices.length > 0) {
                const rnd = Math.floor(Math.random() * bossIndices.length);
                const selectedIndex = bossIndices[rnd];
                const [bossCard] = party.sharedState.zoneDeck.splice(selectedIndex, 1); // remove chosen boss

                // Remove OTHER bosses from the deck so you don't fight two
                party.sharedState.zoneDeck = party.sharedState.zoneDeck.filter(c => !c.arenaReward);

                bossCard.id = Date.now();
                bossCard.debuffs = [];
                party.sharedState.zoneCards = [null, bossCard, null]; // Boss in center

                // Special Setup for Vexor
                if (bossCard.name === 'Vexor, Lord of the Arena') {
                    const columnCard = gameData.specialCards.stoneColumn;
                    // Clone columns for left (0) and right (2) slots
                    if (columnCard) {
                        party.sharedState.zoneCards[0] = { ...columnCard, id: Date.now() + 1, debuffs: [] };
                        party.sharedState.zoneCards[2] = { ...columnCard, id: Date.now() + 2, debuffs: [] };
                    }
                }

            } else {
                drawCardsForServer(party.sharedState, 1);
            }
        } else {
            drawCardsForServer(party.sharedState, 3);
        }

        party.members.forEach(memberName => {
            const member = players[memberName];
            if (member && member.id) io.to(member.id).emit('party:adventureStarted', party.sharedState);
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

                    // Clean up the encounter
                    if (encounter.turnTimerId) clearTimeout(encounter.turnTimerId);
                    delete pvpEncounters[encounter.id];

                    // Check if this is a duel or world PvP
                    if (encounter.isDuel) {
                        // DUEL: Send the winning party home too (no loot in duels)
                        party.members.forEach(memberName => {
                            const memberPlayer = players[memberName];
                            const memberCharacter = memberPlayer?.character;
                            if (memberCharacter) {
                                const memberState = party.sharedState.partyMemberStates.find(p => p.name === memberName);
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

                        // Clean up the winning duel party
                        if (party.isSoloParty) {
                            if (players[party.leaderId]?.character) {
                                players[party.leaderId].character.partyId = null;
                            }
                            delete parties[party.id];
                        } else {
                            party.sharedState = null;
                            broadcastPartyUpdate(io, party.id);
                        }
                    } else {
                        // WORLD PVP: Winner stays in adventure to loot
                        party.sharedState.pvpEncounterId = null;
                        party.sharedState.log.push({ message: "Combat has ended! You may continue your adventure.", type: 'success' });
                        party.sharedState.partyMemberStates.forEach(p => {
                            if (!p.isDead) {
                                p.actionPoints = 3;
                                p.turnEnded = false;
                            }
                        });
                        broadcastAdventureUpdate(io, party);
                    }

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

            // **BUG FIX**: Handle surrender BEFORE the active team check so it works anytime
            if (action.type === 'surrender' && party.sharedState?.pvpEncounterId) {
                const encounter = pvpEncounters[party.sharedState.pvpEncounterId];
                if (encounter && encounter.isDuel) {
                    const surrenderingPlayerState = encounter.playerStates.find(p => p.name === name);
                    if (surrenderingPlayerState && !surrenderingPlayerState.isDead) {
                        encounter.log.push({ message: `${name} has surrendered!`, type: 'damage' });

                        const surrenderingTeam = surrenderingPlayerState.team;
                        const winningTeam = surrenderingTeam === 'A' ? 'B' : 'A';

                        const winningParty = parties[winningTeam === 'A' ? encounter.partyAId : encounter.partyBId];
                        const losingParty = parties[surrenderingTeam === 'A' ? encounter.partyAId : encounter.partyBId];

                        if (winningParty && losingParty) {
                            state.endDuelEncounter(io, winningParty, losingParty, encounter);
                        }
                        return;
                    }
                }
            }

            if (!party.sharedState) return;

            // Block normal actions if a reaction is pending (in either PvE or PvP)
            // Allow specific actions: returnHome (Flee), surrender, resolvePvpFlee, resolveReaction
            const encounter = party.sharedState.pvpEncounterId ? pvpEncounters[party.sharedState.pvpEncounterId] : null;
            const hasPendingReaction = party.sharedState.pendingReaction || (encounter && encounter.pendingReaction);
            const allowedDuringReaction = ['returnHome', 'surrender', 'resolvePvpFlee', 'resolveReaction'];
            if (hasPendingReaction && !allowedDuringReaction.includes(action.type)) return;

            if (action.type === 'returnHome' || action.type === 'ventureDeeper') {
                // Allow action if player is leader, OR if it's a solo party, OR JUST ALLOW ANYONE TO DO IT TO PREVENT STUCK STATES
                // Decision: Allow any party member to proceed/return. This prevents hostage holding.
                // if (name === party.leaderId || (party.isSoloParty && party.members.includes(name))) {
                if (party.members.includes(name)) {
                    if (action.type === 'returnHome') await state.processEndAdventure(io, player, party);
                    if (action.type === 'ventureDeeper') await state.processVentureDeeper(io, player, party);
                }
                return;
            }

            let actingPlayerState;
            if (party.sharedState.pvpEncounterId) {
                const encounter = pvpEncounters[party.sharedState.pvpEncounterId];
                if (!encounter) {
                    console.log(`[playerAction] BLOCKED: No encounter found for pvpEncounterId ${party.sharedState.pvpEncounterId}`);
                    return;
                }
                actingPlayerState = encounter.playerStates.find(p => p.name === name);
                console.log(`[playerAction] Player ${name} found in encounter:`, !!actingPlayerState, `team: ${actingPlayerState?.team}, activeTeam: ${encounter.activeTeam}`);
                if (encounter.activeTeam !== actingPlayerState?.team) {
                    console.log(`[playerAction] BLOCKED: Not player's team turn. Active: ${encounter.activeTeam}, Player: ${actingPlayerState?.team}`);
                    return;
                }
            } else {
                actingPlayerState = party.sharedState.partyMemberStates.find(p => p.name === name);
            }

            if (!actingPlayerState || actingPlayerState.isDead) return;
            if (actingPlayerState.turnEnded && action.type !== 'dialogueChoice') return;
            if (action.type === 'dialogueChoice' && name !== party.leaderId) return;

            switch (action.type) {
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
                case 'unequipItem':
                    await actions.processUnequipItem(io, party, player, action.payload);
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
                    if (party.sharedState.pvpEncounterId) {
                        const encounter = pvpEncounters[party.sharedState.pvpEncounterId];
                        if (encounter) {
                            await state.processPvpPlayerEndTurn(io, encounter, actingPlayerState);

                            const teamMembers = encounter.playerStates.filter(p => p.team === encounter.activeTeam);
                            const allTurnsEnded = teamMembers.every(p => p.turnEnded || p.isDead);
                            if (allTurnsEnded) {
                                state.startNextPvpTeamTurn(io, encounter.id);
                            }
                        }
                    } else {
                        party.sharedState.log.push({ message: `${player.character.characterName} has ended their turn.`, type: 'info' });
                        await state.processPlayerEndTurn(io, partyId, player.character.characterName);
                    }
                    break;
                // Note: 'surrender' is handled earlier (before active team check) so it works anytime
            }

            broadcastAdventureUpdate(io, party);

        } catch (error) {
            console.error(`!!! PLAYER ACTION ERROR !!! A server crash was prevented. Action:`, action);
            console.error(error);
            socket.emit('partyError', 'A server error occurred. Your action may not have completed.');
        }
    });
};