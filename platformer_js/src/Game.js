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
import { GAME_CONFIG, PLAYER_CONFIG, LEVEL_DATA } from './utils/constants.js';

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

    // Systems
    this.inputManager = new InputManager();
    this.spriteLoader = new SpriteLoader();
    this.camera = new Camera(this.canvas.width, this.canvas.height);
    this.renderer = null; // Created after sprites load

    // Game objects
    this.player = null;
    this.platforms = [];
    this.coins = [];
    this.enemies = [];
    this.boss = null;
    this.portal = null;
    this.projectiles = [];

    this.lastTime = 0;
  }

  /**
   * Initialize game
   */
  async init() {
    // Load sprites first
    await this.spriteLoader.loadAll();

    // Create renderer with loaded sprites
    this.renderer = new Renderer(this.canvas, this.spriteLoader);

    // Initialize game objects
    this.createLevel();
    this.setupInputHandlers();

    // Set camera bounds
    const ground = this.platforms[0];
    this.camera.setBounds({
      minX: 0,
      maxX: ground.width,
      minY: 0,
      maxY: this.canvas.height
    });
  }

  /**
   * Create level from data
   */
  createLevel() {
    // Create player
    this.player = new Player(PLAYER_CONFIG.START_X, PLAYER_CONFIG.START_Y);

    // Create platforms
    LEVEL_DATA.platforms.forEach(data => {
      this.platforms.push(
        new Platform(data.x, data.y, data.width, data.height)
      );
    });

    // Create coins
    LEVEL_DATA.coins.forEach(data => {
      this.coins.push(new Coin(data.x, data.y, data.isPowerUp));
    });

    // Create enemies
    LEVEL_DATA.enemies.forEach(data => {
      this.enemies.push(new Enemy(data));
    });

    // Create boss
    this.boss = new Boss(LEVEL_DATA.boss);

    // Create portal
    this.portal = new Portal(LEVEL_DATA.portal.x, LEVEL_DATA.portal.y);
    this.portal.setSprite(this.spriteLoader.getSprite('portal'));
  }

  /**
   * Set up input handlers
   */
  setupInputHandlers() {
    // Shooting
    this.inputManager.on('shoot:down', () => {
      if (this.canShoot && !this.gameOver && !this.gameWon) {
        this.shoot();
      }
    });
  }

  /**
   * Create projectile
   */
  shoot() {
    if (!this.canShoot) {
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
  gameLoop = timestamp => {
    const deltaTime = timestamp - this.lastTime;
    this.lastTime = timestamp;

    this.update(deltaTime);
    this.render();

    requestAnimationFrame(this.gameLoop);
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
    const ground = this.platforms[0];
    const bounds = {
      minX: 0,
      maxX: ground.width,
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
          hit.target.hit();
          this.score += 50;
        } else if (hit.type === 'boss') {
          const points = hit.target.takeDamage();
          this.score += points;
        }
        this.projectiles.splice(i, 1);
      }
    }
  }

  /**
   * Check all collisions
   */
  checkCollisions() {
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
    this.enemies.forEach(enemy => {
      const collision = CollisionSystem.checkEnemyCollision(this.player, enemy);
      if (collision === 'stomp') {
        enemy.hit();
        this.player.bounce();
        this.score += 50;
      } else if (collision === 'damage') {
        this.lives = this.player.takeDamage(this.lives);
        if (this.lives <= 0) {
          this.gameOver = true;
        }
      }
    });

    // Boss collision
    const bossCollision = CollisionSystem.checkEnemyCollision(
      this.player,
      this.boss
    );
    if (bossCollision === 'stomp') {
      const points = this.boss.takeDamage();
      this.player.bounce();
      this.score += points;
    } else if (bossCollision === 'damage') {
      this.lives = this.player.takeDamage(this.lives);
      if (this.lives <= 0) {
        this.gameOver = true;
      }
    }

    // Portal collision
    if (CollisionSystem.checkPortalEntry(this.player, this.portal)) {
      this.gameWon = true;
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
    this.lastTime = performance.now();
    this.gameLoop(this.lastTime);
  }
}
