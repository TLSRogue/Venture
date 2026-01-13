// /data/cards.js
export const cardPools = {
    farmlands: [
        {
            card: {
                name: "Raging Bull",
                type: "enemy",
                health: 15,
                maxHealth: 15,
                description: "An enraged bull, kicking up dust.",
                icon: "🐂",
                imageUrl: '/assets/farmlands-ragingbull.png',
                attackTable: [
                    { range: [1, 3], action: 'miss', message: "The bull snorts and misses!" },
                    { range: [4, 12], action: 'attack', attackRange: 'melee', damage: 3, damageType: 'Physical', message: "Charge! Deals 3 Physical Damage!" },
                    { range: [13, 20], action: 'special', message: "Thick Hide! Gain 1 Physical Resistance until the next Zone Turn then make another action!" }
                ],
                guaranteedLoot: { items: ["Bull Horn", "Cow Hide", "Cow Hide"] }
            }, count: 1
        },
        {
            card: {
                name: "Farmer",
                type: "npc",
                description: "A friendly farmer.",
                icon: "👨‍🌾",
                imageUrl: '/assets/farmlands-farmer.png',
                quests: [
                    { id: "FARMHAND_TROUBLE", title: "Farmhand Trouble", target: "Angry Farmhand", required: 2, reward: { gold: 20, qp: 1 }, prerequisite: null },
                    { id: "BULL_RAGE", title: "Kill the Raging Bull", target: "Raging Bull", required: 1, reward: { gold: 50, qp: 1, titleReward: "Bull-Slayer" }, prerequisite: "FARMHAND_TROUBLE" }
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
            }, count: 1
        },
        {
            card: {
                name: "Farmer's Wife",
                type: "npc",
                description: "She seems worried about something.",
                icon: "👩‍🌾",
                imageUrl: '/assets/farmlands-farmerswife.png',
                quests: [{ id: "BAKERS_REQUEST", title: "A Birthday Surprise", turnInItems: { "Egg": 1, "Milk": 1, "Wheat": 1 }, reward: { gold: 25, qp: 1, recipeReward: "Birthday Cake" }, prerequisite: null }],
                dialogue: {
                    BAKERS_REQUEST_start: { text: "Oh, hello there. My husband's birthday is soon, and I'd love to surprise him with a cake. Could you possibly gather the ingredients for one?", options: [{ text: "I'd be happy to help.", questId: "BAKERS_REQUEST", next: "BAKERS_REQUEST_inProgress" }, { text: "I'm not much of a baker.", next: "farewell" }] },
                    BAKERS_REQUEST_inProgress: { text: "I'm sure you can find the ingredients around the farmlands. You'll need an Egg, some Milk, and a bit of Wheat. He'll be so happy!", options: [{ text: "I'll do my best.", next: "farewell" }] },
                    BAKERS_REQUEST_ready: { text: "Oh, these are perfect! Thank you so much! As a thank you, let me teach you the recipe. Here is a little something for your effort, too.", options: [{ text: "You're welcome.", questComplete: "BAKERS_REQUEST", next: "allQuestsDone" }] },
                    allQuestsDone: { text: "He's going to love this. Thank you again!", options: [{ text: "Happy to help.", next: "farewell" }] },
                    farewell: { text: "Have a sweet day.", options: [] }
                }
            }, count: 1
        },
        { card: { name: "Treasure Chest", type: "treasure", description: "A locked chest. What could be inside?", icon: "📦", imageUrl: '/assets/farmlands-treasurechest.png' }, count: 1 },
        {
            card: {
                name: "Chicken", type: "enemy", health: 2, maxHealth: 2, description: "A feisty farm chicken", icon: "🐔", imageUrl: '/assets/farmlands-chicken.png',
                attackTable: [
                    { range: [1, 3], action: 'miss', message: "Miss!" },
                    { range: [4, 15], action: 'attack', attackRange: 'melee', damage: 1, damageType: 'Physical', message: "Peck! Deals 1 Physical Damage!" },
                    { range: [16, 20], action: 'attack', attackRange: 'melee', damage: 2, damageType: 'Physical', message: "Eye Gouge! Deals 2 Physical Damage!" }
                ],
                guaranteedLoot: { items: ["Raw Chicken"] },
                lootTable: [
                    { range: [1, 10], items: ["Egg"] },
                    { range: [11, 17], items: ["Feather"] },
                    { range: [18, 20], items: ["Rotten Egg"] }
                ]
            }, count: 8
        },
        {
            card: {
                name: "Pig", type: "enemy", health: 3, maxHealth: 3, description: "A muddy pig", icon: "🐷", imageUrl: '/assets/farmlands-pig.png',
                attackTable: [
                    { range: [1, 3], action: 'miss', message: "Miss!" },
                    { range: [4, 15], action: 'attack', attackRange: 'melee', damage: 1, damageType: 'Physical', message: "Slam! Deals 1 Physical Damage!" },
                    { range: [16, 20], action: 'attack', attackRange: 'melee', damage: 2, damageType: 'Physical', message: "Headbutt! Deals 2 Physical Damage!" }
                ],
                guaranteedLoot: { items: ["Pork"] },
                lootTable: [
                    { range: [1, 10], items: [] },
                    { range: [11, 20], items: ["Animal Fat"] }
                ]
            }, count: 8
        },
        {
            card: {
                name: "Cow", type: "enemy", health: 4, maxHealth: 4, description: "A gentle cow", icon: "🐮", imageUrl: '/assets/farmlands-cow.png',
                attackTable: [
                    { range: [1, 3], action: 'miss', message: "Miss!" },
                    { range: [4, 15], action: 'attack', attackRange: 'melee', damage: 2, damageType: 'Physical', message: "Kick! Deals 2 Physical Damage!" },
                    { range: [16, 20], action: 'attack', attackRange: 'melee', damage: 2, damageType: 'Physical', debuff: { type: 'daze', duration: 2 }, message: "Press! Deals 2 Physical Damage and applies Daze!" }
                ],
                guaranteedLoot: { items: ["Cow Hide"] },
                lootTable: [
                    { range: [1, 10], items: ["Milk"] },
                    { range: [11, 20], items: ["Animal Fat"] }
                ]
            }, count: 8
        },
        {
            card: {
                name: "Angry Farmhand", type: "enemy", health: 4, maxHealth: 4, description: "An angry local. Wants you off his land.", icon: "🧑‍🌾", imageUrl: '/assets/farmlands-angryfarmhand.jpg',
                attackTable: [
                    { range: [1, 3], action: 'miss', message: "Miss!" },
                    { range: [4, 13], action: 'special', message: "The Farmhand weighs his options..." },
                    { range: [14, 20], action: 'attack', attackRange: 'melee', damage: 2, damageType: 'Fire', debuff: { type: 'burn', duration: 2, damage: 1, damageType: 'Fire' }, message: "Torch Throw! Deals 2 Fire Damage and Burns!" }
                ],
                guaranteedLoot: { gold: true, minGold: 1, maxGold: 3, items: ["Cloth"] },
                lootTable: [
                    { range: [1, 19], randomItems: { pool: ['Wheat', 'Carrot', 'Apple', 'Seeds'], count: 1 } },
                    { range: [20, 20], items: ["Pitchfork"] }
                ]
            }, count: 3
        },
        { card: { name: "Iron Node", type: "resource", skill: "mining", description: "Requires Mining Pickaxe (T1). Rare chance for gemstones.", lootPool: [{ name: "Iron" }, { name: "Iron" }, { name: "Iron" }, { name: "Iron" }, { name: "Tier 1 Gemstone" }], tool: "Mining Pickaxe (T1)", icon: "⛏️", imageUrl: '/assets/farmlands-ironnode.png' }, count: 6 },
        { card: { name: "Tree", type: "resource", skill: "woodcutting", description: "Requires Woodcutting Axe (T1)", loot: { name: "Wood", type: "material", price: 5 }, tool: "Woodcutting Axe (T1)", icon: "🌲", imageUrl: '/assets/farmlands-tree.png' }, count: 6 },
        { card: { name: "River", type: "resource", skill: "fishing", description: "Requires Fishing Rod (T1)", loot: { name: "Fish", type: "material", price: 5 }, tool: "Fishing Rod (T1)", icon: "🎣", imageUrl: '/assets/farmlands-river.png' }, count: 6 },
        { card: { name: "Crops", type: "resource", skill: "harvesting", description: "Requires Harvesting Sickle (T1)", lootPool: [{ name: "Wheat" }, { name: "Carrot" }, { name: "Hemp" }], tool: "Harvesting Sickle (T1)", icon: "🌾", imageUrl: '/assets/farmlands-crops.png' }, count: 5 },
    ],

    goblinCaves: [
        {
            card: {
                name: "Gorbon the Goblin King",
                type: "enemy",
                health: 30,
                maxHealth: 30,
                description: "The formidable king of the goblins.",
                icon: "👺",
                imageUrl: '/assets/goblincaves-gorbonking.png',
                attackTable: [
                    { range: [1, 3], action: 'miss', message: "The King stumbles on his royal robes. Miss!" },
                    { range: [4, 10], action: 'attack', attackRange: 'melee', damage: 4, damageType: 'Physical', message: "Royal Mace! Deals 4 Physical Damage!" },
                    { range: [11, 15], action: 'attack', attackRange: 'melee', damage: 5, damageType: 'Physical', debuff: { type: 'daze', duration: 2 }, message: "Crushing Blow! Deals 5 Physical Damage and Dazes!" },
                    { range: [16, 20], action: 'special', message: "FOR THE HORDE! Gorbon rallies his minions!" }
                ],
                guaranteedLoot: { gold: true, items: ["Gold Nugget", "Gold Nugget", "Gold Nugget"] },
                lootTable: [
                    { range: [1, 15], items: ["Gorbon's Crown"] },
                    { range: [16, 20], items: ["Gorbon's Royal Mace"] }
                ]
            }, count: 1
        },
        {
            card: {
                name: "Treasure Hunter",
                type: "npc",
                description: "A rugged-looking adventurer.",
                icon: "🕵️‍♂️",
                imageUrl: '/assets/goblincaves-treasurehunter.png',
                quests: [{ id: "LUCKY_CHARM_HUNT", title: "The Lucky Charm", turnInItems: { "Goblin Lucky Charm": 1 }, reward: { gold: 50, qp: 1, spellReward: { name: 'Stealth' } }, prerequisite: { qp: 2 } }],
                dialogue: {
                    LUCKY_CHARM_HUNT_start: { text: "You look like you've seen a thing or two. I'm after a rare trinket—a Goblin Lucky Charm. Find one for me, and I'll teach you a trick for staying out of sight.", options: [{ text: "I'll keep an eye out.", questId: "LUCKY_CHARM_HUNT", next: "LUCKY_CHARM_HUNT_inProgress" }, { text: "I have other priorities.", next: "farewell" }] },
                    LUCKY_CHARM_HUNT_inProgress: { text: "They say those charms are hidden away in old chests. Keep searching!", options: [{ text: "Will do.", next: "farewell" }] },
                    LUCKY_CHARM_HUNT_ready: { text: "Is that it? You found one! Amazing! A deal's a deal. Let me show you the art of stealth...", options: [{ text: "I'm ready to learn.", questComplete: "LUCKY_CHARM_HUNT", next: "allQuestsDone" }] },
                    allQuestsDone: { text: "Use that skill well. It's saved my skin more times than I can count.", options: [{ text: "Thank you.", next: "farewell" }] },
                    prereqNotMet: { text: "You're not quite ready for this task. Come back when you've proven yourself a bit more.", options: [{ text: "I understand.", next: "farewell" }] },
                    farewell: { text: "Happy hunting.", options: [] }
                }
            }, count: 1
        },
        { card: { name: "Treasure Chest", type: "treasure", description: "A locked chest. What could be inside?", loot: [{ name: "Goblin Lucky Charm", type: "questItem", price: 0, description: "A strange, surprisingly shiny goblin trinket." }], icon: "📦", imageUrl: '/assets/goblincaves-treasurechest.png' }, count: 1 },
        {
            card: {
                name: "Goblin Shaman",
                type: "enemy",
                health: 8,
                maxHealth: 8,
                description: "A mystical goblin shaman.",
                icon: "👺",
                imageUrl: '/assets/goblincaves-shaman.png',
                attackTable: [
                    { range: [1, 3], action: 'miss', message: "The Shaman's hex fizzles. Miss!" },
                    { range: [4, 12], action: 'attack', attackRange: 'ranged', damage: 3, damageType: 'Nature', message: "Hex! Deals 3 Nature Damage!" },
                    { range: [13, 17], action: 'attack', attackRange: 'ranged', damage: 2, damageType: 'Nature', debuff: { type: 'poison', duration: 2, damage: 1, damageType: 'Nature' }, message: "Toxic Curse! Deals 2 Nature Damage and Poisons!" },
                    { range: [18, 20], action: 'special', message: "The Shaman chants and heals an ally!" }
                ],
                guaranteedLoot: { gold: true },
                lootTable: [
                    { range: [1, 10], items: ["Goblin Head", "Magic Essence"] },
                    { range: [11, 16], items: ["Goblin Head", "Vines", "Magic Essence"] },
                    { range: [17, 19], items: ["Shaman's Fetish", "Magic Essence"] },
                    { range: [20, 20], items: ["Shaman's Fetish", "Magic Essence", "Old Family Recipe"] }
                ]
            }, count: 5
        },
        {
            card: {
                name: "Goblin Archer",
                type: "enemy",
                health: 8,
                maxHealth: 8,
                description: "A sneaky goblin archer.",
                icon: "👺",
                imageUrl: '/assets/goblincaves-archer.png',
                attackTable: [
                    { range: [1, 3], action: 'miss', message: "The arrow whizzes past. Miss!" },
                    { range: [4, 12], action: 'attack', attackRange: 'ranged', damage: 3, damageType: 'Physical', message: "Barbed Arrow! Deals 3 Physical Damage!" },
                    { range: [13, 17], action: 'attack', attackRange: 'ranged', damage: 2, damageType: 'Physical', debuff: { type: 'bleed', duration: 2, damage: 1, damageType: 'Physical' }, message: "Serrated Arrow! Deals 2 Physical Damage and causes Bleed!" },
                    { range: [18, 20], action: 'attack', attackRange: 'ranged', damage: 4, damageType: 'Physical', debuff: { type: 'trap', duration: 1 }, message: "Net Trap! Deals 4 Physical Damage and Traps you!" }
                ],
                guaranteedLoot: { gold: true },
                lootTable: [
                    { range: [1, 11], items: ["Goblin Head"] },
                    { range: [12, 17], items: ["Goblin Head", "Arrow Bundle"] },
                    { range: [18, 19], items: ["Archer's Shortbow"] },
                    { range: [20, 20], items: ["Archer's Shortbow", "Old Family Recipe"] }
                ]
            }, count: 6
        },
        {
            card: {
                name: "Goblin Warrior",
                type: "enemy",
                health: 10,
                maxHealth: 10,
                description: "A brutish goblin warrior.",
                icon: "👺",
                imageUrl: '/assets/goblincaves-warrior.png',
                attackTable: [
                    { range: [1, 3], action: 'miss', message: "The warrior swings wildly. Miss!" },
                    { range: [4, 12], action: 'attack', attackRange: 'melee', damage: 4, damageType: 'Physical', message: "Brutal Swing! Deals 4 Physical Damage!" },
                    { range: [13, 17], action: 'attack', attackRange: 'melee', damage: 3, damageType: 'Physical', debuff: { type: 'daze', duration: 2 }, message: "Headbutt! Deals 3 Physical Damage and Dazes!" },
                    { range: [18, 20], action: 'attack', attackRange: 'melee', damage: 5, damageType: 'Physical', message: "Overhead Smash! Deals 5 Physical Damage!" }
                ],
                guaranteedLoot: { gold: true },
                lootTable: [
                    { range: [1, 11], items: ["Goblin Head"] },
                    { range: [12, 17], items: ["Goblin Head", "Iron"] },
                    { range: [18, 19], items: ["Warrior's Cleaver"] },
                    { range: [20, 20], items: ["Warrior's Cleaver", "Old Family Recipe"] }
                ]
            }, count: 7
        },
        { card: { name: "Boulders", type: "resource", description: "A pile of impassable rocks.", charges: 0, icon: "🪨", imageUrl: '/assets/goblincaves-boulders.png' }, count: 8 },
        { card: { name: "Vines", type: "resource", skill: "woodcutting", description: "Requires Woodcutting Axe (T1)", loot: { name: "Vines", type: "material", price: 5 }, tool: "Woodcutting Axe (T1)", icon: "🌿", imageUrl: '/assets/goblincaves-vines.png' }, count: 6 },
        { card: { name: "Coal", type: "resource", skill: "mining", description: "Requires Mining Pickaxe (T1)", loot: { name: "Coal", type: "material", price: 5 }, tool: "Mining Pickaxe (T1)", icon: "⛏️" }, count: 6 },
    ],

    town: [
        {
            card: {
                name: "Knight",
                type: "npc",
                description: "A stoic knight in shining armor.",
                icon: "⚔️",
                imageUrl: '/assets/town-knight.jpg',
                quests: [
                    { id: "GOBLIN_MENACE", title: "Goblin Menace", target: "Goblin", required: 4, reward: { gold: 100, qp: 1 }, prerequisite: null },
                    { id: "SLAY_THE_KING", title: "Slay Their King!", target: "Gorbon the Goblin King", required: 1, reward: { gold: 100, qp: 1 }, prerequisite: "GOBLIN_MENACE" }
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
            }, count: 1
        },
        {
            card: {
                name: "Brother Thatch",
                type: "npc",
                description: "A bald monk in simple robes, tending a small garden.",
                icon: "🧘‍♂️",
                quests: [
                    { id: "MONK_FOCUS_QUEST", title: "A Test of Focus", turnInItems: { "Wheat": 3, "Fish": 3 }, reward: { spellReward: { name: "Monk's Training" } } }
                ],
                dialogue: {
                    MONK_FOCUS_QUEST_start: { text: "Greetings, traveler. The path to strength is not through the clash of steel alone, but through the quiet focus of the mind. What do you seek?", options: [{ text: "I seek strength. Can you teach me?", next: "MONK_FOCUS_QUEST_offer" }, { text: "Just passing through.", next: "farewell" }] },
                    MONK_FOCUS_QUEST_offer: { text: "Strength is a byproduct of discipline. True power is focus. If you wish to learn, you must first demonstrate patience. Bring me three bundles of wheat from the farmlands, and three fish from the river. Do this, and I will teach you a technique to channel your inner energy.", options: [{ text: "I will gather these things.", questId: "MONK_FOCUS_QUEST", next: "MONK_FOCUS_QUEST_inProgress" }, { text: "I don't have time for that.", next: "farewell" }] },
                    MONK_FOCUS_QUEST_inProgress: { text: "The river teaches patience, the fields teach diligence. Return when you have gathered the items.", options: [{ text: "I will return.", next: "farewell" }] },
                    MONK_FOCUS_QUEST_ready: { text: "You have returned, and with the requested items. You have shown patience and a focused spirit. Very well. Let me show you how to turn your own life force into a weapon, and a balm.", options: [{ text: "Thank you, master.", questComplete: "MONK_FOCUS_QUEST", next: "allQuestsDone" }] },
                    allQuestsDone: { text: "The technique is now yours. Practice it, and you will find strength not only in your fists, but in your spirit. Go well.", options: [{ text: "Farewell.", next: "farewell" }] },
                    farewell: { text: "May your path be clear.", options: [] }
                }
            }, count: 1
        },
        {
            card: {
                name: "Blacksmith",
                type: "npc",
                description: "A burly smith working at his forge. The heat is intense.",
                icon: "🔨",
                imageUrl: '/assets/town-blacksmith.jpg',
                quests: [
                    { id: "STEEL_ARMOR_QUEST", title: "Steel Armor Forging", turnInItems: { "Steel Bar": 3 }, reward: { gold: 50, qp: 1, recipeReward: "Steel Armor" }, prerequisite: null }
                ],
                dialogue: {
                    STEEL_ARMOR_QUEST_start: { text: "Hail, adventurer! I see you've got some steel on ya. If you can bring me three Steel Bars, I'll teach you the art of forging proper Steel Armor. It's tougher than iron, and it'll save your hide more than once.", options: [{ text: "I'll bring you the steel.", questId: "STEEL_ARMOR_QUEST", next: "STEEL_ARMOR_QUEST_inProgress" }, { text: "Maybe another time.", next: "farewell" }] },
                    STEEL_ARMOR_QUEST_inProgress: { text: "You'll need to smelt some Steel Bars from Iron and Coal. Come back when you've got three of 'em.", options: [{ text: "I'm working on it.", next: "farewell" }] },
                    STEEL_ARMOR_QUEST_ready: { text: "Excellent! This is fine steel. Watch closely now, and I'll show you how to forge armor that'll make the goblins weep. Here's a bit of gold for your trouble too.", options: [{ text: "Thank you, master smith.", questComplete: "STEEL_ARMOR_QUEST", next: "allQuestsDone" }] },
                    allQuestsDone: { text: "You've got the knowledge now. Go forge yourself some proper armor!", options: [{ text: "Farewell.", next: "farewell" }] },
                    farewell: { text: "Keep that blade sharp.", options: [] }
                }
            }, count: 1
        },
        {
            card: {
                name: "Fortune Teller",
                type: "npc",
                description: "A mysterious old woman peers into a glowing crystal ball.",
                icon: "🔮",
                imageUrl: '/assets/town-fortuneteller.jpg',
                quests: [
                    { id: "OLD_RECIPE_QUEST", title: "The Old Recipe", turnInItems: { "Old Family Recipe": 1 }, reward: { gold: 75, qp: 1, recipeReward: ["Gem of Strength", "Gem of Agility", "Gem of Wisdom", "Gem of Fortitude", "Gem of Fire", "Gem of Arcane", "Gem of Nature", "Gem of Might"] }, prerequisite: null }
                ],
                dialogue: {
                    OLD_RECIPE_QUEST_start: { text: "Ah, a seeker of secrets... I have foreseen your coming. I lost something precious long ago—a family recipe for imbuing gems with power. The goblins stole it generations past. If you find it, I will share the knowledge with you.", options: [{ text: "I'll search for your recipe.", questId: "OLD_RECIPE_QUEST", next: "OLD_RECIPE_QUEST_inProgress" }, { text: "I'm not interested in fortune telling.", next: "farewell" }] },
                    OLD_RECIPE_QUEST_inProgress: { text: "The recipe is hidden somewhere in the goblin caves. They guard it without knowing its value. Bring it to me, and I shall teach you the art of gem enchantment.", options: [{ text: "I'll keep looking.", next: "farewell" }] },
                    OLD_RECIPE_QUEST_ready: { text: "The spirits were right! You've found it! At last, my family's legacy returns. As promised, I shall teach you to craft enchanted gems. You'll need raw gemstones and magic essence from the shaman.", options: [{ text: "Thank you for the knowledge.", questComplete: "OLD_RECIPE_QUEST", next: "allQuestsDone" }] },
                    allQuestsDone: { text: "The gems you craft will enhance your armor with great power. Use this knowledge wisely, adventurer.", options: [{ text: "Farewell.", next: "farewell" }] },
                    farewell: { text: "The future is always in motion...", options: [] }
                }
            }, count: 1
        },
        {
            card: {
                name: "Mugger", type: "enemy", health: 6, maxHealth: 6, description: "A shady figure eyes your coin purse.", icon: "👤", imageUrl: '/assets/town-mugger.jpg',
                attackTable: [
                    { range: [1, 5], action: 'miss', message: "Miss!" },
                    { range: [6, 15], action: 'attack', attackRange: 'melee', damage: 3, damageType: 'Physical', debuff: { type: 'bleed', duration: 2, damage: 1, damageType: 'Physical' }, message: "Stab! Deals 3 Physical Damage and Bleed!" },
                    { range: [16, 20], action: 'attack', attackRange: 'melee', damage: 3, damageType: 'Physical', debuff: { type: 'bleed', duration: 2, damage: 1, damageType: 'Physical' }, message: "Slash! Deals 3 Physical Damage and Bleed!" }
                ],
                guaranteedLoot: { gold: true, minGold: 5, maxGold: 25 },
                lootTable: [
                    { range: [1, 10], items: [] },
                    { range: [11, 20], items: ["Mugger's Knife"] }
                ]
            }, count: 1
        },
        { card: { name: "Townsfolk", type: "npc", description: "A local man enjoying the day.", icon: "🧑", imageUrl: '/assets/town-citizen-m.jpg' }, count: 4 },
        { card: { name: "Townsfolk", type: "npc", description: "A local woman enjoying the day.", icon: "👩", imageUrl: '/assets/town-citizen-f.jpg' }, count: 4 },
        { card: { name: "Sewer Grate", type: "treasure", description: "A dark opening leading down to the sewers.", icon: "🕳️", imageUrl: '/assets/town-sewer-grate.jpg', loot: [{ name: "Rat Tail", type: "material", price: 1 }] }, count: 1 },

    ],

    sewers: [
        {
            card: {
                name: "Sewer Rat", type: "enemy", health: 6, maxHealth: 6, icon: "🐀",
                imageUrl: '/assets/sewer-rat.jpg',
                attackTable: [
                    { range: [1, 8], action: 'miss', message: "Miss!" },
                    { range: [9, 20], action: 'attack', attackRange: 'melee', damage: 2, damageType: 'Physical', message: "Bite! Deals 2 Physical Damage!" }
                ],
                lootTable: [
                    { range: [1, 10], items: ["Rat Meat"] },
                    { range: [11, 18], items: ["Rat Tail"] },
                    { range: [19, 20], items: ["Rat Eye"] }
                ]
            }, count: 10
        },
        {
            card: {
                name: "Plague Rat", type: "enemy", health: 10, maxHealth: 10, icon: "🐀",
                imageUrl: '/assets/plague-rat.jpg',
                attackTable: [
                    { range: [1, 8], action: 'miss', message: "Miss!" },
                    { range: [9, 16], action: 'attack', attackRange: 'melee', damage: 3, damageType: 'Physical', message: "Maul! Deals 3 Physical Damage!" },
                    { range: [17, 20], action: 'attack', attackRange: 'melee', damage: 2, damageType: 'Nature', debuff: { type: 'poison', duration: 2, damage: 1, damageType: 'Nature' }, message: "Infectious Bite! Deals 2 Nature Damage and Poisons!" }
                ],
                lootTable: [
                    { range: [1, 10], items: ["Rat Meat", "Rat Eye"] },
                    { range: [11, 18], items: ["Rat Tail"] },
                    { range: [19, 20], items: ["Plague Essence"] }
                ]
            }, count: 5
        },
        {
            card: {
                name: "The Rat King", type: "enemy", health: 30, maxHealth: 30, description: "A horrifying amalgamation of rats.", icon: "👑",
                imageUrl: '/assets/rat-king.jpg',
                attackTable: [
                    { range: [1, 5], action: 'miss', message: "Miss!" },
                    { range: [6, 10], action: 'attack', attackRange: 'melee', damage: 3, damageType: 'Physical', message: "Gnaw! Deals 3 Physical Damage!" },
                    { range: [11, 15], action: 'attack', attackRange: 'melee', damage: 2, damageType: 'Physical', debuff: { type: 'poison', duration: 3, damage: 2, damageType: 'Nature' }, message: "Diseased Bite! Deals 2 Physical Damage and Poisons you!" },
                    { range: [16, 20], action: 'special', message: "The Rat King shrieks and another rat appears!" }
                ],
                guaranteedLoot: { gold: true, items: ["Rat Tail Cloak"] },
                lootTable: [
                    { range: [1, 15], items: ["Rat Tail", "Plague Essence"] },
                    { range: [16, 20], items: ["Rat King's Crown"] }
                ]
            }, count: 1
        },
    ],

    arena: [
        {
            card: {
                name: "Pulvis Cadus", type: "enemy", health: 40, maxHealth: 40, description: "A master of strange concoctions and explosives.", icon: "⚗️",
                imageUrl: '/assets/arena-pulvis.jpg',
                bonuses: { fireResistance: 2, physicalResistance: 2 },
                arenaReward: 100,
                attackTable: [
                    { range: [1, 3], action: 'miss', message: "Miss!" },
                    { range: [4, 7], action: 'attack', attackRange: 'ranged', damage: 5, damageType: 'Fire', message: "Bomb Toss! Deals 5 Fire Damage!" },
                    { range: [8, 12], action: 'attack', attackRange: 'ranged', damage: 5, damageType: 'Arcane', debuff: { type: 'daze', duration: 2 }, message: "Flash Bang! Deals 5 Arcane Damage and Dazes you!" },
                    { range: [13, 15], action: 'special', message: "A Quick Fix! Pulvis Cadus heals and repairs his chassis." },
                    { range: [16, 20], action: 'special', message: "Pulvis Cadus throws out some unstable kegs!" }
                ],
                lootTable: [
                    { range: [1, 10], recipe: "Powder Keg" },
                    { range: [11, 20], items: ["Magna Clavis"] }
                ]
            }, count: 1
        },
        {
            card: {
                name: "Vexor, Lord of the Arena", type: "enemy", health: 40, maxHealth: 40, description: "The brutal champion of the arena.", icon: "🛡️",
                imageUrl: '/assets/arena-vexor.jpg',
                bonuses: { physicalResistance: 1 },
                arenaReward: 100,
                attackTable: [
                    { range: [1, 3], action: 'miss', message: "Miss!" },
                    { range: [4, 8], action: 'special', message: "Vexor swings his massive axe at the biggest threat!" },
                    { range: [9, 12], action: 'special', message: "Vexor bashes the weakest foe with his shield!" },
                    { range: [13, 16], action: 'special', message: "Vexor catches his breath and taunts his enemies!" },
                    { range: [17, 20], action: 'special', message: "Whirlwind! Vexor spins wildly, hitting everyone!" }
                ],
                lootTable: [
                    { range: [1, 20], items: ["Champion's Belt"] } // Placeholder loot
                ]
            }, count: 1
        },
    ],

    // --- NEW: PvP Zone Card Pool ---
    blighted_wastes: [
        {
            card: {
                name: "Wary Scout",
                type: "npc",
                description: "'Be careful out there. This land is cursed, and its guardians aren't the only thing you have to worry about.'",
                icon: "🤠",
            }, count: 1
        },
        {
            card: {
                name: "Doomsayer",
                type: "npc",
                description: "'They come seeking treasure, but all they find is their own greed... and the end of their journey.'",
                icon: "🔮",
            }, count: 1
        },
        {
            card: {
                name: "Ashfang Stalker", type: "enemy", health: 18, maxHealth: 18, description: "A shadowy beast that moves through the ash.", icon: "🐺",
                attackTable: [
                    { range: [1, 5], action: 'miss', message: "Misses!" },
                    { range: [6, 15], action: 'attack', attackRange: 'melee', damage: 4, damageType: 'Physical', message: "Claw! Deals 4 Physical Damage!" },
                    { range: [16, 20], action: 'attack', attackRange: 'melee', damage: 3, damageType: 'Physical', debuff: { type: 'bleed', duration: 3, damage: 2, damageType: 'Physical' }, message: "Hamstring! Deals 3 Physical Damage and applies a heavy Bleed!" }
                ],
                lootTable: [{ range: [1, 20], randomItems: { pool: ['Drake Scale', 'Obsidian Chunk'], count: 1 } }]
            }, count: 6
        },
        {
            card: {
                name: "Cinderhulk", type: "enemy", health: 25, maxHealth: 25, description: "A hulking elemental of magma and rock.", icon: "👹",
                attackTable: [
                    { range: [1, 5], action: 'miss', message: "Misses!" },
                    { range: [6, 15], action: 'attack', attackRange: 'melee', damage: 5, damageType: 'Physical', message: "Slam! Deals 5 Physical Damage!" },
                    { range: [16, 20], action: 'attack', attackRange: 'melee', damage: 4, damageType: 'Fire', debuff: { type: 'burn', duration: 2, damage: 2, damageType: 'Fire' }, message: "Immolate! Deals 4 Fire Damage and applies Burn!" }
                ],
                lootTable: [{ range: [1, 20], items: ["Obsidian Chunk", "Obsidian Chunk"] }]
            }, count: 4
        },
        {
            card: {
                name: "Lava Drake", type: "enemy", health: 22, maxHealth: 22, description: "A lesser drake that breathes searing flames.", icon: "🐲",
                attackTable: [
                    { range: [1, 5], action: 'miss', message: "Misses!" },
                    { range: [6, 15], action: 'attack', attackRange: 'ranged', damage: 6, damageType: 'Fire', message: "Fire Breath! Deals 6 Fire Damage!" },
                    { range: [16, 20], action: 'special', attackRange: 'melee', message: "Tail Swipe! Hits all party members for 3 damage!" }
                ],
                lootTable: [{ range: [1, 20], items: ["Drake Scale", "Drake Scale"] }]
            }, count: 2
        },
        { card: { name: "Obsidian Vein", type: "resource", skill: "mining", description: "Requires Mining Pickaxe (T2)", loot: { name: "Obsidian Chunk" }, tool: "Steel Pickaxe (T2)", icon: "💎" }, count: 5 },
        { card: { name: "Ashenwood Tree", type: "resource", skill: "woodcutting", description: "Requires Woodcutting Axe (T2)", loot: { name: "Ashenwood Log" }, tool: "Steel Axe (T2)", icon: "🌳" }, count: 5 },
        { card: { name: "Rare Treasure", type: "treasure", description: "A heavily locked chest.", icon: "👑" }, count: 2 },
    ],
};

export const specialCards = {
    powderKeg: {
        name: "Powder Keg", type: "enemy", health: 4, maxHealth: 4, description: "It's fizzing ominously.", charges: 0, icon: "💣",
        attackTable: [
            { range: [1, 20], action: 'special', message: "The Powder Keg fizzes..." }
        ]
    },
    lootGoblin: {
        name: "Loot Goblin",
        type: "enemy",
        health: 6,
        maxHealth: 6,
        tier: 1,
        description: "A greedy goblin carrying a massive sack of loot!",
        icon: "💰",
        imageUrl: '/assets/loot-goblin.jpg',
        stolenGold: 0,
        attackTable: [
            { range: [1, 10], action: 'special', message: "The Loot Goblin dances around, taunting you!" },
            { range: [11, 15], action: 'special', message: "Pickpocket! The goblin quickly snatches some of your gold!" },
            { range: [16, 20], action: 'special', message: "The Loot Goblin opens a portal and escapes!" }
        ]
    },
    stoneColumn: {
        name: "Stone Column",
        type: "enemy",
        health: 8,
        maxHealth: 8,
        description: "A sturdy stone column. Vexor uses these for cover.",
        icon: "🏛️",
        imageUrl: '/assets/arena-column.jpg',
        isTargetable: true,
        attackTable: [
            { range: [1, 20], action: 'miss', message: "The column stands firm." }
        ]
    }
};