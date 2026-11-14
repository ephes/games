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
    this.batchController = null;
  }

  /**
   * Load a single sprite
   * @param {string} name - Sprite identifier
   * @param {string} path - Path to sprite image
   * @param {Object} [options] - Optional signal and timeoutMs (default 10000)
   * @returns {Promise} Load promise
   */
  async loadSprite(name, path, options = {}) {
    const request = Symbol(name);
    this.requests.set(name, request);
    try {
      const img = await this.loadImage(path, options);
      if (this.requests.get(name) === request) {
        this.sprites.set(name, img);
      }
      return img;
    } finally {
      if (this.requests.get(name) === request) {
        this.requests.delete(name);
      }
    }
  }

  /** Load one image with a bounded lifetime and a single cleanup path. */
  loadImage(path, { signal, timeoutMs = 10_000 } = {}) {
    return new Promise((resolve, reject) => {
      if (
        !Number.isFinite(timeoutMs) ||
        timeoutMs <= 0 ||
        timeoutMs > 2_147_483_647
      ) {
        reject(new Error('Sprite timeout must be between 0 and 2147483647 ms'));
        return;
      }
      const img = new Image();
      let settled = false;
      const finish = error => {
        if (settled) {
          return;
        }
        settled = true;
        clearTimeout(timer);
        signal?.removeEventListener('abort', abort);
        img.onload = null;
        img.onerror = null;
        if (error) {
          reject(error);
        } else {
          resolve(img);
        }
      };
      const abort = () =>
        finish(new DOMException('Sprite load aborted', 'AbortError'));
      const timer = setTimeout(
        () => finish(new Error(`Sprite load timed out: ${path}`)),
        timeoutMs
      );
      img.onload = () => finish();
      img.onerror = () => finish(new Error(`Failed to load sprite: ${path}`));
      signal?.addEventListener('abort', abort, { once: true });
      if (signal?.aborted) {
        abort();
        return;
      }
      try {
        img.src = path;
      } catch (error) {
        finish(error);
      }
    });
  }

  /**
   * Load all game sprites
   * @param {Object} [options] - Optional signal and per-image timeoutMs (default 10000)
   * @returns {Promise} Promise that resolves when all sprites are loaded
   */
  async loadAll({ signal, timeoutMs = 10_000 } = {}) {
    this.batchController?.abort();
    const controller = new AbortController();
    this.batchController = controller;
    const abort = () => controller.abort();
    signal?.addEventListener('abort', abort, { once: true });
    if (signal?.aborted) {
      abort();
    }
    const batch = ++this.batch;
    this.loaded = false;
    const promises = [];
    this.loadPromises = promises;
    const staged = new Map();
    const requests = new Map();
    const load = (name, path) => {
      const request = Symbol(name);
      requests.set(name, request);
      this.requests.set(name, request);
      promises.push(
        this.loadImage(path, { signal: controller.signal, timeoutMs }).then(
          img => staged.set(name, img)
        )
      );
    };

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
      if (
        this.batch === batch &&
        [...requests].every(
          ([name, request]) => this.requests.get(name) === request
        )
      ) {
        for (const [name, img] of staged) {
          this.sprites.set(name, img);
        }
        this.loaded = true;
      }
    } finally {
      controller.abort();
      signal?.removeEventListener('abort', abort);
      for (const [name, request] of requests) {
        if (this.requests.get(name) === request) {
          this.requests.delete(name);
        }
      }
      if (this.batch === batch) {
        this.loadPromises = [];
        this.batchController = null;
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
