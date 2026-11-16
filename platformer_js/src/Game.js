/**
 * @module Game
 */

import { Player } from './entities/Player.js';
import { Enemy } from './entities/Enemy.js';
import { Boss } from './entities/Boss.js';
import { Projectile } from './entities/Projectile.js';
import { Platform } from './objects/Platform.js';
import { Coin } from './objects/Coin.js';
import { Portal } from './objects/Portal.js';
import { InputManager } from './systems/InputManager.js';
import { CollisionSystem } from './systems/CollisionSystem.js';
import { Camera } from './systems/Camera.js';
import { SpriteLoader } from './systems/SpriteLoader.js';
import { Renderer } from './rendering/Renderer.js';
import {
  buildStaticWorldIndex,
  queryStaticWorld,
  retireStaticCoin,
  sweptBounds,
  visibleStaticObjects
} from './rendering/staticWorld.js';
import { GAME_CONFIG, LEVELS } from './utils/constants.js';
import { LDtkLoader, WORLD_LIMITS } from './systems/LDtkLoader.js';

/**
 * Main game class that coordinates all game systems
 */
export class Game {
  /**
   * Create game instance
   * @param {string} canvasId - Canvas element ID
   */
  constructor(canvasId) {
    this.canvas = document.getElementById(canvasId);
    this.ctx = this.canvas.getContext('2d');

    // Game state
    this.score = 0;
    this.lives = GAME_CONFIG.INITIAL_LIVES;
    this.gameOver = false;
    this.gameWon = false;
    this.canShoot = false;
    this.lastShotTime = -GAME_CONFIG.SHOT_COOLDOWN;
    this.currentLevel = 0;
    this.levels = LEVELS; // Can be replaced with LDtk levels
    this.totalLevels = this.levels.length;

    // Systems
    if (!this.canvas.hasAttribute('tabindex')) {
      this.canvas.tabIndex = 0;
    }
    this.onPointerDown = () => this.canvas.focus({ preventScroll: true });
    this.canvas.addEventListener('pointerdown', this.onPointerDown);
    this.inputManager = new InputManager(this.canvas);
    this.spriteLoader = new SpriteLoader();
    this.spriteController = new AbortController();
    this.camera = new Camera(this.canvas.width, this.canvas.height);
    this.renderer = null; // Created after sprites load
    this.ldtkLoader = new LDtkLoader();

    // Game objects
    this.player = null;
    this.staticWorldIndex = null;
    this.platforms = [];
    this.coins = [];
    this.enemies = [];
    this.boss = null;
    this.portal = null;
    this.projectiles = [];

    this.lastTime = 0;
    this.accumulator = 0;
    this.running = false;
    this.disposed = false;
    this.loopGeneration = 0;
    this.importGeneration = 0;
    this.initPromise = null;
    this.initialized = false;
  }

  /**
   * Initialize game
   */
  init() {
    if (this.initPromise) {
      return this.initPromise;
    }
    if (this.disposed) {
      return Promise.resolve();
    }
    this.initPromise = (async () => {
      try {
        await this.spriteLoader.loadAll({
          signal: this.spriteController.signal
        });
        if (this.disposed) {
          return;
        }
        this.renderer = new Renderer(this.canvas, this.spriteLoader);
        this.createLevel();
        this.setupInputHandlers();
        this.initialized = true;
      } catch (error) {
        this.dispose();
        throw error;
      }
    })();
    return this.initPromise;
  }

  /**
   * Construct all level objects before replacing the current playable state.
   * @param {Object} levelData - Level data (defaults to the current level)
   */
  createLevel(levelData = this.levels[this.currentLevel]) {
    const player = new Player(levelData.playerStart.x, levelData.playerStart.y);
    const platforms = levelData.platforms.map(
      data => new Platform(data.x, data.y, data.width, data.height)
    );
    const coins = levelData.coins.map(
      data => new Coin(data.x, data.y, data.isPowerUp)
    );
    const enemies = levelData.enemies.map(data => new Enemy(data));
    const portal = new Portal(levelData.portal.x, levelData.portal.y);
    portal.setSprite(this.spriteLoader.getSprite('portal'));
    const boss = new Boss(levelData.boss);
    const bounds = {
      minX: 0,
      maxX: Math.max(this.canvas.width, levelData.width ?? 0),
      minY: 0,
      maxY: Math.max(this.canvas.height, levelData.height ?? 0)
    };
    // Reduce each collection without spreading large collision meshes into a call.
    for (const objects of [platforms, coins, enemies, [player, boss, portal]]) {
      for (const object of objects) {
        const right = object.x + object.width;
        const bottom = object.y + object.height;
        if (![object.x, object.y, right, bottom].every(Number.isFinite)) {
          throw new Error('Invalid level object extent');
        }
        bounds.minX = Math.min(bounds.minX, object.x);
        bounds.minY = Math.min(bounds.minY, object.y);
        bounds.maxX = Math.max(bounds.maxX, right);
        bounds.maxY = Math.max(bounds.maxY, bottom);
      }
    }
    boss.bounds = bounds;
    const staticWorldIndex = buildStaticWorldIndex(platforms, coins);

    this.player?.dispose();
    this.player = player;
    this.staticWorldIndex = staticWorldIndex;
    this.platforms = platforms;
    this.indexedPlatforms = platforms;
    this.coins = coins;
    this.indexedCoins = coins;
    this.enemies = enemies;
    this.boss = boss;
    this.portal = portal;
    this.camera.setBounds(bounds);
  }

  /**
   * Load next level
   */
  loadNextLevel() {
    const nextLevel = this.currentLevel + 1;

    if (nextLevel >= this.levels.length) {
      // All levels completed!
      this.currentLevel = nextLevel;
      this.gameWon = true;
      this.player.dispose();
      // Clear objects when game is won
      this.staticWorldIndex = null;
      this.platforms = this.indexedPlatforms = [];
      this.coins = this.indexedCoins = [];
      this.enemies = [];
      this.projectiles = [];
      return;
    }

    // Construction may fail; keep the current index and objects until it succeeds.
    this.createLevel(this.levels[nextLevel]);
    this.currentLevel = nextLevel;
    this.projectiles = [];

    // Reset camera
    this.camera.reset();
  }

  /**
   * Set up input handlers
   */
  setupInputHandlers() {
    // Shooting
    this.inputManager.on('shoot:down', () => {
      this.shoot();
    });
  }

  /**
   * Create projectile
   */
  shoot() {
    if (
      !this.initialized ||
      this.disposed ||
      this.gameOver ||
      this.gameWon ||
      !this.canShoot
    ) {
      return;
    }

    const now = performance.now();
    if (now - this.lastShotTime < GAME_CONFIG.SHOT_COOLDOWN) {
      return;
    }

    const projectile = new Projectile(
      this.player.x + (this.player.direction > 0 ? this.player.width : 0),
      this.player.y + this.player.height / 2,
      this.player.direction
    );

    this.projectiles.push(projectile);
    this.lastShotTime = now;
  }

  /**
   * Main game loop
   * @param {number} timestamp - Current timestamp
   */
  gameLoop = (timestamp, generation) => {
    if (!this.running || this.disposed || generation !== this.loopGeneration) {
      return;
    }
    try {
      const step = 1000 / 60;
      const elapsed = Math.max(0, timestamp - this.lastTime);
      this.lastTime = timestamp;
      // Drop suspension time; ordinary slow frames can catch up at most five steps.
      if (elapsed > 250) {
        this.accumulator = 0;
      } else {
        this.accumulator += Math.min(elapsed, step * 5);
      }
      let steps = 0;
      while (this.accumulator + 1e-7 >= step && steps < 5) {
        this.accumulator = Math.max(0, this.accumulator - step);
        this.update(step);
        steps++;
        if (!this.running || this.disposed) {
          return;
        }
      }
      this.render();
      if (
        this.running &&
        !this.disposed &&
        generation === this.loopGeneration
      ) {
        this.animationFrameId = requestAnimationFrame(time =>
          this.gameLoop(time, generation)
        );
      }
    } catch (error) {
      this.dispose();
      throw error;
    }
  };

  /**
   * Update game state
   * @param {number} deltaTime - Time since last update
   */
  update(deltaTime) {
    if (this.gameOver || this.gameWon) {
      return;
    }

    // Update player
    const keys = this.inputManager.getKeys();
    let previousPlayer = { x: this.player.x, y: this.player.y };
    this.player.update(keys, deltaTime);

    // Keep player in bounds
    const bounds = {
      minX: this.camera.bounds.minX,
      maxX: this.camera.bounds.maxX,
      maxY: this.camera.bounds.maxY
    };
    const clamped = CollisionSystem.keepInBounds(this.player, bounds);
    this.player.x = clamped.x;
    this.player.y = clamped.y;

    // Platform collisions
    const collisionResult = CollisionSystem.checkPlatformCollisions(
      this.player,
      this.platforms === this.indexedPlatforms
        ? queryStaticWorld(
            this.staticWorldIndex,
            sweptBounds(this.player, previousPlayer),
            'platforms'
          )
        : this.platforms,
      previousPlayer
    );

    // If player is not on any platform, they should be jumping/falling
    if (!collisionResult.isGrounded) {
      // Check if player was previously grounded and just walked off a platform
      if (!this.player.isJumping && this.player.velocityY === 0) {
        this.player.velocityY = 0.1; // Small downward velocity to trigger falling
      }
      this.player.isJumping = true;
    }

    // Update camera
    this.camera.follow(this.player, true);

    // Snapshot target positions before movement for relative projectile sweeps.
    const previousTargets = new Map(
      [...this.enemies, this.boss].map(target => [
        target,
        { x: target.x, y: target.y }
      ])
    );

    // Update enemies
    this.enemies.forEach(enemy => enemy.update(this.platforms, deltaTime));
    this.enemies = this.enemies.filter(
      enemy => enemy.alive || enemy.isInHitAnimation()
    );
    this.boss.update(this.platforms, deltaTime, this.player, true);

    // Get boss projectiles and check collisions
    const bossProjectiles = this.boss.getProjectiles();
    for (const projectile of bossProjectiles) {
      if (
        projectile.active &&
        (projectile.previousPosition
          ? CollisionSystem.sweptContactTime(
              projectile,
              this.player,
              projectile.previousPosition,
              previousPlayer
            ) !== null
          : CollisionSystem.checkCollision(projectile, this.player))
      ) {
        projectile.active = false;
        const livesBefore = this.lives;
        this.lives = this.player.takeDamage(this.lives);
        if (this.lives <= 0) {
          this.gameOver = true;
          this.player.dispose();
          return;
        }
        if (this.lives < livesBefore) {
          // A respawn is a teleport, not a path later shots may sweep.
          previousPlayer = { x: this.player.x, y: this.player.y };
        }
      }
    }

    for (const projectile of bossProjectiles) {
      projectile.cull();
    }
    this.boss.projectiles = bossProjectiles.filter(
      projectile => projectile.active
    );

    // Update projectiles
    this.updateProjectiles(deltaTime, previousTargets);

    // Check collisions
    this.checkCollisions(previousPlayer, previousTargets);
  }

  /**
   * Update projectiles
   * @param {number} deltaTime - Time since last update
   * @param {Map} [previousTargets] - Target positions before this step
   */
  updateProjectiles(deltaTime, previousTargets = new Map()) {
    if (this.projectiles.length === 0) {
      return;
    }
    const index = CollisionSystem.buildProjectileIndex(
      this.enemies,
      this.boss,
      previousTargets
    );
    const pending = [];
    const consumed = new Set();
    const findHit = step =>
      CollisionSystem.checkProjectileCollisions(
        step.projectile,
        this.enemies,
        this.boss,
        step.previous,
        previousTargets,
        step.candidates
      );
    const compare = (a, b) => {
      if (a.hit.time !== b.hit.time) {
        return a.hit.time - b.hit.time;
      }
      // Simultaneous shots use pre-step geometry, then their endpoint. Exact
      // duplicate trajectories are interchangeable and retain storage order.
      for (const pose of ['previous', 'projectile']) {
        for (const key of ['x', 'y', 'width', 'height']) {
          const difference = a[pose][key] - b[pose][key];
          if (difference) {
            return difference;
          }
        }
      }
      return 0;
    };
    for (const projectile of this.projectiles) {
      const previous = {
        x: projectile.x,
        y: projectile.y,
        width: projectile.width,
        height: projectile.height
      };
      projectile.update(deltaTime);
      const step = {
        projectile,
        previous,
        candidates: CollisionSystem.queryProjectileIndex(
          index,
          projectile,
          previous
        )
      };
      step.hit = findHit(step);
      if (step.hit) {
        pending.push(step);
      }
    }
    pending.sort(compare);
    while (pending.length) {
      const step = pending.shift();
      const { hit, projectile } = step;
      if (!hit.target.alive) {
        // An earlier shot retired this target. Re-query the same swept path
        // and reinsert its next live contact into the remaining chronology.
        step.hit = findHit(step);
        if (step.hit) {
          pending.push(step);
          pending.sort(compare);
        }
        continue;
      }
      if (hit.type === 'enemy') {
        if (hit.target.hit()) {
          this.score += 50;
        }
      } else {
        this.score += hit.target.takeDamage();
        if (!this.boss.alive) {
          this.portal.unlock();
        }
      }
      consumed.add(projectile);
    }
    // Contacts take precedence over off-screen retirement for every shot.
    this.projectiles = this.projectiles.filter(
      projectile =>
        !consumed.has(projectile) &&
        !projectile.isOutOfBounds(this.camera.x, this.canvas.width)
    );
  }

  /**
   * Check all collisions
   */
  checkCollisions(previousPlayer, previousTargets = new Map()) {
    if (this.gameOver || this.gameWon) {
      return;
    }

    // Coins retain their existing precedence for exact time ties. A bounce/respawn replaces the remaining
    // sweep with current-pose overlaps, so coins beyond the contact cannot award.
    let remaining = this.enemies;
    let boss = this.boss;
    for (;;) {
      const bodyStart = previousPlayer ?? {
        x: this.player.x,
        y: this.player.y - Math.max(0, this.player.velocityY)
      };
      const hit = this.player.isInvulnerable
        ? null
        : CollisionSystem.checkProjectileCollisions(
            this.player,
            remaining,
            boss,
            bodyStart,
            previousTargets
          );
      const bodyTime = hit
        ? CollisionSystem.sweptContactTime(
            this.player,
            hit.target,
            bodyStart,
            previousTargets.get(hit.target) ?? hit.target
          )
        : Infinity;
      const coins =
        this.coins === this.indexedCoins
          ? queryStaticWorld(
              this.staticWorldIndex,
              sweptBounds(this.player, previousPlayer),
              'coins'
            )
          : this.coins;
      const contacts = coins
        .filter(coin => !coin.collected)
        .map(coin => ({
          coin,
          time: CollisionSystem.sweptContactTime(
            this.player.getBounds(),
            coin.getBounds(),
            previousPlayer ?? this.player,
            coin
          )
        }))
        .filter(contact => contact.time !== null && contact.time <= bodyTime)
        .sort((a, b) => a.time - b.time);
      for (const { coin } of contacts) {
        const result = coin.collect();
        if (result.collected) {
          retireStaticCoin(this.staticWorldIndex, coin);
          this.score += result.points;
          if (result.powerUp) {
            this.canShoot = true;
          }
        }
      }
      if (!hit) {
        break;
      }
      const { target, type } = hit;
      const collision = CollisionSystem.checkEnemyCollision(
        this.player,
        target,
        previousPlayer,
        previousTargets.get(target)
      );
      if (collision === 'stomp') {
        const points =
          type === 'boss' ? target.takeDamage() : target.hit() ? 50 : 0;
        this.score += points;
        this.player.y = target.y - this.player.height;
        this.player.bounce();
        if (type === 'boss' && !target.alive) {
          this.portal.unlock();
        }
      } else if (collision === 'damage') {
        this.lives = this.player.takeDamage(this.lives);
        if (this.lives <= 0) {
          this.gameOver = true;
          this.player.dispose();
          return;
        }
      }
      remaining = remaining.filter(enemy => enemy !== target);
      if (target === boss) {
        boss = null;
      }
      previousPlayer = { x: this.player.x, y: this.player.y };
      previousTargets = new Map();
    }

    // Portal collision - only allow entry if unlocked
    if (
      !this.portal.isLocked &&
      CollisionSystem.checkPortalEntry(
        this.player,
        this.portal,
        0.6,
        previousPlayer
      )
    ) {
      this.loadNextLevel();
    }
  }

  /**
   * Render game
   */
  render() {
    this.renderer.clear();

    // Apply camera transform
    this.ctx.save();
    try {
      this.camera.applyTransform(this.ctx);

      // Draw game objects
      for (const object of visibleStaticObjects(
        this.staticWorldIndex,
        this.camera
      )) {
        object.draw(this.ctx, 0);
      }
      for (const enemy of this.enemies) {
        // Run and hit sprites both fit the destination rectangle in either facing.
        if (this.camera.isVisible(enemy.getBounds())) {
          this.renderer.drawEnemy(enemy);
        }
      }
      this.renderer.drawBoss(this.boss);

      // Draw boss projectiles
      const bossProjectiles = this.boss.getProjectiles();
      const fireballSprite = this.spriteLoader.getSprite('boss.fireball');
      bossProjectiles.forEach(projectile => {
        if (fireballSprite) {
          projectile.drawWithSprite(this.ctx, this.camera, fireballSprite);
        } else {
          projectile.draw(this.ctx, this.camera);
        }
      });

      this.portal.draw(this.ctx, 0);
      this.projectiles.forEach(projectile => projectile.draw(this.ctx, 0));
      this.renderer.drawPlayer(this.player);
    } finally {
      this.ctx.restore();
    }

    // Draw UI (not affected by camera)
    this.drawUI();

    // Draw game state screens
    if (this.gameOver) {
      this.renderer.drawGameOver(this.score);
    } else if (this.gameWon) {
      this.renderer.drawWinScreen(this.score);
    }
  }

  /**
   * Draw UI elements
   */
  drawUI() {
    // Score
    this.renderer.drawText(`Score: ${this.score}`, 20, 30);

    // Lives
    this.renderer.drawText(`Lives: ${this.lives}`, 20, 60, { color: 'red' });

    // Level indicator
    const levelName = this.levels[this.currentLevel]?.name || 'Unknown';
    this.renderer.drawText(
      `Level ${this.currentLevel + 1}: ${levelName}`,
      20,
      90,
      { color: 'yellow' }
    );

    // Controls
    let controls = 'Controls: Arrow Keys to move';
    if (this.canShoot) {
      controls += ', SPACE to shoot';
    }
    this.renderer.drawText(controls, 20, this.canvas.height - 20, {
      font: '16px Arial'
    });
  }

  /**
   * Start the initialized game; early calls are ignored. Await init() first.
   */
  start() {
    if (!this.initialized || this.running || this.disposed) {
      return;
    }
    this.running = true;
    this.accumulator = 0;
    this.lastTime = performance.now();
    this.gameLoop(this.lastTime, ++this.loopGeneration);
  }

  /**
   * Stop animation and release keyboard listeners before replacing the game.
   */
  dispose() {
    if (this.disposed) {
      return;
    }
    this.disposed = true;
    this.running = false;
    this.loopGeneration++;
    this.importGeneration++;
    this.ldtkLoader.cancelLoad();
    this.spriteController.abort();
    cancelAnimationFrame(this.animationFrameId);
    this.inputManager.dispose();
    this.canvas.removeEventListener('pointerdown', this.onPointerDown);
    this.player?.dispose();
  }

  /**
   * Require playable exits and bosses in every converted import level.
   * Numeric fields, patrol geometry and optional defaults are checked by the loader.
   * @param {Array} levels - Converted candidate levels
   */
  validateLDtkLevels(levels) {
    for (const level of levels) {
      for (const [entity, value] of [
        ['Boss', level.boss],
        ['Portal', level.portal]
      ]) {
        if (!value) {
          throw new Error(`LDtk level ${level.name} requires ${entity}`);
        }
      }
    }
  }

  /**
   * Load and use LDtk levels
   * @param {string} url - URL to LDtk file
   * @returns {Promise<boolean>} True on replacement; false leaves play unchanged
   */
  async loadLDtkLevels(url) {
    if (this.disposed) {
      return false;
    }
    const generation = ++this.importGeneration;
    try {
      const world = await this.ldtkLoader.loadWorld(url, { publish: false });
      if (this.disposed || generation !== this.importGeneration) {
        return false;
      }
      const ldtkLevels = this.ldtkLoader.getAllLevels(world);
      this.validateLDtkLevels(ldtkLevels);

      if (ldtkLevels.length > 0) {
        const index =
          Number.isInteger(this.currentLevel) &&
          this.currentLevel >= 0 &&
          this.currentLevel < ldtkLevels.length
            ? this.currentLevel
            : 0;

        // Construction may fail; do not publish the new table until it succeeds.
        this.createLevel(ldtkLevels[index]);
        this.ldtkLoader.world = world;
        this.levels = ldtkLevels;
        this.totalLevels = ldtkLevels.length;
        this.currentLevel = index;
        this.restorePlayableLevel();
        this.camera.reset();

        console.log(`Loaded ${ldtkLevels.length} levels from LDtk`);
        return true;
      }
    } catch (error) {
      console.error('Failed to load LDtk levels:', error);
    }
    return false;
  }

  /**
   * Add LDtk levels to existing levels
   * @param {string} url - URL to LDtk file
   * @returns {Promise<boolean>} True on append; false leaves play unchanged
   */
  async addLDtkLevels(url) {
    if (this.disposed) {
      return false;
    }
    const generation = ++this.importGeneration;
    try {
      const world = await this.ldtkLoader.loadWorld(url, { publish: false });
      if (this.disposed || generation !== this.importGeneration) {
        return false;
      }
      const ldtkLevels = this.ldtkLoader.getAllLevels(world);
      this.validateLDtkLevels(ldtkLevels);

      if (ldtkLevels.length > 0) {
        const combined = [...this.levels, ...ldtkLevels];
        if (combined.length > WORLD_LIMITS.levels) {
          throw new Error('LDtk level budget exceeded');
        }
        if (
          combined.reduce(
            (count, level) =>
              count + level.enemies.length + level.coins.length + 3,
            0
          ) > WORLD_LIMITS.entities
        ) {
          throw new Error('LDtk world entity budget exceeded');
        }
        if (
          combined.reduce((count, level) => count + level.platforms.length, 0) >
          WORLD_LIMITS.platforms
        ) {
          throw new Error('LDtk world platform budget exceeded');
        }
        this.ldtkLoader.world = world;
        this.levels = combined;
        this.totalLevels = this.levels.length;

        console.log(`Added ${ldtkLevels.length} levels from LDtk`);
        return true;
      }
    } catch (error) {
      console.error('Failed to add LDtk levels:', error);
    }
    return false;
  }

  /**
   * Reset current level
   */
  resetLevel() {
    if (this.disposed) {
      return false;
    }
    const index = this.gameWon ? 0 : this.currentLevel;
    this.createLevel(this.levels[index]);
    this.currentLevel = index;
    this.restorePlayableLevel();
    this.camera.reset();
    return true;
  }

  /** Publish recovery only after a new level's objects have been constructed. */
  restorePlayableLevel() {
    if (this.gameOver || this.gameWon) {
      this.lives = GAME_CONFIG.INITIAL_LIVES;
    }
    this.gameOver = false;
    this.gameWon = false;
    this.projectiles = [];
    this.inputManager.reset();
    this.accumulator = 0;
  }
}
