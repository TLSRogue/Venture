// /data/cards.js
export const cardPools = {
    farmlands: [
        {
            card: {
                name: "Raging Bull",
                type: "enemy",
                isBoss: true,
                health: 15,
                maxHealth: 15,
                description: "An enraged bull, kicking up dust.",
                icon: "🐂",
                imageUrl: '/assets/farmlands-ragingbull.jpg',
                attackTable: [
                    { range: [1, 3], action: 'miss', message: "The bull snorts and misses!" },
                    { range: [4, 12], action: 'attack', attackRange: 'melee', damage: 3, damageType: 'Physical', message: "Charge! Deals 3 Physical Damage!" },
                    { range: [13, 20], action: 'special', message: "Thick Hide! Gain 1 Physical Resistance until the next Zone Turn then make another action!" }
                ],
                guaranteedLoot: { items: ["Bull Horn", "Cow Hide"] },
                lootTable: [
                    { range: [1, 10], items: ["Cow Hide"] },
                    { range: [11, 15], items: ["Cow Hide", "Animal Fat"] },
                    { range: [16, 19], items: ["Cow Hide", "Animal Fat", "Cow Hide"] },
                    { range: [20, 20], items: ["Cow Hide", "Animal Fat", "Cow Hide", "Bull Horn"] }
                ]
            }, count: 1
        },
        {
            card: {
                name: "Farmer",
                type: "npc",
                description: "A friendly farmer.",
                icon: "👨‍🌾",
                imageUrl: '/assets/farmlands-farmer.jpg',
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
                imageUrl: '/assets/farmlands-farmerswife.jpg',
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
        { card: { name: "Treasure Chest", type: "treasure", description: "A locked chest. What could be inside?", loot: [{ name: "Wizard's Staff Recipe (T1)", type: "recipe", rarity: "uncommon" }, { name: "Gold Pouch", quantity: 1 }, { name: "Healing Potion" }], lootCount: 2, icon: "📦", imageUrl: '/assets/farmlands-treasurechest.jpg' }, count: 1 },
        {
            card: {
                name: "Chicken", type: "enemy", health: 2, maxHealth: 2, description: "A feisty farm chicken", icon: "🐔", imageUrl: '/assets/farmlands-chicken.jpg',
                attackTable: [
                    { range: [1, 3], action: 'miss', message: "Miss!" },
                    { range: [4, 15], action: 'attack', attackRange: 'melee', damage: 1, damageType: 'Physical', message: "Peck! Deals 1 Physical Damage!" },
                    { range: [16, 20], action: 'attack', attackRange: 'melee', damage: 2, damageType: 'Physical', message: "Eye Gouge! Deals 2 Physical Damage!" }
                ],
                guaranteedLoot: { items: ["Raw Chicken"] },
                lootTable: [
                    { range: [1, 10], items: ["Feather"] },
                    { range: [11, 15], items: ["Feather", "Egg"] },
                    { range: [16, 19], items: ["Feather", "Egg", "Egg"] },
                    { range: [20, 20], items: ["Feather", "Egg", "Rotten Egg"] }
                ]
            }, count: 8
        },
        {
            card: {
                name: "Pig", type: "enemy", health: 3, maxHealth: 3, description: "A muddy pig", icon: "🐷", imageUrl: '/assets/farmlands-pig.jpg',
                attackTable: [
                    { range: [1, 3], action: 'miss', message: "Miss!" },
                    { range: [4, 15], action: 'attack', attackRange: 'melee', damage: 1, damageType: 'Physical', message: "Slam! Deals 1 Physical Damage!" },
                    { range: [16, 20], action: 'attack', attackRange: 'melee', damage: 2, damageType: 'Physical', message: "Headbutt! Deals 2 Physical Damage!" }
                ],
                guaranteedLoot: { items: ["Pork"] },
                lootTable: [
                    { range: [1, 10], items: ["Animal Fat"] },
                    { range: [11, 15], items: ["Animal Fat", "Pork"] },
                    { range: [16, 19], items: ["Animal Fat", "Pork", "Animal Fat"] },
                    { range: [20, 20], items: ["Pork", "Pork", "Animal Fat", "Animal Fat"] }
                ]
            }, count: 8
        },
        {
            card: {
                name: "Cow", type: "enemy", health: 4, maxHealth: 4, description: "A gentle cow", icon: "🐮", imageUrl: '/assets/farmlands-cow.jpg',
                attackTable: [
                    { range: [1, 3], action: 'miss', message: "Miss!" },
                    { range: [4, 15], action: 'attack', attackRange: 'melee', damage: 2, damageType: 'Physical', message: "Kick! Deals 2 Physical Damage!" },
                    { range: [16, 20], action: 'attack', attackRange: 'melee', damage: 2, damageType: 'Physical', debuff: { type: 'daze', duration: 2 }, message: "Press! Deals 2 Physical Damage and applies Daze!" }
                ],
                guaranteedLoot: { items: ["Cow Hide"] },
                lootTable: [
                    { range: [1, 10], items: ["Milk"] },
                    { range: [11, 15], items: ["Milk", "Animal Fat"] },
                    { range: [16, 19], items: ["Milk", "Animal Fat", "Cow Hide"] },
                    { range: [20, 20], items: ["Cow Hide", "Cow Hide", "Milk", "Animal Fat"] }
                ]
            }, count: 8
        },
        {
            card: {
                name: "Angry Farmhand", type: "enemy", health: 4, maxHealth: 4, description: "An angry local. Wants you off his land.", icon: "🧑‍🌾", imageUrl: '/assets/farmlands-angryfarmhand.jpg',
                attackTable: [
                    { range: [1, 3], action: 'miss', message: "Miss!" },
                    { range: [4, 6], action: 'special', message: "The Farmhand weighs his options..." },
                    { range: [7, 13], action: 'attack', attackRange: 'melee', damage: 2, damageType: 'Physical', debuff: { type: 'bleed', duration: 2, damage: 1, damageType: 'Physical' }, message: "Pitchfork Jab! Deals 2 Physical Damage and Bleeds!" },
                    { range: [14, 20], action: 'attack', attackRange: 'melee', damage: 2, damageType: 'Fire', debuff: { type: 'burn', duration: 2, damage: 1, damageType: 'Fire' }, message: "Torch Throw! Deals 2 Fire Damage and Burns!" }
                ],
                guaranteedLoot: { items: ["Cloth"] },
                lootTable: [
                    { range: [1, 10], gold: { min: 1, max: 5 }, randomItems: { pool: ['Wheat', 'Carrot', 'Apple', 'Seeds'], count: 1 } },
                    { range: [11, 15], gold: { min: 2, max: 8 }, items: ["Thread"] },
                    { range: [16, 19], gold: { min: 3, max: 10 }, items: ["Thread", "Wizard's Staff Recipe (T1)"] },
                    { range: [20, 20], gold: { min: 5, max: 15 }, items: ["Thread", "Pitchfork"] }
                ]
            }, count: 3
        },
        { card: { name: "Iron Node", type: "resource", skill: "mining", description: "Requires Mining Tool (T1). Rare chance for gemstones.", lootPool: [{ name: "Iron" }, { name: "Iron" }, { name: "Iron" }, { name: "Iron" }, { name: "Tier 1 Gemstone" }], toolType: "mining", toolTier: 1, charges: 3, icon: "⛏️", imageUrl: '/assets/farmlands-ironnode.jpg' }, count: 6 },
        { card: { name: "Tree", type: "resource", skill: "woodcutting", description: "Requires Woodcutting Tool (T1)", loot: { name: "Wood", type: "material", price: 5 }, toolType: "woodcutting", toolTier: 1, charges: 3, icon: "🌲", imageUrl: '/assets/farmlands-tree.jpg' }, count: 6 },
        { card: { name: "River", type: "resource", skill: "fishing", description: "Requires Fishing Tool (T1)", loot: { name: "Fish", type: "material", price: 5 }, toolType: "fishing", toolTier: 1, charges: 3, icon: "🎣", imageUrl: '/assets/farmlands-river.jpg' }, count: 6 },
        { card: { name: "Crops", type: "resource", skill: "harvesting", description: "Requires Harvesting Tool (T1)", lootPool: [{ name: "Wheat" }, { name: "Carrot" }, { name: "Hemp" }], toolType: "harvesting", toolTier: 1, charges: 3, icon: "🌾", imageUrl: '/assets/farmlands-crops.jpg' }, count: 5 },
        {
            card: {
                name: "Chicken Coop",
                type: "interaction",
                description: "A rustic chicken coop. Something's moving inside...",
                icon: "🏠",
                imageUrl: '/assets/farmlands-chickencoop.jpg',
                interactionCost: 1,
                spawnsEnemy: "angryRooster"
            }, count: 1
        },
        { card: { name: "Farmlands", type: "area", description: "Open farmland stretching to the horizon.", icon: "🌾", imageUrl: '/assets/farmlands-area.jpg', allowSpawnOver: true }, count: 3 },
    ],

    theDocks: [
        {
            card: {
                name: "Blacktide Ship",
                type: "npc",
                description: "A weathered vessel bound for Blacktide Island.",
                icon: "⛵",
                imageUrl: '/assets/blacktide_ship.jpg',
                dialogue: {
                    default: {
                        text: "We are going to Blacktide - if you want to go you will need a ticket!",
                        options: [
                            { text: "Use Boat Ticket", action: "useBoatTicket", next: "success" },
                            { text: "Bribe the Captain (1000G)", action: "bribeCaptain", next: "success" },
                            { text: "Try to Sneak Aboard", action: "sneakAboard", next: "sneakResult" },
                            { text: "Nevermind", next: "farewell" }
                        ]
                    },
                    success: {
                        text: "Welcome aboard! ...Actually, we're not quite ready to set sail yet. Check back later!",
                        options: [{ text: "Understood", next: "farewell" }]
                    },
                    sneakResult: {
                        text: "The captain catches you trying to sneak aboard! 'Get out of here, stowaway!' You are banned from the docks for 10 minutes!",
                        options: [{ text: "Fine...", action: "kickFromDocks", next: "farewell" }]
                    },
                    farewell: { text: "Safe travels.", options: [] }
                }
            }, count: 1
        },
        { card: { name: "Docks", type: "area", description: "Wooden planks stretching over the water.", icon: "🚢", imageUrl: '/assets/docks.jpg', allowSpawnOver: false }, count: 2 },
    ],

    goblinCaves: [
        {
            card: {
                name: "Gorbon the Goblin King",
                type: "enemy",
                isBoss: true,
                health: 30,
                maxHealth: 30,
                description: "The formidable king of the goblins.",
                icon: "👺",
                imageUrl: '/assets/goblincaves-king.jpg',
                physicalResistance: 1,
                attackTable: [
                    { range: [1, 3], action: 'miss', message: "The King stumbles on his royal robes. Miss!" },
                    { range: [4, 10], action: 'attack', attackRange: 'melee', damage: 4, damageType: 'Physical', message: "Royal Mace! Deals 4 Physical Damage!" },
                    { range: [11, 15], action: 'attack', attackRange: 'melee', damage: 5, damageType: 'Physical', debuff: { type: 'daze', duration: 2 }, message: "Crushing Blow! Deals 5 Physical Damage and Dazes!" },
                    { range: [16, 20], action: 'special', message: "FOR THE HORDE! Gorbon rallies his minions!" }
                ],
                reactions: [
                    {
                        name: "Block",
                        cooldown: 2,
                        triggerOn: ["melee", "magic"],
                        roll: 11,
                        blockAmount: 4,
                        message: "Gorbon braces and blocks the attack!"
                    }
                ],
                guaranteedLoot: { gold: { min: 10, max: 30 }, items: ["Gold Nugget", "Gold Nugget"] },
                lootTable: [
                    { range: [1, 10], items: ["Gold Nugget", "Gorbon's Crown"] },
                    { range: [11, 15], items: ["Gold Nugget", "Gold Nugget", "Gorbon's Crown"] },
                    { range: [16, 19], items: ["Gold Nugget", "Gold Nugget", "Gorbon's Royal Mace"] },
                    { range: [20, 20], items: ["Gold Nugget", "Gold Nugget", "Gold Nugget", "Gorbon's Royal Mace", "Gorbon's Crown"] }
                ]
            }, count: 1
        },
        {
            card: {
                name: "Treasure Hunter",
                type: "npc",
                description: "A rugged-looking adventurer.",
                icon: "🕵️‍♂️",
                imageUrl: '/assets/goblincaves-treasurehunter.jpg',
                quests: [{ id: "LUCKY_CHARM_HUNT", title: "The Lucky Charm", turnInItems: { "Goblin Lucky Charm": 1 }, reward: { gold: 50, qp: 1 }, prerequisite: { qp: 2 } }],
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
        { card: { name: "Treasure Chest", type: "treasure", description: "A locked chest. What could be inside?", loot: [{ name: "Goblin Lucky Charm", type: "questItem", price: 0, description: "A strange, surprisingly shiny goblin trinket." }, { name: "Gold Pouch" }, { name: "Healing Potion" }, { name: "Whetstone" }, { name: "Thread" }, { name: "Iron" }, { name: "Coal" }], lootCount: 3, icon: "📦", imageUrl: '/assets/goblincaves-treasure.jpg' }, count: 1 },
        {
            card: {
                name: "Goblin Shaman",
                type: "enemy",
                health: 8,
                maxHealth: 8,
                description: "A mystical goblin shaman.",
                icon: "👺",
                imageUrl: '/assets/goblincaves-shaman.jpg',
                attackTable: [
                    { range: [1, 3], action: 'miss', message: "The Shaman's hex fizzles. Miss!" },
                    { range: [4, 12], action: 'attack', attackRange: 'ranged', isMagic: true, damage: 3, damageType: 'Nature', message: "Hex! Deals 3 Nature Damage!" },
                    { range: [13, 17], action: 'attack', attackRange: 'ranged', isMagic: true, damage: 2, damageType: 'Nature', debuff: { type: 'poison', duration: 2, damage: 1, damageType: 'Nature' }, message: "Toxic Curse! Deals 2 Nature Damage and Poisons!" },
                    { range: [18, 20], action: 'special', isMagic: true, message: "The Shaman chants and heals an ally!" }
                ],
                reactions: [
                    {
                        name: "Hex Ward",
                        cooldown: 2,
                        triggerOn: "magic",
                        roll: 11,
                        blockAmount: 3,
                        message: "The Shaman's ward absorbs the magic!"
                    }
                ],
                guaranteedLoot: { gold: { min: 1, max: 20 } },
                lootTable: [
                    { range: [1, 10], fromCategory: "T1 Material" },
                    { range: [11, 15], fromCategories: ["T1 Weapon", "T1 Equipment"] },
                    { range: [16, 19], items: ["Thread", "Magic Essence"] },
                    { range: [20, 20], items: ["Shaman's Fetish", "Magic Essence"] }
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
                imageUrl: '/assets/goblincaves-archer.jpg',
                attackTable: [
                    { range: [1, 3], action: 'miss', message: "The arrow whizzes past. Miss!" },
                    { range: [4, 12], action: 'attack', attackRange: 'ranged', damage: 3, damageType: 'Physical', message: "Barbed Arrow! Deals 3 Physical Damage!" },
                    { range: [13, 17], action: 'attack', attackRange: 'ranged', damage: 2, damageType: 'Physical', debuff: { type: 'bleed', duration: 2, damage: 1, damageType: 'Physical' }, message: "Serrated Arrow! Deals 2 Physical Damage and causes Bleed!" },
                    { range: [18, 20], action: 'attack', attackRange: 'ranged', damage: 4, damageType: 'Physical', debuff: { type: 'trap', duration: 1 }, message: "Net Trap! Deals 4 Physical Damage and Traps you!" }
                ],
                reactions: [
                    {
                        name: "Evasive Shot",
                        cooldown: 2,
                        triggerOn: ["melee", "ranged"],
                        roll: 11,
                        damage: 3,
                        damageType: "Physical",
                        message: "The Archer dodges and fires a quick shot!"
                    }
                ],
                guaranteedLoot: { gold: { min: 1, max: 20 } },
                lootTable: [
                    { range: [1, 10], fromCategory: "T1 Material" },
                    { range: [11, 15], fromCategories: ["T1 Weapon", "T1 Equipment"] },
                    { range: [16, 19], items: ["Thread", "Feather"] },
                    { range: [20, 20], items: ["Archer's Shortbow", "Feather"] }
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
                imageUrl: '/assets/goblincaves-warrior.jpg',
                attackTable: [
                    { range: [1, 3], action: 'miss', message: "The warrior swings wildly. Miss!" },
                    { range: [4, 12], action: 'attack', attackRange: 'melee', damage: 4, damageType: 'Physical', message: "Brutal Swing! Deals 4 Physical Damage!" },
                    { range: [13, 17], action: 'attack', attackRange: 'melee', damage: 3, damageType: 'Physical', debuff: { type: 'daze', duration: 2 }, message: "Headbutt! Deals 3 Physical Damage and Dazes!" },
                    { range: [18, 20], action: 'attack', attackRange: 'melee', damage: 5, damageType: 'Physical', message: "Overhead Smash! Deals 5 Physical Damage!" }
                ],
                reactions: [
                    {
                        name: "Parry",
                        cooldown: 2,
                        triggerOn: "melee",  // Only triggers against melee attacks
                        roll: 11,            // Success on D20 roll of 11+
                        damage: 3,
                        damageType: "Physical",
                        message: "The Goblin Warrior parries and counter-attacks!"
                    }
                ],
                guaranteedLoot: { gold: { min: 1, max: 20 } },
                lootTable: [
                    { range: [1, 10], fromCategory: "T1 Material" },
                    { range: [11, 15], fromCategories: ["T1 Weapon", "T1 Equipment"] },
                    { range: [16, 19], items: ["Thread", "Whetstone"] },
                    { range: [20, 20], items: ["Warrior's Cleaver", "Whetstone"] }
                ]
            }, count: 7
        },
        { card: { name: "Boulders", type: "resource", skill: "mining", description: "Requires Mining Tool (T1). Something might be lurking behind...", loot: { name: "Rocks", type: "material", price: 5 }, toolType: "mining", toolTier: 1, charges: 3, icon: "🪨", imageUrl: '/assets/goblincaves-boulder.jpg', onDepletedSpawn: true }, count: 8 },
        { card: { name: "Vines", type: "resource", skill: "woodcutting", description: "Requires Woodcutting Tool (T1)", loot: { name: "Vines", type: "material", price: 5 }, toolType: "woodcutting", toolTier: 1, charges: 3, icon: "🌿", imageUrl: '/assets/goblincaves-vines.jpg' }, count: 6 },
        { card: { name: "Coal", type: "resource", skill: "mining", description: "Requires Mining Tool (T1)", loot: { name: "Coal", type: "material", price: 5 }, toolType: "mining", toolTier: 1, charges: 3, icon: "⛏️", imageUrl: '/assets/goblincaves-coal.jpg' }, count: 6 },
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
                imageUrl: '/assets/town-brotherthatch.jpg',
                quests: [
                    { id: "MONK_FOCUS_QUEST", title: "A Test of Focus", turnInItems: { "Wheat": 3, "Fish": 3 }, reward: { gold: 50, qp: 1 } }
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
                    { id: "STEEL_ARMOR_QUEST", title: "Steel Armor Forging", turnInItems: { "Steel Bar": 3 }, reward: { gold: 50, qp: 1, recipeReward: ["Steel Armor", "Steel Helm (T2)", "Steel Boots (T2)"] }, prerequisite: null }
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
                    { id: "OLD_RECIPE_QUEST", title: "The Old Recipe", turnInItems: { "Old Family Recipe": 1 }, reward: { gold: 75, qp: 1, recipeReward: ["Gem of Strength", "Gem of Agility", "Gem of Wisdom", "Gem of Fortitude", "Gem of Fire", "Gem of Arcane", "Gem of Nature", "Gem of Might", "Gem of Frost", "Gem of Holy", "Gem of Shadow"] }, prerequisite: null }
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
                guaranteedLoot: { gold: { min: 5, max: 15 } },
                lootTable: [
                    { range: [1, 10], items: ["Thread"] },
                    { range: [11, 15], gold: { min: 5, max: 15 }, items: ["Thread"] },
                    { range: [16, 19], gold: { min: 10, max: 20 }, items: ["Thread", "Mugger's Knife"] },
                    { range: [20, 20], gold: { min: 15, max: 30 }, items: ["Mugger's Knife"] }
                ]
            }, count: 1
        },
        { card: { name: "Townsfolk", type: "npc", description: "A local man enjoying the day.", icon: "🧑", imageUrl: '/assets/town-citizen-m.jpg' }, count: 4 },
        { card: { name: "Townsfolk", type: "npc", description: "A local woman enjoying the day.", icon: "👩", imageUrl: '/assets/town-citizen-f.jpg' }, count: 4 },
        { card: { name: "Sewer Grate", type: "treasure", description: "A dark opening leading down to the sewers.", icon: "🕳️", imageUrl: '/assets/town-sewer-grate.jpg', loot: [{ name: "Rat Tail", type: "material", price: 1 }] }, count: 1 },
        {
            card: {
                name: "Vagrant",
                type: "npc",
                description: "A disheveled man reeking of cheap ale, muttering to himself.",
                icon: "🧔",
                imageUrl: '/assets/town-vagrant.jpg',
                quests: [
                    { id: "RAT_KING_CROWN", title: "The True King", turnInItems: { "Rat King's Crown": 1 }, reward: { qp: 1 }, prerequisite: null }
                ],
                dialogue: {
                    RAT_KING_CROWN_start: { text: "*hic* Youuu don't undershtand... I'M the Rat King! ME! They shtole my crown... thosse filthy ratss... *burp* ...took everythin' from me...", options: [{ text: "You... were the Rat King?", next: "RAT_KING_CROWN_explain" }, { text: "You're just a drunk.", next: "farewell" }] },
                    RAT_KING_CROWN_explain: { text: "*hic* I ruled the sewersss... the KING of all ratss! But they... they betrayed me... took my crown... left me to ROT up here... *sob* ...bring me my crown... prove I'm not crazyyy...", options: [{ text: "I'll look for your crown.", questId: "RAT_KING_CROWN", next: "RAT_KING_CROWN_inProgress" }, { text: "Get some sleep, friend.", next: "farewell" }] },
                    RAT_KING_CROWN_inProgress: { text: "*hic* My crown... my beautifulll crown... the ratss wear it now... mocking meee... *mumbles incoherently*", options: [{ text: "I'm still looking.", next: "farewell" }] },
                    RAT_KING_CROWN_ready: { text: "*eyes widen* Isss that... MY CROWN?! *grabs it, inspects it* Wait... I can't drink outta thiss! *throws it away* Uselesss! ...but thank you, shtranger... now I know... I know I washn't dreaming... *passes out*", options: [{ text: "...Okay then.", questComplete: "RAT_KING_CROWN", next: "allQuestsDone" }] },
                    allQuestsDone: { text: "*snoring loudly* ...zzz... my kingdom... zzz...", options: [{ text: "Let him sleep.", next: "farewell" }] },
                    farewell: { text: "*mumbles and stares blankly*", options: [] }
                }
            }, count: 1
        },
        {
            card: {
                name: "Fletcher",
                type: "npc",
                description: "A skilled craftsman who makes arrows and other sharp implements.",
                icon: "🏹",
                imageUrl: '/assets/town-fletcher.jpg',
                quests: [
                    { id: "RANGER_SET_QUEST", title: "Ranger's Training", turnInItems: { "Leather": 3 }, reward: { gold: 50, qp: 1, recipeReward: ["Ranger Armor (T2)", "Ranger Cowl (T2)", "Ranger Boots (T2)"] }, prerequisite: null }
                ],
                dialogue: {
                    start: {
                        text: "Ah, a customer! I craft the finest arrows and bolts in the region. Looking for something sharp?", options: [
                            { text: "Tell me about your work.", next: "about" },
                            { text: "I have a Rooster Spur. Can you do anything with it?", next: "spurRecipe", requiresItem: "Rooster Spur" },
                            { text: "I'm interested in Ranger gear.", next: "RANGER_SET_QUEST_start" },
                            { text: "Just browsing.", next: "farewell" }
                        ]
                    },
                    RANGER_SET_QUEST_start: { text: "So you want to dress like a ranger? It takes more than just looking the part. Bring me 3 pieces of cured Leather, and I'll teach you how to craft a full Ranger set.", options: [{ text: "I'll bring the leather.", questId: "RANGER_SET_QUEST", next: "RANGER_SET_QUEST_inProgress" }, { text: "Maybe later.", next: "farewell" }] },
                    RANGER_SET_QUEST_inProgress: { text: "You can craft Leather from Hides using a tanning agent. I need 3 pieces.", options: [{ text: "I'm on it.", next: "farewell" }] },
                    RANGER_SET_QUEST_ready: { text: "Good quality leather. Fine work. Here, let me show you the patterns for the Ranger Armor, Cowl, and Boots. They'll serve you well in the wild.", options: [{ text: "Thanks for the training.", questComplete: "RANGER_SET_QUEST", next: "allQuestsDone" }] },
                    allQuestsDone: { text: "Stay sharp out there. A ranger is only as good as their gear.", options: [{ text: "Farewell.", next: "farewell" }] },
                    about: { text: "I've been fletching for decades. Arrows, bolts, throwing knives... if it flies and sticks, I can make it.", options: [{ text: "Interesting.", next: "farewell" }] },
                    spurRecipe: { text: "A Rooster Spur? Now that's a nasty little thing. Sharp as any blade I've seen. Tell you what\u2014I'll teach you how to fashion it into a proper dagger. You'll need some Dark Wood for the handle.", options: [{ text: "Teach me.", teachRecipe: "Spur Dagger", next: "spurRecipeLearned" }] },
                    spurRecipeLearned: { text: "There you go. Spur Dagger\u2014fast, light, and it'll make your enemies bleed. Good hunting!", options: [{ text: "Thanks.", next: "farewell" }] },
                    farewell: { text: "Stay sharp out there.", options: [] }
                }
            }, count: 1
        },
        {
            card: {
                name: "Chef",
                type: "npc",
                description: "A cheerful chef with a passion for culinary arts.",
                icon: "👨‍🍳",
                imageUrl: '/assets/town-chef.jpg',
                quests: [
                    { id: "CHEF_MEAT_QUEST", title: "Fresh Ingredients", turnInItems: { "Pork": 2, "Raw Chicken": 2 }, reward: { gold: 30, qp: 1, recipeReward: "Meat Pie" }, prerequisite: null },
                    { id: "CHEF_FISH_QUEST", title: "Catch of the Day", turnInItems: { "Fish": 5 }, reward: { gold: 40, qp: 1, recipeReward: "Fish Stew" }, prerequisite: "CHEF_MEAT_QUEST" }
                ],
                dialogue: {
                    CHEF_MEAT_QUEST_start: { text: "Ah, a fellow food lover! My kitchen is running low on supplies. Bring me some Pork and Chicken, and I'll teach you the secret to my famous Meat Pie!", options: [{ text: "I'll gather the ingredients.", questId: "CHEF_MEAT_QUEST", next: "CHEF_MEAT_QUEST_inProgress" }, { text: "Maybe another time.", next: "farewell" }] },
                    CHEF_MEAT_QUEST_inProgress: { text: "The farmlands are full of livestock. Bring me 2 Pork and 2 Raw Chicken!", options: [{ text: "I'm working on it.", next: "farewell" }] },
                    CHEF_MEAT_QUEST_ready: { text: "Perfect! These are exactly what I needed. Watch closely—here's how you make a proper Meat Pie.", options: [{ text: "Thank you, Chef.", questComplete: "CHEF_MEAT_QUEST", next: "CHEF_FISH_QUEST_start" }] },
                    CHEF_FISH_QUEST_start: { text: "You have a natural talent! Now, for something more refined. Bring me 5 Fish, and I'll share my Fish Stew recipe.", options: [{ text: "I'll go fishing.", questId: "CHEF_FISH_QUEST", next: "CHEF_FISH_QUEST_inProgress" }, { text: "That's enough cooking for now.", next: "farewell" }] },
                    CHEF_FISH_QUEST_inProgress: { text: "The rivers are teeming with fish. Keep at it!", options: [{ text: "I'll be back.", next: "farewell" }] },
                    CHEF_FISH_QUEST_ready: { text: "Magnificent! These are beautifully fresh. Here's the recipe for my hearty Fish Stew.", options: [{ text: "Thanks for the recipes.", questComplete: "CHEF_FISH_QUEST", next: "allQuestsDone" }] },
                    allQuestsDone: { text: "You've become quite the chef yourself! Good luck on your adventures.", options: [{ text: "Farewell.", next: "farewell" }] },
                    farewell: { text: "Bon appétit!", options: [] }
                }
            }, count: 1
        },
        {
            card: {
                name: "Tailor",
                type: "npc",
                description: "A skilled seamstress surrounded by bolts of fine fabric.",
                icon: "🧵",
                imageUrl: '/assets/town-tailor.jpg',
                quests: [
                    { id: "TAILOR_CLOTH_QUEST", title: "Fine Fabrics", turnInItems: { "Cloth": 5 }, reward: { gold: 25, qp: 1, recipeReward: "Cloth Armor" }, prerequisite: null },
                    { id: "TAILOR_SILK_QUEST", title: "Silken Threads", turnInItems: { "Silk": 3 }, reward: { gold: 50, qp: 1, recipeReward: ["Silk Wizard Robes (T2)", "Silk Wizard Hat (T2)", "Silk Wizard Boots (T2)"] }, prerequisite: "TAILOR_CLOTH_QUEST" }
                ],
                dialogue: {
                    TAILOR_CLOTH_QUEST_start: { text: "Welcome to my shop! I'm always in need of quality materials. Bring me some Cloth, and I'll teach you to craft proper armor with it.", options: [{ text: "I'll find some cloth.", questId: "TAILOR_CLOTH_QUEST", next: "TAILOR_CLOTH_QUEST_inProgress" }, { text: "Not interested in sewing.", next: "farewell" }] },
                    TAILOR_CLOTH_QUEST_inProgress: { text: "Farmhands usually carry Cloth. You can also find Hemp in the fields to weave your own.", options: [{ text: "I'll keep looking.", next: "farewell" }] },
                    TAILOR_CLOTH_QUEST_ready: { text: "Wonderful! This is fine material. Let me show you how to craft Cloth Armor—it's lightweight but protective.", options: [{ text: "Thank you.", questComplete: "TAILOR_CLOTH_QUEST", next: "TAILOR_SILK_QUEST_start" }] },
                    TAILOR_SILK_QUEST_start: { text: "You have a steady hand! Now, for something more elegant. I need 3 bolts of refined Silk.", options: [{ text: "I'll find the silk.", questId: "TAILOR_SILK_QUEST", next: "TAILOR_SILK_QUEST_inProgress" }, { text: "Spiders aren't my thing.", next: "farewell" }] },
                    TAILOR_SILK_QUEST_inProgress: { text: "You can weave Silk from Spider Silk and Thread. The spiders in the Dark Forest carry the raw silk.", options: [{ text: "I'll manage.", next: "farewell" }] },
                    TAILOR_SILK_QUEST_ready: { text: "Exquisite! This silk is perfect. Here's how you craft a full Silk Wizard set—robes, hat, and boots.", options: [{ text: "Amazing craftsmanship.", questComplete: "TAILOR_SILK_QUEST", next: "allQuestsDone" }] },
                    allQuestsDone: { text: "You're a natural tailor! Come back if you need any repairs.", options: [{ text: "Farewell.", next: "farewell" }] },
                    farewell: { text: "May your threads never fray!", options: [] }
                }
            }, count: 1
        },
        {
            card: {
                name: "Wizard",
                type: "npc",
                description: "An elderly mage studying an ancient tome, arcane symbols floating around him.",
                icon: "🧙",
                imageUrl: '/assets/town-wizard.jpg',
                quests: [
                    { id: "WIZARD_ESSENCE_QUEST", title: "Arcane Components", turnInItems: { "Magic Essence": 3 }, reward: { qp: 1, gold: 50 }, prerequisite: null },
                    { id: "WIZARD_CRYSTAL_QUEST", title: "Crystal Power", turnInItems: { "Dark Crystal": 2 }, reward: { qp: 1, gold: 75 }, prerequisite: "WIZARD_ESSENCE_QUEST" },
                    { id: "WIZARD_PLAGUE_QUEST", title: "Plague Research", turnInItems: { "Plague Essence": 1 }, reward: { qp: 1, gold: 100 }, prerequisite: "WIZARD_CRYSTAL_QUEST" }
                ],
                dialogue: {
                    WIZARD_ESSENCE_QUEST_start: { text: "Ah, an adventurer with potential! The arcane arts require rare components. Bring me 3 Magic Essences from the goblin shamans, and I shall reward you with knowledge of the arcane.", options: [{ text: "I'll gather the essences.", questId: "WIZARD_ESSENCE_QUEST", next: "WIZARD_ESSENCE_QUEST_inProgress" }, { text: "Magic isn't my path.", next: "farewell" }] },
                    WIZARD_ESSENCE_QUEST_inProgress: { text: "Goblin Shamans in the caves carry Magic Essence. Defeat them and bring me their magical remains.", options: [{ text: "I'll find them.", next: "farewell" }] },
                    WIZARD_ESSENCE_QUEST_ready: { text: "Excellent! These essences pulse with power. Take this scroll—it contains arcane knowledge.", options: [{ text: "Thank you, wise one.", questComplete: "WIZARD_ESSENCE_QUEST", next: "WIZARD_CRYSTAL_QUEST_start" }] },
                    WIZARD_CRYSTAL_QUEST_start: { text: "Your potential grows! Dark Crystals from the forest contain trapped fire magic. Bring me 2, and I'll give you a scroll of fire.", options: [{ text: "I'll venture into the forest.", questId: "WIZARD_CRYSTAL_QUEST", next: "WIZARD_CRYSTAL_QUEST_inProgress" }, { text: "Perhaps later.", next: "farewell" }] },
                    WIZARD_CRYSTAL_QUEST_inProgress: { text: "The Dark Forest hides many secrets. The crystal nodes there contain what I need.", options: [{ text: "I'm on it.", next: "farewell" }] },
                    WIZARD_CRYSTAL_QUEST_ready: { text: "These crystals are magnificent! The fire within them is ancient. Here—master the flames.", options: [{ text: "I feel the power!", questComplete: "WIZARD_CRYSTAL_QUEST", next: "WIZARD_PLAGUE_QUEST_start" }] },
                    WIZARD_PLAGUE_QUEST_start: { text: "For your final test, I need something truly rare. Plague Essence from the sewer's depths. Dangerous, yes, but the nature magic within is unparalleled.", options: [{ text: "I'll brave the sewers.", questId: "WIZARD_PLAGUE_QUEST", next: "WIZARD_PLAGUE_QUEST_inProgress" }, { text: "That sounds too dangerous.", next: "farewell" }] },
                    WIZARD_PLAGUE_QUEST_inProgress: { text: "The Plague Rats carry what I need. Be careful—their disease is deadly.", options: [{ text: "I'll be cautious.", next: "farewell" }] },
                    WIZARD_PLAGUE_QUEST_ready: { text: "You've done it! This essence is perfect for studying nature's darker side. Take this scroll—you've earned it.", options: [{ text: "Thank you for everything.", questComplete: "WIZARD_PLAGUE_QUEST", next: "allQuestsDone" }] },
                    allQuestsDone: { text: "You've proven yourself a true student of magic. May your spells strike true!", options: [{ text: "Farewell, master.", next: "farewell" }] },
                    farewell: { text: "The arcane waits for no one...", options: [] }
                }
            }, count: 1
        },

    ],

    sewers: [
        {
            card: {
                name: "Sewer Rat", type: "enemy", health: 6, maxHealth: 6, icon: "🐀",
                imageUrl: '/assets/sewer-rat.jpg',
                attackTable: [
                    { range: [1, 3], action: 'miss', message: "Miss!" },
                    { range: [4, 20], action: 'attack', attackRange: 'melee', damage: 2, damageType: 'Physical', message: "Bite! Deals 2 Physical Damage!" }
                ],
                guaranteedLoot: { items: ["Rat Meat"] },
                lootTable: [
                    { range: [1, 10], items: ["Rat Tail"] },
                    { range: [11, 15], items: ["Rat Tail", "Rat Eye"] },
                    { range: [16, 19], items: ["Rat Tail", "Rat Eye", "Rat Eye"] },
                    { range: [20, 20], items: ["Rat Tail", "Rat Eye", "Rat Eye", "Rat Meat"] }
                ]
            }, count: 10
        },
        {
            card: {
                name: "Plague Rat", type: "enemy", health: 10, maxHealth: 10, icon: "🐀",
                imageUrl: '/assets/plague-rat.jpg',
                attackTable: [
                    { range: [1, 3], action: 'miss', message: "Miss!" },
                    { range: [4, 14], action: 'attack', attackRange: 'melee', damage: 3, damageType: 'Physical', message: "Maul! Deals 3 Physical Damage!" },
                    { range: [15, 20], action: 'attack', attackRange: 'melee', damage: 2, damageType: 'Nature', debuff: { type: 'poison', duration: 2, damage: 1, damageType: 'Nature' }, message: "Infectious Bite! Deals 2 Nature Damage and Poisons!" }
                ],
                guaranteedLoot: { items: ["Rat Meat", "Rat Tail"] },
                lootTable: [
                    { range: [1, 10], items: ["Rat Eye"] },
                    { range: [11, 15], items: ["Rat Eye", "Rat Tail"] },
                    { range: [16, 19], items: ["Rat Tail", "Plague Essence"] },
                    { range: [20, 20], items: ["Plague Essence", "Plague Essence"] }
                ]
            }, count: 5
        },
        {
            card: {
                name: "The Rat King", type: "enemy", isBoss: true, health: 30, maxHealth: 30, description: "A horrifying amalgamation of rats.", icon: "👑",
                imageUrl: '/assets/rat-king.jpg',
                attackTable: [
                    { range: [1, 3], action: 'miss', message: "Miss!" },
                    { range: [4, 9], action: 'attack', attackRange: 'melee', damage: 3, damageType: 'Physical', message: "Gnaw! Deals 3 Physical Damage!" },
                    { range: [10, 15], action: 'attack', attackRange: 'melee', damage: 2, damageType: 'Physical', debuff: { type: 'poison', duration: 3, damage: 2, damageType: 'Nature' }, message: "Diseased Bite! Deals 2 Physical Damage and Poisons you!" },
                    { range: [16, 20], action: 'special', message: "The Rat King shrieks and another rat appears!" }
                ],
                guaranteedLoot: { gold: { min: 10, max: 25 }, items: ["Rat Meat", "Rat Tail", "Rat Tail"] },
                lootTable: [
                    { range: [1, 10], items: ["Rat Tail Cloak"] },
                    { range: [11, 15], items: ["Rat King's Crown"] },
                    { range: [16, 19], items: ["Rat King's Crown", "Rat Tail Cloak"] },
                    { range: [20, 20], items: ["Sludge Staff", "Rat King's Crown", "Rat Tail Cloak"] }
                ]
            }, count: 1
        },
        { card: { name: "Treasure Chest", type: "treasure", description: "A grimy chest half-submerged in sewer water.", icon: "📦", imageUrl: '/assets/sewers-treasurechest.jpg' }, count: 1 },
        { card: { name: "Empty Canal", type: "area", description: "A dark, empty sewer canal.", icon: "🕳️", imageUrl: '/assets/sewers-emptycanal.jpg', allowSpawnOver: true }, count: 3 },
    ],

    arena: [
        {
            card: {
                name: "Pulvis Cadus", type: "enemy", isBoss: true, health: 40, maxHealth: 40, description: "A master of strange concoctions and explosives.", icon: "⚗️",
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
                guaranteedLoot: { gold: { min: 50, max: 100 } },
                lootTable: [
                    { range: [1, 10], recipe: "Powder Keg" },
                    { range: [11, 15], items: ["Magna Clavis"] },
                    { range: [16, 19], items: ["Magna Clavis"] },
                    { range: [20, 20], items: ["Magna Clavis", "Powder Keg"] }
                ]
            }, count: 1
        },
        {
            card: {
                name: "Vexor, Lord of the Arena", type: "enemy", isBoss: true, health: 40, maxHealth: 40, description: "The brutal champion of the arena.", icon: "🛡️",
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
                guaranteedLoot: { gold: { min: 50, max: 100 }, items: ["Champion's Belt"] },
                lootTable: [
                    { range: [1, 10], gold: { min: 25, max: 50 } },
                    { range: [11, 15], gold: { min: 30, max: 60 } },
                    { range: [16, 19], gold: { min: 40, max: 80 } },
                    { range: [20, 20], gold: { min: 50, max: 100 }, items: ["Champion's Belt"] }
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
                guaranteedLoot: { items: ["Obsidian Chunk"] },
                lootTable: [
                    { range: [1, 10], items: ["Hide"] },
                    { range: [11, 15], items: ["Hide", "Drake Scale"] },
                    { range: [16, 19], items: ["Drake Scale", "Drake Scale"] },
                    { range: [20, 20], items: ["Drake Scale", "Drake Scale", "Obsidian Chunk"] }
                ]
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
                guaranteedLoot: { items: ["Obsidian Chunk"] },
                lootTable: [
                    { range: [1, 10], items: ["Obsidian Chunk"] },
                    { range: [11, 15], items: ["Obsidian Chunk", "Obsidian Chunk"] },
                    { range: [16, 19], items: ["Obsidian Chunk", "Obsidian Chunk"] },
                    { range: [20, 20], items: ["Obsidian Chunk", "Obsidian Chunk", "Obsidian Chunk"] }
                ]
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
                guaranteedLoot: { items: ["Drake Scale"] },
                lootTable: [
                    { range: [1, 10], items: ["Drake Scale"] },
                    { range: [11, 15], items: ["Drake Scale", "Drake Scale"] },
                    { range: [16, 19], items: ["Drake Scale", "Drake Scale"] },
                    { range: [20, 20], items: ["Drake Scale", "Drake Scale", "Drake Scale"] }
                ]
            }, count: 2
        },
        { card: { name: "Obsidian Vein", type: "resource", skill: "mining", description: "Requires Mining Tool (T4)", loot: { name: "Obsidian Chunk" }, toolType: "mining", toolTier: 4, charges: 3, icon: "💎" }, count: 5 },
        { card: { name: "Ashenwood Tree", type: "resource", skill: "woodcutting", description: "Requires Woodcutting Tool (T4)", loot: { name: "Ashenwood Log" }, toolType: "woodcutting", toolTier: 4, charges: 3, icon: "🌳" }, count: 5 },
        { card: { name: "Rare Treasure", type: "treasure", description: "A heavily locked chest.", icon: "👑" }, count: 2 },
    ],

    // --- Dark Forest Zone ---
    darkForest: [
        {
            card: {
                name: "Night Watchman",
                type: "npc",
                description: "A vigilant guard keeping watch over the forest's edge.",
                icon: "🛡️",
                imageUrl: '/assets/darkforest-nightwatchman.jpg',
                quests: [
                    { id: "FOREST_PATROL", title: "Forest Patrol", target: "Dark Forest Enemy", required: 8, reward: { gold: 100, qp: 1 }, prerequisite: null }
                ],
                dialogue: {
                    FOREST_PATROL_start: { text: "Hail, adventurer. These woods grow more dangerous by the day. Spiders and wolves lurk in every shadow. Help me cull their numbers—slay 8 of these beasts and I'll reward you handsomely.", options: [{ text: "I'll help keep the forest safe.", questId: "FOREST_PATROL", next: "FOREST_PATROL_inProgress" }, { text: "I have other business.", next: "farewell" }] },
                    FOREST_PATROL_inProgress: { text: "The beasts still prowl. Keep hunting, friend.", options: [{ text: "I'll continue.", next: "farewell" }] },
                    FOREST_PATROL_ready: { text: "Excellent work! The forest is safer thanks to you. Here is your reward.", options: [{ text: "Thank you.", questComplete: "FOREST_PATROL", next: "allQuestsDone" }] },
                    allQuestsDone: { text: "The forest thanks you, brave one. Safe travels.", options: [{ text: "Farewell.", next: "farewell" }] },
                    farewell: { text: "Stay vigilant.", options: [] }
                }
            }, count: 1
        },
        {
            card: {
                name: "Mary",
                type: "npc",
                description: "A nervous young woman with dark circles under her eyes.",
                icon: "👩",
                imageUrl: '/assets/darkforest-mary.jpg',
                quests: [
                    { id: "VAMPIRE_HUNT", title: "The Inheritance", target: "Vampire", required: 1, reward: { qp: 1, gold: 50 }, prerequisite: null }
                ],
                dialogue: {
                    VAMPIRE_HUNT_start: { text: "Please, you must help me! I married Lord Ashworth for his fortune, but that wretched old man just won't die! He never leaves his mansion, never eats... I just want what's mine. Can you... deal with him?", options: [{ text: "I'll pay the lord a visit.", questId: "VAMPIRE_HUNT", next: "VAMPIRE_HUNT_inProgress" }, { text: "This isn't my concern.", next: "farewell" }] },
                    VAMPIRE_HUNT_inProgress: { text: "The mansion is deeper in the forest. Be careful—strange things happen there at night.", options: [{ text: "I'll find him.", next: "farewell" }] },
                    VAMPIRE_HUNT_ready: { text: "He's dead? Finally! I mean... oh how tragic. Well, here's a little something for your... trouble. I learned this from a shady friend—you seem like you could use it.", options: [{ text: "Thanks for the tip.", questComplete: "VAMPIRE_HUNT", next: "allQuestsDone" }] },
                    allQuestsDone: { text: "The mansion is mine now. Don't visit too often, will you?", options: [{ text: "Farewell.", next: "farewell" }] },
                    farewell: { text: "Good luck out there.", options: [] }
                }
            }, count: 1
        },
        {
            card: {
                name: "Black Widow",
                type: "enemy",
                health: 12,
                maxHealth: 12,
                description: "A giant venomous spider lurking in its web.",
                icon: "🕷️",
                imageUrl: '/assets/darkforest-blackwidow.jpg',
                questTarget: "Dark Forest Enemy",
                attackTable: [
                    { range: [1, 3], action: 'miss', message: "Miss!" },
                    { range: [4, 9], action: 'attack', attackRange: 'melee', damage: 4, damageType: 'Physical', message: "Bite! Deals 4 Physical Damage!" },
                    { range: [10, 16], action: 'attack', attackRange: 'ranged', damage: 4, damageType: 'Nature', debuff: { type: 'trap', duration: 2 }, message: "Web Shot! Deals 4 Nature Damage and Traps for 2 turns!" },
                    { range: [17, 20], action: 'special', message: "Consume! The spider strikes at a trapped victim!" }
                ],
                guaranteedLoot: { items: ["Spider Leg"] },
                lootTable: [
                    { range: [1, 10], items: ["Spider Silk"] },
                    { range: [11, 15], items: ["Spider Silk", "Spider Silk"] },
                    { range: [16, 19], items: ["Spider Silk", "Venom Sac"] },
                    { range: [20, 20], items: ["Venom Sac", "Venom Sac"] }
                ]
            }, count: 6
        },
        {
            card: {
                name: "Gray Wolf",
                type: "enemy",
                health: 16,
                maxHealth: 16,
                description: "A fierce predator of the dark woods.",
                icon: "🐺",
                imageUrl: '/assets/darkforest-graywolf.jpg',
                questTarget: "Dark Forest Enemy",
                attackTable: [
                    { range: [1, 3], action: 'miss', message: "Miss!" },
                    { range: [4, 10], action: 'attack', attackRange: 'melee', damage: 5, damageType: 'Physical', message: "Bite! Deals 5 Physical Damage!" },
                    { range: [11, 17], action: 'attack', attackRange: 'melee', damage: 5, damageType: 'Physical', debuff: { type: 'daze', duration: 1 }, message: "Pounce! Deals 5 Physical Damage and Dazes!" },
                    { range: [18, 20], action: 'special', message: "Howl! The wolf calls for reinforcements!" }
                ],
                guaranteedLoot: { items: ["Hide"] },
                lootTable: [
                    { range: [1, 10], items: ["Rough Fur"] },
                    { range: [11, 15], items: ["Rough Fur", "Wolf Bones"] },
                    { range: [16, 19], items: ["Rough Fur", "Wolf Bones", "Hide"] },
                    { range: [20, 20], items: ["Rough Fur", "Wolf Bones", "Hide", "Wolf Bones"] }
                ]
            }, count: 5
        },
        { card: { name: "Withered Tree", type: "resource", skill: "woodcutting", description: "Requires Woodcutting Tool (T2)", loot: { name: "Dark Wood" }, toolType: "woodcutting", toolTier: 2, charges: 3, icon: "🌲", imageUrl: '/assets/darkforest-witheredtree.jpg' }, count: 5 },
        { card: { name: "Dark Crystal Node", type: "resource", skill: "mining", description: "Requires Mining Tool (T2)", loot: { name: "Dark Crystal" }, toolType: "mining", toolTier: 2, charges: 3, icon: "💎", imageUrl: '/assets/darkforest-darkcrystal.jpg' }, count: 5 },
        { card: { name: "Treasure Chest", type: "treasure", description: "An old chest covered in cobwebs.", icon: "📦" }, count: 1 },
        { card: { name: "The Mansion", type: "treasure", description: "A decrepit mansion looms in the darkness. Something evil dwells within.", icon: "🏚️", imageUrl: '/assets/darkforest-mansion.jpg' }, count: 1 },
    ],

    // --- Mansion Boss Area ---
    mansion: [
        {
            card: {
                name: "Vampire",
                type: "enemy",
                health: 80,
                maxHealth: 80,
                description: "Lord Ashworth, revealed as an ancient vampire.",
                icon: "🧛",
                imageUrl: '/assets/darkforest-vampire.jpg',
                questTarget: "Vampire",
                phaseThreshold: 60,
                attackTable: [
                    { range: [1, 1], action: 'miss', message: "The Vampire's strike goes wide!" },
                    { range: [2, 6], action: 'special', message: "Take Flight! The Vampire soars into the air!" },
                    { range: [7, 13], action: 'attack', attackRange: 'melee', damage: 7, damageType: 'Physical', debuff: { type: 'bleed', duration: 3, damage: 2, damageType: 'Physical' }, message: "Gouge! Deals 7 Physical Damage and causes heavy Bleeding!" },
                    { range: [14, 17], action: 'special', attackRange: 'ranged', isMagic: true, damage: 8, message: "Blood Fountain! The Vampire drains the blood of the wounded!" },
                    { range: [18, 20], action: 'special', attackRange: 'melee', damage: 8, message: "From The Shadows! The Vampire targets the weakest prey!" }
                ],
                guaranteedLoot: { gold: { min: 80, max: 150 }, items: ["Silk", "Silk"] },
                lootTable: [
                    { range: [1, 10], items: ["Silk", "Cloak of Shadows"] },
                    { range: [11, 15], items: ["Silk", "Vampire's Robe"] },
                    { range: [16, 19], items: ["Silk", "Vampire's Robe", "Cloak of Shadows"] },
                    { range: [20, 20], gold: { min: 100, max: 200 }, items: ["Silk", "Silk", "Vampire's Robe", "Cloak of Shadows"] }
                ]
            }, count: 1
        },
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
    },
    // --- Dark Forest Spawnable Cards ---
    vampireAssistant: {
        name: "Vampire's Assistant",
        type: "enemy",
        health: 20,
        maxHealth: 20,
        description: "A ghoulish servant of the Vampire.",
        icon: "🧟",
        imageUrl: '/assets/darkforest-vampireassistant.jpg',
        attackTable: [
            { range: [1, 3], action: 'miss', message: "Miss!" },
            { range: [4, 10], action: 'attack', attackRange: 'melee', damage: 3, damageType: 'Physical', debuff: { type: 'bleed', duration: 2, damage: 1, damageType: 'Physical' }, message: "Stab! Deals 3 Physical Damage and causes Bleeding!" },
            { range: [11, 20], action: 'special', message: "The Assistant drags in a human victim for its master!" }
        ],
        guaranteedLoot: { items: ["Cloth"] },
        lootTable: [
            { range: [1, 10], items: ["Thread"] },
            { range: [11, 15], items: ["Thread", "Dark Crystal"] },
            { range: [16, 19], items: ["Dark Crystal", "Silk"] },
            { range: [20, 20], items: ["Dark Crystal", "Silk", "Magic Essence"] }
        ]
    },
    humanVictim: {
        name: "Human Victim",
        type: "enemy",
        health: 6,
        maxHealth: 6,
        description: "A helpless victim. The Vampire will consume them if not saved!",
        icon: "😱",
        imageUrl: '/assets/darkforest-humanvictim.jpg',
        turnsUntilConsumed: 2,
        attackTable: [
            { range: [1, 20], action: 'special', message: "The victim lies there, dying..." }
        ]
    },
    grayWolf: {
        name: "Gray Wolf",
        type: "enemy",
        health: 16,
        maxHealth: 16,
        description: "A fierce predator called by the pack.",
        icon: "🐺",
        imageUrl: '/assets/darkforest-graywolf.jpg',
        questTarget: "Dark Forest Enemy",
        attackTable: [
            { range: [1, 3], action: 'miss', message: "Miss!" },
            { range: [4, 10], action: 'attack', attackRange: 'melee', damage: 5, damageType: 'Physical', message: "Bite! Deals 5 Physical Damage!" },
            { range: [11, 17], action: 'attack', attackRange: 'melee', damage: 5, damageType: 'Physical', debuff: { type: 'daze', duration: 1 }, message: "Pounce! Deals 5 Physical Damage and Dazes!" },
            { range: [18, 20], action: 'special', message: "Howl! The wolf calls for reinforcements!" }
        ],
        guaranteedLoot: { items: ["Hide"] },
        lootTable: [
            { range: [1, 10], items: ["Rough Fur"] },
            { range: [11, 15], items: ["Rough Fur", "Wolf Bones"] },
            { range: [16, 19], items: ["Wolf Bones", "Hide"] },
            { range: [20, 20], items: ["Rough Fur", "Wolf Bones", "Hide"] }
        ]
    },
    // --- Farmlands Spawnable Cards ---
    angryRooster: {
        name: "Angry Rooster",
        type: "enemy",
        isBoss: true,
        health: 8,
        maxHealth: 8,
        description: "An enraged rooster protecting its territory!",
        icon: "🐓",
        imageUrl: '/assets/farmlands-angryrooster.jpg',
        attackTable: [
            { range: [1, 3], action: 'miss', message: "Miss!" },
            { range: [4, 8], action: 'attack', attackRange: 'melee', damage: 3, damageType: 'Physical', message: "Claw! Deals 3 Physical Damage!" },
            { range: [9, 15], action: 'attack', attackRange: 'melee', damage: 3, damageType: 'Physical', debuff: { type: 'bleed', duration: 2, damage: 1, damageType: 'Physical' }, message: "Gouge! Deals 3 Physical Damage and Bleed!" },
            { range: [16, 20], action: 'special', message: "Enrage! The Angry Rooster becomes Enraged for 3 turns!" }
        ],
        guaranteedLoot: { items: ["Raw Chicken", "Feather"] },
        lootTable: [
            { range: [1, 10], items: ["Feather"] },
            { range: [11, 15], items: ["Feather", "Egg"] },
            { range: [16, 19], items: ["Feather", "Egg", "Raw Chicken"] },
            { range: [20, 20], items: ["Feather", "Egg", "Raw Chicken", "Rooster Spur"] }
        ]
    },
    // --- Sewer Area Cards ---
    emptyCanal: {
        name: "Empty Canal",
        type: "area",
        description: "A dark, empty sewer canal.",
        icon: "🕳️",
        imageUrl: '/assets/sewers-emptycanal.jpg',
        allowSpawnOver: true
    },
    // --- Farmlands Area Cards ---
    farmlandsArea: {
        name: "Farmlands",
        type: "area",
        description: "Open farmland stretching to the horizon.",
        icon: "🌾",
        imageUrl: '/assets/farmlands-area.jpg',
        allowSpawnOver: true
    },
    // --- Goblin Caves Area Cards ---
    goblinCavesTunnel: {
        name: "Cave Tunnel",
        type: "area",
        description: "A dark tunnel stretching deeper into the caves.",
        icon: "🕳️",
        imageUrl: '/assets/goblincaves-tunnel.jpg',
        allowSpawnOver: true
    },
    // --- Dark Forest Area Cards ---
    darkForestTrail: {
        name: "Dark Forest Trail",
        type: "area",
        description: "A winding trail through the fog-shrouded woods.",
        icon: "🌲",
        imageUrl: '/assets/darkforest-trail.jpg',
        allowSpawnOver: true
    },
    // --- Mansion Area Cards ---
    mansionHall: {
        name: "Mansion Hall",
        type: "area",
        description: "A dusty, abandoned hall in the vampire's mansion.",
        icon: "🏚️",
        imageUrl: '/assets/darkforest-mansionhall.jpg',
        allowSpawnOver: true
    }
};