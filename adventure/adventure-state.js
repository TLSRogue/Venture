// adventure/adventure-state.js

import { players, parties } from '../serverState.js';
import { gameData } from '../game-data.js';
import { broadcastAdventureUpdate, broadcastPartyUpdate } from '../utilsBroadcast.js';
import { getBonusStatsForPlayer, addItemToInventoryServer } from '../utilsHelpers.js';

// --- HELPER FUNCTIONS (Moved here as they are tightly coupled to adventure state) ---

export async function checkAndEndTurnForPlayer(io, party, player) {
    const partyId = party.id;
    const actingPlayerState = party.sharedState.partyMemberStates.find(p => p.playerId === player.id);

    if (actingPlayerState && actingPlayerState.actionPoints <= 0 && !actingPlayerState.turnEnded) {
        actingPlayerState.turnEnded = true;
        party.sharedState.log.push({ message: `${player.character.characterName} is out of Action Points and their turn ends.`, type: 'info' });
        
        const allTurnsEnded = party.sharedState.partyMemberStates.every(p => p.turnEnded || p.isDead);
        if (allTurnsEnded) {
            await runEnemyPhaseForParty(io, partyId);
        }
    }
}

export function defeatEnemyInParty(io, party, enemy, enemyIndex) {
    const { sharedState } = party;
    sharedState.log.push({ message: `${enemy.name} has been defeated!`, type: 'success' });

    let rolledLootItems = [];
    if (enemy.lootTable && enemy.lootTable.length > 0) {
        const roll = Math.floor(Math.random() * 20) + 1;
        const lootDrop = enemy.lootTable.find(entry => roll >= entry.range[0] && roll <= entry.range[1]);

        if (lootDrop) {
            if (lootDrop.items && lootDrop.items.length > 0) {
                rolledLootItems.push(...lootDrop.items);
            }
            if (lootDrop.randomItems && lootDrop.randomItems.pool) {
                for (let i = 0; i < lootDrop.randomItems.count; i++) {
                    const randomItemName = lootDrop.randomItems.pool[Math.floor(Math.random() * lootDrop.randomItems.pool.length)];
                    rolledLootItems.push(randomItemName);
                }
            }
        }
    }
    const rolledLootObjects = rolledLootItems.map(name => gameData.allItems.find(i => i.name === name)).filter(Boolean);

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

        if (enemy.guaranteedLoot && enemy.guaranteedLoot.items) {
            enemy.guaranteedLoot.items.forEach(itemName => {
                 const itemData = gameData.allItems.find(i => i.name === itemName);
                 if (itemData) {
                    if (!addItemToInventoryServer(character, itemData, 1, sharedState.groundLoot)) {
                        sharedState.log.push({ message: `${itemName} dropped, but your inventory is full! It was left on the ground.`, type: 'damage'});
                    }
                 }
            });
        }
        
        if(rolledLootObjects.length > 0) {
            rolledLootObjects.forEach(itemData => {
                if (!addItemToInventoryServer(character, itemData, 1, sharedState.groundLoot)) {
                     sharedState.log.push({ message: `${itemData.name} dropped, but your inventory is full! It was left on the ground.`, type: 'damage'});
                }
            });
        }

        if (member.id) io.to(member.id).emit('characterUpdate', character);
    });
    
    if (enemy.guaranteedLoot && enemy.guaranteedLoot.gold) {
        sharedState.log.push({ message: `${enemy.name} dropped gold, which was split among the party.`, type: 'success'});
    }
     if (enemy.guaranteedLoot && enemy.guaranteedLoot.items) {
        sharedState.log.push({ message: `${enemy.name} dropped: ${enemy.guaranteedLoot.items.join(', ')}!`, type: 'success'});
    }
    if (rolledLootItems.length > 0) {
        sharedState.log.push({ message: `${enemy.name} also dropped: ${rolledLootItems.join(', ')}!`, type: 'success' });
    }

    sharedState.zoneCards[enemyIndex] = null;

    if (!sharedState.zoneCards.some(c => c && c.type === 'enemy')) {
        sharedState.log.push({ message: "Combat has ended! Action Points restored.", type: "success" });
        sharedState.partyMemberStates.forEach(p => { if (!p.isDead) p.actionPoints = 3; });
    }
}


// --- STATE MANAGEMENT FUNCTIONS ---

export async function processEndAdventure(io, player, party) {
    const { sharedState } = party;
    if (!sharedState) return;

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
    
    const proceedToNextArea = () => {
        sharedState.zoneCards = [];
        sharedState.groundLoot = [];
        drawCardsForServer(sharedState, 3);

        sharedState.partyMemberStates.forEach(p => {
            p.actionPoints = 3;
            p.turnEnded = false;
            p.weaponCooldowns = {};
            p.spellCooldowns = {};
            p.itemCooldowns = {};
        });
        sharedState.turnNumber = 0;
        sharedState.isPlayerTurn = true;
    };
    
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

            const targetPlayerState = alivePlayers[Math.floor(Math.random() * alivePlayers.length)];
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
                        availableReactions: availableReactions.map(r => ({ name: r.name }))
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
                if (targetPlayerObject.character) {
                    targetPlayerState.lootableInventory = [...targetPlayerObject.character.inventory.filter(Boolean)];
                    targetPlayerObject.character.inventory = Array(24).fill(null);
                    if(targetPlayerObject.id) io.to(targetPlayerObject.id).emit('characterUpdate', targetPlayerObject.character);
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

    const partyId = player.character.partyId;
    const party = parties[partyId];
    if (!party || !party.sharedState || !party.sharedState.pendingReaction) return;
    
    const { sharedState } = party;
    const reaction = sharedState.pendingReaction;

    if (reaction.targetName !== name) return.

    clearTimeout(party.reactionTimeout);
    party.reactionTimeout = null;

    const { reactionType } = payload;
    const reactingPlayerState = sharedState.partyMemberStates.find(p => p.name === name);
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
    
    sharedState.log.push({ message: logMessage, type: dodged || blocked ? 'success' : 'reaction' });

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
        sharedState.log.push({ message: damageMessage, type: 'damage' });
    }

    if (reactingPlayerState.health <= 0) {
        reactingPlayerState.health = 0;
        reactingPlayerState.isDead = true;
        if (reactingPlayer.character) {
            reactingPlayerState.lootableInventory = [...reactingPlayer.character.inventory.filter(Boolean)];
            reactingPlayer.character.inventory = Array(24).fill(null);
            if(reactingPlayer.id) io.to(reactingPlayer.id).emit('characterUpdate', reactingPlayer.character);
        }
        sharedState.log.push({ message: `${name} has been defeated!`, type: 'damage' });
    }

    const lastAttackerIndex = reaction.attackerIndex;
    const wasFleeing = reaction.isFleeing || false;
    sharedState.pendingReaction = null;

    const enemies = sharedState.zoneCards.map((c, i) => ({card: c, index: i})).filter(e => e.card && e.card.type === 'enemy');
    const lastEnemyListIndex = enemies.findIndex(e => e.index === lastAttackerIndex);
    
    await runEnemyPhaseForParty(io, partyId, wasFleeing, lastEnemyListIndex + 1);
}