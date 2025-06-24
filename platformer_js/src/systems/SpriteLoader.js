/**
 * @module systems/SpriteLoader
 */

/**
 * Manages sprite loading and caching
 */
export class SpriteLoader {
  constructor() {
    this.sprites = new Map();
    this.loaded = false;
    this.loadPromises = [];
  }

  /**
   * Load a single sprite
   * @param {string} name - Sprite identifier
   * @param {string} path - Path to sprite image
   * @returns {Promise} Load promise
   */
  loadSprite(name, path) {
    const img = new Image();
    const promise = new Promise((resolve, reject) => {
      img.onload = () => {
        this.sprites.set(name, img);
        resolve(img);
      };
      img.onerror = () => reject(new Error(`Failed to load sprite: ${path}`));
    });

    img.src = path;
    this.loadPromises.push(promise);
    return promise;
  }

  /**
   * Load all game sprites
   * @returns {Promise} Promise that resolves when all sprites are loaded
   */
  async loadAll() {
    // Player sprites
    this.loadSprite('player.idle', 'assets/sprites/pink-man-idle.png');
    this.loadSprite('player.run', 'assets/sprites/pink-man-run.png');
    this.loadSprite('player.jump', 'assets/sprites/pink-man-jump.png');
    this.loadSprite('player.fall', 'assets/sprites/pink-man-fall.png');
    this.loadSprite('player.hit', 'assets/sprites/pink-man-hit.png');

    // Enemy sprites
    this.loadSprite('enemy.run', 'assets/sprites/slime-run.png');
    this.loadSprite('enemy.hit', 'assets/sprites/slime-hit.png');

    // Boss sprite
    this.loadSprite('boss', 'assets/sprites/boss_kobra_64x96-sheet.png');

    // Portal sprite
    this.loadSprite('portal', 'assets/sprites/level_portal_128.png');

    await Promise.all(this.loadPromises);
    this.loaded = true;
  }

  /**
   * Get a loaded sprite
   * @param {string} name - Sprite name
   * @returns {Image|null} Sprite image or null
   */
  getSprite(name) {
    return this.sprites.get(name) || null;
  }

  /**
   * Get animation info for sprites
   * @returns {Object} Animation configurations
   */
  getAnimationConfig() {
    return {
      player: {
        frameWidth: 32,
        frameHeight: 32,
        animations: {
          idle: { frames: 11, fps: 15 },
          run: { frames: 12, fps: 15 },
          jump: { frames: 1, fps: 15 },
          fall: { frames: 1, fps: 15 },
          hit: { frames: 7, fps: 15 }
        }
      },
      enemy: {
        frameWidth: 44,
        frameHeight: 30,
        animations: {
          run: { frames: 10, fps: 15 },
          hit: { frames: 5, fps: 20 }
        }
      },
      boss: {
        frameWidth: 64,
        frameHeight: 96,
        frames: 5,
        fps: 10
      }
    };
  }
}
