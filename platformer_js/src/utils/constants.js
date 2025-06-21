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
 * Level data
 */
export const LEVEL_DATA = {
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
    y: 150,
    platformIndex: 10
  },
  portal: {
    x: 2700,
    y: 222
  }
};
