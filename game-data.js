'use strict';

// This file contains all the static data for the game.
// By exporting the gameData object, we can import it into any other
// JavaScript module that needs access to item, spell, or card data.

export const gameData = {
    allItems: [
        // Consumables
        { name: "Healing Potion", price: 25, type: "consumable", cost: 1, heal: 3, description: "Heals 3 HP for 1 Action Point", icon: "🧪" },
        { name: "Cooked Fish", price: 30, type: "consumable", cost: 1, heal: 3, buff: { type: 'Well Fed (Agi)', duration: 2, bonus: { agility: 1 } }, description: "Heals 3 HP, +1 Agility for 1 turn (ends after your next turn).", icon: "🐟" },
        { name: "Cooked Pork", price: 35, type: "consumable", cost: 1, heal: 3, buff: { type: 'Well Fed (Str)', duration: 2, bonus: { strength: 1 } }, description: "Heals 3 HP, +1 Strength for 1 turn (ends after your next turn).", icon: "🍖" },
        { name: "Birthday Cake", price: 100, type: "consumable", cost: 1, heal: 2, charges: 3, description: "A delicious cake. Heals 2 HP. Has 3 charges.", icon: "🎂" },
        { name: "Wooden Torch", price: 15, type: "consumable", cost: 0, buff: { type: 'Light Source', duration: 4 }, description: "Provides light for 3 turns. Costs no AP to use outside combat.", icon: "🔥" },
        { name: "Powder Keg", price: 75, type: "consumable", cost: 1, description: "Deals 3 Fire damage to all enemies. They can avoid on a 12+ roll.", icon: "💣" },
        
        // Arrows
        { name: "Iron Arrows", type: "arrows", price: 2, stackable: 200, bonus: { rollBonus: 1 }, description: "A bundle of simple iron-tipped arrows. Provides +1 to bow attack rolls.", tier: 1, icon: "🏹" },

        // Tools
        { name: "Mining Pickaxe (T1)", price: 50, type: "tool", slot: "mainHand", skillBonus: { mining: 1 }, description: "Allows mining iron nodes. +1 Mining.", tier: 1, icon: "⛏️" },
        { name: "Woodcutting Axe (T1)", price: 50, type: "tool", slot: "mainHand", skillBonus: { woodcutting: 1 }, description: "Allows chopping trees. +1 Woodcutting.", tier: 1, icon: "🪓" },
        { name: "Fishing Rod (T1)", price: 50, type: "tool", slot: "mainHand", skillBonus: { fishing: 1 }, description: "Allows fishing in rivers. +1 Fishing.", tier: 1, icon: "🎣" },
        { name: "Harvesting Sickle (T1)", price: 50, type: "tool", slot: "mainHand", skillBonus: { harvesting: 1 }, description: "Allows harvesting crops. +1 Harvesting.", tier: 1, icon: "🌾" },
        
        // Weapons
        { name: "Wooden Training Sword", type: "weapon", slot: "mainHand", cost: 1, cooldown: 1, hit: 15, weaponType: "One-Hand Sword", weaponDamage: 1, damageType: "Physical", description: "1AP, 1CD | D20+Str (15+) | Deals 1 Physical Damage.", tier: 1, icon: "⚔️" },
        { name: "Iron Dagger", price: 90, type: "weapon", slot: ["mainHand", "offHand"], cost: 1, cooldown: 0, hit: 15, stat: "agility", weaponType: "Dagger", weaponDamage: 1, damageType: "Physical", description: "1AP, 0CD | D20+Agi (15+) | Deals 1 Physical Damage.", tier: 1, icon: "🗡️" },
        { name: "Mugger's Knife", price: 150, type: "weapon", slot: ["mainHand", "offHand"], cost: 1, cooldown: 1, hit: 15, stat: "agility", weaponType: "Dagger", weaponDamage: 2, damageType: "Physical", description: "1AP, 1CD | D20+Agi (15+) | Deals 2 Physical Damage and applies Bleed.", onHit: { debuff: { type: 'bleed', duration: 2, damage: 1, damageType: 'Physical' } }, tier: 1, icon: "🔪" },
        { name: "Iron Sword", price: 100, type: "weapon", slot: "mainHand", cost: 1, cooldown: 1, hit: 15, weaponType: "One-Hand Sword", weaponDamage: 2, damageType: "Physical", description: "1AP, 1CD | D20+Str (15+) | Deals 2 Physical Damage.", tier: 1, icon: "⚔️" },
        { name: "Pitchfork", price: 50, type: "weapon", slot: "mainHand", hands: 2, cost: 1, cooldown: 2, stat: "agility", hit: 15, weaponType: "Two-Hand Polearm", weaponDamage: 3, damageType: "Physical", description: "1AP, 2CD | D20+Agi (15+) | Deals 3 Physical Damage. On 20+, also applies Bleed.", onCrit: { debuff: { type: 'bleed', duration: 3, damage: 1, damageType: 'Physical' } }, tier: 1, icon: "🔱" },
        { name: "Longbow", price: 0, type: "weapon", slot: "mainHand", hands: 2, cost: 1, cooldown: 2, stat: "agility", hit: 15, weaponType: "Two-Hand Bow", weaponDamage: 3, damageType: "Physical", description: "1AP, 2CD | D20+Agi (15+) | Deals 3 Physical Damage. Ranged.", tier: 1, icon: "🏹" },
        { name: "Staff", price: 50, type: "weapon", slot: "mainHand", hands: 2, cost: 1, cooldown: 2, stat: "wisdom", hit: 15, weaponType: "Two-Hand Staff", weaponDamage: 3, damageType: "Arcane", description: "1AP, 2CD | D20+Wis (15+) | Deals 3 Arcane Damage. Ranged.", tier: 1, icon: "🪄" },
        { name: "Magna Clavis", price: 500, type: "weapon", slot: "mainHand", hands: 2, cost: 1, cooldown: 3, weaponDamage: 5, damageType: "Physical", bonus: { strength: 1, wisdom: 1 }, description: "1AP, 3CD | D20+Str (15+) | Deals 5 Physical Damage. +1 Str, +1 Wis.", weaponType: "Two-Hand Mace", tier: 1, icon: "🔨" },
        { name: "Iron Spear", price: 120, type: "weapon", slot: "mainHand", hands: 2, cost: 1, cooldown: 2, stat: "agility", hit: 15, weaponType: "Two-Hand Spear", weaponDamage: 3, damageType: "Physical", description: "1AP, 2CD | D20+Agi (15+) | Deals 3 Physical Damage. On 20+, applies Bleed.", tier: 1, onCrit: { debuff: { type: 'bleed', duration: 3, damage: 1, damageType: 'Physical' } }, icon: "🔱" },
        { name: "Iron Mace", price: 120, type: "weapon", slot: "mainHand", hands: 2, cost: 1, cooldown: 2, stat: "strength", hit: 15, weaponType: "Two-Hand Mace", weaponDamage: 3, damageType: "Physical", description: "1AP, 2CD | D20+Str (15+) | Deals 3 Physical Damage. On 20+, applies Dazed.", tier: 1, onCrit: { debuff: { type: 'daze', duration: 2 } }, icon: "🔨" },
        
        // Armor & Accessories
        { name: "Bull Horn", price: 0, type: "accessory", slot: "accessory", description: "When equipped, provides an activatable ability.", activatedAbility: { name: "Bull Horn", cost: 1, cooldown: 3, buff: { type: 'War Cry', duration: 3, bonus: { strength: 1, agility: 1, wisdom: 1, defense: 1 } }, description: "1AP 3CD: Gain +1 to all stats for 2 turns." }, tier: 1, icon: "🐂" },
        { name: "Rat Tail Cloak", price: 250, type: "accessory", slot: "accessory", bonus: { agility: 1, maxHealth: 1 }, activatedAbility: { name: "Cleanse", cost: 1, cooldown: 3, effect: 'cleanse', description: "1AP 3CD: Remove a Poison or Bleed effect." }, tier: 1, icon: "🧥" },
        { name: "Quiver", price: 50, type: "accessory", slot: "accessory", grantsSlot: 'ammo', bonus: { agility: 1 }, description: "+1 Agility. Unlocks an Ammo slot.", tier: 1, icon: "🎒" },
        { name: "Iron Shield", price: 120, type: "shield", slot: "offHand", weaponType: "Shield", cooldown: 2, reaction: { type: 'block', value: 2, hit: 12, stat: 'defense' }, description: "Reaction: D20+Def, 12+ reduce damage by 2", tier: 1, icon: "🛡️" },
        { name: "Iron Helm", price: 120, type: "armor", slot: "helmet", bonus: { strength: 1, maxHealth: 1, defense: 1 }, description: "+1 Str, +1 Max HP, +1 Def", tier: 1, icon: "🪖" },
        { name: "Iron Armor", price: 150, type: "armor", slot: "armor", bonus: { strength: 1, defense: 1, maxHealth: 1 }, description: "+1 Str, +1 Def, +1 Max HP", tier: 1, icon: "👕" },
        { name: "Steel Armor", price: 300, type: "armor", slot: "armor", bonus: { strength: 1, defense: 1, maxHealth: 1, physicalResistance: 1 }, description: "+1 Str, +1 Def, +1 Max HP, +1 Physical Resistance", tier: 1, icon: "👕" },
        { name: "Leather Armor", price: 50, type: "armor", slot: "armor", bonus: { agility: 1, maxHealth: 1 }, description: "+1 Agility, +1 Max HP", tier: 1, icon: "👕" },
        { name: "Leather Cowl", price: 50, type: "armor", slot: "helmet", bonus: { agility: 1, maxHealth: 1 }, description: "+1 Agility, +1 Max HP", tier: 1, icon: "🪖" },
        { name: "Wizard Robe", price: 50, type: "armor", slot: "armor", bonus: { wisdom: 1, maxHealth: 1 }, description: "+1 Wisdom, +1 Max HP", tier: 1, icon: "👘" },
        { name: "Wizard Hat", price: 50, type: "armor", slot: "helmet", bonus: { wisdom: 1, maxHealth: 1 }, description: "+1 Wisdom, +1 Max HP", tier: 1, icon: "🧙" },
        { name: "Amulet of Strength", price: 80, type: "accessory", slot: "accessory", bonus: { strength: 1 }, description: "+1 Strength", tier: 1, icon: "💎" },
        { name: "Iron Boots", price: 50, type: "armor", slot: "boots", bonus: { strength: 1 }, description: "+1 Strength", tier: 1, icon: "👢" },
        { name: "Leather Boots", price: 50, type: "armor", slot: "boots", bonus: { agility: 1 }, description: "+1 Agility", tier: 1, icon: "👢" },
        { name: "Cloth Boots", price: 50, type: "armor", slot: "boots", bonus: { wisdom: 1 }, description: "+1 Wisdom", tier: 1, icon: "👢" },
        
        // Materials
        { name: "Iron", type: "material", price: 10, description: "A chunk of raw iron.", icon: "🪨" },
        { name: "Wood", type: "material", price: 5, description: "A sturdy log of wood.", icon: "🪵" },
        { name: "Fish", type: "material", price: 8, description: "A fresh fish.", icon: "🐟" },
        { name: "Pork", type: "material", price: 10, description: "A slab of raw pork.", icon: "🍖" },
        { name: "Cow Hide", type: "material", price: 5, description: "A tough piece of leather.", icon: "🐮" },
        { name: "Vines", type: "material", price: 5, description: "A length of sturdy vine.", icon: "🌿" },
        { name: "Coal", type: "material", price: 8, description: "A lump of coal.", icon: "⚫" },
        { name: "Goblin Head", type: "material", price: 5, description: "A gruesome trophy.", icon: "💀" },
        { name: "Animal Fat", type: "material", price: 5, description: "A greasy lump of fat.", icon: "🧈" },
        { name: "Steel Bar", price: 50, type: "material", description: "A strong metal bar.", icon: "🔗" },
        { name: "Spices", price: 10, type: "material", description: "A blend of savory spices.", icon: "🌶️" },
        { name: "Cloth", type: "material", price: 8, description: "A piece of rough cloth.", icon: "📜" },
        { name: "Egg", type: "material", price: 5, description: "A fresh egg.", icon: "🥚" },
        { name: "Raw Chicken", type: "material", price: 8, description: "Uncooked chicken meat.", icon: "🍗" },
        { name: "Milk", type: "material", price: 6, description: "A bottle of fresh milk.", icon: "🥛" },
        { name: "Wheat", type: "material", price: 4, description: "A bundle of wheat.", icon: "🌾" },
        { name: "Feather", type: "material", price: 2, description: "A small, light feather.", icon: "🪶" },
        { name: "Goblin Lucky Charm", type: "questItem", price: 0, description: "A strange, surprisingly shiny goblin trinket.", icon: "🍀" }
    ],
    
    allSpells: [
        { name: "Punch", cost: 1, cooldown: 1, school: "Physical", description: "D20+Str, 10+ deals 1 damage", type: "attack", stat: "strength", damage: 1, hit: 10, damageType: 'Physical', icon: "👊" },
        { name: "Kick", cost: 1, cooldown: 1, school: "Physical", description: "D20+Agi, 10+ deals 1 damage", type: "attack", stat: "agility", damage: 1, hit: 10, damageType: 'Physical', icon: "🦶" },
        { name: "Dodge", cooldown: 3, school: "Physical", description: "Reaction: D20+Agi, 15+ avoid damage", type: "reaction", stat: "agility", hit: 15, icon: "🤸" },
        { name: "Fireball", price: 100, cost: 1, cooldown: 1, school: "Arcane", description: "D20+Wis, 15+ deals 2 damage and applies Burn (2 damage after enemy's next action).", type: "attack", stat: "wisdom", damage: 2, hit: 15, damageType: 'Arcane', debuff: { type: 'burn', duration: 1, damage: 2, damageType: 'Arcane' }, icon: "🔥" },
        { name: "Flash Heal", price: 100, cost: 1, cooldown: 2, school: "Holy", description: "D20+Wis, 15+ heals you for 3 HP.", type: "heal", stat: "wisdom", heal: 3, hit: 15, icon: "✨" },
        { name: "Holy Shock", price: 100, cost: 1, cooldown: 1, school: "Holy", description: "D20+Wis (15+) Heal 1+Wis if target is friendly, or deal 1+Wis Holy Damage if target is an enemy.", type: "versatile", stat: "wisdom", baseEffect: 1, damageType: 'Holy', hit: 15, icon: "⚡" },
        { name: "Shield Bash", price: 100, cost: 1, cooldown: 3, school: "Physical", description: "Requires Shield. D20+Str, 15+ deals 2 damage and Stuns the target.", type: "attack", stat: "strength", damage: 2, hit: 15, damageType: 'Physical', debuff: { type: 'stun', duration: 1 }, requires: { weaponType: "Shield", hand: "offHand" }, icon: "🛡️" },
        { name: "Aim True", price: 100, cost: 1, cooldown: 3, school: "Physical", description: "Requires Bow. D20+Agi, 10+ deals 3 damage. On 15+, also applies Stun.", type: "attack", stat: "agility", damage: 3, hit: 10, damageType: 'Physical', onHit: { threshold: 15, debuff: { type: 'stun', duration: 1 } }, icon: "🎯" },
        { name: "Flame Strike", price: 100, cost: 1, cooldown: 4, school: "Arcane", description: "D20+Wis, 15+ deals 3 damage and Burn to target and adjacent enemies.", type: "aoe", stat: "wisdom", damage: 3, hit: 15, damageType: 'Arcane', debuff: { type: 'burn', duration: 1, damage: 2, damageType: 'Arcane' }, icon: "💥" },
        { name: "Stealth", cost: 1, cooldown: 3, school: "Physical", description: "D20+Agi, 15+ gain Stealth until your next turn.", type: "buff", stat: "agility", hit: 15, buff: { type: 'Stealth', duration: 2 }, icon: "🤫" },
        { name: "Warrior's Might", price: 100, cost: 1, cooldown: 4, school: "Physical", description: "D20+Missing Health. On 15+, gain +2 Strength and +2 Defense for 3 turns.", type: "buff", hit: 15, buff: { type: "Warrior's Might", duration: 4, bonus: { strength: 2, defense: 2 } }, icon: "💪" },
        { name: "Ambush", price: 100, cost: 1, cooldown: 3, school: "Physical", description: "Requires Dagger(s). D20+Agi, 15+ deal weapon damage with all equipped daggers and apply Bleed for 1 turn per dagger.", type: "attack", stat: "agility", hit: 15, requires: { weaponType: "Dagger" }, icon: "🗡️" },
        { name: "Dagger Throw", price: 100, cost: 1, cooldown: 3, school: "Physical", description: "Requires Main-Hand Dagger. D20+Agi, 15+ deal main-hand weapon damage + 2. Ranged.", type: "attack", stat: "agility", hit: 15, requires: { weaponType: "Dagger", hand: "mainHand" }, damageBonus: 2, icon: "🔪" },
        { name: "Magic Barrier", price: 100, cost: 1, cooldown: 3, school: "Arcane", description: "D20+Wisdom. On 15+, gain a shield equal to your Wisdom+1 for 3 turns.", type: "buff", stat: "wisdom", hit: 15, buff: { type: 'Magic Barrier', duration: 4, shield: 'wisdom' }, icon: "💠" },
        { name: "Crushing Blow", price: 100, cost: 1, cooldown: 3, school: "Physical", description: "Requires Mace. D20+Str, 15+ deal Main-Hand Mace Damage+2 and Daze.", type: "attack", stat: "strength", damageBonus: 2, hit: 15, damageType: 'Physical', requires: { weaponType: ["Mace", "Two-Hand Mace"], hand: "mainHand" }, onHit: { debuff: { type: 'daze', duration: 2 } }, icon: "🔨" },
        { name: "Monk's Training", price: 100, cost: 1, cooldown: 4, school: "Physical", description: "Passive: Unarmed attacks deal +1 damage and generate 1 Focus. Active: Spend all Focus to Heal(X) and get +(X) to all rolls this turn. X = Focus you had.", type: 'utility', stat: 'strength', hit: 10, icon: "🧘" },
        { name: "Split Shot", price: 100, cost: 1, cooldown: 3, school: "Physical", description: "Requires Bow. D20+Agility, 15+ Deal Bow Damage to all enemies.", type: "aoe", stat: "agility", hit: 15, damageType: 'Physical', requires: { weaponType: "Two-Hand Bow" }, aoeTargeting: 'all', icon: "🏹" }
    ],

    cardPools: {
        farmlands: [
            { card: { 
                name: "Raging Bull", 
                type: "enemy", 
                health: 12, 
                maxHealth: 12, 
                description: "An enraged bull, kicking up dust.",
                icon: "🐂",
                attackTable: [
                    { range: [1, 7], action: 'miss', message: "The bull snorts and misses!" },
                    { range: [8, 15], action: 'attack', damage: 3, damageType: 'Physical', message: "Charge! Deals 3 Physical Damage!" },
                    { range: [16, 20], action: 'special', message: "Thick Hide! Gain 1 Physical Resistance until the next Zone Turn then make another action!" }
                ],
                guaranteedLoot: { items: ["Bull Horn", "Cow Hide", "Cow Hide"] }
            }, count: 1 },
            { card: { 
                name: "Farmer", 
                type: "npc", 
                description: "A friendly farmer.", 
                icon: "👨‍🌾",
                quests: [
                    {id: "FARMHAND_TROUBLE", title: "Farmhand Trouble", target: "Angry Farmhand", required: 2, reward: {gold: 20, qp: 1}, prerequisite: null},
                    {id: "BULL_RAGE", title: "Kill the Raging Bull", target: "Raging Bull", required: 1, reward: {gold: 50, qp: 1, titleReward: "Bull-Slayer"}, prerequisite: "FARMHAND_TROUBLE"}
                ],
                dialogue: {
                    FARMHAND_TROUBLE_start: { text: "Howdy, stranger. Those farmhands are causing a ruckus again. Could you teach 'em a lesson?", options: [{ text: "I'll sort them out.", questId: "FARMHAND_TROUBLE", next: "FARMHAND_TROUBLE_inProgress" }, { text: "Not my problem.", next: "farewell" }] },
                    FARMHAND_TROUBLE_inProgress: { text: "Still dealing with those rascals? Don't let them walk all over you.", options: [{ text: "I'm on it.", next: "farewell" }] },
                    FARMHAND_TROUBLE_ready: { text: "You taught them a thing or two! Excellent. Here's something for your trouble.", options: [{ text: "Thank you, Sir.", questComplete: "FARMHAND_TROUBLE", next: "BULL_RAGE_start" }] },
                    BULL_RAGE_start: { text: "Thanks for that. But now there's a bigger problem... a Raging Bull! Can you handle it?", options: [{ text: "I'll take care of the beast.", questId: "BULL_RAGE", next: "BULL_RAGE_inProgress" }, { text: "That's too much for me.", next: "farewell" }] },
                    BULL_RAGE_inProgress: { text: "Be careful out there. That bull's got a mean streak.", options: [{ text: "I will.", next: "farewell" }] },
                    BULL_RAGE_ready: { text: "You did it! You're a hero! Please, take this reward.", options: [{ text: "My pleasure.", questComplete: "BULL_RAGE", next: "allQuestsDone" }] },
                    allQuestsDone: { text: "Thanks for all your help, friend. The farmlands are safer because of you.", options: [{ text: "Take care.", next: "farewell" }] },
                    farewell: { text: "Happy farming.", options: [] }
                }
            }, count: 1 },
            { card: { 
                name: "Farmer's Wife", 
                type: "npc", 
                description: "She seems worried about something.", 
                icon: "👩‍🌾",
                quests: [ {id: "BAKERS_REQUEST", title: "A Birthday Surprise", turnInItems: { "Birthday Cake": 1 }, reward: {gold: 25, qp: 1}, prerequisite: null} ],
                dialogue: {
                    BAKERS_REQUEST_start: { text: "Oh, hello there. My husband's birthday is soon, and I'd love to surprise him with a cake. Could you possibly make one?", options: [{ text: "I'd be happy to help.", questId: "BAKERS_REQUEST", next: "BAKERS_REQUEST_inProgress" }, { text: "I'm not much of a baker.", next: "farewell" }] },
                    BAKERS_REQUEST_inProgress: { text: "I'm sure you can find the ingredients around the farmlands. He'll be so happy!", options: [{ text: "I'll do my best.", next: "farewell" }] },
                    BAKERS_REQUEST_ready: { text: "Oh, that looks wonderful! Thank you so much! Here is a little something for your effort.", options: [{ text: "You're welcome.", questComplete: "BAKERS_REQUEST", next: "allQuestsDone" }] },
                    allQuestsDone: { text: "He's going to love this. Thank you again!", options: [{ text: "Happy to help.", next: "farewell" }] },
                    farewell: { text: "Have a sweet day.", options: [] }
                }
            }, count: 1 },
            { card: { name: "Treasure Chest", type: "treasure", description: "A locked chest. What could be inside?", icon: "📦" }, count: 1 },
            { card: { 
                name: "Chicken", type: "enemy", health: 2, maxHealth: 2, description: "A feisty farm chicken", icon: "🐔",
                attackTable: [
                    { range: [1, 10], action: 'miss', message: "Miss!" },
                    { range: [11, 15], action: 'attack', damage: 1, damageType: 'Physical', message: "Peck! Deals 1 Physical Damage!" },
                    { range: [16, 20], action: 'attack', damage: 2, damageType: 'Physical', message: "Eye Gouge! Deals 2 Physical Damage!" }
                ],
                guaranteedLoot: { items: ["Raw Chicken"] },
                lootTable: [
                    { range: [1, 10], items: ["Egg"] },
                    { range: [11, 20], items: ["Feather"] }
                ]
            }, count: 8 },
            { card: { 
                name: "Pig", type: "enemy", health: 3, maxHealth: 3, description: "A muddy pig", icon: "🐷",
                attackTable: [
                    { range: [1, 10], action: 'miss', message: "Miss!" },
                    { range: [11, 15], action: 'attack', damage: 1, damageType: 'Physical', message: "Slam! Deals 1 Physical Damage!" },
                    { range: [16, 20], action: 'attack', damage: 2, damageType: 'Physical', message: "Headbutt! Deals 2 Physical Damage!" }
                ],
                guaranteedLoot: { items: ["Pork"] },
                lootTable: [
                    { range: [1, 10], items: [] },
                    { range: [11, 20], items: ["Animal Fat"] }
                ]
            }, count: 8 },
            { card: { 
                name: "Cow", type: "enemy", health: 4, maxHealth: 4, description: "A gentle cow", icon: "🐮",
                attackTable: [
                    { range: [1, 10], action: 'miss', message: "Miss!" },
                    { range: [11, 15], action: 'attack', damage: 2, damageType: 'Physical', message: "Kick! Deals 2 Physical Damage!" },
                    { range: [16, 20], action: 'attack', damage: 2, damageType: 'Physical', debuff: { type: 'daze', duration: 2 }, message: "Press! Deals 2 Physical Damage and applies Daze!" }
                ],
                guaranteedLoot: { items: ["Cow Hide"] },
                lootTable: [
                    { range: [1, 10], items: ["Milk"] },
                    { range: [11, 20], items: ["Animal Fat"] }
                ] 
            }, count: 8 },
            { card: { 
                name: "Angry Farmhand", type: "enemy", health: 4, maxHealth: 4, description: "An angry local. Wants you off his land.", icon: "🧑‍🌾",
                attackTable: [
                    { range: [1, 8], action: 'miss', message: "Miss!" },
                    { range: [9, 15], action: 'attack', damage: 2, damageType: 'Physical', message: "Stab! Deals 2 Physical Damage!" },
                    { range: [16, 20], action: 'attack', damage: 2, damageType: 'Physical', debuff: { type: 'bleed', duration: 2, damage: 1, damageType: 'Physical' }, message: "Slash! Deals 2 Physical Damage and applies Bleed!" }
                ],
                guaranteedLoot: { gold: true, items: ["Cloth"] },
                lootTable: [
                    { range: [1, 19], randomItems: { pool: ['Iron', 'Wood', 'Wheat', 'Fish'], count: 2 } },
                    { range: [20, 20], items: ["Pitchfork"] }
                ]
            }, count: 3 },
            { card: { name: "Iron Node", type: "resource", skill: "mining", description: "Requires Mining Pickaxe (T1)", loot: {name: "Iron", type: "material", price: 5}, tool: "Mining Pickaxe (T1)", icon: "⛏️" }, count: 6 },
            { card: { name: "Tree", type: "resource", skill: "woodcutting", description: "Requires Woodcutting Axe (T1)", loot: {name: "Wood", type: "material", price: 5}, tool: "Woodcutting Axe (T1)", icon: "🌲" }, count: 6 },
            { card: { name: "River", type: "resource", skill: "fishing", description: "Requires Fishing Rod (T1)", loot: {name: "Fish", type: "material", price: 5}, tool: "Fishing Rod (T1)", icon: "🎣" }, count: 6 },
            { card: { name: "Wheat Field", type: "resource", skill: "harvesting", description: "Requires Harvesting Sickle (T1)", loot: {name: "Wheat", type: "material", price: 4}, tool: "Harvesting Sickle (T1)", icon: "🌾" }, count: 5 },
        ],
        
        goblinCaves: [
            { card: { name: "Gorbon the Goblin King", type: "enemy", health: 30, maxHealth: 30, damage: 5, attackDesc: "Royal Mace: Varies by roll.", description: "The formidable king of the goblins.", loot: {goldDrop: 100}, icon: "👺" }, count: 1 },
            { card: { 
                name: "Treasure Hunter", 
                type: "npc", 
                description: "A rugged-looking adventurer.", 
                icon: "🕵️‍♂️",
                quests: [ {id: "LUCKY_CHARM_HUNT", title: "The Lucky Charm", turnInItems: { "Goblin Lucky Charm": 1 }, reward: {gold: 50, qp: 1, spellReward: { name: 'Stealth' }}, prerequisite: {qp: 2}} ],
                dialogue: {
                    LUCKY_CHARM_HUNT_start: { text: "You look like you've seen a thing or two. I'm after a rare trinket—a Goblin Lucky Charm. Find one for me, and I'll teach you a trick for staying out of sight.", options: [{ text: "I'll keep an eye out.", questId: "LUCKY_CHARM_HUNT", next: "LUCKY_CHARM_HUNT_inProgress" }, { text: "I have other priorities.", next: "farewell" }] },
                    LUCKY_CHARM_HUNT_inProgress: { text: "They say those charms are hidden away in old chests. Keep searching!", options: [{ text: "Will do.", next: "farewell" }] },
                    LUCKY_CHARM_HUNT_ready: { text: "Is that it? You found one! Amazing! A deal's a deal. Let me show you the art of stealth...", options: [{ text: "I'm ready to learn.", questComplete: "LUCKY_CHARM_HUNT", next: "allQuestsDone" }] },
                    allQuestsDone: { text: "Use that skill well. It's saved my skin more times than I can count.", options: [{ text: "Thank you.", next: "farewell" }] },
                    prereqNotMet: { text: "You're not quite ready for this task. Come back when you've proven yourself a bit more.", options: [{ text: "I understand.", next: "farewell" }] },
                    farewell: { text: "Happy hunting.", options: [] }
                }
            }, count: 1 },
            { card: { name: "Treasure Chest", type: "treasure", description: "A locked chest. What could be inside?", loot: [{name: "Goblin Lucky Charm", type: "questItem", price: 0, description: "A strange, surprisingly shiny goblin trinket."}], icon: "📦" }, count: 1 },
            { card: { name: "Goblin Shaman", type: "enemy", health: 8, maxHealth: 8, damage: 3, attackDesc: "Hex: Deals 3 Nature Damage or Heals ally.", description: "A mystical goblin shaman.", loot: {name: "Goblin Head", type: "material", price: 5}, icon: "👺" }, count: 5 },
            { card: { name: "Goblin Archer", type: "enemy", health: 8, maxHealth: 8, damage: 3, attackDesc: "Barbed Arrow: Deals 3 damage or Traps you.", description: "A sneaky goblin archer.", loot: {name: "Goblin Head", type: "material", price: 5}, icon: "👺" }, count: 6 },
            { card: { name: "Goblin Warrior", type: "enemy", health: 10, maxHealth: 10, damage: 3, attackDesc: "Brutal Swing: Deals 3 damage and can Daze.", description: "A brutish goblin warrior.", loot: {name: "Goblin Head", type: "material", price: 5}, icon: "👺" }, count: 7 },
            { card: { name: "Boulders", type: "resource", description: "A pile of impassable rocks.", charges: 0, icon: "🪨" }, count: 8 },
            { card: { name: "Vines", type: "resource", skill: "woodcutting", description: "Requires Woodcutting Axe (T1)", loot: {name: "Vines", type: "material", price: 5}, tool: "Woodcutting Axe (T1)", icon: "🌿" }, count: 6 },
            { card: { name: "Coal", type: "resource", skill: "mining", description: "Requires Mining Pickaxe (T1)", loot: {name: "Coal", type: "material", price: 5}, tool: "Mining Pickaxe (T1)", icon: "⛏️" }, count: 6 },
        ],

        town: [
            { card: { 
                name: "Knight", 
                type: "npc", 
                description: "A stoic knight in shining armor.", 
                icon: "⚔️",
                quests: [
                    {id: "GOBLIN_MENACE", title: "Goblin Menace", target: "Goblin", required: 4, reward: {gold: 100, qp: 1}, prerequisite: null},
                    {id: "SLAY_THE_KING", title: "Slay Their King!", target: "Gorbon the Goblin King", required: 1, reward: {gold: 100, qp: 1}, prerequisite: "GOBLIN_MENACE"}
                ],
                dialogue: {
                    GOBLIN_MENACE_start: { text: "Citizen! The goblin menace grows bolder by the day. We need able-bodied adventurers to cull their numbers. Are you up to the task?", options: [{ text: "I'll do my part.", questId: "GOBLIN_MENACE", next: "GOBLIN_MENACE_inProgress" }, { text: "I'm not looking for trouble.", next: "farewell" }] },
                    GOBLIN_MENACE_inProgress: { text: "The town is counting on you. Return to the caves and fight with honor!", options: [{ text: "For the town!", next: "farewell" }] },
                    GOBLIN_MENACE_ready: { text: "Excellent work. You've proven your valor against the goblin horde. Here is your payment.", options: [{ text: "Thank you, Sir.", questComplete: "GOBLIN_MENACE", next: "SLAY_THE_KING_start" }] },
                    SLAY_THE_KING_start: { text: "Your work isn't finished, however. The goblin threat will never truly end while their king, Gorbon, still draws breath. Slay him, and you will be a hero to this town.", options: [{ text: "I accept this challenge.", questId: "SLAY_THE_KING", next: "SLAY_THE_KING_inProgress" }, { text: "That is a task for another day.", next: "farewell" }] },
                    SLAY_THE_KING_inProgress: { text: "Be careful in those caves. Gorbon is a formidable foe.", options: [{ text: "I will not fail.", next: "farewell" }] },
                    SLAY_THE_KING_ready: { text: "You've done it! You've slain the Goblin King! The town is in your debt. Take this reward.", options: [{ text: "It was an honor.", questComplete: "SLAY_THE_KING", next: "allQuestsDone" }] },
                    allQuestsDone: { text: "You are a true hero of this town. We are all grateful for your service.", options: [{ text: "Farewell.", next: "farewell" }] },
                    farewell: { text: "Stay vigilant.", options: [] }
                }
            }, count: 1 },
            { card: { 
                name: "Brother Thatch", 
                type: "npc", 
                description: "A bald monk in simple robes, tending a small garden.",
                icon: "🧘‍♂️",
                quests: [
                    {id: "MONK_FOCUS_QUEST", title: "A Test of Focus", turnInItems: { "Wheat": 3, "Fish": 3 }, reward: {spellReward: { name: "Monk's Training" }}}
                ],
                dialogue: {
                    MONK_FOCUS_QUEST_start: { text: "Greetings, traveler. The path to strength is not through the clash of steel alone, but through the quiet focus of the mind. What do you seek?", options: [{ text: "I seek strength. Can you teach me?", next: "MONK_FOCUS_QUEST_offer" }, { text: "Just passing through.", next: "farewell" }] },
                    MONK_FOCUS_QUEST_offer: { text: "Strength is a byproduct of discipline. True power is focus. If you wish to learn, you must first demonstrate patience. Bring me three bundles of wheat from the farmlands, and three fish from the river. Do this, and I will teach you a technique to channel your inner energy.", options: [{ text: "I will gather these things.", questId: "MONK_FOCUS_QUEST", next: "MONK_FOCUS_QUEST_inProgress" }, { text: "I don't have time for that.", next: "farewell" }] },
                    MONK_FOCUS_QUEST_inProgress: { text: "The river teaches patience, the fields teach diligence. Return when you have gathered the items.", options: [ { text: "I will return.", next: "farewell" } ] },
                    MONK_FOCUS_QUEST_ready: { text: "You have returned, and with the requested items. You have shown patience and a focused spirit. Very well. Let me show you how to turn your own life force into a weapon, and a balm.", options: [ { text: "Thank you, master.", questComplete: "MONK_FOCUS_QUEST", next: "allQuestsDone" } ] },
                    allQuestsDone: { text: "The technique is now yours. Practice it, and you will find strength not only in your fists, but in your spirit. Go well.", options: [ { text: "Farewell.", next: "farewell" } ] },
                    farewell: { text: "May your path be clear.", options: [] }
                }
            }, count: 1 },
            { card: { name: "Mugger", type: "enemy", health: 6, maxHealth: 6, description: "A shady figure eyes your coin purse.", icon: "👤",
                attackTable: [
                    { range: [1, 6], action: 'miss', message: "Miss!" },
                    { range: [7, 15], action: 'attack', damage: 1, damageType: 'Physical', debuff: { type: 'bleed', duration: 2, damage: 1, damageType: 'Physical' }, message: "Stab! Deals 1 Physical Damage and Bleed!" },
                    { range: [16, 20], action: 'special', message: "The mugger offers you a deal..." }
                ],
                lootTable: [
                    { range: [1, 10], items: [], gold: true },
                    { range: [11, 20], items: ["Mugger's Knife"], gold: true }
                ]
            }, count: 1 },
            { card: { name: "Townsfolk", type: "npc", description: "A local resident enjoying the day.", icon: "🧑" }, count: 8 },
            { card: { name: "Sewer Grate", type: "resource", description: "A rusty grate leading down into the darkness.", icon: "🕳️" }, count: 1 },
        ],

        sewers: [
            { card: { name: "Rat", type: "enemy", health: 3, maxHealth: 3, icon: "🐀", attackTable: [
                { range: [1, 10], action: 'miss', message: "Miss!" },
                { range: [11, 20], action: 'attack', damage: 1, damageType: 'Physical', message: "Bite! Deals 1 Physical Damage!" }
            ]}, count: 10 },
            { card: { name: "Large Rat", type: "enemy", health: 5, maxHealth: 5, icon: "🐀", attackTable: [
                { range: [1, 10], action: 'miss', message: "Miss!" },
                { range: [11, 20], action: 'attack', damage: 2, damageType: 'Physical', message: "Maul! Deals 2 Physical Damage!" }
            ]}, count: 5 },
            { card: { name: "The Rat King", type: "enemy", health: 20, maxHealth: 20, description: "A horrifying amalgamation of rats.", icon: "👑",
                attackTable: [
                    { range: [1, 5], action: 'miss', message: "Miss!" },
                    { range: [6, 10], action: 'attack', damage: 3, damageType: 'Physical', message: "Gnaw! Deals 3 Physical Damage!" },
                    { range: [11, 15], action: 'attack', damage: 2, damageType: 'Physical', debuff: { type: 'poison', duration: 3, damage: 2, damageType: 'Nature' }, message: "Diseased Bite! Deals 2 Physical Damage and Poisons you!" },
                    { range: [16, 20], action: 'special', message: "The Rat King shrieks and another rat appears!" }
                ],
                guaranteedLoot: { gold: true, items: ["Rat Tail Cloak"] }
            }, count: 1 },
        ],
    
        arena: [
            { card: { name: "Pulvis Cadus", type: "enemy", health: 30, maxHealth: 30, description: "A master of strange concoctions and explosives.", icon: "⚗️",
                arenaReward: 100,
                attackTable: [
                    { range: [1, 3], action: 'miss', message: "Miss!" },
                    { range: [4, 7], action: 'attack', damage: 3, damageType: 'Fire', message: "Bomb Toss! Deals 3 Fire Damage!" },
                    { range: [8, 12], action: 'attack', damage: 3, damageType: 'Arcane', debuff: { type: 'daze', duration: 2 }, message: "Flash Bang! Deals 3 Arcane Damage and Dazes you!" },
                    { range: [13, 15], action: 'special', message: "A Quick Fix! Pulvis Cadus heals and prepares his next move." },
                    { range: [16, 20], action: 'special', message: "Pulvis Cadus throws out some unstable kegs!" }
                ],
                lootTable: [
                    { range: [1, 10], recipe: "Powder Keg" },
                    { range: [11, 20], items: ["Magna Clavis"] }
                ]
            }, count: 1},
        ],
    },

    specialCards: {
        powderKeg: { name: "Powder Keg", type: "enemy", health: 2, maxHealth: 2, description: "It's fizzing ominously.", charges: 0, icon: "💣",
            attackTable: [
                { range: [1, 20], action: 'special', message: "The Powder Keg fizzes..." }
            ]
        },
        lootGoblin: {
            name: "Loot Goblin",
            type: "enemy",
            health: 6,
            maxHealth: 6,
            description: "A greedy goblin carrying a massive sack of loot!",
            icon: "💰",
            stolenGold: 0, 
            attackTable: [
                { range: [1, 10], action: 'special', message: "The Loot Goblin dances around, taunting you!" },
                { range: [11, 15], action: 'special', message: "Pickpocket! The goblin quickly snatches some of your gold!" },
                { range: [16, 20], action: 'special', message: "The Loot Goblin opens a portal and escapes!" }
            ]
        }
    },

    craftingRecipes: [
        { result: { name: "Iron Arrows", quantity: 10 }, materials: { "Iron": 1, "Feather": 1, "Wood": 1 }, category: "Fletching" },
        { result: { name: "Longbow" }, materials: { "Wood": 2, "Cow Hide": 1 }, category: "Fletching" },
        { result: { name: "Cooked Fish" }, materials: { "Fish": 1, "Spices": 1 }, category: "Cooking" },
        { result: { name: "Cooked Pork" }, materials: { "Pork": 1, "Spices": 1 }, category: "Cooking" },
        { result: { name: "Birthday Cake" }, materials: { "Egg": 1, "Milk": 1, "Wheat": 1 }, category: "Cooking" },
        { result: { name: "Iron Dagger" }, materials: { "Iron": 1, "Wood": 1 }, category: "Blacksmithing" },
        { result: { name: "Iron Sword" }, materials: { "Wood": 1, "Iron": 1 }, category: "Blacksmithing" },
        { result: { name: "Iron Mace" }, materials: { "Iron": 2, "Wood": 1 }, category: "Blacksmithing" },
        { result: { name: "Iron Spear" }, materials: { "Wood": 2, "Iron": 1 }, category: "Blacksmithing" },
        { result: { name: "Iron Shield" }, materials: { "Iron": 1, "Cow Hide": 1 }, category: "Blacksmithing" },
        { result: { name: "Iron Armor" }, materials: { "Iron": 2 }, category: "Blacksmithing" },
        { result: { name: "Iron Helm" }, materials: { "Iron": 1, "Cow Hide": 1 }, category: "Blacksmithing" },
        { result: { name: "Steel Bar" }, materials: { "Iron": 1, "Coal": 1 }, category: "Blacksmithing" },
        { result: { name: "Steel Armor" }, materials: { "Steel Bar": 2 }, category: "Blacksmithing" },
        { result: { name: "Iron Boots" }, materials: { "Iron": 1, "Cow Hide": 1 }, category: "Blacksmithing" },
        { result: { name: "Quiver" }, materials: { "Cow Hide": 2 }, category: "Leatherworking" },
        { result: { name: "Leather Armor" }, materials: { "Cow Hide": 2 }, category: "Leatherworking" },
        { result: { name: "Leather Cowl" }, materials: { "Cow Hide": 2 }, category: "Leatherworking" },
        { result: { name: "Leather Boots" }, materials: { "Cow Hide": 2 }, category: "Leatherworking" },
        { result: { name: "Wizard Robe" }, materials: { "Cloth": 1, "Cow Hide": 1 }, category: "Tailoring" },
        { result: { name: "Wizard Hat" }, materials: { "Cloth": 1, "Cow Hide": 1 }, category: "Tailoring" },
        { result: { name: "Cloth Boots" }, materials: { "Cloth": 1, "Cow Hide": 1 }, category: "Tailoring" },
        { result: { name: "Staff" }, materials: { "Wood": 2 }, category: "General" },
        { result: { name: "Wooden Torch" }, materials: { "Wood": 1, "Animal Fat": 1 }, category: "General" },
        { result: { name: "Powder Keg" }, materials: { "Wood": 2, "Coal": 1 }, category: "General", requiresDiscovery: true },
    ],

    genericTreasureLoot: [
        { name: "Healing Potion" },
        { name: "Gold Pouch", type: "consumable", price: 0, gold: 25, description: "A pouch containing 25 gold." }
    ]
};