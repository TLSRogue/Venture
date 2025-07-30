// serverState.js

/**
 * This file holds the "in-memory database" for the server.
 * All dynamic game state that needs to be shared across modules is stored here.
 */

export let players = {}; // Keyed by characterName
export let parties = {}; // Keyed by partyId
export let duels = {};   // Keyed by duelId