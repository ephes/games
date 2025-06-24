import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Game } from '../src/Game.js';
import { CollisionSystem } from '../src/systems/CollisionSystem.js';

// Mock the SpriteLoader to avoid loading actual images in tests
vi.mock('../src/systems/SpriteLoader.js', () => ({
  SpriteLoader: class {
    async loadAll() {
      return Promise.resolve();
    }
    getSprite() {
      return { width: 64, height: 64 };
    }
    getAnimationConfig() {
      return {
        idle: { frames: 11, speed: 15 },
        run: { frames: 12, speed: 15 },
        jump: { frames: 1, speed: 15 },
        fall: { frames: 1, speed: 15 },
        hit: { frames: 7, speed: 15 }
      };
    }
  }
}));

describe('PlatformerGame', () => {
  let game;
  let canvas;

  beforeEach(async () => {
    // Create mock canvas element
    canvas = document.createElement('canvas');
    canvas.id = 'gameCanvas';
    canvas.width = 800;
    canvas.height = 400;
    document.body.appendChild(canvas);

    // Create game instance and initialize
    game = new Game('gameCanvas');
    await game.init();
  });

  describe('Initialization', () => {
    it('should initialize with default values', () => {
      expect(game.score).toBe(0);
      expect(game.lives).toBe(3);
      expect(game.gameOver).toBe(false);
      expect(game.gameWon).toBe(false);
      expect(game.canShoot).toBe(false);
    });

    it('should create player at starting position', () => {
      expect(game.player.x).toBe(50);
      expect(game.player.y).toBe(200);
      expect(game.player.width).toBe(30);
      expect(game.player.height).toBe(30);
    });

    it('should create platforms', () => {
      expect(game.platforms).toHaveLength(11);
      expect(game.platforms[0].x).toBe(0);
      expect(game.platforms[0].y).toBe(350);
      expect(game.platforms[0].width).toBe(3000);
      expect(game.platforms[0].height).toBe(50);
    });

    it('should create coins with power-ups', () => {
      expect(game.coins).toHaveLength(10);
      const powerUpCoins = game.coins.filter(coin => coin.isPowerUp);
      expect(powerUpCoins).toHaveLength(2);
    });

    it('should create enemies', () => {
      expect(game.enemies).toHaveLength(7);
      game.enemies.forEach(enemy => {
        expect(enemy.alive).toBe(true);
        expect(enemy.width).toBe(44);
        expect(enemy.height).toBe(30);
      });
    });

    it('should create boss', () => {
      expect(game.boss).toBeDefined();
      expect(game.boss.health).toBe(10);
      expect(game.boss.alive).toBe(true);
      expect(game.boss.x).toBe(2600);
    });

    it('should create portal at end of level', () => {
      expect(game.portal.x).toBe(2700);
      expect(game.portal.y).toBe(222);
      expect(game.portal.width).toBe(128);
      expect(game.portal.height).toBe(128);
    });
  });

  describe('Collision Detection', () => {
    it('should detect collision between two rectangles', () => {
      const rect1 = { x: 0, y: 0, width: 10, height: 10 };
      const rect2 = { x: 5, y: 5, width: 10, height: 10 };
      const rect3 = { x: 20, y: 20, width: 10, height: 10 };

      expect(CollisionSystem.checkCollision(rect1, rect2)).toBe(true);
      expect(CollisionSystem.checkCollision(rect1, rect3)).toBe(false);
    });
  });

  describe('Player Movement', () => {
    it('should move player left when left arrow is pressed', () => {
      const initialX = game.player.x;
      // Simulate key press
      game.inputManager.keys['ArrowLeft'] = true;
      // Update player
      game.player.update(game.inputManager.keys, 16);
      expect(game.player.x).toBe(initialX - game.player.speed);
      expect(game.player.direction).toBe(-1);
    });

    it('should move player right when right arrow is pressed', () => {
      const initialX = game.player.x;
      // Simulate key press
      game.inputManager.keys['ArrowRight'] = true;
      // Update player
      game.player.update(game.inputManager.keys, 16);
      expect(game.player.x).toBe(initialX + game.player.speed);
      expect(game.player.direction).toBe(1);
    });

    it('should apply gravity to player', () => {
      game.player.velocityY = 0;
      game.player.update(game.inputManager.keys, 16);
      expect(game.player.velocityY).toBe(game.player.gravity);
    });

    it('should not move player beyond level boundaries', () => {
      game.player.x = -10;
      const bounds = { minX: 0, maxX: 3000, maxY: 400 };
      const clamped = CollisionSystem.keepInBounds(game.player, bounds);
      expect(clamped.x).toBe(0);

      game.player.x = 5000;
      const clamped2 = CollisionSystem.keepInBounds(game.player, bounds);
      expect(clamped2.x).toBeLessThan(3000);
    });
  });

  describe('Coin Collection', () => {
    it('should collect coin on collision', () => {
      const coin = game.coins[0];
      game.player.x = coin.x;
      game.player.y = coin.y;

      // Manually check collision like game does
      game.checkCollisions();

      expect(coin.collected).toBe(true);
      expect(game.score).toBe(10);
    });

    it('should grant shooting ability from power-up coins', () => {
      const powerUpCoin = game.coins.find(coin => coin.isPowerUp);
      game.player.x = powerUpCoin.x;
      game.player.y = powerUpCoin.y;

      // Manually check collision like game does
      game.checkCollisions();

      expect(game.canShoot).toBe(true);
    });
  });

  describe('Shooting Mechanics', () => {
    beforeEach(() => {
      game.canShoot = true;
      game.lastShotTime = 0;
    });

    it('should create projectile when shooting', () => {
      const initialProjectiles = game.projectiles.length;
      game.shoot();
      expect(game.projectiles.length).toBe(initialProjectiles + 1);
    });

    it('should not shoot without power-up', () => {
      game.canShoot = false;
      const initialProjectiles = game.projectiles.length;
      game.shoot();
      expect(game.projectiles.length).toBe(initialProjectiles);
    });

    it('should respect shot cooldown', () => {
      game.shoot();
      const firstCount = game.projectiles.length;

      // Try to shoot immediately
      game.shoot();
      expect(game.projectiles.length).toBe(firstCount);

      // Wait for cooldown
      game.lastShotTime = Date.now() - 500 - 1; // SHOT_COOLDOWN is 500
      game.shoot();
      expect(game.projectiles.length).toBe(firstCount + 1);
    });

    it('should create projectile in player direction', () => {
      game.player.direction = 1;
      game.shoot();
      const projectile = game.projectiles[game.projectiles.length - 1];
      expect(projectile.direction).toBe(1);
      expect(projectile.x).toBe(game.player.x + game.player.width);
    });
  });

  describe('Enemy Behavior', () => {
    it('should move enemies back and forth on platforms', () => {
      const enemy = game.enemies[0];
      const platformIndex = 1; // Most enemies are on platform index 1
      const platform = game.platforms[platformIndex];

      // Move enemy to platform edge
      enemy.x = platform.x;
      enemy.direction = -1;
      enemy.update(game.platforms, 16);

      expect(enemy.direction).toBe(1);
      expect(enemy.x).toBeGreaterThanOrEqual(platform.x);
    });

    it('should damage player on collision', () => {
      const enemy = game.enemies[0];
      game.player.x = enemy.x;
      game.player.y = enemy.y;
      game.player.velocityY = 0; // Not jumping
      game.player.isInvulnerable = false;

      game.checkCollisions();

      expect(game.lives).toBe(2);
      expect(game.player.isInvulnerable).toBe(true);
    });

    it('should kill enemy when player jumps on it', () => {
      const enemy = game.enemies[0];
      // Position player above enemy
      game.player.x = enemy.x;
      game.player.y = enemy.y - game.player.height + 5; // Overlap slightly
      game.player.velocityY = 5; // Falling down

      game.checkCollisions();

      expect(enemy.isHit).toBe(true);
      expect(game.score).toBe(50);
      expect(game.player.velocityY).toBeLessThan(0); // Bounced
    });
  });

  describe('Boss Fight', () => {
    it('should damage boss with projectiles', () => {
      // Ensure boss is alive
      expect(game.boss.alive).toBe(true);
      expect(game.boss.width).toBe(64);
      expect(game.boss.height).toBe(96);

      // Create a projectile at boss position
      game.canShoot = true;
      game.lastShotTime = 0;
      game.player.x = game.boss.x - 100;
      game.player.y = game.boss.y;
      game.player.direction = 1;

      game.shoot();
      const projectile = game.projectiles[0];
      expect(projectile).toBeDefined();

      // Move projectile to overlap with boss
      projectile.x = game.boss.x + 10; // Well inside boss bounds
      projectile.y = game.boss.y + 10;

      const initialHealth = game.boss.health;

      // Test collision directly first
      const collision = CollisionSystem.checkCollision(projectile, game.boss);
      expect(collision).toBe(true);

      // Set camera position to ensure projectile isn't removed as out of bounds
      game.camera.x = game.boss.x - 100;

      // Check if projectile would be considered out of bounds
      const outOfBounds = projectile.isOutOfBounds(
        game.camera.x,
        game.canvas.width
      );
      expect(outOfBounds).toBe(false);

      game.updateProjectiles(16);

      expect(game.boss.health).toBe(initialHealth - 1);
      expect(game.projectiles.length).toBe(0); // Projectile removed after hit
    });

    it('should kill boss when health reaches 0', () => {
      game.boss.health = 1;

      // Create a projectile at boss position
      game.canShoot = true;
      game.lastShotTime = 0;
      game.player.x = game.boss.x - 100;
      game.player.y = game.boss.y;
      game.player.direction = 1;

      game.shoot();
      const projectile = game.projectiles[0];

      // Move projectile to overlap with boss
      projectile.x = game.boss.x + 10;
      projectile.y = game.boss.y + 10;

      // Set camera position to ensure projectile isn't removed as out of bounds
      game.camera.x = game.boss.x - 100;

      const initialScore = game.score;
      game.updateProjectiles(16);

      expect(game.boss.alive).toBe(false);
      expect(game.score).toBe(initialScore + 200);
    });
  });

  describe('Win Condition', () => {
    it('should win when player reaches portal center', () => {
      // Position player at portal center
      game.player.x =
        game.portal.x + game.portal.width / 2 - game.player.width / 2;
      game.player.y =
        game.portal.y + game.portal.height / 2 - game.player.height / 2;

      game.checkCollisions();

      expect(game.gameWon).toBe(true);
    });

    it('should not win when player only touches portal edge', () => {
      // Position player at portal edge
      game.player.x = game.portal.x;
      game.player.y = game.portal.y;

      game.checkCollisions();

      expect(game.gameWon).toBe(false);
    });
  });

  describe('Game Over', () => {
    it('should end game when lives reach 0', () => {
      game.lives = 1;
      const enemy = game.enemies[0];
      game.player.x = enemy.x;
      game.player.y = enemy.y;
      game.player.velocityY = 0;

      game.checkCollisions();

      expect(game.lives).toBe(0);
      expect(game.gameOver).toBe(true);
    });

    it('should stop updates when game is over', () => {
      game.gameOver = true;
      const initialScore = game.score;

      // Try to collect a coin
      const coin = game.coins[0];
      game.player.x = coin.x;
      game.player.y = coin.y;
      game.update(16);

      expect(game.score).toBe(initialScore);
    });
  });
});
