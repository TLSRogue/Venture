'use strict';

import { gameData } from './game-data.js';
import { gameState } from './state.js';
import * as UI from './ui.js';
import * as Player from './player.js';
import * as Interactions from './interactions.js';
import * as Network from './network.js';

let reactionResolver = null;

// --- TURN MANAGEMENT LOGIC ---

export async function endTurn() {
    if (gameState.inDuel) {
        Network.emitDuelAction({ type: 'endTurn' });
        return;
    }
    if (gameState.partyId) {
        // In co-op mode, tell the server you are ending your turn.
        Network.emitPartyAction({ type: 'endTurn' });
        document.getElementById('end-turn-btn').disabled = true; // Disable locally until server update
        UI.addToLog("You have ended your turn.", "info");
        return;
    }
    
    // --- SOLO PLAY LOGIC ---
    if (!gameState.turnState.isPlayerTurn || gameState.turnState.isProcessing) return;
    gameState.turnState.isPlayerTurn = false;
    Interactions.clearSelection();
    document.getElementById('end-turn-btn').disabled = true;
    
    if(gameState.playerDebuffs && gameState.playerDebuffs.length > 0) {
        UI.addToLog("--- End of Turn Effects ---", "info");
        for (const debuff of gameState.playerDebuffs) {
            if(debuff.damage) {
                let damageToDeal = debuff.damage;
                const bonuses = Player.getBonusStats();
                if (debuff.type === 'poison' || debuff.damageType === 'Physical') {
                    const totalResistance = (gameState.physicalResistance || 0) + (bonuses.physicalResistance || 0);
                    const resistedAmount = Math.min(damageToDeal - 1, totalResistance);
                    if (resistedAmount > 0) {
                        damageToDeal -= resistedAmount;
                        UI.addToLog(`You resist ${resistedAmount} damage from ${debuff.type}.`, 'resist');
                    }
                }
                if (gameState.shield > 0 && damageToDeal > 0) {
                   const blockedByShield = Math.min(gameState.shield, damageToDeal);
                   gameState.shield -= blockedByShield;
                   damageToDeal -= blockedByShield;
                   UI.addToLog(`Your Magic Barrier absorbs ${blockedByShield} damage from ${debuff.type}.`, 'reaction');
                }
                if (damageToDeal > 0) {
                    gameState.health -= damageToDeal;
                    UI.addToLog(`You take ${damageToDeal} damage from ${debuff.type}.`, 'damage');
                }
            }
            debuff.duration--;
        }
        const expiredDebuffs = gameState.playerDebuffs.filter(debuff => debuff.duration <= 0);
        if (expiredDebuffs.length > 0) {
            UI.addToLog(`Debuffs worn off: ${expiredDebuffs.map(d => d.type).join(', ')}.`, 'info');
        }
        gameState.playerDebuffs = gameState.playerDebuffs.filter(debuff => debuff.duration > 0);
        UI.updateDisplay();
    }

    if (gameState.health <= 0) {
        Player.handleDefeat();
        return; 
    }

    await runEnemyPhase();

    if (gameState.health > 0) {
        startPlayerTurn();
    }
}

export async function runEnemyPhase() {
    gameState.turnState.isProcessing = true;
    UI.addToLog("--- Zone's Turn ---", 'info');
    try {
        Object.keys(gameState.spellCooldowns).forEach(spell => {
            if (gameState.spellCooldowns[spell] > 0) gameState.spellCooldowns[spell]--;
        });
        Object.keys(gameState.weaponCooldowns).forEach(weapon => {
            if (gameState.weaponCooldowns[weapon] > 0) gameState.weaponCooldowns[weapon]--;
        });
        Object.keys(gameState.itemCooldowns).forEach(item => {
            if (gameState.itemCooldowns[item] > 0) gameState.itemCooldowns[item]--;
        });

        for (let i = 0; i < gameState.zoneCards.length; i++) {
            if (gameState.health <= 0) break;
            const enemy = gameState.zoneCards[i];
            if (enemy && enemy.type === 'enemy' && enemy.health > 0) {
                await processEnemyAction(enemy, i);
            }
        }
    } catch (error) {
        console.error("Error during enemy phase:", error);
    } finally {
        gameState.turnState.isProcessing = false;
    }
}

export function startPlayerTurn() {
    gameState.buffs.forEach(buff => {
        buff.duration--;
        if (buff.type === 'Magic Barrier' && buff.duration <= 0) {
            gameState.shield = 0;
        }
    });
    const expiredBuffs = gameState.buffs.filter(buff => buff.duration <= 0);
    if (expiredBuffs.length > 0) {
        UI.addToLog(`Buffs worn off: ${expiredBuffs.map(b => b.type).join(', ')}.`, 'info');
    }
    gameState.buffs = gameState.buffs.filter(buff => buff.duration > 0);

    gameState.actionPoints = 3;
    gameState.turnState.isPlayerTurn = true;
    document.getElementById('end-turn-btn').disabled = false;
    UI.addToLog("--- Your Turn ---", 'info');
    UI.updateDisplay();
    UI.renderPlayerActionBars();
}

export function checkEndOfPlayerTurn() {
    if (gameState.partyId || gameState.inDuel) {
        // In co-op/duels, the server determines when the turn ends.
        return;
    }
    if (gameState.actionPoints <= 0 && gameState.zoneCards.some(c => c && c.type === 'enemy')) {
        endTurn();
    }
}

// --- COMBAT ACTIONS ---

export function castSpell(spellIndex, targetIndex) {
    // This function now only emits the action to the server.
    // The server will handle all logic and broadcast the new state.
    // This will require you to ensure solo play also runs through the server,
    // for example by treating the solo player as a "party of one."

    if (gameState.inDuel) {
        Network.emitDuelAction({
            type: 'castSpell',
            payload: { spellIndex, targetIndex }
        });
    } else if (gameState.partyId) {
        Network.emitPartyAction({
            type: 'castSpell',
            payload: { spellIndex, targetIndex }
        });
    } else {
        // For solo play to work, it MUST also communicate with the server.
        // We will unify it with the party system. This requires changes
        // to how a solo adventure is started (see game.js recommendations).
        // For now, assuming solo play will use the party system:
        Network.emitPartyAction({
             type: 'castSpell',
             payload: { spellIndex, targetIndex }
        });
    }

    Interactions.clearSelection();
}


export function weaponAttack(targetIndex) {
    const selectedAction = gameState.turnState.selectedAction;
    if (!selectedAction || selectedAction.type !== 'weapon') {
        return;
    }

    if (gameState.inDuel) {
        Network.emitDuelAction({
            type: 'weaponAttack',
            payload: { weaponSlot: selectedAction.slot, targetIndex }
        });
        Interactions.clearSelection();
        return;
    }
    if (gameState.partyId) {
        Network.emitPartyAction({
            type: 'weaponAttack',
            payload: { weaponSlot: selectedAction.slot, targetIndex }
        });
        Interactions.clearSelection();
        return;
    }

    // --- SOLO PLAY LOGIC ---
    const weapon = gameState.equipment[selectedAction.slot];
    if (!weapon) {
        return;
    }

    const target = gameState.zoneCards[targetIndex];
    const bonuses = Player.getBonusStats();
    const stat = weapon.stat || 'strength';
    const statValue = gameState[stat] + bonuses[stat];

    gameState.actionPoints -= weapon.cost;
    gameState.weaponCooldowns[weapon.name] = weapon.cooldown;

    const dazeDebuff = gameState.playerDebuffs.find(d => d.type === 'daze');
    const dazeModifier = dazeDebuff ? -3 : 0;
    const focusBuff = gameState.buffs.find(b => b.type === 'Focus');
    const focusModifier = focusBuff ? focusBuff.bonus.rollBonus : 0;

    let ammoBonus = 0;
    let ammoBonusText = '';
    if (weapon.weaponType.includes('Bow')) {
        const ammo = gameState.equipment.ammo;
        if (ammo && ammo.quantity > 0) {
            ammoBonus = ammo.bonus.rollBonus || 0;
            ammoBonusText = ` + ${ammoBonus}(ammo)`;
        } else {
            UI.addToLog("You have no arrows equipped!", "damage");
        }
    }

    const roll = Math.floor(Math.random() * 20) + 1;
    const total = roll + statValue + dazeModifier + focusModifier + ammoBonus;
    const hitTarget = weapon.hit || 15;

    let description = `Attacking with ${weapon.name}: ${roll}(d20) + ${statValue}(${stat.slice(0,3)})${ammoBonusText} ${dazeModifier !== 0 ? dazeModifier : ''} ${focusModifier > 0 ? `+${focusModifier}` : ''} = ${total}. (Target: ${hitTarget}+)`;

    if (roll === 1) {
        description += ` Critical Failure! You miss!`;
        UI.addToLog(description, 'damage');
    } else if (total >= hitTarget) {
        target.health -= weapon.weaponDamage;
        description += ` Hit! Dealt ${weapon.weaponDamage} ${weapon.damageType} damage to ${target.name}.`;
        if (roll === 20 && weapon.onCrit) {
            if (weapon.onCrit.debuff) {
                target.debuffs.push({ ...weapon.onCrit.debuff });
                description += ` CRITICAL HIT! ${target.name} is now ${weapon.onCrit.debuff.type}!`;
            }
        }
        if (weapon.onHit && weapon.onHit.debuff) {
            target.debuffs.push({ ...weapon.onHit.debuff });
            description += ` ${target.name} is now ${weapon.onHit.debuff.type}!`;
        }
        UI.addToLog(description, 'damage');
         if (target.health <= 0) {
            defeatEnemy(targetIndex);
        }
    } else {
         description += ` Miss!`;
         UI.addToLog(description, 'info');
    }

    if (weapon.weaponType.includes('Bow')) {
        const ammo = gameState.equipment.ammo;
        if (ammo && ammo.quantity > 0) {
            ammo.quantity--;
            if (ammo.quantity <= 0) {
                UI.addToLog(`You've used your last ${ammo.name}!`, 'info');
                gameState.equipment.ammo = null;
            }
        }
    }
    
    Interactions.clearSelection();
    UI.updateDisplay();
    UI.renderPlayerActionBars();
    UI.renderAdventureScreen();
    checkEndOfPlayerTurn();
}

export function useItemAbility(slot) {
    const item = gameState.equipment[slot];
    if (!item || !item.activatedAbility) return;

    if (gameState.inDuel) {
        Network.emitDuelAction({ type: 'useItemAbility', payload: { slot } });
        return;
    }
    if (gameState.partyId) {
        Network.emitPartyAction({ type: 'useItemAbility', payload: { slot } });
        return;
    }

    const ability = item.activatedAbility;
    if (gameState.actionPoints < ability.cost) {
        UI.showInfoModal("Not enough action points!");
        return;
    }
    if ((gameState.itemCooldowns[item.name] || 0) > 0) {
        UI.showInfoModal(`${item.name} is on cooldown!`);
        return;
    }

    gameState.actionPoints -= ability.cost;
    gameState.itemCooldowns[item.name] = ability.cooldown;

    if (ability.buff) {
        gameState.buffs.push({ ...ability.buff });
        UI.addToLog(`You used ${ability.name} and gained the ${ability.buff.type} buff!`, 'heal');
    }
    if (ability.effect === 'cleanse') {
        const bleedIndex = gameState.playerDebuffs.findIndex(d => d.type === 'bleed');
        const poisonIndex = gameState.playerDebuffs.findIndex(d => d.type === 'poison');

        if (poisonIndex !== -1) {
            const removed = gameState.playerDebuffs.splice(poisonIndex, 1);
            UI.addToLog(`You cleansed ${removed[0].type}!`, 'heal');
        } else if (bleedIndex !== -1) {
            const removed = gameState.playerDebuffs.splice(bleedIndex, 1);
            UI.addToLog(`You cleansed ${removed[0].type}!`, 'heal');
        } else {
            UI.addToLog(`You used ${ability.name}, but there was nothing to cleanse.`, 'info');
        }
    }

    UI.updateDisplay();
    UI.renderPlayerActionBars();
    checkEndOfPlayerTurn();
}

export async function processEnemyAction(enemy, enemyIndex, forcedAttack = null) {
    if (!enemy.debuffs) {
        enemy.debuffs = [];
    }
    const burnDebuff = enemy.debuffs.find(d => d.type === 'burn');
    if (burnDebuff) {
        enemy.health -= burnDebuff.damage;
        UI.addToLog(`${enemy.name} takes ${burnDebuff.damage} damage from Burn.`, 'damage');
        burnDebuff.duration--;
    }
    const bleedDebuff = enemy.debuffs.find(d => d.type === 'bleed');
    if (bleedDebuff) {
        enemy.health -= bleedDebuff.damage;
        UI.addToLog(`${enemy.name} takes ${bleedDebuff.damage} damage from Bleed.`, 'damage');
        bleedDebuff.duration--;
    }
    enemy.debuffs = enemy.debuffs.filter(d => d.duration > 0);

    if (enemy.health <= 0) {
        if (enemyIndex !== -1) defeatEnemy(enemyIndex);
        return;
    }

    if (enemy.debuffs.some(d => d.type === 'stun')) {
        UI.addToLog(`${enemy.name} is stunned and cannot act!`, 'reaction');
        enemy.debuffs = enemy.debuffs.filter(d => d.type !== 'stun');
        UI.renderAdventureScreen();
        return;
    }

    if (gameState.buffs.some(b => b.type === 'Stealth')) {
        const spotRoll = Math.floor(Math.random() * 20) + 1;
        if (spotRoll < 16) {
            UI.addToLog(`${enemy.name} fails to spot you and misses its turn!`, 'reaction');
            return;
        } else {
            UI.addToLog(`${enemy.name} spots you through your stealth!`, 'damage');
        }
    }
    
    const cardEl = document.querySelectorAll('#zone-cards .card')[enemyIndex];
    if (cardEl) {
        cardEl.classList.add('attacking');
    }

    await new Promise(resolve => setTimeout(resolve, 800));

    const roll = Math.floor(Math.random() * 20) + 1;
    
    if (enemy.attackTable) {
        const attack = forcedAttack || enemy.attackTable.find(a => roll >= a.range[0] && roll <= a.range[1]);
        if (attack && attack.action === 'special') {
            if (enemy.name === 'Mugger') {
                await Interactions.handleMuggerInteraction(enemyIndex, true); 
            } else if (enemy.name === 'The Rat King') {
                UI.addToLog(attack.message, 'info');
                const emptySlotIndex = gameState.zoneCards.findIndex(c => c === null);
                if (emptySlotIndex !== -1) {
                    const ratCard = gameData.cardPools.sewers.find(p => p.card.name === 'Large Rat').card;
                    const newRat = {...ratCard, id: Date.now(), health: ratCard.maxHealth, debuffs: []};
                    gameState.zoneCards[emptySlotIndex] = newRat;
                    UI.addToLog('A Large Rat appears!', 'damage');
                    UI.renderAdventureScreen();
                } else {
                    UI.addToLog('There is no room for more rats!', 'info');
                }
            } else if (enemy.name === 'Pulvis Cadus') {
                if (attack.message.includes('A Quick Fix')) {
                    enemy.health = Math.min(enemy.maxHealth, enemy.health + 3);
                    if (!enemy.buffs) enemy.buffs = [];
                    enemy.buffs.push({ type: 'empowered', duration: 2, bonus: 5 });
                    UI.addToLog("Pulvis Cadus heals and looks empowered!", 'heal');
                } else if (attack.message.includes('unstable kegs')) {
                    let spawned = 0;
                    for(let i = 0; i < 2 && spawned < 2; i++) {
                        const emptySlotIndex = gameState.zoneCards.findIndex(c => c === null);
                        if (emptySlotIndex !== -1) {
                            const newKeg = {...gameData.specialCards.powderKeg, id: Date.now() + i, health: 2, debuffs: [], charges: 0};
                            gameState.zoneCards[emptySlotIndex] = newKeg;
                            spawned++;
                        }
                    }
                    if (spawned > 0) {
                        UI.addToLog(`Pulvis Cadus spawns ${spawned} Powder Keg(s)!`, 'damage');
                        UI.renderAdventureScreen();
                    } else {
                        UI.addToLog("Pulvis Cadus tries to spawn kegs, but there's no room!", 'info');
                    }
                }
            } else if (enemy.name === 'Powder Keg') {
                enemy.charges = (enemy.charges || 0) + 1;
                UI.addToLog(`The Powder Keg fizzes... (${enemy.charges}/3)`, 'info');
                if (enemy.charges >= 3) {
                    UI.addToLog('The Powder Keg explodes!', 'damage');
                    gameState.health -= 4; 
                    gameState.zoneCards[enemyIndex] = null;
                }
            } else if (enemy.name === 'Raging Bull' && attack.message.includes('Tough Hide')) {
                UI.addToLog(attack.message, 'reaction');
                if (!enemy.buffs) enemy.buffs = [];
                enemy.buffs.push({ type: 'Physical Resistance', value: 2, duration: 2 }); 
                UI.renderAdventureScreen();
                await new Promise(resolve => setTimeout(resolve, 800));
                const secondRoll = Math.floor(Math.random() * 18) + 1;
                const secondAttack = enemy.attackTable.find(a => secondRoll >= a.range[0] && secondRoll <= a.range[1]);
                await processEnemyAction(enemy, enemyIndex, secondAttack);
                if (cardEl) {
                    cardEl.classList.remove('attacking');
                }
                return;
            } else if (enemy.name === 'Loot Goblin') {
                UI.addToLog(attack.message, 'reaction');
                if (attack.message.includes('Pickpocket')) {
                    const stolen = Math.floor(Math.random() * 10) + 1;
                    if (gameState.gold >= stolen) {
                        gameState.gold -= stolen;
                        enemy.stolenGold = (enemy.stolenGold || 0) + stolen;
                        UI.addToLog(`The Loot Goblin stole ${stolen} gold!`, 'damage');
                        UI.updateDisplay();
                    }
                } else if (attack.message.includes('escapes')) {
                    UI.addToLog('The Loot Goblin escaped with your gold!', 'damage');
                    gameState.zoneCards[enemyIndex] = null;
                }
            }
        }
        
        if (attack && attack.action === 'attack') {
            const reactionResult = await awaitPlayerReaction(attack.damage, enemy.name);
            if (gameState.health <= 0) return;

            let damageToDeal = reactionResult.finalDamage;
            
            if (damageToDeal > 0) {
                const bonuses = Player.getBonusStats();
                const totalResistance = (gameState.physicalResistance || 0) + (bonuses.physicalResistance || 0);
                if (attack.damageType === 'Physical' && totalResistance > 0) {
                    const resistedAmount = Math.min(damageToDeal - 1, totalResistance); 
                    if (resistedAmount > 0) {
                        damageToDeal -= resistedAmount;
                        UI.addToLog(`You resist ${resistedAmount} physical damage!`, 'resist');
                    }
                }
            }

            if (gameState.shield > 0 && damageToDeal > 0) {
                const blockedByShield = Math.min(gameState.shield, damageToDeal);
                gameState.shield -= blockedByShield;
                damageToDeal -= blockedByShield;
                UI.addToLog(`Your Magic Barrier absorbs ${blockedByShield} damage!`, 'reaction');
            }
            gameState.health -= damageToDeal;
            
            let attackMessage = `${enemy.name} rolls a ${roll}: ${attack.message}`;
            if (attack.debuff && !reactionResult.dodged) {
                gameState.playerDebuffs.push({ ...attack.debuff });
                attackMessage += ` You are now ${attack.debuff.type}!`;
            }
            UI.addToLog(attackMessage, reactionResult.finalDamage > 0 ? 'damage' : 'reaction');
            UI.updateDisplay();
        } else if (attack && attack.action === 'miss') {
            UI.addToLog(`${enemy.name} rolls a ${roll}: Miss!`, 'info');
        }
    } else { 
        if (roll >= 10) { 
            const reactionResult = await awaitPlayerReaction(enemy.damage, enemy.name);
            if (gameState.health <= 0) return;
            gameState.health -= reactionResult.finalDamage;
            UI.addToLog(`${enemy.name} attacks for ${reactionResult.finalDamage} damage!`, reactionResult.finalDamage > 0 ? 'damage' : 'reaction');
            UI.updateDisplay();
        } else {
            UI.addToLog(`${enemy.name} misses its attack.`, 'info');
        }
    }
    
    if (cardEl) {
        cardEl.classList.remove('attacking');
    }

    if (enemy.health <= 0) {
        if (enemyIndex !== -1) defeatEnemy(enemyIndex);
    } else {
        UI.renderAdventureScreen();
    }

    if (gameState.health <= 0) {
        Player.handleDefeat();
    }
}

export function awaitPlayerReaction(damage, attacker) {
    return new Promise(resolve => {
        if (gameState.health <= 0) {
            resolve({ finalDamage: damage, description: `You take ${damage} damage while incapacitated.` });
            return;
        }

        reactionResolver = resolve;
        gameState.turnState.pendingReaction = { damage, attacker };
        const availableReactions = [];
        const dodgeSpell = gameState.equippedSpells.find(s => s.name === "Dodge");
        if (dodgeSpell && (gameState.spellCooldowns[dodgeSpell.name] || 0) <= 0) {
            availableReactions.push({ name: 'Dodge', type: 'spell', spell: dodgeSpell });
        }
        const shield = gameState.equipment.offHand;
        if (shield && shield.reaction && (gameState.weaponCooldowns[shield.name] || 0) <= 0) {
            availableReactions.push({ name: 'Shield Block', type: 'equipment', item: shield });
        }

        if (availableReactions.length > 0) {
            let buttons = '';
            availableReactions.forEach(reaction => {
                buttons += `<button class="btn btn-primary" data-reaction="${reaction.name}">Use ${reaction.name}</button>`;
            });
            const modalContent = `
                <h2>Reaction!</h2>
                <p>${attacker} is about to deal ${damage} damage to you!</p>
                <div class="action-buttons" id="reaction-buttons">
                    ${buttons}
                    <button class="btn btn-danger" data-reaction="take_damage">Take Damage</button>
                </div>
            `;
            UI.showModal(modalContent);
        } else {
            resolve({ finalDamage: damage, description: `${attacker} attacks for ${damage} damage!` });
        }
    });
}

export function resolveReaction(reactionType) {
    if (!reactionResolver) return;

    const { damage } = gameState.turnState.pendingReaction;
    const bonuses = Player.getBonusStats();
    let result = { finalDamage: damage, description: `You take ${damage} damage.` };
    let roll = 0;
    let total = 0;

    if (reactionType === 'Dodge') {
        const dodgeSpell = gameState.equippedSpells.find(s => s.name === "Dodge");
        const playerAgility = gameState.agility + bonuses.agility;
        roll = Math.floor(Math.random() * 20) + 1;
        total = roll + playerAgility;
        
        if (roll === 1) {
            result.description = `Dodge (1): Critical Failure! You take ${damage} damage.`;
        } else if (total >= dodgeSpell.hit) {
            result.finalDamage = 0;
            result.description = `Dodge (${total}): Success! You avoid all damage.`;
            result.dodged = true;
        } else {
            result.description = `Dodge (${total}): Failure! You take ${damage} damage.`;
        }
        gameState.spellCooldowns[dodgeSpell.name] = dodgeSpell.cooldown;
    } else if (reactionType === 'Shield Block') {
        const shield = gameState.equipment.offHand;
        const playerDefense = gameState.defense + bonuses.defense;
        roll = Math.floor(Math.random() * 20) + 1;
        total = roll + playerDefense;
        
        if (roll === 1) {
            result.description = `Shield Block (1): Critical Failure! You take ${damage} damage.`;
        } else if (total >= shield.reaction.hit) {
            const blockedDamage = Math.min(damage, shield.reaction.value);
            result.finalDamage = damage - blockedDamage;
            result.description = `Shield Block (${total}): Success! You block ${blockedDamage} damage, taking ${result.finalDamage}.`;
        } else {
            result.description = `Shield Block (${total}): Failure! You take ${damage} damage.`;
        }
        gameState.weaponCooldowns[shield.name] = shield.cooldown;
    }
    
    UI.hideModal();
    reactionResolver(result);
    reactionResolver = null;
    gameState.turnState.pendingReaction = null;
    UI.renderSpells();
    UI.updateDisplay();
}

export function defeatEnemy(index) {
    const enemy = gameState.zoneCards[index];
    UI.addToLog(`${enemy.name} has been defeated!`, 'success');

    if (enemy.name === "Loot Goblin") {
        const totalGold = (enemy.stolenGold || 0) + 20;
        gameState.gold += totalGold;
        UI.addToLog(`The Loot Goblin drops ${totalGold} gold!`, 'success');

        const zoneLootPool = gameData.allItems.filter(item => {
            return gameData.cardPools.farmlands.some(card => card.card.lootTable && card.card.lootTable.some(loot => loot.items.includes(item.name))) ||
                   gameData.cardPools.goblinCaves.some(card => card.card.loot && card.card.loot.name === item.name);
        });

        for (let i = 0; i < 2; i++) {
            if (zoneLootPool.length > 0) {
                const randomItem = {...zoneLootPool[Math.floor(Math.random() * zoneLootPool.length)]};
                if (Player.addItemToInventory(randomItem)) {
                    UI.addToLog(`The Loot Goblin also dropped: ${randomItem.name}!`, 'success');
                }
            }
        }
    } else {
        const allCardPools = Object.values(gameData.cardPools).flat();
        const cardDef = allCardPools.find(p => p.card.name === enemy.name);
        if (cardDef && cardDef.count === 1) {
            gameState.cardDefeatTimes[enemy.name] = Date.now();
        }

        if (enemy.arenaReward) {
            gameState.gold += enemy.arenaReward;
            UI.addToLog(`You are awarded ${enemy.arenaReward} gold for your victory in the Arena!`, 'success');
        }

        gameState.quests.forEach(quest => {
            if (quest.status === 'active' && (quest.details.target === enemy.name || (quest.details.target === 'Goblin' && enemy.name.includes('Goblin')))) {
                quest.progress++;
                if (quest.progress >= quest.details.required) {
                    quest.status = 'readyToTurnIn';
                    UI.addToLog(`Quest Objective Complete: ${quest.details.title}`, 'success');
                }
            }
        });
        
        if (enemy.guaranteedLoot) {
            if (enemy.guaranteedLoot.gold) {
                const goldAmount = (Math.floor(Math.random() * 20) + 1) + (Math.floor(Math.random() * 20) + 1);
                gameState.gold += goldAmount;
                UI.addToLog(`You found: ${goldAmount} gold`, 'success');
            }
            if (enemy.guaranteedLoot.items) {
                enemy.guaranteedLoot.items.forEach(itemName => {
                     const itemData = gameData.allItems.find(i => i.name === itemName);
                     if (itemData) {
                        Player.addItemToInventory(itemData);
                        UI.addToLog(`You found: ${itemName}`, 'success');
                     }
                });
            }
        }

        if (enemy.randomLoot) {
            const { tier, count, type } = enemy.randomLoot;
            const lootPool = gameData.allItems.filter(item => 
                item.tier === tier && 
                type.includes(item.type)
            );

            for (let i = 0; i < count; i++) {
                if (lootPool.length > 0) {
                    const randomItem = {...lootPool[Math.floor(Math.random() * lootPool.length)]};
                    if (Player.addItemToInventory(randomItem)) {
                        UI.addToLog(`You found a random piece of equipment: ${randomItem.name}!`, 'success');
                    }
                }
            }
        }

        if (enemy.lootTable) {
            const bonuses = Player.getBonusStats();
            const lootRoll = Math.floor(Math.random() * 20) + 1 + (gameState.luck || 0) + (bonuses.luck || 0);
            const lootTier = enemy.lootTable.find(tier => lootRoll >= tier.range[0] && lootRoll <= tier.range[1]);
            if (lootTier) {
                if (lootTier.recipe) {
                    const recipeName = lootTier.recipe;
                    if (!gameState.knownRecipes.includes(recipeName)) {
                        gameState.knownRecipes.push(recipeName);
                        UI.addToLog(`You learned the recipe for ${recipeName}!`, 'success');
                    }
                }
                if (lootTier.gold) {
                    const goldAmount = Math.floor(Math.random() * 20) + 1;
                    gameState.gold += goldAmount;
                    UI.addToLog(`You also found: ${goldAmount} gold`, 'success');
                }
                if (lootTier.items) {
                    let foundItems = '';
                    lootTier.items.forEach(itemName => {
                        const itemData = gameData.allItems.find(i => i.name === itemName);
                        if (itemData) {
                            if(Player.addItemToInventory(itemData)) {
                                foundItems += `${itemName}, `;
                            }
                        }
                    });
                    if (foundItems) {
                        UI.addToLog(`You also found: ${foundItems.slice(0, -2)}`, 'success');
                    }
                }
            }
        } else if (enemy.loot) { 
            let droppedItem = null;
            if(Array.isArray(enemy.loot)) {
                droppedItem = enemy.loot[Math.floor(Math.random() * enemy.loot.length)];
            } else {
                droppedItem = enemy.loot;
            }

            if (droppedItem.goldDrop) {
                gameState.gold += droppedItem.goldDrop;
                UI.addToLog(`You found: ${droppedItem.goldDrop} gold`, 'success');
            } else if(Player.addItemToInventory(droppedItem)) {
                UI.addToLog(`You found: ${droppedItem.name}`, 'info');
            }
        }
    }
    
    gameState.zoneCards[index] = null;

    if (!gameState.zoneCards.some(c => c && c.type === 'enemy')) {
        UI.addToLog("Combat has ended! Action Points restored.", "success");
        gameState.actionPoints = 3;
    }

    UI.renderAdventureScreen();
    UI.renderInventory();
    UI.updateDisplay();
    UI.renderPlayerActionBars();
}