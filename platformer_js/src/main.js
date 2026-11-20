/**
 * @module main
 * Main entry point for the platformer game
 */

import { Game } from './Game.js';

let game = null;
let hidden = false;
let disposed = false;

/**
 * Initialize one game for the current page lifetime.
 */
async function init() {
  if (disposed || hidden || game || document.readyState === 'loading') {
    return;
  }
  let candidate;
  try {
    candidate = new Game('gameCanvas');
    game = candidate;
    await candidate.init();
    if (game === candidate) {
      candidate.start();
    }
  } catch (error) {
    // Retired initialization may finish after a fresh page lifetime has started.
    if (candidate && game !== candidate) {
      return;
    }
    game = null;
    try {
      candidate?.dispose();
    } catch (cleanupError) {
      console.error(
        'Failed to dispose game after startup failure:',
        cleanupError
      );
    }
    console.error('Failed to initialize game:', error);
  }
}

function onPageHide() {
  hidden = true;
  const retired = game;
  game = null;
  retired?.dispose();
}

function onPageShow(event) {
  if (!disposed && hidden && event.persisted) {
    hidden = false;
    init();
  }
}

/**
 * Release the entry point before hot replacement or explicit removal.
 */
export function disposePage() {
  disposed = true;
  document.removeEventListener('DOMContentLoaded', init);
  window.removeEventListener('pagehide', onPageHide);
  window.removeEventListener('pageshow', onPageShow);
  onPageHide();
}

window.addEventListener('pagehide', onPageHide);
window.addEventListener('pageshow', onPageShow);

// Start when DOM is ready. A BFCache restoration starts a fresh Game.
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init, { once: true });
} else {
  init();
}

if (import.meta.hot) {
  import.meta.hot.accept();
  import.meta.hot.dispose(disposePage);
}
