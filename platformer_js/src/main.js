/**
 * @module main
 * Main entry point for the platformer game
 */

import { Game } from './Game.js';

/**
 * Initialize and start the game
 */
async function init() {
  try {
    const game = new Game('gameCanvas');
    // Wait for game to initialize (sprites to load)
    await game.init();
    game.start();
  } catch (error) {
    console.error('Failed to initialize game:', error);
  }
}

// Start when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
