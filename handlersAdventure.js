// handlersAdventure.js

import { players, parties, duels, pvpEncounters } from './serverState.js';
import { gameData, itemsByName } from './data/index.js';
import { broadcastAdventureUpdate, broadcastPartyUpdate } from './utilsBroadcast.js';
import { buildZoneDeckForServer, drawCardsForServer, getBonusStatsForPlayer, playerHasMaterials, consumeMaterials, addItemToInventoryServer } from './utilsHelpers.js';
import { ARENA_ENTRY_FEE, ARENA_HP_SCALE_PER_ROUND, ARENA_DAMAGE_BONUS_PER_ROUND, DEFAULT_ACTION_POINTS, STARTING_HEALTH, BOSS_HP_SCALE_PER_PLAYER } from './constants.js';

import * as actions from './adventure/adventure-actions.js';
import * as interactions from './adventure/adventure-interactions.js';
import * as state from './adventure/adventure-state.js';
import * as PartyManager from './party/party-manager.js';
import * as LootManager from './adventure/loot-manager.js';

/**
 * Spawn an arena boss for the given round. Handles scaling, flanking setup, and state tracking.
 * @param {Object} party - The party object
 * @param {number} round - Current arena round (1-based)
 */
export function spawnArenaBoss(party, round) {
    const { sharedState } = party;
    const arenaState = sharedState.arenaState;
    const partySize = party.members.length;

    // Find next boss that hasn't been defeated yet
    const nextBoss = arenaState.bossPool.find(b => !arenaState.defeatedBosses.includes(b.name));
    if (!nextBoss) return;

    // Clone the boss card
    const bossCard = JSON.parse(JSON.stringify(nextBoss));
    bossCard.id = Date.now();
    bossCard.debuffs = [];
    bossCard.buffs = [];

    // Apply HP scaling: base * (1 + (round-1) * ARENA_HP_SCALE_PER_ROUND)
    const hpRoundMultiplier = 1 + (round - 1) * ARENA_HP_SCALE_PER_ROUND;
    // Then apply party size scaling on top
    const hpPartyMultiplier = 1 + (partySize - 1) * BOSS_HP_SCALE_PER_PLAYER;
    const scaledHP = Math.floor(bossCard.maxHealth * hpRoundMultiplier * hpPartyMultiplier);
    bossCard.health = scaledHP;
    bossCard.maxHealth = scaledHP;

    // Apply damage scaling: +ARENA_DAMAGE_BONUS_PER_ROUND per round after round 1
    const damageBonus = (round - 1) * ARENA_DAMAGE_BONUS_PER_ROUND;
    bossCard.arenaDamageBonus = damageBonus;
    if (bossCard.attackTable) {
        bossCard.attackTable = bossCard.attackTable.map(entry => {
            if (entry.damage) {
                return { ...entry, damage: entry.damage + damageBonus };
            }
            return entry;
        });
    }

    // Place boss in center slot, flanking slots empty by default
    sharedState.zoneCards = [null, bossCard, null];

    // --- BATTLE BROTHERS SPECIAL SPAWN ---
    if (bossCard.isBattleBrother) {
        let rhino, tiger;
        
        // Ensure we have both templates. bossCard is one of them.
        if (bossCard.name === 'BB Rhino') {
            rhino = bossCard;
            const tigerTemplate = arenaState.bossPool.find(b => b.name === 'BB Tiger');
            tiger = JSON.parse(JSON.stringify(tigerTemplate || bossCard)); // Fallback to clone if not found, but should be found
        } else {
            tiger = bossCard;
            const rhinoTemplate = arenaState.bossPool.find(b => b.name === 'BB Rhino');
            rhino = JSON.parse(JSON.stringify(rhinoTemplate || bossCard));
        }

        // Apply scaling to the second brother (the first is already scaled above)
        const scaleBrother = (b) => {
            b.id = Date.now() + 5;
            b.debuffs = [];
            b.buffs = [];
            const hpRoundMult = 1 + (round - 1) * ARENA_HP_SCALE_PER_ROUND;
            const hpPartyMult = 1 + (partySize - 1) * BOSS_HP_SCALE_PER_PLAYER;
            const sHP = Math.floor(b.maxHealth * hpRoundMult * hpPartyMult);
            b.health = sHP;
            b.maxHealth = sHP;
            
            const dmgBonus = (round - 1) * ARENA_DAMAGE_BONUS_PER_ROUND;
            b.arenaDamageBonus = dmgBonus;
            if (b.attackTable) {
                b.attackTable = b.attackTable.map(entry => {
                    if (entry.damage) return { ...entry, damage: entry.damage + dmgBonus };
                    return entry;
                });
            }
        };

        if (rhino !== bossCard) scaleBrother(rhino);
        if (tiger !== bossCard) scaleBrother(tiger);

        // Apply per-round resistance scaling
        // Rhino: +1 Phys Res per round. Tiger: +1 Mag Res per round.
        rhino.physicalResistance = (rhino.physicalResistance || 0) + (round - 1);
        tiger.magicalResistance = (tiger.magicalResistance || 0) + (round - 1);

        // Ensure both are marked as boss for reward logic
        rhino.isBoss = true;
        tiger.isBoss = true;

        // Position: Rhino Left (0), Empty Middle (1), Tiger Right (2)
        sharedState.zoneCards = [
            rhino,
            getZoneAreaCard('arena', 1),
            tiger
        ];
        
        // Mark both as defeated in the pool so they don't spawn again separately
        if (!arenaState.defeatedBosses.includes('BB Rhino')) arenaState.defeatedBosses.push('BB Rhino');
        if (!arenaState.defeatedBosses.includes('BB Tiger')) arenaState.defeatedBosses.push('BB Tiger');
    }

    // Boss-specific flanking setup
    if (bossCard.name === 'Vexor, Lord of the Arena') {
        const columnCard = gameData.specialCards.stoneColumn;
        if (columnCard) {
            sharedState.zoneCards[0] = { ...columnCard, id: Date.now() + 1, debuffs: [] };
            sharedState.zoneCards[2] = { ...columnCard, id: Date.now() + 2, debuffs: [] };
        }
    }
}

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

        // --- TRAINING ZONE (special non-combat zone) ---
        if (zoneName === 'training') {
            // Solo-only
            if (party.members.length > 1) {
                return socket.emit('partyError', 'The Training Grounds is a solo activity.');
            }

            const character = player.character;
            const STARTER_SPELLS = ['Punch', 'Kick', 'Dodge'];

            // Generate offerings if none exist (or all are stale/known)
            if (!character.trainingOfferings || character.trainingOfferings.length === 0) {
                const knownSpellNames = new Set([
                    ...(character.spellbook || []).map(s => s.name),
                    ...(character.equippedSpells || []).map(s => s.name),
                    ...STARTER_SPELLS
                ]);
                const available = gameData.allSpells.filter(s => !knownSpellNames.has(s.name) && s.trainable);

                // Shuffle and pick up to 3
                const shuffled = [...available].sort(() => Math.random() - 0.5);
                character.trainingOfferings = shuffled.slice(0, 3).map(s => s.name);
            }

            // Set up minimal sharedState for the training zone
            const bonuses = getBonusStatsForPlayer(character, null);
            const maxHealth = STARTING_HEALTH + bonuses.maxHealth;
            party.sharedState = {
                currentZone: 'training',
                zoneDeck: [],
                zoneCards: [],
                groundLoot: [],
                turnNumber: 0,
                isPlayerTurn: true,
                activePlayerIndex: 0,
                activePhase: 'player',
                partyMemberStates: [{
                    playerId: player.id,
                    name: character.characterName,
                    icon: character.characterIcon,
                    health: maxHealth,
                    maxHealth: maxHealth,
                    actionPoints: 0,
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
                    equipment: character.equipment,
                    equippedSpells: character.equippedSpells,
                }],
                trainingOfferings: character.trainingOfferings,
                trainingCost: (character.spellsLearnedFromTraining || 0) + 1,
                trainingRefreshCost: 100 * Math.pow(2, character.trainingRefreshCount || 0),
                gold: character.gold || 0,
                questPoints: character.questPoints || 0,
                totalQuestPointsEarned: character.totalQuestPointsEarned || 0,
                log: [{ message: `Welcome to the Training Grounds! Choose a spell to learn.`, type: 'info' }],
                pendingReaction: null,
                pendingLootRoll: null,
                lootRollQueue: [],
                zoneEffects: [],
            };

            party.members.forEach(memberName => {
                const member = players[memberName];
                if (member && member.id) io.to(member.id).emit('party:adventureStarted', party.sharedState);
            });
            return;
        }
        // --- END TRAINING ZONE ---

        // --- THE DOCKS LOCKOUT CHECK ---
        if (zoneName === 'theDocks') {
            const lockoutUntil = party.sharedState?.docksLockoutUntil || player.character.docksLockoutUntil || 0;
            if (Date.now() < lockoutUntil) {
                const remainingMs = lockoutUntil - Date.now();
                const remainingMin = Math.ceil(remainingMs / 60000);
                return socket.emit('partyError', `You are banned from The Docks for ${remainingMin} more minute(s)!`);
            }
        }
        // --- END LOCKOUT CHECK ---

        const deck = buildZoneDeckForServer(zoneName, party.members.length);
        party.sharedState = {
            currentZone: zoneName,
            zoneDeck: deck,
            zoneCards: [],
            groundLoot: [],
            turnNumber: 0,
            isPlayerTurn: true,
            activePlayerIndex: 0,
            activePhase: 'player',
            partyMemberStates: party.members.map((memberName, idx) => {
                const memberPlayer = players[memberName];
                const memberCharacter = memberPlayer.character;
                const bonuses = getBonusStatsForPlayer(memberCharacter, null);
                const maxHealth = STARTING_HEALTH + bonuses.maxHealth;
                return {
                    playerId: memberPlayer.id,
                    name: memberCharacter.characterName,
                    icon: memberCharacter.characterIcon,
                    health: maxHealth,
                    maxHealth: maxHealth,
                    actionPoints: idx === 0 ? DEFAULT_ACTION_POINTS : 0,
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
            zoneEffects: [], // Active zone-wide effects (e.g., Blizzard)
        };

        if (zoneName === 'arena') {
            if (player.character.gold < ARENA_ENTRY_FEE) {
                return socket.emit('partyError', `You need ${ARENA_ENTRY_FEE} gold to enter the Arena.`);
            }
            // Deduct gold from leader (player initiating)
            player.character.gold -= ARENA_ENTRY_FEE;
            socket.emit('characterUpdate', player.character);

            // Build arena boss pool from all arena cards with arenaReward property
            const bossPool = party.sharedState.zoneDeck
                .filter(c => c.arenaReward)
                .map(c => ({ ...c })); // Deep clone each boss template

            // Shuffle boss pool (Fisher-Yates)
            for (let i = bossPool.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                [bossPool[i], bossPool[j]] = [bossPool[j], bossPool[i]];
            }

            // Clear the zone deck — arena doesn't draw from a deck
            party.sharedState.zoneDeck = [];

            // Initialize arena state
            party.sharedState.arenaState = {
                round: 1,
                defeatedBosses: [],
                bossPool: bossPool,
                chestClaimed: false,
                chestAvailable: false,
            };

            // Spawn the first boss
            spawnArenaBoss(party, 1);
        } else {
            drawCardsForServer(party.sharedState, 3);
        }

        party.members.forEach(memberName => {
            const member = players[memberName];
            if (member && member.id) io.to(member.id).emit('party:adventureStarted', party.sharedState);
        });

        // Initialize the first turn, starting the PVE turn timer if enemies are present
        state.startNextPlayerTurn(io, partyId);
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
                                memberCharacter.health = STARTING_HEALTH + bonuses.maxHealth;
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
                                    memberCharacter.health = STARTING_HEALTH + bonuses.maxHealth;
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
                                p.actionPoints = DEFAULT_ACTION_POINTS;
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

                // Only log passes immediately - rolls are shown in consolidated summary when determining winner
                if (choice === 'pass') {
                    sharedState.log.push({ message: `${name} passes on [${rollData.item.name}].`, type: 'info' });
                }

                const livingPlayers = sharedState.partyMemberStates.filter(p => !p.isDead).length;
                if (rollData.rolls.length >= livingPlayers) {
                    LootManager.determineLootWinnerAndDistribute(io, partyId);
                }

                broadcastAdventureUpdate(io, partyId);
                return;
            }

            if (action.type === 'resolveIntervene') {
                await state.resolveIntervene(io, socket, action.payload);
                return;
            }

            if (action.type === 'resolveReaction') {
                await state.handleResolveReaction(io, socket, action.payload);
                return;
            }

            if (action.type === 'submitDebuffSelection') {
                const { sharedState } = party;
                const pendingCleanse = sharedState.pendingCleanse;

                if (!pendingCleanse || pendingCleanse.casterPlayerId !== player.id) {
                    return;
                }

                const { selectedIndices } = action.payload;
                const targetState = sharedState.partyMemberStates.find(
                    p => (p.playerId === pendingCleanse.targetPlayerId) || (p.id === pendingCleanse.targetPlayerId)
                );

                if (targetState && targetState.debuffs && selectedIndices.length > 0) {
                    // Remove selected debuffs (reverse order to preserve indices)
                    const removedNames = [];
                    selectedIndices.sort((a, b) => b - a).forEach(idx => {
                        if (targetState.debuffs[idx]) {
                            removedNames.push(targetState.debuffs[idx].type);
                            targetState.debuffs.splice(idx, 1);
                        }
                    });

                    if (removedNames.length > 0) {
                        sharedState.log.push({
                            message: `${pendingCleanse.casterName} cleanses ${pendingCleanse.targetName}! [id:${pendingCleanse.targetPlayerId}]`,
                            type: 'heal'
                        });
                        sharedState.log.push({ message: `Cleansed: ${removedNames.join(', ')}!`, type: 'heal' });
                    }
                } else if (selectedIndices.length === 0) {
                    sharedState.log.push({ message: `${pendingCleanse.casterName} cancelled the cleanse.`, type: 'info' });
                }

                // Clear pending state
                sharedState.pendingCleanse = null;

                // End caster's turn
                const casterState = sharedState.partyMemberStates.find(p => p.playerId === pendingCleanse.casterPlayerId);
                if (casterState) {
                    casterState.turnEnded = true;
                    const allTurnsEnded = sharedState.partyMemberStates.every(p => p.turnEnded || p.isDead);
                    if (allTurnsEnded) {
                        await state.processEnemyTurn(io, partyId);
                    }
                }

                broadcastAdventureUpdate(io, party);
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
                // Block these actions during enemy turn (server-side safety check)
                if (party.sharedState.activePhase === 'enemy') {
                    return; // Silently ignore - client should have blocked this
                }

                // Allow action if player is leader, OR if it's a solo party, OR JUST ALLOW ANYONE TO DO IT TO PREVENT STUCK STATES
                // Decision: Allow any party member to proceed/return. This prevents hostage holding.
                // if (name === party.leaderId || (party.isSoloParty && party.members.includes(name))) {
                if (party.members.includes(name)) {
                    if (action.type === 'returnHome') await state.processEndAdventure(io, player, party);
                    if (action.type === 'ventureDeeper') await state.processVentureDeeper(io, player, party);
                }
                return;
            }

            const outOfTurnActions = ['dropItem', 'takeGroundLoot', 'takeAllGroundLoot', 'lootPlayer', 'dialogueChoice', 'campfireCraft'];
            let actingPlayerState;
            if (party.sharedState.pvpEncounterId) {
                const encounter = pvpEncounters[party.sharedState.pvpEncounterId];
                if (!encounter) {
                    console.log(`[playerAction] BLOCKED: No encounter found for pvpEncounterId ${party.sharedState.pvpEncounterId}`);
                    return;
                }
                actingPlayerState = encounter.playerStates.find(p => p.name === name);
                const activePlayerId = encounter.turnOrder[encounter.activeTurnIndex];
                if (actingPlayerState?.playerId !== activePlayerId) {
                    if (!outOfTurnActions.includes(action.type)) {
                        console.log(`[playerAction] BLOCKED: Not player's exact turn. Action: ${action.type}`);
                        return;
                    }
                }
            } else {
                actingPlayerState = party.sharedState.partyMemberStates.find(p => p.name === name);
                const activePhase = party.sharedState.activePhase;
                const activePlayer = party.sharedState.partyMemberStates[party.sharedState.activePlayerIndex];
                
                if (activePhase !== 'player' || activePlayer?.playerId !== player.id) {
                    if (!outOfTurnActions.includes(action.type)) {
                        console.log(`[playerAction] BLOCKED: Not player's exact turn in PVE. Action: ${action.type}`);
                        return;
                    }
                }
            }

            if (!actingPlayerState || actingPlayerState.isDead) return;
            if (actingPlayerState.turnEnded && !outOfTurnActions.includes(action.type)) return;
            // Removed leader-only check: Any party member can now make dialogue choices

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
                case 'takeAllGroundLoot':
                    interactions.processTakeAllGroundLoot(io, party, player);
                    break;
                case 'dialogueChoice':
                    interactions.processDialogueChoice(io, player, party, action.payload);
                    break;
                case 'learnTrainingSpell': {
                    if (party.sharedState.currentZone !== 'training') break;
                    const character = player.character;
                    const spellName = action.payload?.spellName;
                    if (!spellName || !character.trainingOfferings.includes(spellName)) break;

                    const cost = (character.spellsLearnedFromTraining || 0) + 1;
                    if (character.questPoints < cost) {
                        socket.emit('partyError', `You need ${cost} QP to learn this spell. You have ${character.questPoints}.`);
                        break;
                    }

                    const spellData = gameData.allSpells.find(s => s.name === spellName);
                    if (!spellData) break;

                    // Already known check
                    const alreadyKnown = character.spellbook.some(s => s.name === spellName) || character.equippedSpells.some(s => s.name === spellName);
                    if (alreadyKnown) {
                        socket.emit('partyError', 'You already know this spell.');
                        break;
                    }

                    // Deduct QP, learn spell, increment counter, clear offerings
                    character.questPoints -= cost;
                    character.spellsLearnedFromTraining = (character.spellsLearnedFromTraining || 0) + 1;
                    character.spellbook.push({ ...spellData });
                    character.trainingOfferings = []; // Full refresh on next visit
                    character.trainingRefreshCount = 0; // Reset refresh cost!

                    party.sharedState.log.push({ message: `${character.characterName} has learned ${spellData.icon} ${spellData.name}!`, type: 'success' });
                    socket.emit('characterUpdate', character);

                    // Auto-end the adventure
                    await state.processEndAdventure(io, player, party);
                    break;
                }
                case 'refreshTrainingSpells': {
                    if (party.sharedState.currentZone !== 'training') break;
                    const charR = player.character;
                    const refreshCost = 100 * Math.pow(2, charR.trainingRefreshCount || 0);

                    if (charR.gold < refreshCost) {
                        socket.emit('partyError', `You need ${refreshCost} gold to refresh. You have ${charR.gold}.`);
                        break;
                    }

                    const STARTER_SPELLS_R = ['Punch', 'Kick', 'Dodge'];
                    const knownR = new Set([
                        ...(charR.spellbook || []).map(s => s.name),
                        ...(charR.equippedSpells || []).map(s => s.name),
                        ...STARTER_SPELLS_R
                    ]);
                    const availableR = gameData.allSpells.filter(s => !knownR.has(s.name) && s.trainable);
                    const shuffledR = [...availableR].sort(() => Math.random() - 0.5);

                    charR.gold -= refreshCost;
                    charR.trainingRefreshCount = (charR.trainingRefreshCount || 0) + 1;
                    charR.trainingOfferings = shuffledR.slice(0, 3).map(s => s.name);

                    // Update sharedState for client
                    party.sharedState.trainingOfferings = charR.trainingOfferings;
                    party.sharedState.trainingRefreshCost = 100 * Math.pow(2, charR.trainingRefreshCount);
                    party.sharedState.log.push({ message: `Spells refreshed! (Cost: ${refreshCost}G)`, type: 'info' });

                    socket.emit('characterUpdate', charR);
                    break;
                }
                case 'lootPlayer':
                    interactions.processLootPlayer(io, player, party, action.payload);
                    break;
                case 'campfireCraft': {
                    const campfireChar = player.character;
                    const { recipeIndex } = action.payload || {};
                    const recipe = gameData.craftingRecipes[recipeIndex];
                    if (!recipe || recipe.category !== 'Cooking') break;

                    // Validate a friendly campfire zone effect exists
                    const zoneEffects = party.sharedState.zoneEffects || [];
                    const playerTeam = actingPlayerState?.team || 'pve';
                    const hasCampfire = zoneEffects.some(e => e.type === 'campfire' && e.casterTeam === playerTeam);
                    if (!hasCampfire) {
                        socket.emit('partyError', 'You need an active Campfire to cook!');
                        break;
                    }

                    // Check for requiresDiscovery
                    if (recipe.requiresDiscovery && !(campfireChar.knownRecipes || []).includes(recipe.result.name)) break;

                    if (playerHasMaterials(campfireChar, recipe.materials)) {
                        consumeMaterials(campfireChar, recipe.materials);
                        const baseItem = itemsByName.get(recipe.result.name);
                        if (baseItem) {
                            addItemToInventoryServer(campfireChar, baseItem, recipe.result.quantity || 1);
                            party.sharedState.log.push({ message: `${campfireChar.characterName} cooks ${baseItem.icon || ''} ${recipe.result.name} over the Campfire!`, type: 'success' });
                        }
                    } else {
                        socket.emit('partyError', 'You don\'t have the required ingredients.');
                    }
                    socket.emit('characterUpdate', campfireChar);
                    break;
                }
                case 'compostItem': {
                    const compostChar = player.character;
                    const { inventoryIndex } = action.payload || {};
                    const targetItem = compostChar.inventory.splice(inventoryIndex, 1)[0];

                    if (!targetItem) {
                        socket.emit('partyError', 'Invalid item selected for composting.');
                        break;
                    }

                    const slopItemBase = itemsByName.get("Slop");
                    if (slopItemBase) {
                        addItemToInventoryServer(compostChar, slopItemBase, 1);
                        party.sharedState.log.push({ message: `${compostChar.characterName} composted ${targetItem.name} and received ${slopItemBase.icon} Slop!`, type: 'info' });
                    }
                    
                    socket.emit('characterUpdate', compostChar);
                    break;
                }
                case 'endTurn':
                    if (party.sharedState.pvpEncounterId) {
                        const encounter = pvpEncounters[party.sharedState.pvpEncounterId];
                        if (encounter) {
                            await state.processPvpPlayerEndTurn(io, encounter, actingPlayerState);

                            const activePlayerId = encounter.turnOrder[encounter.activeTurnIndex];
                            if (activePlayerId === player.id) {
                                state.startNextPvpTurn(io, encounter.id);
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