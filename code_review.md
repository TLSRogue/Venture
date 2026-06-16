# Venture Code & Game Review

A comprehensive review of the Venture multiplayer co-op card RPG codebase. This review identifies critical security vulnerabilities, game-breaking transaction bugs, turn logic edge cases, performance issues, and code maintainability opportunities.

---

## 🚨 Critical Security & Architecture Issues

### 1. High-Risk Security Vulnerability: Trusting the Client for Character Loading
* **Location**: [handlersConnection.js](file:///c:/Users/Travis/Documents/GitHub/Venture/handlersConnection.js#L98-L101)
* **Finding**: The socket handler `loadCharacter` receives a complete, client-provided character object from `localStorage` (`characterData`) and directly stores it in the server's in-memory `players` database.
  ```javascript
  socket.on('loadCharacter', (characterData) => {
    // When loading, we trust the data from localStorage.
    handlePlayerLogin(characterData);
  });
  ```
* **Impact**: A player can open the browser's developer console, modify their `localStorage` state (e.g., set `gold` to `999999`, inject high-tier gear or custom stats), and reconnect. The server will accept this data as the source of truth, bypass registration safety checks, and save it to the server's `players.json`.
* **Recommendation**: 
  - Migrate character state storage entirely to the server side.
  - The client should only pass a identifier/credentials (e.g. a session token or character name) to "log in" and load the character.
  - If a player logs in with a name that is not present in the server's database, they should be prompted to create/register a fresh character, rather than allowing the client to inject a pre-filled one.

### 2. Orphaned Server-Side Characters on Client-Side Deletion
* **Location**: [game.js](file:///c:/Users/Travis/Documents/GitHub/Venture/game.js#L722-L736)
* **Finding**: When a player deletes a character, the client removes it from their own `localStorage` under `ventureCharacterSlots` and redirects them to the select screen. However, no socket event is emitted to notify the server of this deletion.
* **Impact**: Deleted characters remain registered in the server's memory and in `players.json` indefinitely. Over time, this leads to state bloat and memory leaks.
* **Recommendation**: Add a `deleteCharacter` event to the socket system. When triggered, the server should delete the character from the `players` object and update `players.json`.

---

## ⚔️ Game-Breaking Mechanics & Transaction Bugs

### 3. Critical Transaction Failure in Trade Finalization (Item Deletion & Dupes)
* **Location**: [handlersTrade.js](file:///c:/Users/Travis/Documents/GitHub/Venture/handlersTrade.js#L206-L232)
* **Finding**: `processTradeTransfer` executes the trade transfer mutatively and step-by-step:
  ```javascript
  // Step 1: Remove Offer 1 from P1
  if (offer1.gold > 0) c1.gold -= offer1.gold;
  removeItems(c1, offer1.items);

  // Step 2: Remove Offer 2 from P2
  if (offer2.gold > 0) c2.gold -= offer2.gold;
  removeItems(c2, offer2.items);

  // Step 3: P1 receives Offer 2
  c1.gold += offer2.gold;
  if (!addItems(c1, offer2.items)) return false; // Fail here?

  // Step 4: P2 receives Offer 1
  c2.gold += offer1.gold;
  if (!addItems(c2, offer1.items)) return false; // Or fail here?
  ```
  If `addItems` returns `false` (e.g., because Player 2's inventory and bank are full), the function returns `false` and the trade fails. However, the items/gold have already been removed from both players, and Player 1 has already received Player 2's items! There is **no rollback logic** to restore deleted items or revert gold balances on failure.
* **Impact**: Players can easily lose their traded items permanently if their inventory overflows during a trade. This can also be exploited to duplicate gold or destroy items.
* **Recommendation**: Implement validation for inventory space *before* modifying any character stats, or write a rollback block:
  ```javascript
  // Pre-validate inventory space for both players
  if (!hasEnoughInventorySpace(c1, offer2.items) || !hasEnoughInventorySpace(c2, offer1.items)) {
    return false;
  }
  ```

### 4. Turn-Stuck Bug on Player Disconnection / Party Abandonment
* **Location**: [party-manager.js](file:///c:/Users/Travis/Documents/GitHub/Venture/party/party-manager.js#L173-L204)
* **Finding**: When a player leaves a party (or is cleaned up mid-adventure due to a disconnect), they are spliced out of `party.sharedState.partyMemberStates`:
  ```javascript
  party.sharedState.partyMemberStates.splice(memberIndex, 1);
  ```
  However, the `sharedState.activePlayerIndex` is never corrected or checked. If the active player was the last player in the list, `activePlayerIndex` will now point to an out-of-bounds index (i.e. equal to the new length of `partyMemberStates`).
* **Impact**: If it was that player's turn, or if `activePlayerIndex` becomes invalid, `activePlayer` on the server becomes `undefined`. When subsequent actions are sent, the server will block them because `activePlayer?.playerId !== player.id` will fail. The adventure gets permanently stuck and players are forced to surrender or leave the party to escape.
* **Recommendation**: When a player is removed from `partyMemberStates`, verify if `activePlayerIndex` points to an out-of-bounds index or the player who left. If so, call `startNextPlayerTurn` or decrement the index to advance the turn gracefully.

---

## ⚡ Performance & Scalability Concerns

### 5. Blocking Event Loop during Progress Saving
* **Location**: [handlersConnection.js](file:///c:/Users/Travis/Documents/GitHub/Venture/handlersConnection.js#L244-L249)
* **Finding**: The server uses `fs.writeFileSync('players.json', ...)` to save player progress synchronously during socket disconnection.
* **Impact**: `writeFileSync` blocks the entire single-threaded Node.js event loop while writing. As the player count grows and the `players.json` file becomes larger, every disconnection will cause a lag spike (frame drops, delayed socket messages) for all other active players on the server.
* **Recommendation**: Switch to asynchronous file writes (`fs.writeFile`) or throttle saves using an asynchronous queue/database (like SQLite) to prevent event-loop blockages.

---

## 📁 Code Quality & Maintenance

### 6. File Sizes & Tight Coupling
* **File sizes**:
  - `adventure-state.js` (92.6 KB, 2,254 lines)
  - `ui-adventure.js` (80.4 KB, 1,965 lines)
  - `game.js` (46.8 KB, 1,181 lines)
* **Finding**: `adventure-state.js` is overloaded with core state modifiers, network broadcasts, PvP turn cycles, quest objectives, and timers. This makes writing unit tests for combat logic very difficult.
* **Recommendation**: 
  - Extract the PvE turn cycle and PvP turn cycles into separate files (e.g., `pve-state-manager.js` and `pvp-state-manager.js`).
  - Extract the database logic out of socket connection files.

### 7. ESLint Dead Code & Unused Variables
* **Finding**: Running the linter returns **123 warnings** regarding unused variables and imports (e.g., `tookDamage`, `target`, `attack`, `ctx` in adventure handlers).
* **Recommendation**: Clean up unused imports and prefix unused handler arguments with an underscore (e.g., `_target`) to adhere to the config rules.
