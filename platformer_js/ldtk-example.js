/**
 * Example of using LDtk levels in the game
 *
 * To use this:
 * 1. Copy this code to main.js after game.init()
 * 2. Make sure you have created levels in LDtk editor
 * 3. Save the .ldtk file in assets/levels/
 */

/* eslint-disable no-unused-vars, no-console */

import { LEVELS } from './src/utils/constants.js';

// Example 1: Replace all levels with LDtk levels
async function useLDtkLevelsOnly() {
  const game = window.game; // Assuming game is global

  // Load LDtk levels and replace built-in levels
  await game.loadLDtkLevels('./assets/levels/platformer.ldtk');
}

// Example 2: Add LDtk levels after built-in levels
async function addLDtkLevelsToGame() {
  const game = window.game;

  // Add LDtk levels to existing levels
  await game.addLDtkLevels('./assets/levels/platformer.ldtk');
}

// Example 3: Load LDtk levels with error handling
async function loadLDtkWithFallback() {
  const game = window.game;

  try {
    await game.loadLDtkLevels('./assets/levels/platformer.ldtk');
    console.log('LDtk levels loaded successfully');
  } catch (error) {
    console.error('Failed to load LDtk levels, using built-in levels', error);
  }
}

// Example 4: Toggle between built-in and LDtk levels
window.toggleLevelSource = async function () {
  const game = window.game;

  if (game.usingLDtk) {
    // Switch back to built-in levels
    game.levels = LEVELS;
    game.totalLevels = LEVELS.length;
    game.usingLDtk = false;
    console.log('Switched to built-in levels');
  } else {
    // Switch to LDtk levels
    await game.loadLDtkLevels('./assets/levels/platformer.ldtk');
    game.usingLDtk = true;
    console.log('Switched to LDtk levels');
  }

  game.resetLevel();
};

// Add to main.js after game initialization:
/*
window.addEventListener('load', async () => {
  const game = new Game('gameCanvas');
  window.game = game; // Make game accessible globally

  await game.init();

  // Optional: Load LDtk levels
  // await game.loadLDtkLevels('./assets/levels/platformer.ldtk');

  game.start();
});
*/
