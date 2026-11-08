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
    this.lastShotTime = 0;
    this.currentLevel = 0;
    this.levels = LEVELS; // Can be replaced with LDtk levels
    this.totalLevels = this.levels.length;

    // Systems
    this.inputManager = new InputManager();
    this.spriteLoader = new SpriteLoader();
    this.camera = new Camera(this.canvas.width, this.canvas.height);
    this.renderer = null; // Created after sprites load
    this.ldtkLoader = new LDtkLoader();

    // Game objects
    this.player = null;
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
        await this.spriteLoader.loadAll();
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
    const bounds = {
      minX: 0,
      maxX: levelData.platforms.reduce(
        (right, platform) => Math.max(right, platform.x + platform.width),
        this.canvas.width
      ),
      minY: 0,
      maxY: this.canvas.height
    };

    const boss = new Boss(levelData.boss, bounds);

    this.player = player;
    this.platforms = platforms;
    this.coins = coins;
    this.enemies = enemies;
    this.boss = boss;
    this.portal = portal;
    this.camera.setBounds(bounds);
  }

  /**
   * Load next level
   */
  loadNextLevel() {
    this.currentLevel++;

    if (this.currentLevel >= this.levels.length) {
      // All levels completed!
      this.gameWon = true;
      // Clear objects when game is won
      this.platforms = [];
      this.coins = [];
      this.enemies = [];
      this.projectiles = [];
      return;
    }

    // Clear existing objects
    this.platforms = [];
    this.coins = [];
    this.enemies = [];
    this.projectiles = [];

    // Keep player stats but reset position
    const keepShootAbility = this.canShoot;

    // Create new level
    this.createLevel();

    // Restore abilities
    this.canShoot = keepShootAbility;

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

    const now = Date.now();
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
    this.player.update(keys, deltaTime);

    // Keep player in bounds
    const bounds = {
      minX: this.camera.bounds.minX,
      maxX: this.camera.bounds.maxX,
      maxY: this.canvas.height
    };
    const clamped = CollisionSystem.keepInBounds(this.player, bounds);
    this.player.x = clamped.x;
    this.player.y = clamped.y;

    // Platform collisions
    const collisionResult = CollisionSystem.checkPlatformCollisions(
      this.player,
      this.platforms
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
    this.camera.follow(this.player);

    // Update enemies
    this.enemies.forEach(enemy => enemy.update(this.platforms, deltaTime));
    this.boss.update(this.platforms, deltaTime, this.player);

    // Get boss projectiles and check collisions
    const bossProjectiles = this.boss.getProjectiles();
    for (const projectile of bossProjectiles) {
      if (
        projectile.active &&
        CollisionSystem.checkCollision(this.player, projectile)
      ) {
        projectile.active = false;
        this.lives = this.player.takeDamage(this.lives);
        if (this.lives <= 0) {
          this.gameOver = true;
          return;
        }
      }
    }

    // Update projectiles
    this.updateProjectiles(deltaTime);

    // Check collisions
    this.checkCollisions();
  }

  /**
   * Update projectiles
   * @param {number} deltaTime - Time since last update
   */
  updateProjectiles(deltaTime) {
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const projectile = this.projectiles[i];
      projectile.update(deltaTime);

      // Remove if out of bounds
      if (projectile.isOutOfBounds(this.camera.x, this.canvas.width)) {
        this.projectiles.splice(i, 1);
        continue;
      }

      // Check collisions
      const hit = CollisionSystem.checkProjectileCollisions(
        projectile,
        this.enemies,
        this.boss
      );

      if (hit) {
        if (hit.type === 'enemy') {
          if (hit.target.hit()) {
            this.score += 50;
          }
        } else if (hit.type === 'boss') {
          const points = hit.target.takeDamage();
          this.score += points;

          // Check if boss is defeated
          if (!this.boss.alive) {
            this.portal.unlock();
          }
        }
        this.projectiles.splice(i, 1);
      }
    }
  }

  /**
   * Check all collisions
   */
  checkCollisions() {
    if (this.gameOver || this.gameWon) {
      return;
    }

    // Coin collisions
    this.coins.forEach(coin => {
      if (
        CollisionSystem.checkCollision(
          this.player.getBounds(),
          coin.getBounds()
        )
      ) {
        const result = coin.collect();
        if (result.collected) {
          this.score += result.points;
          if (result.powerUp) {
            this.canShoot = true;
          }
        }
      }
    });

    // Enemy collisions
    for (const enemy of this.enemies) {
      const collision = CollisionSystem.checkEnemyCollision(this.player, enemy);
      if (collision === 'stomp') {
        if (enemy.hit()) {
          this.player.bounce();
          this.score += 50;
        }
      } else if (collision === 'damage') {
        this.lives = this.player.takeDamage(this.lives);
        if (this.lives <= 0) {
          this.gameOver = true;
          return;
        }
      }
    }

    // Boss collision
    const bossCollision = CollisionSystem.checkEnemyCollision(
      this.player,
      this.boss
    );
    if (bossCollision === 'stomp') {
      const points = this.boss.takeDamage();
      this.player.bounce();
      this.score += points;

      // Check if boss is defeated
      if (!this.boss.alive) {
        this.portal.unlock();
      }
    } else if (bossCollision === 'damage') {
      this.lives = this.player.takeDamage(this.lives);
      if (this.lives <= 0) {
        this.gameOver = true;
        return;
      }
    }

    // Portal collision - only allow entry if unlocked
    if (
      !this.portal.isLocked &&
      CollisionSystem.checkPortalEntry(this.player, this.portal)
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
    this.camera.applyTransform(this.ctx);

    // Draw game objects
    this.platforms.forEach(platform => platform.draw(this.ctx, 0));
    this.coins.forEach(coin => coin.draw(this.ctx, 0));
    this.enemies.forEach(enemy => this.renderer.drawEnemy(enemy));
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

    this.ctx.restore();

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
   * Start the game
   */
  start() {
    if (this.running || this.disposed) {
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
    cancelAnimationFrame(this.animationFrameId);
    this.inputManager.dispose();
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
        this.projectiles = [];
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
   * @returns {Promise<void>}
   */
  async addLDtkLevels(url) {
    if (this.disposed) {
      return;
    }
    const generation = ++this.importGeneration;
    try {
      const world = await this.ldtkLoader.loadWorld(url, { publish: false });
      if (this.disposed || generation !== this.importGeneration) {
        return;
      }
      const ldtkLevels = this.ldtkLoader.getAllLevels(world);

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
        this.ldtkLoader.world = world;
        this.levels = combined;
        this.totalLevels = this.levels.length;

        console.log(`Added ${ldtkLevels.length} levels from LDtk`);
      }
    } catch (error) {
      console.error('Failed to add LDtk levels:', error);
    }
  }

  /**
   * Reset current level
   */
  resetLevel() {
    // Recreate level
    this.createLevel();
    this.projectiles = [];

    // Reset camera
    this.camera.reset();
  }
}
