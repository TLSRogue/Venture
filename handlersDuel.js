// handlersDuel.js

/**
 * Manages all socket events and logic related to player duels.
 */

import { players, parties, duels } from './serverState.js';
import { broadcastPartyUpdate, broadcastDuelUpdate } from './utilsBroadcast.js';
import { getBonusStatsForPlayer } from './utilsHelpers.js';

// This function is exported separately so the disconnect handler can call it.
export function endDuel(io, duelId, winnerName, loserName) {
    const duel = duels[duelId];
    if (!duel || duel.ended) return;

    console.log(`Ending duel ${duelId}. Winner: ${winnerName}, Loser: ${loserName}`);
    duel.ended = true;
    duel.log.push({ message: `${loserName} has been defeated! ${winnerName} is victorious!`, type: 'success' });
    
    const winner = players[winnerName];
    const loser = players[loserName];
    const duelReward = { gold: 50 };

    if (winner && winner.character) {
        winner.character.gold += duelReward.gold;
        winner.character.duelId = null;
        if (winner.id) {
            io.to(winner.id).emit('duel:end', { outcome: 'win', reward: duelReward });
            io.to(winner.id).emit('characterUpdate', winner.character);
        }
    }

    if (loser && loser.character) {
        loser.character.duelId = null;
        if (loser.id) {
            io.to(loser.id).emit('duel:end', { outcome: 'loss', reward: null });
            io.to(loser.id).emit('characterUpdate', loser.character);
        }
    }

    delete duels[duelId];
    
    if (winner?.character?.partyId) broadcastPartyUpdate(io, winner.character.partyId);
    if (loser?.character?.partyId) broadcastPartyUpdate(io, loser.character.partyId);
}

export const registerDuelHandlers = (io, socket) => {
    socket.on('duel:challenge', (targetCharacterName) => {
        const challengerName = socket.characterName;
        const challenger = players[challengerName];
        const target = players[targetCharacterName];

        if (!challenger || !target || !target.id) {
            return socket.emit('partyError', 'Target player is not available.');
        }
        const challengerInAdventure = challenger.character.partyId && parties[challenger.character.partyId]?.sharedState;
        const targetInAdventure = target.character.partyId && parties[target.character.partyId]?.sharedState;

        if (challengerInAdventure || targetInAdventure) {
            return socket.emit('partyError', 'Cannot duel while in an adventure.');
        }
        if (challenger.character.duelId || target.character.duelId) {
            return socket.emit('partyError', 'One of the players is already in a duel.');
        }

        console.log(`${challengerName} is challenging ${targetCharacterName} to a duel.`);
        io.to(target.id).emit('duel:receiveChallenge', {
            challengerName: challengerName,
            challengerId: challengerName 
        });
    });

    socket.on('duel:accept', (challengerName) => {
        const acceptorName = socket.characterName;
        const challenger = players[challengerName];
        const acceptor = players[acceptorName];

        if (!challenger || !challenger.id || !acceptor) return; 

        const duelId = `DUEL-${Date.now()}`;
        
        const createPlayerState = (playerObj) => {
            const bonuses = getBonusStatsForPlayer(playerObj.character, null);
            const maxHealth = 10 + bonuses.maxHealth;
            return {
                id: playerObj.id,
                name: playerObj.character.characterName,
                icon: playerObj.character.characterIcon,
                health: maxHealth,
                maxHealth: maxHealth,
                actionPoints: 3,
                buffs: [],
                debuffs: [],
                weaponCooldowns: {},
                spellCooldowns: {},
                itemCooldowns: {}
            };
        };

        const duelState = {
            id: duelId,
            player1: createPlayerState(challenger),
            player2: createPlayerState(acceptor),
            activePlayerId: challenger.id,
            log: [{ message: `Duel between ${challengerName} and ${acceptorName} has begun!`, type: 'success' }],
            ended: false,
            disconnectTimeout: null
        };

        duels[duelId] = duelState;
        challenger.character.duelId = duelId;
        acceptor.character.duelId = duelId;
        
        console.log(`Duel ${duelId} starting.`);
        io.to(challenger.id).to(acceptor.id).emit('duel:start', duelState);
        if (challenger.character.partyId) broadcastPartyUpdate(io, challenger.character.partyId);
        if (acceptor.character.partyId) broadcastPartyUpdate(io, acceptor.character.partyId);
    });

    socket.on('duel:playerAction', (action) => {
        try {
            const playerName = socket.characterName;
            const player = players[playerName];
            if (!player || !player.character.duelId) return;
        
            const duel = duels[player.character.duelId];
            if (!duel || duel.ended || duel.activePlayerId !== player.id) return;
            
            const actingPlayerState = duel.player1.name === playerName ? duel.player1 : duel.player2;
            const opponentPlayerState = duel.player1.name === playerName ? duel.player2 : duel.player1;
            const actingCharacter = player.character;
        
            let actionTaken = false;

            if (action.type === 'weaponAttack') {
                const weapon = actingCharacter.equipment[action.payload.weaponSlot];
                if (weapon && actingPlayerState.actionPoints >= weapon.cost && (actingPlayerState.weaponCooldowns[weapon.name] || 0) <= 0) {
                    actingPlayerState.actionPoints -= weapon.cost;
                    actingPlayerState.weaponCooldowns[weapon.name] = weapon.cooldown;
                    
                    const bonuses = getBonusStatsForPlayer(actingCharacter, actingPlayerState);
                    const stat = weapon.stat || 'strength';
                    const statValue = (actingCharacter[stat] || 0) + (bonuses[stat] || 0);
                    const roll = Math.floor(Math.random() * 20) + 1;
                    const total = roll + statValue;
                    
                    let logMessage = `${playerName} attacks with ${weapon.name}: ${roll}(d20) + ${statValue} = ${total}.`;
                    
                    if (roll === 1) {
                        logMessage += ` Critical Failure!`;
                        duel.log.push({ message: logMessage, type: 'damage' });
                    } else if (total >= (weapon.hit || 15)) {
                        opponentPlayerState.health -= weapon.weaponDamage;
                        logMessage += ` Hit for ${weapon.weaponDamage} damage!`;
                        duel.log.push({ message: logMessage, type: 'damage' });
                    } else {
                        logMessage += ` Miss!`;
                        duel.log.push({ message: logMessage, type: 'info' });
                    }
                    actionTaken = true;
                }
            }
        
            if (action.type === 'castSpell') {
                const { spellIndex, targetIndex } = action.payload;
                const spell = actingCharacter.equippedSpells[spellIndex];
                if (spell && actingPlayerState.actionPoints >= (spell.cost || 0) && (actingPlayerState.spellCooldowns[spell.name] || 0) <= 0) {
                    actingPlayerState.actionPoints -= (spell.cost || 0);
                    actingPlayerState.spellCooldowns[spell.name] = spell.cooldown;

                    const bonuses = getBonusStatsForPlayer(actingCharacter, actingPlayerState);
                    const statValue = (actingCharacter[spell.stat] || 0) + (bonuses[spell.stat] || 0);
                    const roll = Math.floor(Math.random() * 20) + 1;
                    const total = roll + statValue;

                    let logMessage = `${playerName} casts ${spell.name}: ${roll}(d20) + ${statValue} = ${total}.`;

                    if (roll === 1 || total < (spell.hit || 15)) {
                        logMessage += ` The spell fizzles!`;
                        duel.log.push({ message: logMessage, type: 'info' });
                    } else {
                        logMessage += ` Success!`;
                        duel.log.push({ message: logMessage, type: spell.type === 'heal' ? 'heal' : 'damage' });
                        
                        const target = (targetIndex === 'player') ? actingPlayerState : opponentPlayerState;

                        if (spell.type === 'heal') {
                            target.health = Math.min(target.maxHealth, target.health + spell.heal);
                            duel.log.push({ message: `${playerName} healed ${target.name} for ${spell.heal} HP.`, type: 'heal' });
                        } else if (spell.type === 'attack') {
                            target.health -= spell.damage;
                            duel.log.push({ message: `Dealt ${spell.damage} damage to ${target.name}.`, type: 'damage' });
                        } else if (spell.type === 'versatile') {
                            const effectValue = spell.baseEffect + statValue;
                            if (target === opponentPlayerState) {
                                target.health -= effectValue;
                                duel.log.push({ message: `Dealt ${effectValue} ${spell.damageType} damage to ${target.name}.`, type: 'damage' });
                            } else {
                                target.health = Math.min(target.maxHealth, target.health + effectValue);
                                duel.log.push({ message: `${playerName} healed ${target.name} for ${effectValue} HP.`, type: 'heal' });
                            }
                        }
                    }
                    actionTaken = true;
                }
            }

            if (action.type === 'useItemAbility') {
                const item = actingCharacter.equipment[action.payload.slot];
                const ability = item?.activatedAbility;
                if (ability && actingPlayerState.actionPoints >= ability.cost && (actingPlayerState.itemCooldowns[item.name] || 0) <= 0) {
                    actingPlayerState.actionPoints -= ability.cost;
                    actingPlayerState.itemCooldowns[item.name] = ability.cooldown;
                    if (ability.buff) {
                        const buff = ability.buff;
                        const existingIndex = actingPlayerState.buffs.findIndex(b => b.type === buff.type);
                        if(existingIndex !== -1) actingPlayerState.buffs.splice(existingIndex, 1);
                        actingPlayerState.buffs.push({ ...buff });
                        duel.log.push({ message: `${playerName} used ${ability.name} and gained ${buff.type}!`, type: 'heal' });
                    }
                    actionTaken = true;
                }
            }

            if (action.type === 'useConsumable') {
                const item = actingCharacter.inventory[action.payload.inventoryIndex];
                 if (item?.type === 'consumable' && actingPlayerState.actionPoints >= (item.cost || 0)) {
                    actingPlayerState.actionPoints -= (item.cost || 0);
                    if(item.heal) {
                        actingPlayerState.health = Math.min(actingPlayerState.maxHealth, actingPlayerState.health + item.heal);
                        duel.log.push({ message: `${playerName} used ${item.name}, healing for ${item.heal} HP.`, type: 'heal' });
                    }
                    item.quantity = (item.quantity || 1) - 1;
                    if(item.quantity <= 0) actingCharacter.inventory[action.payload.inventoryIndex] = null;
                    io.to(player.id).emit('characterUpdate', actingCharacter);
                    actionTaken = true;
                 }
            }
        
            if (actionTaken) {
                if (opponentPlayerState.health <= 0) {
                    endDuel(io, duel.id, actingPlayerState.name, opponentPlayerState.name);
                    return; 
                }
                if (actingPlayerState.actionPoints <= 0) {
                    action.type = 'endTurn';
                }
            }
        
            if (action.type === 'endTurn') {
                if (!actionTaken) duel.log.push({ message: `${playerName} ends their turn.`, type: 'info' });
                
                Object.keys(actingPlayerState.weaponCooldowns).forEach(k => { if(actingPlayerState.weaponCooldowns[k] > 0) actingPlayerState.weaponCooldowns[k]--; });
                Object.keys(actingPlayerState.spellCooldowns).forEach(k => { if(actingPlayerState.spellCooldowns[k] > 0) actingPlayerState.spellCooldowns[k]--; });
                Object.keys(actingPlayerState.itemCooldowns).forEach(k => { if(actingPlayerState.itemCooldowns[k] > 0) actingPlayerState.itemCooldowns[k]--; });
                
                duel.activePlayerId = opponentPlayerState.id;
                opponentPlayerState.actionPoints = 3;

                duel.log.push({ message: `It is now ${opponentPlayerState.name}'s turn.`, type: 'info' });
            }
            
            broadcastDuelUpdate(io, duel.id);
        } catch (error) {
            console.error(`!!! DUEL ERROR !!! A server crash was prevented. Details:`);
            console.error(error);
            socket.emit('partyError', 'A server error occurred during the duel. The action may not have completed.');
        }
    });
};