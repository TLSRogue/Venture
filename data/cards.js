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
                    { range: [4, 16], action: 'attack', attackRange: 'melee', damage: 4, damageType: 'Physical', message: "Charge! Deals 3 Physical Damage!" },
                    { range: [17, 20], action: 'special', message: "Thick Hide! Gain 1 Physical Resistance until the next Zone Turn then make another action!" }
                ],
                guaranteedLoot: { items: ["Bull Horn", "Raw Beef"] },
                lootTable: [
                    { range: [1, 10], items: ["Cow Hide"] },
                    { range: [11, 15], items: ["Cow Hide", "Animal Fat"] },
                    { range: [16, 19], items: ["Cow Hide", "Animal Fat", "Cow Hide"] },
                    { range: [20, 20], items: ["Cow Hide", "Animal Fat", "Cow Hide"] }
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
                    { id: "FARMHAND_TROUBLE", title: "Farmhand Trouble", target: "Angry Farmhand", required: 4, reward: { gold: 50, qp: 1 }, prerequisite: null },
                    { id: "BULL_RAGE", title: "Kill the Raging Bull", target: "Raging Bull", required: 1, reward: { gold: 50, qp: 2, titleReward: "Bull-Slayer" }, prerequisite: "FARMHAND_TROUBLE" }
                ],
                dialogue: {
                    FARMHAND_TROUBLE_start: { text: "'Ah, traveler. A word, if you have a moment? The local farmhands... they've grown restless. They raid our stores and threaten the peace. Will you help an honest farmer put them in their place?'", options: [{ text: "Consider them dealt with.", questId: "FARMHAND_TROUBLE", next: "FARMHAND_TROUBLE_inProgress" }, { text: "I have my own troubles.", next: "farewell" }] },
                    FARMHAND_TROUBLE_inProgress: { text: "'Please, do not linger. The longer those rogues roam free, the more of our harvest we lose.'", options: [{ text: "I'll return when it's done.", next: "farewell" }] },
                    FARMHAND_TROUBLE_ready: { text: "'You return! And the fields are quiet once more. You have a steady hand. Please, take this coin—it is all I can spare.'", options: [{ text: "My thanks.", questComplete: "FARMHAND_TROUBLE", next: "BULL_RAGE_start" }] },
                    BULL_RAGE_start: { text: "'Wait, there is one more thing. A darkness has taken one of our prize bulls. It rampages through the western pastures, crazed and violent. Only a true warrior could slay such a beast...'", options: [{ text: "I will put the beast to rest.", questId: "BULL_RAGE", next: "BULL_RAGE_inProgress" }, { text: "That is beyond my skill.", next: "farewell" }] },
                    BULL_RAGE_inProgress: { text: "'Stay clear of its horns, traveler! That beast has already trampled two of my best fences.'", options: [{ text: "I will be careful.", next: "farewell" }] },
                    BULL_RAGE_ready: { text: "'By the Gods... you slew the Raging Bull! You have saved our livelihood, champion. We are forever in your debt.'", options: [{ text: "It was an honor.", questComplete: "BULL_RAGE", next: "allQuestsDone" }] },
                    allQuestsDone: { text: "'The fields are safe again, thanks to you. May the rains be plentiful wherever you roam.'", options: [{ text: "Farewell, farmer.", next: "farewell" }] },
                    farewell: { text: "'Watch your step out there.'", options: [] }
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
                    BAKERS_REQUEST_start: { text: "'Oh, hello there! My husband’s naming day approaches, and I simply must bake him a cake. But the roads are too dangerous for me to gather the ingredients. Could you find me an egg, some milk, and fresh wheat?'", options: [{ text: "I will gather what you need.", questId: "BAKERS_REQUEST", next: "BAKERS_REQUEST_inProgress" }, { text: "I cannot spare the time.", next: "farewell" }] },
                    BAKERS_REQUEST_inProgress: { text: "'Remember, I need an Egg, some Milk, and Wheat. Please hurry, the naming day is almost upon us!'", options: [{ text: "I will return soon.", next: "farewell" }] },
                    BAKERS_REQUEST_ready: { text: "'These are perfect! Oh, he will be so thrilled. You have a kind heart. Here, take these coins, and... let me write down my recipe for you.'", options: [{ text: "Thank you.", questComplete: "BAKERS_REQUEST", next: "allQuestsDone" }] },
                    allQuestsDone: { text: "'The smell of fresh cake will fill the house soon... Thank you again for your kindness.'", options: [{ text: "You're welcome.", next: "farewell" }] },
                    farewell: { text: "'Safe travels to you.'", options: [] }
                }
            }, count: 1
        },
        {
            card: {
                name: "Composting Bin",
                type: "interaction",
                description: "A wooden bin smelling faintly of rot. You can toss food and consumables inside to make Slop.",
                icon: "🪣",
                imageUrl: '/assets/compost_bin.jpg',
                deckPlacement: "front"
            }, count: 1
        },
        { card: { name: "Treasure Chest", type: "treasure", description: "A locked chest. What could be inside?", guaranteedCategories: ["T1 Weapon", "T1 Armor"], loot: [{ name: "Recipe: Champions Breakfast" }], lootCount: 1, icon: "📦", imageUrl: '/assets/farmlands-treasurechest.jpg' }, count: 1 },
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
                    { range: [11, 19], items: ["Feather", "Egg"] },
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
                    { range: [1, 10], items: ["Animal Fat"] }
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
                guaranteedLoot: { items: ["Cow Hide", "Raw Beef"] },
                lootTable: [
                    { range: [1, 10], items: ["Milk"] }
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
                    { range: [16, 19], gold: { min: 3, max: 10 }, fromCategories: ["T1 Weapon", "T1 Equipment"] },
                    { range: [20, 20], gold: { min: 5, max: 15 }, items: ["Thread", "Pitchfork"] }
                ]
            }, count: 5
        },
        { card: { name: "Iron Node", type: "resource", skill: "mining", description: "A vein of raw iron ore jutting from the earth.", lootPool: [{ name: "Iron" }, { name: "Iron" }, { name: "Iron" }, { name: "Iron" }, { name: "Tier 1 Gemstone" }], toolType: "mining", toolTier: 1, charges: 3, icon: "⛏️", imageUrl: '/assets/farmlands-ironnode.jpg' }, count: 6 },
        { card: { name: "Tree", type: "resource", skill: "woodcutting", description: "A sturdy tree ripe for felling.", loot: { name: "Wood", type: "material", price: 5 }, toolType: "woodcutting", toolTier: 1, charges: 3, icon: "🌲", imageUrl: '/assets/farmlands-tree.jpg' }, count: 6 },
        { card: { name: "River", type: "resource", skill: "fishing", description: "A calm stretch of water teeming with fish.", loot: { name: "Fish", type: "material", price: 5 }, toolType: "fishing", toolTier: 1, charges: 3, icon: "🎣", imageUrl: '/assets/farmlands-river.jpg' }, count: 6 },
        { card: { name: "Crops", type: "resource", skill: "harvesting", description: "Golden fields of wheat and root vegetables.", lootPool: [{ name: "Wheat" }, { name: "Carrot" }, { name: "Hemp" }], toolType: "harvesting", toolTier: 1, charges: 3, icon: "🌾", imageUrl: '/assets/farmlands-crops.jpg' }, count: 5 },
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
        {
            card: {
                name: "Loyal Farmhand",
                type: "npc",
                description: "He looks nervous and keeps glancing over his shoulder. You can only speak to him when the area is clear.",
                icon: "👨‍🌾",
                imageUrl: '/assets/loyal_farmhand.jpg',
                deckPlacement: "bottomHalf",
                requiresClearArea: true,
                quests: [
                    { id: "FARMHAND_DEFENSE", title: "Protect the Farmhand", target: "Farmhand Revolter", required: 1, reward: { gold: 50, qp: 2 }, prerequisite: null }
                ],
                dialogue: {
                    FARMHAND_DEFENSE_start: { text: "'Stranger! You look capable. Please, you have to help me! The others... they've gone mad. They're going to kill me because I won't join their rebellion. If you protect me, I'll pay you well!'", options: [{ text: "I will stand with you. (Starts Defense)", questId: "FARMHAND_DEFENSE", next: "FARMHAND_DEFENSE_inProgress", action: "startDefenseQuest" }, { text: "I don't want any trouble.", next: "farewell" }] },
                    FARMHAND_DEFENSE_inProgress: { text: "'They are coming! Defend me!'", options: [{ text: "Stay behind me.", next: "farewell" }] },
                    FARMHAND_DEFENSE_ready: { text: "'You... you actually saved me! I thought I was dead for sure. Thank the gods you were here. Here is what I promised.'", options: [{ text: "You're safe now.", questComplete: "FARMHAND_DEFENSE", next: "allQuestsDone" }] },
                    allQuestsDone: { text: "'I'm getting out of here while I still can. Thank you again!'", options: [{ text: "Farewell.", next: "farewell" }] },
                    farewell: { text: "'Stay safe out there.'", options: [] },
                    enemiesPresent: { text: "'Not now! They're still here!'", options: [{ text: "(Defeat enemies first)", next: "farewell" }] }
                }
            }, count: 1
        },
        {
            card: {
                name: "Farmhand Revolter", type: "enemy", health: 8, maxHealth: 8, description: "The furious leader of the rebel farmhands.", icon: "🧑‍🌾", imageUrl: '/assets/farmhand_revolter.jpg',
                attackTable: [
                    { range: [1, 3], action: 'miss', message: "Miss!" },
                    { range: [4, 6], action: 'special', message: "The Revolter rallies the others!" },
                    { range: [7, 13], action: 'attack', attackRange: 'melee', damage: 4, damageType: 'Physical', debuff: { type: 'bleed', duration: 2, damage: 2, damageType: 'Physical' }, message: "Vicious Pitchfork Jab! Deals 4 Physical Damage and Bleeds!" },
                    { range: [14, 20], action: 'attack', attackRange: 'melee', damage: 4, damageType: 'Fire', debuff: { type: 'burn', duration: 2, damage: 2, damageType: 'Fire' }, message: "Blazing Torch Throw! Deals 4 Fire Damage and Burns!" }
                ],
                guaranteedLoot: { items: ["Cloth", "Cloth"], gold: { min: 10, max: 20 } },
                lootTable: [
                    { range: [1, 10], randomItems: { pool: ['Wheat', 'Carrot', 'Apple', 'Seeds'], count: 2 } },
                    { range: [11, 15], gold: { min: 4, max: 16 }, items: ["Thread", "Thread"] },
                    { range: [16, 19], gold: { min: 6, max: 20 }, fromCategories: ["T1 Weapon", "T1 Equipment", "T1 Equipment"] },
                    { range: [20, 20], gold: { min: 10, max: 30 }, items: ["Thread", "Pitchfork", "Pitchfork"] }
                ]
            }, count: 0 // Do not spawn in normal deck
        },
        { card: { name: "Farmlands", type: "area", description: "Open farmland stretching to the horizon.", icon: "🌾", imageUrl: '/assets/farmlands-area.jpg', allowSpawnOver: true }, count: 1 },
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
                    LUCKY_CHARM_HUNT_start: { text: "'Ah, another soul brave—or foolish—enough to plumb these depths. Tell you what. There's a rare trinket buried somewhere in this dark, a Goblin Lucky Charm. Find it for me, and I'll teach you a trick that's saved my neck more times than I can count.'", options: [{ text: "Consider it found.", questId: "LUCKY_CHARM_HUNT", next: "LUCKY_CHARM_HUNT_inProgress" }, { text: "I seek my own fortunes.", next: "farewell" }] },
                    LUCKY_CHARM_HUNT_inProgress: { text: "'Check the old chests. The goblins don't even know what they have, but they guard them nonetheless.'", options: [{ text: "I'll keep looking.", next: "farewell" }] },
                    LUCKY_CHARM_HUNT_ready: { text: "'Ha! You actually found it. Let me see... yes, this is the genuine article. A deal is a deal, my friend. Let me show you how to blend into the shadows.'", options: [{ text: "I am ready to learn.", questComplete: "LUCKY_CHARM_HUNT", next: "allQuestsDone" }] },
                    allQuestsDone: { text: "'Use that skill wisely. In these caves, sometimes not being seen is better than striking the first blow.'", options: [{ text: "My thanks.", next: "farewell" }] },
                    prereqNotMet: { text: "'You've got the look of a greenhorn. Come back when you've survived a bit longer in the wild, eh?'", options: [{ text: "I will.", next: "farewell" }] },
                    farewell: { text: "'May the shadows hide you.'", options: [] }
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
        { card: { name: "Boulders", type: "resource", skill: "mining", description: "Crumbling boulders blocking a passage. Something lurks behind.", loot: { name: "Rocks", type: "material", price: 5 }, toolType: "mining", toolTier: 1, charges: 3, icon: "🪨", imageUrl: '/assets/goblincaves-boulder.jpg', onDepletedSpawn: true }, count: 8 },
        { card: { name: "Vines", type: "resource", skill: "woodcutting", description: "Thick, tangled vines clinging to the cave walls.", loot: { name: "Vines", type: "material", price: 5 }, toolType: "woodcutting", toolTier: 1, charges: 3, icon: "🌿", imageUrl: '/assets/goblincaves-vines.jpg' }, count: 6 },
        { card: { name: "Coal", type: "resource", skill: "mining", description: "Dark deposits of coal embedded in the rock.", loot: { name: "Coal", type: "material", price: 5 }, toolType: "mining", toolTier: 1, charges: 3, icon: "⛏️", imageUrl: '/assets/goblincaves-coal.jpg' }, count: 6 },
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
                    { id: "SWORD_PRACTICE", title: "Sword Practice", requiredWeapon: "Wooden Training Sword", required: 5, reward: { gold: 20, qp: 1, itemReward: { name: "Iron Sword", quantity: 1 } }, prerequisite: null },
                    { id: "GOBLIN_MENACE", title: "Goblin Menace", target: "Goblin", required: 4, reward: { gold: 100, qp: 1 }, prerequisite: "SWORD_PRACTICE" },
                    { id: "SLAY_THE_KING", title: "Slay Their King!", target: "Gorbon the Goblin King", required: 1, reward: { gold: 100, qp: 2 }, prerequisite: "GOBLIN_MENACE" }
                ],
                dialogue: {
                    SWORD_PRACTICE_start: { text: "'Halt, citizen. You carry yourself like an adventurer, but have you the mettle? Take up this wooden training sword. Show me five solid strikes against any foe, and I will see if you are worthy of true steel.'", options: [{ text: "I'll prove my worth.", questId: "SWORD_PRACTICE", next: "SWORD_PRACTICE_inProgress" }, { text: "I have no time for games.", next: "farewell" }] },
                    SWORD_PRACTICE_inProgress: { text: "'Five strikes, citizen. Keep your guard up and follow through.'", options: [{ text: "I understand.", next: "farewell" }] },
                    SWORD_PRACTICE_ready: { text: "'Not bad form... rough, but promising. You've earned this. An iron blade, forged for defending this town. Wield it with honor.'", options: [{ text: "Thank you, Sir Knight.", questComplete: "SWORD_PRACTICE", next: "GOBLIN_MENACE_start" }] },
                    GOBLIN_MENACE_start: { text: "'Adventurer! The goblin menace from the caves grows dangerously bold. They raid our outskirts under the cover of night. We need able-bodied fighters to thin their numbers. Will you answer the call?'", options: [{ text: "For the town. I accept.", questId: "GOBLIN_MENACE", next: "GOBLIN_MENACE_inProgress" }, { text: "That is the Guard's job.", next: "farewell" }] },
                    GOBLIN_MENACE_inProgress: { text: "'The caves lie to the north. Do not let them ambush you in the dark.'", options: [{ text: "I will be careful.", next: "farewell" }] },
                    GOBLIN_MENACE_ready: { text: "'Excellent work! The town sleeps a little easier tonight because of your steel. Accept this bounty, with my thanks.'", options: [{ text: "The pleasure was mine.", questComplete: "GOBLIN_MENACE", next: "SLAY_THE_KING_start" }] },
                    SLAY_THE_KING_start: { text: "'There is a darker root to this problem, however. The goblins serve a monstrous king named Gorbon. So long as he draws breath, they will always return. You must descend into the deepest caverns and end his reign.'", options: [{ text: "I will claim his head.", questId: "SLAY_THE_KING", next: "SLAY_THE_KING_inProgress" }, { text: "That sounds like certain death.", next: "farewell" }] },
                    SLAY_THE_KING_inProgress: { text: "'Tread lightly. Gorbon is surrounded by his fiercest guards.'", options: [{ text: "I am prepared.", next: "farewell" }] },
                    SLAY_THE_KING_ready: { text: "'By the Light... you actually slew the Goblin King! This is a tale they will sing of in the taverns for years! The town is forever in your debt, hero.'", options: [{ text: "It was an honor to serve.", questComplete: "SLAY_THE_KING", next: "allQuestsDone" }] },
                    allQuestsDone: { text: "'You are a true paragon of this town. Should you ever need anything, you need only ask.'", options: [{ text: "Farewell, Sir Knight.", next: "farewell" }] },
                    farewell: { text: "'Stand firm against the dark.'", options: [] }
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
                    { id: "MONK_FOCUS_QUEST", title: "A Test of Focus", turnInItems: { "Fish": 3 }, reward: { gold: 50, qp: 1 } }
                ],
                dialogue: {
                    MONK_FOCUS_QUEST_start: { text: "'Greetings, wanderer. You seek strength, yes? True strength is not found in the swing of a sword, but the stillness of the mind. Can you prove your patience to me?'", options: [{ text: "I am willing to learn.", next: "MONK_FOCUS_QUEST_offer" }, { text: "I have no time for riddles.", next: "farewell" }] },
                    MONK_FOCUS_QUEST_offer: { text: "'Patience is learned through action... and inaction. Go to the river. Cast your line and bring me three fish. The waiting will temper your spirit. Do this, and I will share a technique of the old masters.'", options: [{ text: "I shall return with the fish.", questId: "MONK_FOCUS_QUEST", next: "MONK_FOCUS_QUEST_inProgress" }, { text: "I am not a fisherman.", next: "farewell" }] },
                    MONK_FOCUS_QUEST_inProgress: { text: "'The river flows, heedless of your desires. Learn to wait with it.'", options: [{ text: "I will be patient.", next: "farewell" }] },
                    MONK_FOCUS_QUEST_ready: { text: "'You have returned. And your eyes are calmer than before. You have taken the first step on the path. Come, let me show you how to draw power from the spirits of the wild.'", options: [{ text: "I am ready, Master.", questComplete: "MONK_FOCUS_QUEST", next: "allQuestsDone" }] },
                    allQuestsDone: { text: "'The spirits flow through all things. Channel them, and you shall never walk alone.'", options: [{ text: "Thank you.", next: "farewell" }] },
                    farewell: { text: "'Walk in peace.'", options: [] }
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
                    STEEL_ARMOR_QUEST_start: { text: "'Well met, adventurer! Ye look like ye could use some proper plating. Bring me three bars of good Steel, and I'll teach ye the secrets of the forge.'", options: [{ text: "I can find the steel.", questId: "STEEL_ARMOR_QUEST", next: "STEEL_ARMOR_QUEST_inProgress" }, { text: "I prefer light armor.", next: "farewell" }] },
                    STEEL_ARMOR_QUEST_inProgress: { text: "'Ye'll need to smelt Iron and Coal to make Steel. Come back when ye have three solid bars.'", options: [{ text: "I'll keep working the forge.", next: "farewell" }] },
                    STEEL_ARMOR_QUEST_ready: { text: "'Aye, this is fine steel. No impurities. Ye have the eye of a smith. Watch closely, now—here is how ye fold the metal to make it impenetrable.'", options: [{ text: "Thank you for the knowledge.", questComplete: "STEEL_ARMOR_QUEST", next: "allQuestsDone" }] },
                    allQuestsDone: { text: "'Keep yer hammer striking true, and yer armor will never fail ye.'", options: [{ text: "Farewell.", next: "farewell" }] },
                    farewell: { text: "'Keep the forge hot!'", options: [] }
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
                    OLD_RECIPE_QUEST_start: { text: "'Ah, another thread woven into the tapestry... I have foreseen your coming. Long ago, the goblins stole my family's legacy—a recipe for imbuing gems with power. Return it to me, and I shall share its secrets.'", options: [{ text: "I will find your recipe.", questId: "OLD_RECIPE_QUEST", next: "OLD_RECIPE_QUEST_inProgress" }, { text: "I put no stock in fortunes.", next: "farewell" }] },
                    OLD_RECIPE_QUEST_inProgress: { text: "'The threads of fate point toward the deep caves. The recipe lies hidden in the dark.'", options: [{ text: "I will keep looking.", next: "farewell" }] },
                    OLD_RECIPE_QUEST_ready: { text: "'Ah! The spirits do not lie! You have returned my family's legacy. As it was foretold, I shall now teach you the art of enchanting gems. You will need raw stones and the essence of magic.'", options: [{ text: "I am ready to learn.", questComplete: "OLD_RECIPE_QUEST", next: "allQuestsDone" }] },
                    allQuestsDone: { text: "'The future is always shifting, but true power can anchor you. Use my family's knowledge well.'", options: [{ text: "Farewell, seer.", next: "farewell" }] },
                    farewell: { text: "'The fates are watching...'", options: [] }
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
                    { id: "RAT_KING_CROWN", title: "The True King", turnInItems: { "Rat King's Crown": 1 }, reward: { qp: 2, titleReward: "The Rat King" }, prerequisite: null }
                ],
                dialogue: {
                    RAT_KING_CROWN_start: { text: "'*Hic* You... you don't understand. I am the King! The true King of the Sewers! They betrayed me... those filthy rats... took my crown. *Burp* Get it back. Prove I'm not a madman!'", options: [{ text: "Right. The 'Rat King'. I'll look for it.", questId: "RAT_KING_CROWN", next: "RAT_KING_CROWN_inProgress" }, { text: "You've had enough ale, old man.", next: "farewell" }] },
                    RAT_KING_CROWN_explain: { text: "'*Hic* I ruled the dark... they worshipped me! But they stole my crown... left me up here in the light. *Sob* Bring it back to me...'", options: [{ text: "I'll retrieve your crown.", questId: "RAT_KING_CROWN", next: "RAT_KING_CROWN_inProgress" }, { text: "Sleep it off, friend.", next: "farewell" }] },
                    RAT_KING_CROWN_inProgress: { text: "'*Hic* My crown... my beautiful, filthy crown... the rats are mocking me... *mumbles incoherently*'", options: [{ text: "I'm still looking.", next: "farewell" }] },
                    RAT_KING_CROWN_ready: { text: "'*Eyes widen* Is that... MY CROWN?! *He grabs it tightly.* Wait... I can't drink out of this! *He throws it back at you.* Useless! But... thank you, stranger. Now I know I wasn't dreaming. *He passes out.*'", options: [{ text: "...Okay then.", questComplete: "RAT_KING_CROWN", next: "allQuestsDone" }] },
                    allQuestsDone: { text: "'*Snoring loudly* ...zzz... my glorious kingdom... zzz...'", options: [{ text: "Let him sleep.", next: "farewell" }] },
                    farewell: { text: "'*Mumbles and stares blankly*'", options: [] }
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
                        text: "'Ah, a customer! I craft the finest bows and fletch the sharpest arrows in the region. What do you need today?'", options: [
                            { text: "Tell me about your trade.", next: "about" },
                            { text: "I found this Rooster Spur. Is it useful?", next: "spurRecipe", requiresItem: "Rooster Spur" },
                            { text: "I'm looking for Ranger gear.", next: "RANGER_SET_QUEST_start" },
                            { text: "Just passing through.", next: "farewell" }
                        ]
                    },
                    RANGER_SET_QUEST_start: { text: "'You wish to walk the path of the Ranger? It takes more than a keen eye. Bring me three pieces of cured Leather, and I'll teach you to craft garments fit for the wilderness.'", options: [{ text: "I will gather the leather.", questId: "RANGER_SET_QUEST", next: "RANGER_SET_QUEST_inProgress" }, { text: "Perhaps another time.", next: "farewell" }] },
                    RANGER_SET_QUEST_inProgress: { text: "'Leather requires hides and tanning agents. Bring me three pieces when you have them.'", options: [{ text: "I'll return soon.", next: "farewell" }] },
                    RANGER_SET_QUEST_ready: { text: "'This is fine leather work. You have steady hands. Here, study these patterns. This is how you craft the armor of a true Ranger.'", options: [{ text: "My thanks.", questComplete: "RANGER_SET_QUEST", next: "allQuestsDone" }] },
                    allQuestsDone: { text: "'Keep your bowstring taut, and watch the wind.'", options: [{ text: "Farewell.", next: "farewell" }] },
                    about: { text: "'I've been shaping wood and feather for decades. If you need it to fly true and hit hard, I'm your man.'", options: [{ text: "Good to know.", next: "farewell" }] },
                    spurRecipe: { text: "'A Rooster Spur? Sharp as any steel, that is. Pair it with some Dark Wood for a handle, and you've got a fine, fast dagger. Here, let me show you how.'", options: [{ text: "I appreciate the lesson.", teachRecipe: "Spur Dagger", next: "spurRecipeLearned" }] },
                    spurRecipeLearned: { text: "'The Spur Dagger. Light, deadly, and easily concealed. Good hunting.'", options: [{ text: "Thanks.", next: "farewell" }] },
                    farewell: { text: "'May your aim be true.'", options: [] }
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
                    { id: "CHEF_MEAT_QUEST", title: "Good Meats", turnInItems: { "Pork": 2, "Raw Chicken": 2 }, reward: { gold: 30, qp: 1, recipeReward: ["Cooked Pork", "Cooked Chicken", "Cooked Rat Meat"] }, prerequisite: null },
                    { id: "CHEF_FISH_QUEST", title: "On The Lighter Side", turnInItems: { "Fish": 2, "Carrot": 2 }, reward: { gold: 40, qp: 1, recipeReward: ["Cooked Fish", "Spiced Carrots"] }, prerequisite: "CHEF_MEAT_QUEST" }
                ],
                dialogue: {
                    CHEF_MEAT_QUEST_start: { text: "'Welcome to my kitchen! I am trying a new, hearty stew, but I am woefully short on quality meats. Bring me two cuts of Pork and two Raw Chickens, and I will share my culinary secrets with you.'", options: [{ text: "I'll fetch the meat.", questId: "CHEF_MEAT_QUEST", next: "CHEF_MEAT_QUEST_inProgress" }, { text: "I'm no butcher.", next: "farewell" }] },
                    CHEF_MEAT_QUEST_inProgress: { text: "'The farms should have plenty of livestock. Two Pork and two Raw Chickens, please!'", options: [{ text: "I'm still hunting.", next: "farewell" }] },
                    CHEF_MEAT_QUEST_ready: { text: "'Ah, magnificent! These cuts are prime. Watch closely now, the secret is in the searing... there! A proper roast. The knowledge is yours.'", options: [{ text: "My compliments to the Chef.", questComplete: "CHEF_MEAT_QUEST", next: "CHEF_FISH_QUEST_start" }] },
                    CHEF_FISH_QUEST_start: { text: "'You have a palate for this! Now, we need something lighter to balance the menu. Two fresh Fish and two Carrots. Can you manage that?'", options: [{ text: "I'll find them.", questId: "CHEF_FISH_QUEST", next: "CHEF_FISH_QUEST_inProgress" }, { text: "I think I've cooked enough.", next: "farewell" }] },
                    CHEF_FISH_QUEST_inProgress: { text: "'The river has fish, and the fields have carrots. The stew won't wait forever!'", options: [{ text: "I will hurry.", next: "farewell" }] },
                    CHEF_FISH_QUEST_ready: { text: "'Beautifully fresh! The perfect contrast. Here is how you prepare them to preserve their natural flavor.'", options: [{ text: "Thank you for the recipes.", questComplete: "CHEF_FISH_QUEST", next: "allQuestsDone" }] },
                    allQuestsDone: { text: "'You've got the makings of a fine cook. Until our next feast!'", options: [{ text: "Farewell.", next: "farewell" }] },
                    farewell: { text: "'May your hearth always be warm!'", options: [] }
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
                    TAILOR_CLOTH_QUEST_start: { text: "'Greetings! My hands are weary from weaving, and I am in dire need of sturdy Cloth. Bring me five bolts, and I shall instruct you in crafting durable garments.'", options: [{ text: "I'll procure the cloth.", questId: "TAILOR_CLOTH_QUEST", next: "TAILOR_CLOTH_QUEST_inProgress" }, { text: "I prefer armor of iron.", next: "farewell" }] },
                    TAILOR_CLOTH_QUEST_inProgress: { text: "'Thread and Hemp can be woven into Cloth, or perhaps those unruly farmhands have some to spare.'", options: [{ text: "I understand.", next: "farewell" }] },
                    TAILOR_CLOTH_QUEST_ready: { text: "'Excellent weave, strong and dependable. Now, let me show you how to cut and stitch it into proper Cloth Armor. It won't stop an axe, but it will turn a dagger.'", options: [{ text: "Thank you.", questComplete: "TAILOR_CLOTH_QUEST", next: "TAILOR_SILK_QUEST_start" }] },
                    TAILOR_SILK_QUEST_start: { text: "'You learn quickly. Let us try something more ambitious. Silk. I need three bolts of refined Silk for a special commission. Can you manage it?'", options: [{ text: "I will find the silk.", questId: "TAILOR_SILK_QUEST", next: "TAILOR_SILK_QUEST_inProgress" }, { text: "Spiders are not to my liking.", next: "farewell" }] },
                    TAILOR_SILK_QUEST_inProgress: { text: "'The spiders of the Dark Forest spin the finest raw silk. Weave it with heavy thread.'", options: [{ text: "I will return when I have it.", next: "farewell" }] },
                    TAILOR_SILK_QUEST_ready: { text: "'Breathtaking. It flows like water. Here, the patterns for a masterwork: the Silk Wizard's garb. Wear it with pride.'", options: [{ text: "A masterpiece. Thank you.", questComplete: "TAILOR_SILK_QUEST", next: "allQuestsDone" }] },
                    allQuestsDone: { text: "'You possess a true artisan's touch. Come back if your garments ever need mending.'", options: [{ text: "Farewell.", next: "farewell" }] },
                    farewell: { text: "'May your threads never fray.'", options: [] }
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
                    WIZARD_ESSENCE_QUEST_start: { text: "'Hmm. You possess an aura of latent potential. The arcane arts demand strange reagents. Bring me three vials of Magic Essence from the goblin shamans. Do this, and I will share my knowledge.'", options: [{ text: "I shall retrieve the essence.", questId: "WIZARD_ESSENCE_QUEST", next: "WIZARD_ESSENCE_QUEST_inProgress" }, { text: "Magic brings only ruin.", next: "farewell" }] },
                    WIZARD_ESSENCE_QUEST_inProgress: { text: "'The primitive magic of the goblin shamans is crude, but potent. Bring me their essence.'", options: [{ text: "I'll return soon.", next: "farewell" }] },
                    WIZARD_ESSENCE_QUEST_ready: { text: "'Ah, yes. I can feel the chaotic energy humming within these vials. Excellent. You have earned your compensation.'", options: [{ text: "My thanks, Master Wizard.", questComplete: "WIZARD_ESSENCE_QUEST", next: "WIZARD_CRYSTAL_QUEST_start" }] },
                    WIZARD_CRYSTAL_QUEST_start: { text: "'Your potential continues to impress. I require a conduit of darker power for my next experiment. Two Dark Crystals from the depths of the forest.'", options: [{ text: "I will brave the dark woods.", questId: "WIZARD_CRYSTAL_QUEST", next: "WIZARD_CRYSTAL_QUEST_inProgress" }, { text: "I dare not enter those woods.", next: "farewell" }] },
                    WIZARD_CRYSTAL_QUEST_inProgress: { text: "'The forest shadows hold many crystallized secrets. I need two of them.'", options: [{ text: "I am searching.", next: "farewell" }] },
                    WIZARD_CRYSTAL_QUEST_ready: { text: "'Magnificent! The trapped ambient magic within these is ancient. Traces of an era long past. Well done, apprentice.'", options: [{ text: "I feel the power humming.", questComplete: "WIZARD_CRYSTAL_QUEST", next: "WIZARD_PLAGUE_QUEST_start" }] },
                    WIZARD_PLAGUE_QUEST_start: { text: "'For your final task, you must face true festering corruption. I require the Plague Essence found only in the deepest sewers. The magic of decay is dangerous, but vital to understand.'", options: [{ text: "I will face the corruption.", questId: "WIZARD_PLAGUE_QUEST", next: "WIZARD_PLAGUE_QUEST_inProgress" }, { text: "I want nothing to do with plague.", next: "farewell" }] },
                    WIZARD_PLAGUE_QUEST_inProgress: { text: "'The Plague Rats carry the essence of rot. Guard yourself well against their bite.'", options: [{ text: "I shall be careful.", next: "farewell" }] },
                    WIZARD_PLAGUE_QUEST_ready: { text: "'You survived. Remarkable. This essence... it practically writhes with necrotic energy. You have proven a most capable assistant. Please, take this reward. You have earned it.'", options: [{ text: "It was an honor to assist.", questComplete: "WIZARD_PLAGUE_QUEST", next: "allQuestsDone" }] },
                    allQuestsDone: { text: "'Your studies are complete for now. Continue to practice your arts. Magic is a muscle that must be exercised.'", options: [{ text: "Farewell, Master.", next: "farewell" }] },
                    farewell: { text: "'The weave of magic surrounds us all.'", options: [] }
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
        { card: { name: "Obsidian Vein", type: "resource", skill: "mining", description: "Jagged obsidian formations radiating dark energy.", loot: { name: "Obsidian Chunk" }, toolType: "mining", toolTier: 4, charges: 3, icon: "💎" }, count: 5 },
        { card: { name: "Ashenwood Tree", type: "resource", skill: "woodcutting", description: "A petrified tree scorched by volcanic heat.", loot: { name: "Ashenwood Log" }, toolType: "woodcutting", toolTier: 4, charges: 3, icon: "🌳" }, count: 5 },
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
                    FOREST_PATROL_start: { text: "'You there. Travel the outer roads if you must, but keep a hand on your weapon. The beasts of the wood grow bolder by the hour. If you've a mind to help, strike down eight of them. I'll see you compensated.'", options: [{ text: "I will clear the perimeter.", questId: "FOREST_PATROL", next: "FOREST_PATROL_inProgress" }, { text: "I prefer to stay in town.", next: "farewell" }] },
                    FOREST_PATROL_inProgress: { text: "'Eight beasts, traveler. Count your kills, and keep your guard up.'", options: [{ text: "I am on it.", next: "farewell" }] },
                    FOREST_PATROL_ready: { text: "'Word travels fast. They say the howls in the dark are fewer tonight. You've done a good deed. Take this bounty, with the Guard's thanks.'", options: [{ text: "It was my duty.", questComplete: "FOREST_PATROL", next: "allQuestsDone" }] },
                    allQuestsDone: { text: "'We hold the line here, but the dark is deep. Safe travels.'", options: [{ text: "Farewell.", next: "farewell" }] },
                    farewell: { text: "'May the Light guide you.'", options: [] }
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
                    { id: "VAMPIRE_HUNT", title: "The Inheritance", target: "Vampire", required: 1, reward: { qp: 2, gold: 300 }, prerequisite: null }
                ],
                dialogue: {
                    VAMPIRE_HUNT_start: { text: "'Please, you must help me! I married Lord Ashworth for his fortune, but that wretched old man just won't die! He never leaves his mansion, never eats... I just want what's mine. Can you... deal with him?'", options: [{ text: "I'll pay the lord a visit.", questId: "VAMPIRE_HUNT", next: "VAMPIRE_HUNT_inProgress" }, { text: "This isn't my concern.", next: "farewell" }] },
                    VAMPIRE_HUNT_inProgress: { text: "'The mansion is deeper in the forest. Be careful—strange things happen there at night.'", options: [{ text: "I'll find him.", next: "farewell" }] },
                    VAMPIRE_HUNT_ready: { text: "'He's dead? Finally! I mean... oh how tragic. Well, here's a little something for your... trouble. Speak to no one.'", options: [{ text: "Thanks for the tip.", questComplete: "VAMPIRE_HUNT", next: "allQuestsDone" }] },
                    allQuestsDone: { text: "'The mansion is mine now. Don't visit too often, will you?'", options: [{ text: "Farewell.", next: "farewell" }] },
                    farewell: { text: "'Good luck out there.'", options: [] }
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
        { card: { name: "Withered Tree", type: "resource", skill: "woodcutting", description: "A gnarled, dark-barked tree twisted by shadow.", loot: { name: "Dark Wood" }, toolType: "woodcutting", toolTier: 2, charges: 3, icon: "🌲", imageUrl: '/assets/darkforest-witheredtree.jpg' }, count: 5 },
        { card: { name: "Dark Crystal Node", type: "resource", skill: "mining", description: "A cluster of shadowy crystals pulsing with faint light.", loot: { name: "Dark Crystal" }, toolType: "mining", toolTier: 2, charges: 3, icon: "💎", imageUrl: '/assets/darkforest-darkcrystal.jpg' }, count: 5 },
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