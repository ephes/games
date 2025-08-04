/**
 * @module utils/constants
 */

/**
 * Game configuration constants
 */
export const GAME_CONFIG = {
  CANVAS_WIDTH: 800,
  CANVAS_HEIGHT: 400,
  GRAVITY: 0.5,
  INITIAL_LIVES: 3,
  INVULNERABILITY_DURATION: 2000,
  SHOT_COOLDOWN: 500
};

/**
 * Player configuration
 */
export const PLAYER_CONFIG = {
  START_X: 50,
  START_Y: 200,
  WIDTH: 30,
  HEIGHT: 30,
  SPEED: 5,
  JUMP_FORCE: 12
};

/**
 * Level data - Array of levels
 */
export const LEVELS = [
  // Level 1
  {
    name: 'The Beginning',
    playerStart: { x: 50, y: 200 },
    platforms: [
      { x: 0, y: 350, width: 3000, height: 50 }, // Ground
      { x: 300, y: 250, width: 200, height: 20 },
      { x: 100, y: 150, width: 200, height: 20 },
      { x: 500, y: 200, width: 200, height: 20 },
      { x: 800, y: 150, width: 200, height: 20 },
      { x: 1100, y: 250, width: 200, height: 20 },
      { x: 1400, y: 150, width: 200, height: 20 },
      { x: 1700, y: 200, width: 200, height: 20 },
      { x: 2000, y: 250, width: 200, height: 20 },
      { x: 2300, y: 150, width: 200, height: 20 },
      { x: 2600, y: 200, width: 200, height: 20 }
    ],
    coins: [
      { x: 350, y: 200, isPowerUp: true },
      { x: 150, y: 100 },
      { x: 550, y: 150 },
      { x: 850, y: 100 },
      { x: 1150, y: 200 },
      { x: 1450, y: 100 },
      { x: 1750, y: 150 },
      { x: 2050, y: 200 },
      { x: 2350, y: 100 },
      { x: 2650, y: 150, isPowerUp: true }
    ],
    enemies: [
      { x: 320, y: 220, speed: 2, platformIndex: 1 },
      { x: 120, y: 120, speed: 3, platformIndex: 2 },
      { x: 820, y: 170, speed: 2, platformIndex: 3 },
      { x: 1120, y: 220, speed: 3, platformIndex: 5 },
      { x: 1420, y: 120, speed: 2, platformIndex: 6 },
      { x: 1720, y: 170, speed: 3, platformIndex: 7 },
      { x: 2020, y: 220, speed: 2, platformIndex: 8 }
    ],
    boss: {
      x: 2600,
      y: 270, // Adjusted to be closer to ground
      platformIndex: 0 // Ground platform
    },
    portal: {
      x: 2700,
      y: 222
    }
  },

  // Level 2
  {
    name: 'Sky Castle',
    playerStart: { x: 50, y: 300 },
    platforms: [
      { x: 0, y: 350, width: 3500, height: 50 }, // Ground
      // Staircase pattern
      { x: 200, y: 300, width: 150, height: 20 },
      { x: 400, y: 250, width: 150, height: 20 },
      { x: 600, y: 200, width: 150, height: 20 },
      { x: 800, y: 150, width: 150, height: 20 },
      // Upper level platforms
      { x: 1000, y: 120, width: 300, height: 20 },
      { x: 1400, y: 120, width: 300, height: 20 },
      { x: 1800, y: 120, width: 300, height: 20 },
      // Moving platform positions
      { x: 1100, y: 250, width: 100, height: 20 },
      { x: 1500, y: 250, width: 100, height: 20 },
      { x: 1900, y: 250, width: 100, height: 20 },
      // Boss arena
      { x: 2200, y: 250, width: 400, height: 20 },
      { x: 2700, y: 200, width: 200, height: 20 },
      { x: 3000, y: 150, width: 200, height: 20 }
    ],
    coins: [
      { x: 250, y: 250, isPowerUp: true },
      { x: 450, y: 200 },
      { x: 650, y: 150 },
      { x: 850, y: 100 },
      { x: 1150, y: 70 },
      { x: 1550, y: 70 },
      { x: 1950, y: 70 },
      { x: 1150, y: 200 },
      { x: 1550, y: 200 },
      { x: 1950, y: 200 },
      { x: 2400, y: 200, isPowerUp: true },
      { x: 2800, y: 150 },
      { x: 3100, y: 100 }
    ],
    enemies: [
      { x: 250, y: 270, speed: 2, platformIndex: 1 },
      { x: 450, y: 220, speed: 3, platformIndex: 2 },
      { x: 650, y: 170, speed: 2, platformIndex: 3 },
      { x: 1050, y: 90, speed: 3, platformIndex: 5 },
      { x: 1450, y: 90, speed: 2, platformIndex: 6 },
      { x: 1850, y: 90, speed: 3, platformIndex: 7 },
      { x: 1150, y: 220, speed: 4, platformIndex: 8 },
      { x: 1550, y: 220, speed: 4, platformIndex: 9 },
      { x: 1950, y: 220, speed: 4, platformIndex: 10 }
    ],
    boss: {
      x: 2800,
      y: 270, // Adjusted to be closer to ground
      platformIndex: 0 // Ground platform
    },
    portal: {
      x: 3300,
      y: 222
    }
  }
];

// For backward compatibility
export const LEVEL_DATA = LEVELS[0];
