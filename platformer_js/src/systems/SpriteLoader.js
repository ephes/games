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
    this.requests = new Map();
    this.batch = 0;
  }

  /**
   * Load a single sprite
   * @param {string} name - Sprite identifier
   * @param {string} path - Path to sprite image
   * @returns {Promise} Load promise
   */
  loadSprite(name, path) {
    const request = Symbol(name);
    this.requests.set(name, request);
    const img = new Image();
    const promise = new Promise((resolve, reject) => {
      img.onload = () => {
        if (this.requests.get(name) === request) {
          this.sprites.set(name, img);
          this.requests.delete(name);
        }
        resolve(img);
      };
      img.onerror = () => {
        if (this.requests.get(name) === request) {
          this.requests.delete(name);
        }
        reject(new Error(`Failed to load sprite: ${path}`));
      };
    });

    img.src = path;
    return promise;
  }

  /**
   * Load all game sprites
   * @returns {Promise} Promise that resolves when all sprites are loaded
   */
  async loadAll() {
    const batch = ++this.batch;
    this.loaded = false;
    const promises = [];
    this.loadPromises = promises;
    const load = (name, path) => promises.push(this.loadSprite(name, path));

    // Player sprites
    load('player.idle', 'assets/sprites/pink-man-idle.png');
    load('player.run', 'assets/sprites/pink-man-run.png');
    load('player.jump', 'assets/sprites/pink-man-jump.png');
    load('player.fall', 'assets/sprites/pink-man-fall.png');
    load('player.hit', 'assets/sprites/pink-man-hit.png');

    // Enemy sprites
    load('enemy.run', 'assets/sprites/slime-run.png');
    load('enemy.hit', 'assets/sprites/slime-hit.png');

    // Boss sprite
    load('boss', 'assets/sprites/boss_kobra_64x96-sheet.png');

    // Portal sprite
    load('portal', 'assets/sprites/level_portal_128.png');

    // Boss fireball sprite
    load('boss.fireball', 'assets/sprites/boss-fireball.png');

    try {
      await Promise.all(promises);
      if (this.batch === batch) {
        this.loaded = true;
      }
    } finally {
      if (this.batch === batch) {
        this.loadPromises = [];
      }
    }
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
