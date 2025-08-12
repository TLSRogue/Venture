// /data/cards.js
export const cardPools = {
    farmlands: [
        { card: { 
            name: "Raging Bull", 
            type: "enemy", 
            health: 15, 
            maxHealth: 15, 
            description: "An enraged bull, kicking up dust.",
            icon: "🐂",
            imageUrl: '/assets/raging-bull.png', // <<< Add this line
            attackTable: [
                { range: [1, 3], action: 'miss', message: "The bull snorts and misses!" },
                { range: [4, 12], action: 'attack', damage: 3, damageType: 'Physical', message: "Charge! Deals 3 Physical Damage!" },
                { range: [13, 20], action: 'special', message: "Thick Hide! Gain 1 Physical Resistance until the next Zone Turn then make another action!" }
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
            quests: [ {id: "BAKERS_REQUEST", title: "A Birthday Surprise", turnInItems: { "Egg": 1, "Milk": 1, "Wheat": 1 }, reward: {gold: 25, qp: 1, recipeReward: "Birthday Cake"}, prerequisite: null} ],
            dialogue: {
                BAKERS_REQUEST_start: { text: "Oh, hello there. My husband's birthday is soon, and I'd love to surprise him with a cake. Could you possibly gather the ingredients for one?", options: [{ text: "I'd be happy to help.", questId: "BAKERS_REQUEST", next: "BAKERS_REQUEST_inProgress" }, { text: "I'm not much of a baker.", next: "farewell" }] },
                BAKERS_REQUEST_inProgress: { text: "I'm sure you can find the ingredients around the farmlands. You'll need an Egg, some Milk, and a bit of Wheat. He'll be so happy!", options: [{ text: "I'll do my best.", next: "farewell" }] },
                BAKERS_REQUEST_ready: { text: "Oh, these are perfect! Thank you so much! As a thank you, let me teach you the recipe. Here is a little something for your effort, too.", options: [{ text: "You're welcome.", questComplete: "BAKERS_REQUEST", next: "allQuestsDone" }] },
                allQuestsDone: { text: "He's going to love this. Thank you again!", options: [{ text: "Happy to help.", next: "farewell" }] },
                farewell: { text: "Have a sweet day.", options: [] }
            }
        }, count: 1 },
        { card: { name: "Treasure Chest", type: "treasure", description: "A locked chest. What could be inside?", icon: "📦" }, count: 1 },
        { card: { 
            name: "Chicken", type: "enemy", health: 2, maxHealth: 2, description: "A feisty farm chicken", icon: "🐔",
            attackTable: [
                { range: [1, 3], action: 'miss', message: "Miss!" },
                { range: [4, 15], action: 'attack', damage: 1, damageType: 'Physical', message: "Peck! Deals 1 Physical Damage!" },
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
                { range: [1, 3], action: 'miss', message: "Miss!" },
                { range: [4, 15], action: 'attack', damage: 1, damageType: 'Physical', message: "Slam! Deals 1 Physical Damage!" },
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
                { range: [1, 3], action: 'miss', message: "Miss!" },
                { range: [4, 15], action: 'attack', damage: 2, damageType: 'Physical', message: "Kick! Deals 2 Physical Damage!" },
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
                { range: [1, 3], action: 'miss', message: "Miss!" },
                { range: [4, 15], action: 'attack', damage: 2, damageType: 'Physical', message: "Stab! Deals 2 Physical Damage!" },
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
        { card: { name: "Crops", type: "resource", skill: "harvesting", description: "Requires Harvesting Sickle (T1)", lootPool: [{name: "Wheat"}, {name: "Carrot"}, {name: "Hemp"}], tool: "Harvesting Sickle (T1)", icon: "🌾" }, count: 5 },
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
    
    // --- NEW: PvP Zone Card Pool ---
    blighted_wastes: [
        { card: { 
            name: "Wary Scout", 
            type: "npc", 
            description: "'Be careful out there. This land is cursed, and its guardians aren't the only thing you have to worry about.'", 
            icon: "🤠",
        }, count: 1 },
        { card: { 
            name: "Doomsayer", 
            type: "npc", 
            description: "'They come seeking treasure, but all they find is their own greed... and the end of their journey.'", 
            icon: "🔮",
        }, count: 1 },
        { card: { 
            name: "Ashfang Stalker", type: "enemy", health: 18, maxHealth: 18, description: "A shadowy beast that moves through the ash.", icon: "🐺",
            attackTable: [
                { range: [1, 5], action: 'miss', message: "Misses!" },
                { range: [6, 15], action: 'attack', damage: 4, damageType: 'Physical', message: "Claw! Deals 4 Physical Damage!" },
                { range: [16, 20], action: 'attack', damage: 3, damageType: 'Physical', debuff: { type: 'bleed', duration: 3, damage: 2, damageType: 'Physical' }, message: "Hamstring! Deals 3 Physical Damage and applies a heavy Bleed!" }
            ],
            lootTable: [ { range: [1, 20], randomItems: { pool: ['Drake Scale', 'Obsidian Chunk'], count: 1 } } ]
        }, count: 6 },
        { card: { 
            name: "Cinderhulk", type: "enemy", health: 25, maxHealth: 25, description: "A hulking elemental of magma and rock.", icon: "👹",
            attackTable: [
                { range: [1, 5], action: 'miss', message: "Misses!" },
                { range: [6, 15], action: 'attack', damage: 5, damageType: 'Physical', message: "Slam! Deals 5 Physical Damage!" },
                { range: [16, 20], action: 'attack', damage: 4, damageType: 'Fire', debuff: { type: 'burn', duration: 2, damage: 2, damageType: 'Fire' }, message: "Immolate! Deals 4 Fire Damage and applies Burn!" }
            ],
            lootTable: [ { range: [1, 20], items: ["Obsidian Chunk", "Obsidian Chunk"] } ]
        }, count: 4 },
         { card: { 
            name: "Lava Drake", type: "enemy", health: 22, maxHealth: 22, description: "A lesser drake that breathes searing flames.", icon: "🐲",
            attackTable: [
                { range: [1, 5], action: 'miss', message: "Misses!" },
                { range: [6, 15], action: 'attack', damage: 6, damageType: 'Fire', message: "Fire Breath! Deals 6 Fire Damage!" },
                { range: [16, 20], action: 'special', message: "Tail Swipe! Hits all party members for 3 damage!" }
            ],
            lootTable: [ { range: [1, 20], items: ["Drake Scale", "Drake Scale"] } ]
        }, count: 2 },
        { card: { name: "Obsidian Vein", type: "resource", skill: "mining", description: "Requires Mining Pickaxe (T2)", loot: {name: "Obsidian Chunk"}, tool: "Steel Pickaxe (T2)", icon: "💎" }, count: 5 },
        { card: { name: "Ashenwood Tree", type: "resource", skill: "woodcutting", description: "Requires Woodcutting Axe (T2)", loot: {name: "Ashenwood Log"}, tool: "Steel Axe (T2)", icon: "🌳" }, count: 5 },
        { card: { name: "Rare Treasure", type: "treasure", description: "A heavily locked chest.", icon: "👑" }, count: 2 },
    ],
};

export const specialCards = {
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
};