// adventure/adventure-state.js

import { players, parties, pvpZoneQueues, pvpEncounters } from '../serverState.js';
import { gameData, lootPools } from '../data/index.js';
import { rollD20 } from '../shared.js';
import { broadcastAdventureUpdate, broadcastPartyUpdate } from '../utilsBroadcast.js';
import { getBonusStatsForPlayer, addItemToInventoryServer, drawCardsForServer, createStateForClient, getZoneAreaCard } from '../utilsHelpers.js';
import { applyDamage, applyDoTEffects, applyChillStack, processChillReduction, getAvailablePlayerReactions, processEndOfTurnEffects } from './combat-core.js';
import { PVP_TURN_DURATION_MS, LOOT_ROLL_DURATION_MS, REACTION_TIMER_MS, PVP_QUEUE_TIMEOUT_MS, INTERVENE_TIMER_MS, INVENTORY_SIZE, DEFAULT_ACTION_POINTS, STARTING_HEALTH } from '../constants.js';
import * as PartyManager from '../party/party-manager.js';
import { processEnemyEndOfTurn, handleEnemySpecialAction } from './enemy-handlers.js';
import {
    handlePvpPlayerDeath,
    checkPvpWinCondition,
    endPvpEncounter,
    endDuelEncounter,
    startPvpEncounter,
    startNextPvpTeamTurn,
    processPvpPlayerEndTurn
} from './pvp-state.js';
import {
    determineLootWinnerAndDistribute,
    processNextLootRoll
} from './loot-manager.js';

const PVP_ZONES = ['blighted_wastes'];

/**
 * Helper function to proceed to normal reaction after intervene phase is complete.
 * Called either when no one intervenes or after intervene roll fails.
 */
function proceedToNormalReaction(io, party, targetPlayerState, availableReactions, attack, enemy, enemyIndex, isFleeing) {
    const { sharedState } = party;

    // Clear intervene state
    if (sharedState.interveneTimeout) {
        clearTimeout(sharedState.interveneTimeout);
        sharedState.interveneTimeout = null;
    }
    sharedState.pendingIntervene = null;

    // Set up normal reaction
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
        endOfTurnProcessed: true
    };

    const reactionPayload = {
        damage: attack.damage,
        attacker: enemy.name,
        attackMessage: attack.message,
        availableReactions: availableReactions.map(r => ({ name: r.name })),
        timer: REACTION_TIMER_MS
    };

    io.to(targetPlayerState.playerId).emit('party:requestReaction', reactionPayload);
    party.reactionTimeout = setTimeout(() => {
        const playerSocket = io.sockets.sockets.get(targetPlayerState.playerId);
        if (playerSocket) {
            // Use the handleResolveReaction function defined in this file
            handleResolveReaction(io, playerSocket, { reactionType: 'take_damage' });
        }
    }, REACTION_TIMER_MS);

    broadcastAdventureUpdate(io, party);
}

/**
 * Handle a player's response to an intervene prompt.
 * @param {Object} io - Socket.io instance
 * @param {Object} socket - The socket of the responding player
 * @param {Object} payload - { accept: boolean }
 */
export async function resolveIntervene(io, socket, payload) {
    const name = socket.characterName;
    const player = players[name];
    if (!player?.character?.partyId) return;

    const party = parties[player.character.partyId];
    if (!party?.sharedState?.pendingIntervene) return;

    const { sharedState } = party;
    const interveneData = sharedState.pendingIntervene;

    // Verify this player is a potential intervenor
    if (!interveneData.potentialIntervenors.includes(name)) return;

    // Mark as responded
    if (!interveneData.respondedIntervenors.includes(name)) {
        interveneData.respondedIntervenors.push(name);
    }

    const intervenorState = sharedState.partyMemberStates.find(p => p.name === name);
    if (!intervenorState || intervenorState.isDead) return;

    if (payload.accept) {
        // Clear the timeout since someone is intervening
        if (sharedState.interveneTimeout) {
            clearTimeout(sharedState.interveneTimeout);
            sharedState.interveneTimeout = null;
        }

        // Get intervene spell
        const interveneSpell = player.character.equippedSpells.find(s => s.isIntervene);
        if (!interveneSpell) return;

        // Put spell on cooldown
        intervenorState.spellCooldowns[interveneSpell.name] = interveneSpell.cooldown;

        // Roll for intervene success
        const bonuses = getBonusStatsForPlayer(player.character, intervenorState);
        const defenseValue = player.character.defense + (bonuses.defense || 0);
        const roll = rollD20();
        const total = roll + defenseValue;
        const isSuccess = roll !== 1 && total >= interveneSpell.hit;

        const rollColor = isSuccess ? '#2ecc71' : '#e74c3c';
        const rollDisplay = `<span style="color:${rollColor}">🎲${roll}</span>`;

        if (roll === 1) {
            // Critical failure - intervenor takes damage, no second reaction
            sharedState.log.push({ message: `${name}'s Intervene: ${rollDisplay} Critical Failure!`, type: 'damage' });

            const damageToDeal = interveneData.damage;
            applyDamage(intervenorState, damageToDeal);

            sharedState.log.push({
                message: `${interveneData.attackerName} ${interveneData.message} ${name} intercepts but takes ${damageToDeal} damage! [id:${intervenorState.playerId}]`,
                type: 'damage'
            });

            if (intervenorState.health <= 0) {
                intervenorState.isDead = true;
                intervenorState.lootableInventory = [...player.character.inventory.filter(Boolean)];
                player.character.inventory = Array(INVENTORY_SIZE).fill(null);
                io.to(player.id).emit('characterUpdate', player.character);
                sharedState.log.push({ message: `${name} has been defeated!`, type: 'damage' });
            }

            sharedState.pendingIntervene = null;

            // Continue enemy phase
            const lastAttackerIndex = interveneData.attackerIndex;
            const enemies = sharedState.zoneCards.map((c, i) => ({ card: c, index: i })).filter(e => e.card && e.card.type === 'enemy');
            const lastEnemyListIndex = enemies.findIndex(e => e.index === lastAttackerIndex);

            broadcastAdventureUpdate(io, party);
            await runEnemyPhaseForParty(io, party.id, false, lastEnemyListIndex + 1);

        } else if (isSuccess) {
            // Success - intervenor becomes new target and gets their own reactions
            sharedState.log.push({ message: `${name}'s Intervene: ${rollDisplay} Success! Intercepting attack!`, type: 'success' });

            // Build available reactions for the intervenor
            const newAvailableReactions = [];

            // Check for dodge
            const dodgeSpell = player.character.equippedSpells.find(s => s.name === "Dodge");
            if (dodgeSpell && (intervenorState.spellCooldowns[dodgeSpell.name] || 0) <= 0) {
                newAvailableReactions.push({ name: 'Dodge' });
            }

            // Check for block
            const shield = player.character.equipment.offHand;
            if (shield && shield.type === 'shield' && shield.reaction && (intervenorState.itemCooldowns[shield.name] || 0) <= 0) {
                newAvailableReactions.push({ name: 'Block' });
            }

            // Clear intervene state
            sharedState.pendingIntervene = null;

            // Set up reaction for the intervenor as the new target
            const enemy = sharedState.zoneCards[interveneData.attackerIndex];
            proceedToNormalReaction(io, party, intervenorState, newAvailableReactions,
                { damage: interveneData.damage, damageType: interveneData.damageType, attackRange: interveneData.attackRange, debuff: interveneData.debuff, message: interveneData.message },
                enemy, interveneData.attackerIndex, interveneData.isFleeing);

        } else {
            // Failed roll - intervenor takes full damage with no second reaction
            sharedState.log.push({ message: `${name}'s Intervene: ${rollDisplay} Failed!`, type: 'damage' });

            const damageToDeal = interveneData.damage;
            applyDamage(intervenorState, damageToDeal);

            sharedState.log.push({
                message: `${interveneData.attackerName} ${interveneData.message} ${name} intercepts but takes ${damageToDeal} damage! [id:${intervenorState.playerId}]`,
                type: 'damage'
            });

            if (intervenorState.health <= 0) {
                intervenorState.isDead = true;
                intervenorState.lootableInventory = [...player.character.inventory.filter(Boolean)];
                player.character.inventory = Array(INVENTORY_SIZE).fill(null);
                io.to(player.id).emit('characterUpdate', player.character);
                sharedState.log.push({ message: `${name} has been defeated!`, type: 'damage' });
            }

            sharedState.pendingIntervene = null;

            // Continue enemy phase
            const lastAttackerIndex = interveneData.attackerIndex;
            const enemies = sharedState.zoneCards.map((c, i) => ({ card: c, index: i })).filter(e => e.card && e.card.type === 'enemy');
            const lastEnemyListIndex = enemies.findIndex(e => e.index === lastAttackerIndex);

            broadcastAdventureUpdate(io, party);
            await runEnemyPhaseForParty(io, party.id, false, lastEnemyListIndex + 1);
        }
    } else {
        // Declined - check if all potential intervenors have responded
        const allResponded = interveneData.potentialIntervenors.every(name =>
            interveneData.respondedIntervenors.includes(name)
        );

        if (allResponded) {
            // Everyone declined - proceed to normal target
            const originalTargetState = sharedState.partyMemberStates.find(p => p.name === interveneData.originalTargetName);
            const enemy = sharedState.zoneCards[interveneData.attackerIndex];

            proceedToNormalReaction(io, party, originalTargetState, interveneData.availableReactions,
                { damage: interveneData.damage, damageType: interveneData.damageType, attackRange: interveneData.attackRange, debuff: interveneData.debuff, message: interveneData.message },
                enemy, interveneData.attackerIndex, interveneData.isFleeing);
        }
    }
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
    // Defeat message is now consolidated with loot drops below

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
        // Restore overlayed card if enemy was spawned over one, otherwise use zone area card
        if (enemy.overlayedCard) {
            sharedState.zoneCards[enemyIndex] = { ...enemy.overlayedCard, id: Date.now() };
        } else {
            sharedState.zoneCards[enemyIndex] = getZoneAreaCard(sharedState.currentZone);
        }
        if (!sharedState.zoneCards.some(c => c && c.type === 'enemy')) {
            sharedState.partyMemberStates.forEach(p => { if (!p.isDead) p.actionPoints = DEFAULT_ACTION_POINTS; });
        }
        return;
    }

    let lootToDistribute = [];
    // --- NEW: Handle gold and traits from loot table entries ---
    let lootTableGold = 0;

    if (enemy.lootTable && enemy.lootTable.length > 0) {
        const roll = rollD20();
        const lootDrop = enemy.lootTable.find(entry => roll >= entry.range[0] && roll <= entry.range[1]);

        if (lootDrop) {
            // 1. Handle "gold" in loot table
            if (lootDrop.gold) {
                if (lootDrop.gold.min !== undefined && lootDrop.gold.max !== undefined) {
                    lootTableGold = Math.floor(Math.random() * (lootDrop.gold.max - lootDrop.gold.min + 1)) + lootDrop.gold.min;
                }
            }

            // 2. Handle "trait" (e.g. { trait: 'T1 Recipe', chance: 1.0 })
            if (lootDrop.trait) {
                // Determine count (default 1)
                const count = lootDrop.count || 1;
                const itemsWithTrait = gameData.allItems.filter(i => i.traits && i.traits.includes(lootDrop.trait));

                if (itemsWithTrait.length > 0) {
                    for (let i = 0; i < count; i++) {
                        const randomItem = itemsWithTrait[Math.floor(Math.random() * itemsWithTrait.length)];
                        lootToDistribute.push(randomItem);
                    }
                }
            }

            // 3. Handle standard items list
            if (lootDrop.items && lootDrop.items.length > 0) {
                lootDrop.items.forEach(itemName => {
                    const itemData = gameData.allItems.find(i => i.name === itemName);
                    if (itemData) lootToDistribute.push(itemData);
                });
            }

            // 4. Handle fromCategory
            if (lootDrop.fromCategory) {
                const count = lootDrop.count || 1;
                for (let i = 0; i < count; i++) {
                    const itemData = lootPools.getRandomFromCategory(lootDrop.fromCategory);
                    if (itemData) lootToDistribute.push(itemData);
                }
            }

            // 5. Handle fromCategories
            if (lootDrop.fromCategories) {
                const count = lootDrop.count || 1;
                for (let i = 0; i < count; i++) {
                    const itemData = lootPools.getRandomFromCategories(lootDrop.fromCategories);
                    if (itemData) lootToDistribute.push(itemData);
                }
            }

            // 6. Handle legacy randomItems
            if (lootDrop.randomItems && lootDrop.randomItems.pool) {
                for (let i = 0; i < lootDrop.randomItems.count; i++) {
                    const randomItemName = lootDrop.randomItems.pool[Math.floor(Math.random() * lootDrop.randomItems.pool.length)];
                    const itemData = gameData.allItems.find(i => i.name === randomItemName);
                    if (itemData) lootToDistribute.push(itemData);
                }
            }
        }
    }

    // Handle separate guaranteedLoot (Legacy & Hybrid support)
    if (enemy.guaranteedLoot && enemy.guaranteedLoot.items) {
        enemy.guaranteedLoot.items.forEach(itemName => {
            const itemData = gameData.allItems.find(i => i.name === itemName);
            if (itemData) lootToDistribute.push(itemData);
        });
    }

    // Collect dropped items...
    const droppedItemNames = [];
    const rollableItems = [];

    lootToDistribute.forEach(itemData => {
        if (itemData.rarity === 'uncommon' || itemData.rarity === 'rare') {
            rollableItems.push(itemData);
        } else {
            sharedState.groundLoot.push({ ...itemData, quantity: 1 });
            droppedItemNames.push(itemData.name);
        }
    });

    // Calculate Gold Distribution (before logging so we can include in combined message)
    let totalGoldDropped = 0;

    // 1. Loot Table Gold
    if (lootTableGold > 0) {
        totalGoldDropped += lootTableGold;
    }

    // 2. Guaranteed Gold
    if (enemy.guaranteedLoot && enemy.guaranteedLoot.gold) {
        let goldAmount;
        const goldConfig = enemy.guaranteedLoot.gold;
        if (goldConfig.min !== undefined && goldConfig.max !== undefined) {
            goldAmount = Math.floor(Math.random() * (goldConfig.max - goldConfig.min + 1)) + goldConfig.min;
        } else if (enemy.guaranteedLoot.minGold !== undefined && enemy.guaranteedLoot.maxGold !== undefined) {
            // Legacy format support
            goldAmount = Math.floor(Math.random() * (enemy.guaranteedLoot.maxGold - enemy.guaranteedLoot.minGold + 1)) + enemy.guaranteedLoot.minGold;
        } else {
            goldAmount = rollD20() + rollD20();
        }
        totalGoldDropped += goldAmount;
    }

    // Build consolidated defeat message
    let defeatMessage = `${enemy.name} defeated!`;
    const dropParts = [];
    if (droppedItemNames.length > 0) {
        dropParts.push(droppedItemNames.join(', '));
    }
    if (totalGoldDropped > 0) {
        dropParts.push(`${totalGoldDropped}g`);
    }
    if (dropParts.length > 0) {
        defeatMessage += ` Dropped: ${dropParts.join(', ')}`;
    }
    sharedState.log.push({ message: defeatMessage, type: 'success' });

    // Process rollable items (uncommon/rare) - these get their own message since they need action
    rollableItems.forEach(itemData => {
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
    });

    // Calculate per-player gold share
    const totalGoldPerPlayer = Math.floor(totalGoldDropped / party.members.length);

    // Update Party Members (Quests, Gold, State)
    party.members.forEach(memberName => {
        const member = players[memberName];
        if (!member || !member.character) return;
        const character = member.character;

        // Update Quests
        character.quests.forEach(quest => {
            if (quest.status === 'active' && (quest.details.target === enemy.name || quest.details.target === enemy.questTarget || (quest.details.target === 'Goblin' && enemy.name.includes('Goblin')))) {
                quest.progress++;
                if (quest.progress >= quest.details.required) {
                    quest.status = 'readyToTurnIn';
                    if (member.id) io.to(member.id).emit('questObjectiveComplete', quest.details.title);
                }
            }
        });

        // Add Gold
        if (totalGoldPerPlayer > 0) {
            character.gold += totalGoldPerPlayer;
        }

        if (member.id) io.to(member.id).emit('characterUpdate', character);
    });
    // Restore overlayed card if enemy was spawned over one, otherwise use zone-specific area card
    if (enemy.overlayedCard) {
        sharedState.zoneCards[enemyIndex] = { ...enemy.overlayedCard, id: Date.now() };
    } else {
        sharedState.zoneCards[enemyIndex] = getZoneAreaCard(sharedState.currentZone);
    }
    if (!sharedState.zoneCards.some(c => c && c.type === 'enemy')) {
        sharedState.partyMemberStates.forEach(p => { if (!p.isDead) p.actionPoints = DEFAULT_ACTION_POINTS; });
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
        const alivePlayers = sharedState.partyMemberStates.filter(p => !p.isDead && p.health > 0);
        const isWipe = alivePlayers.length === 0;
        party.members.forEach(memberName => {
            const memberPlayer = players[memberName];
            const memberCharacter = memberPlayer?.character;
            if (memberCharacter) {
                if (!sharedState.partyMemberStates.find(p => p.name === memberName)?.isDead) {
                    const bonuses = getBonusStatsForPlayer(memberCharacter, null);
                    memberCharacter.health = STARTING_HEALTH + bonuses.maxHealth;
                }
                if (memberPlayer.id) {
                    io.to(memberPlayer.id).emit('characterUpdate', memberCharacter);
                    if (isWipe) {
                        io.to(memberPlayer.id).emit('party:adventureEnded', { outcome: 'loss', message: 'Your party was wiped out!' });
                    } else {
                        io.to(memberPlayer.id).emit('party:adventureEnded');
                    }
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
                p.actionPoints = DEFAULT_ACTION_POINTS;
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

    // Helper: End adventure when party wipes (all dead)
    const endTheAdventureAfterWipe = () => {
        sharedState.isLoadingNextArea = false;
        party.members.forEach(memberName => {
            const memberPlayer = players[memberName];
            const memberCharacter = memberPlayer?.character;
            if (memberCharacter) {
                // Don't restore health for dead players
                if (memberPlayer.id) {
                    io.to(memberPlayer.id).emit('characterUpdate', memberCharacter);
                    io.to(memberPlayer.id).emit('party:adventureEnded', { outcome: 'loss', message: 'Your party succumbed to their wounds!' });
                }
            }
        });
        if (party.isSoloParty) {
            PartyManager.cleanupSoloParty(io, party, player);
        } else {
            PartyManager.endPartyAdventure(io, party.id);
        }
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
            broadcastAdventureUpdate(io, party);
            endTheAdventureAfterWipe();
            return;
        }
    } else {
        // Process end-of-turn effects (DoT, buff/debuff durations) before leaving
        processPartyEndOfTurn(sharedState);
        broadcastAdventureUpdate(io, party);

        // Check if anyone died from DoT before proceeding
        const alivePlayers = sharedState.partyMemberStates.filter(p => !p.isDead);
        if (alivePlayers.length === 0) {
            sharedState.log.push({ message: "The party succumbed to their wounds before they could venture deeper!", type: 'damage' });
            broadcastAdventureUpdate(io, party);
            endTheAdventureAfterWipe();
            return;
        } else {
            sharedState.log.push({ message: "The party ventures deeper into the zone!", type: 'info' });
            proceedToNextArea();
        }
    }
    broadcastAdventureUpdate(io, party);
}

/**
 * Process active zone effects (e.g., Blizzard) between player and enemy turns.
 * Zone effects deal damage/apply debuffs to all enemies, then decrement duration.
 * Works for both PVE (targets zoneCards enemies) and PVP (targets enemy-team players).
 * @param {Object} io - Socket.io instance
 * @param {Object} party - The party object
 * @param {Object} [encounter] - Optional PVP encounter object
 * @param {string} [activeTeam] - The team that just finished their turn (zone effects hit enemies of this team)
 */
export function processZoneEffects(io, party, encounter = null, activeTeam = null) {
    const { sharedState } = party;
    if (!sharedState.zoneEffects || sharedState.zoneEffects.length === 0) return;

    const log = encounter ? encounter.log : sharedState.log;

    sharedState.zoneEffects.forEach(effect => {
        // In PVP, only tick zone effects after the caster's team turn
        if (encounter && activeTeam && effect.casterTeam && effect.casterTeam !== activeTeam) {
            return; // Skip — not this caster's team turn
        }

        if (effect.type === 'blizzard') {
            log.push({ message: `${effect.icon} The Blizzard rages on!`, type: 'info' });

            const damage = effect.damage;

            if (encounter && activeTeam) {
                // PVP: Damage all living enemy-team players
                const enemyTeam = activeTeam === 'A' ? 'B' : 'A';
                encounter.playerStates.forEach(p => {
                    if (p.team === enemyTeam && !p.isDead && p.health > 0) {
                        applyDamage(p, damage);
                        log.push({
                            message: `${p.name} takes ${damage} Frost damage from Blizzard!`,
                            type: 'damage'
                        });

                        if (effect.chillAmount && effect.chillAmount > 0) {
                            applyChillStack(p, effect.chillAmount, log);
                        }

                        if (p.health <= 0) {
                            p.health = 0;
                            p.isDead = true;
                            log.push({ message: `${p.name} has been slain by the Blizzard!`, type: 'damage' });
                            const defeatedPlayer = players[p.name];
                            if (defeatedPlayer) {
                                handlePvpPlayerDeath(io, defeatedPlayer, encounter);
                            }
                            checkPvpWinCondition(io, encounter, p);
                        }
                    }
                });
            } else {
                // PVE: Damage all living enemies in zoneCards
                sharedState.zoneCards.forEach((card, idx) => {
                    if (card && card.type === 'enemy' && !card.isDead && card.health > 0) {
                        applyDamage(card, damage);
                        sharedState.log.push({
                            message: `${card.name} takes ${damage} Frost damage from Blizzard!`,
                            type: 'damage'
                        });

                        if (effect.chillAmount && effect.chillAmount > 0) {
                            applyChillStack(card, effect.chillAmount, sharedState.log);
                        }

                        if (card.health <= 0) {
                            defeatEnemyInParty(io, party, card, idx);
                        }
                    }
                });
            }
        }

        // Decrement duration (only for effects that were processed this turn)
        effect.duration--;
    });

    // Remove expired effects in-place (preserve shared array reference between parties)
    for (let i = sharedState.zoneEffects.length - 1; i >= 0; i--) {
        if (sharedState.zoneEffects[i].duration <= 0) {
            const e = sharedState.zoneEffects[i];
            log.push({ message: `${e.icon || '🌨️'} ${e.name} has faded.`, type: 'info' });
            sharedState.zoneEffects.splice(i, 1);
        }
    }
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

        // Process zone effects (e.g., Blizzard) at start of zone turn
        processZoneEffects(io, party);

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

                // Decrement enemy reaction cooldowns
                if (enemy.reactionCooldowns) {
                    for (const reactionName in enemy.reactionCooldowns) {
                        if (enemy.reactionCooldowns[reactionName] > 0) {
                            enemy.reactionCooldowns[reactionName]--;
                        }
                    }
                }

                // Process Chill reduction for enemy
                processChillReduction(enemy, sharedState.log);

                if (damageTaken) broadcastAdventureUpdate(io, party);
                return false;
            };

            if (enemy.debuffs.some(d => d.type === 'stun' || d.type === 'frozen')) {
                const effect = enemy.debuffs.find(d => d.type === 'stun' || d.type === 'frozen');
                sharedState.log.push({ message: `${enemy.name} is ${effect.type === 'frozen' ? 'Frozen' : 'stunned'} and cannot act!`, type: 'reaction' });
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

            let roll = rollD20();
            const modifiedRoll = Math.max(1, roll + dazeModifier + stealthModifier); // Minimum roll of 1

            if (dazeDebuff && dazeModifier !== 0) {
                sharedState.log.push({ message: `${enemy.name} is dazed! (-3 to attack roll)`, type: 'info' });
            }
            if (stealthBuff) {
                sharedState.log.push({ message: `${enemy.name}'s attack is hindered by shadows! (-5 to hit)`, type: 'info' });
            }
            const attack = enemy.attackTable ? enemy.attackTable.find(a => modifiedRoll >= a.range[0] && modifiedRoll <= a.range[1]) : null;

            // Check for Silence - prevents magic attacks
            if (attack && attack.isMagic) {
                const silenceDebuff = (enemy.debuffs || []).find(d => d.type.toLowerCase() === 'silence');
                if (silenceDebuff) {
                    sharedState.log.push({ message: `${enemy.name} is Silenced and cannot use magic!`, type: 'info' });
                    processEndOfTurn();
                    broadcastAdventureUpdate(io, party);
                    await new Promise(resolve => setTimeout(resolve, 1200));
                    continue;
                }
            }

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
                // UNIFIED: Use shared reaction availability helper
                const attackDetails = { attackRange: attack.attackRange || 'melee', damageType: attack.damageType };
                const availableReactions = getAvailablePlayerReactions(targetCharacter, targetPlayerState, attackDetails, sharedState.log);
                // --- END OF REACTION LOGIC ---
                if (availableReactions.length > 0 && !isFleeing) {
                    // FIX: Process end of turn effects BEFORE waiting for reaction
                    // This ensures DOT damage is applied even if we pause for reaction
                    if (processEndOfTurn()) {
                        // Enemy died from DOT - skip the reaction setup
                        broadcastAdventureUpdate(io, party);
                        continue;
                    }

                    // --- INTERVENE CHECK ---
                    // Check if any OTHER party member can intervene before we offer reactions to target
                    const potentialIntervenors = [];
                    sharedState.partyMemberStates.forEach(pmState => {
                        if (pmState.name === targetPlayerState.name || pmState.isDead) return;
                        const pmPlayer = players[pmState.name];
                        if (!pmPlayer?.character) return;

                        // Check for Intervene spell
                        const interveneSpell = pmPlayer.character.equippedSpells.find(s => s.isIntervene);
                        if (!interveneSpell) return;

                        // Check cooldown
                        if ((pmState.spellCooldowns[interveneSpell.name] || 0) > 0) return;

                        // Check for shield equipped
                        const shield = pmPlayer.character.equipment.offHand;
                        if (!shield || shield.type !== 'shield') return;

                        potentialIntervenors.push({
                            playerState: pmState,
                            player: pmPlayer,
                            spell: interveneSpell
                        });
                    });

                    // If there are potential intervenors, ask them first
                    if (potentialIntervenors.length > 0) {
                        // Store the attack info so we can resume after intervene decision
                        sharedState.pendingIntervene = {
                            attackerName: enemy.name,
                            attackerIndex: enemyIndex,
                            originalTargetName: targetPlayerState.name,
                            damage: attack.damage,
                            damageType: attack.damageType,
                            attackRange: attack.attackRange || 'melee',
                            debuff: attack.debuff || null,
                            message: attack.message,
                            availableReactions: availableReactions,
                            potentialIntervenors: potentialIntervenors.map(pi => pi.playerState.name),
                            respondedIntervenors: [],
                            isFleeing: isFleeing,
                            endOfTurnProcessed: true
                        };

                        // Notify all potential intervenors
                        const intervenePayload = {
                            attacker: enemy.name,
                            target: targetPlayerState.name,
                            damage: attack.damage,
                            attackMessage: attack.message,
                            timer: INTERVENE_TIMER_MS
                        };

                        potentialIntervenors.forEach(pi => {
                            io.to(pi.playerState.playerId).emit('party:requestIntervene', intervenePayload);
                        });

                        // Set timeout for intervene response
                        sharedState.interveneTimeout = setTimeout(() => {
                            // Nobody intervened in time - continue to normal target
                            proceedToNormalReaction(io, party, targetPlayerState, availableReactions, attack, enemy, enemyIndex, isFleeing);
                        }, INTERVENE_TIMER_MS);

                        broadcastAdventureUpdate(io, party);
                        return;
                    }
                    // --- END INTERVENE CHECK ---

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
                        attackMessage: attack.message,
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

                    // Flame Shield burn-on-melee counter for enemy melee attacks
                    if (attack.attackRange === 'melee' || !attack.attackRange) {
                        const flameShield = targetPlayerState.buffs?.find(b => b.type === 'Flame Shield');
                        if (flameShield && flameShield.burnOnMelee) {
                            // Apply burn to the enemy
                            if (!enemy.debuffs) enemy.debuffs = [];
                            const burnDebuff = { ...flameShield.burnOnMelee };
                            const existingBurn = enemy.debuffs.findIndex(d => d.type.toLowerCase() === 'burn');
                            if (existingBurn !== -1) enemy.debuffs.splice(existingBurn, 1);
                            enemy.debuffs.push(burnDebuff);
                            sharedState.log.push({ message: `${enemy.name} is burned by ${targetPlayerState.name}'s Flame Shield!`, type: 'damage' });
                        }

                        // Ice Barrier chill-on-melee counter for enemy melee attacks
                        const iceBarrier = targetPlayerState.buffs?.find(b => b.type === 'Ice Barrier');
                        if (iceBarrier && iceBarrier.chillOnMelee) {
                            // Apply chill to the enemy
                            applyChillStack(enemy, iceBarrier.chillOnMelee, sharedState.log);
                            sharedState.log.push({ message: `${enemy.name} is chilled by ${targetPlayerState.name}'s Ice Barrier!`, type: 'damage' });
                        }
                    }
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

                // NOTE: Legacy inline handlers below should eventually be migrated to the registry
                // For now, they provide fallback handling for special attacks not yet in registry

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
                            // UNIFIED: Use shared reaction availability helper
                            const vampireAttackDetails = { attackRange: 'melee', damageType: 'Physical' };
                            const availableReactions = getAvailablePlayerReactions(playerObj.character, target, vampireAttackDetails, sharedState.log);

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
                                    attackMessage: 'strikes from the shadows!',
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
                        targetPlayerObject.character.inventory = Array(INVENTORY_SIZE).fill(null);
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

                    let extraRoll = rollD20();
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

            // Check for Stun or Frozen - reduces AP by 1
            const disablingDebuff = p.debuffs.find(d => d.type === 'stun' || d.type === 'frozen');
            if (disablingDebuff) {
                p.actionPoints = DEFAULT_ACTION_POINTS - 1; // Lose 1 AP due to stun/frozen
                const effectName = disablingDebuff.type === 'frozen' ? 'Frozen' : 'stunned';
                sharedState.log.push({ message: `${p.name} is ${effectName} and starts with reduced Action Points!`, type: 'reaction' });
            } else {
                p.actionPoints = DEFAULT_ACTION_POINTS;
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

    // UNIFIED: Use shared end-of-turn effects (DoT + Chill + buff/debuff decrement)
    processEndOfTurnEffects(playerState, sharedState.log);

    // PVE-specific: Rejuvenate healing
    const rejuvenateBuff = (playerState.buffs || []).find(b => b.type === 'Rejuvenate');
    if (rejuvenateBuff && !playerState.isDead) {
        const playerChar = players[playerName]?.character;
        if (playerChar) {
            const bonuses = getBonusStatsForPlayer(playerChar, playerState);
            const healAmount = Number(rejuvenateBuff.healAmount || Math.max(1, 1 + (bonuses.naturePower || 0)));
            const currentHealth = Number(playerState.health || 0);
            const maxHealth = Number(playerState.maxHealth || 10);
            playerState.health = Math.min(maxHealth, currentHealth + (isNaN(healAmount) ? 0 : healAmount));
            sharedState.log.push({ message: `${playerState.name}'s Rejuvenate heals for ${healAmount} HP.`, type: 'heal' });
            if (playerState.playerId) io.to(playerState.playerId).emit('characterUpdate', playerChar);
        }
    }

    // Death check after DoT
    if (playerState.health <= 0) {
        playerState.health = 0;
        playerState.isDead = true;
        sharedState.log.push({ message: `${playerState.name} has succumbed to their wounds!`, type: 'damage' });
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

        // 1a. Apply Rejuvenate Healing
        const rejuvenateBuff = (playerState.buffs || []).find(b => b.type === 'Rejuvenate');
        if (rejuvenateBuff && !playerState.isDead) {
            const playerChar = players[playerState.name]?.character;
            if (playerChar) {
                const bonuses = getBonusStatsForPlayer(playerChar, playerState);
                const healAmount = Number(rejuvenateBuff.healAmount || Math.max(1, 1 + (bonuses.naturePower || 0)));
                const currentHealth = Number(playerState.health || 0);
                const maxHealth = Number(playerState.maxHealth || 10);
                playerState.health = Math.min(maxHealth, currentHealth + (isNaN(healAmount) ? 0 : healAmount));
                sharedState.log.push({ message: `${playerState.name}'s Rejuvenate heals for ${healAmount} HP.`, type: 'heal' });
            }
        }

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


// Re-export functions to maintain API compatibility
export {
    handlePvpPlayerDeath,
    endDuelEncounter,
    startPvpEncounter,
    startNextPvpTeamTurn,
    processPvpPlayerEndTurn
};

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
            const roll = rollD20();
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
            const roll = rollD20();
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
            const roll = rollD20();
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

            const roll = rollD20();
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
                reactingPlayer.character.inventory = Array(INVENTORY_SIZE).fill(null);
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