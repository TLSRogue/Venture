// constants.js

// Durations are in milliseconds
export const PVP_TURN_DURATION_MS = 60000;
export const PVE_TURN_DURATION_MS = 30000;
export const LOOT_ROLL_DURATION_MS = 60000;
export const REACTION_TIMER_MS = 15000;
export const DUEL_DISCONNECT_MS = 20000;
export const PVP_QUEUE_TIMEOUT_MS = 5000;
export const INTERVENE_TIMER_MS = 5000;
export const MERCHANT_ROTATION_MS = 10 * 60 * 1000; // 10 minutes
export const DOCKS_LOCKOUT_MS = 10 * 60 * 1000; // 10 minutes

// Costs & Other Game Values
export const ARENA_ENTRY_FEE = 100;
export const ARENA_HP_SCALE_PER_ROUND = 0.25; // +25% HP per round
export const ARENA_DAMAGE_BONUS_PER_ROUND = 1; // +1 damage per round after round 1
export const ARENA_CHEST_BASE_GOLD = 75;
export const ARENA_CHEST_GOLD_PER_ROUND = 75;
export const BRIBE_CAPTAIN_COST = 1000;

// Combat
export const DEFAULT_ACTION_POINTS = 3;
export const DEFAULT_HIT_TARGET = 15;
export const RESOURCE_HIT_TARGET = 11;
export const BOSS_HP_SCALE_PER_PLAYER = 0.20; // +20% per additional player

// Starting Character Stats
export const STARTING_HEALTH = 10;
export const STARTING_GOLD = 300;

// Merchant
export const MERCHANT_STOCK_SIZE = 10;
export const MERCHANT_MAX_QUANTITY = 10;

// Loot Goblin
export const LOOT_GOBLIN_SPAWN_CHANCE = 0.33;

// Inventory
export const INVENTORY_SIZE = 28;