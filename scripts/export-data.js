import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { gameData } from '../data/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const outputDir = path.join(__dirname, '..', 'VentureClient', 'Content', 'data');
if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir, { recursive: true });
}

// Write gameData sections to files
fs.writeFileSync(path.join(outputDir, 'allItems.json'), JSON.stringify(gameData.allItems, null, 2));
fs.writeFileSync(path.join(outputDir, 'allSpells.json'), JSON.stringify(gameData.allSpells, null, 2));
fs.writeFileSync(path.join(outputDir, 'cardPools.json'), JSON.stringify(gameData.cardPools, null, 2));
fs.writeFileSync(path.join(outputDir, 'specialCards.json'), JSON.stringify(gameData.specialCards, null, 2));
fs.writeFileSync(path.join(outputDir, 'craftingRecipes.json'), JSON.stringify(gameData.craftingRecipes, null, 2));
fs.writeFileSync(
  path.join(outputDir, 'genericTreasureLoot.json'),
  JSON.stringify(gameData.genericTreasureLoot, null, 2)
);

console.log('Game data exported successfully to:', outputDir);
