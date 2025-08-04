import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Game } from '../src/Game.js';
import { LEVELS } from '../src/utils/constants.js';

describe('Multi-Level Support', () => {
  let game;
  let mockCanvas;
  let mockCtx;

  beforeEach(() => {
    // Mock canvas and context
    mockCtx = {
      clearRect: vi.fn(),
      fillRect: vi.fn(),
      fillText: vi.fn(),
      drawImage: vi.fn(),
      save: vi.fn(),
      restore: vi.fn(),
      translate: vi.fn(),
      getImageData: vi.fn(() => ({
        data: new Uint8ClampedArray(4)
      }))
    };

    mockCanvas = {
      getContext: vi.fn(() => mockCtx),
      width: 800,
      height: 400
    };

    // Mock DOM
    global.document = {
      getElementById: vi.fn(() => mockCanvas),
      addEventListener: vi.fn()
    };

    // Mock Image
    global.Image = class {
      constructor() {
        this.src = '';
        this.complete = true;
        this.onload = null;
        setTimeout(() => {
          if (this.onload) {
            this.onload();
          }
        }, 0);
      }
    };

    game = new Game('gameCanvas');

    // Mock sprite loader
    game.spriteLoader.loadAll = vi.fn().mockResolvedValue();
    game.spriteLoader.getSprite = vi.fn().mockReturnValue({
      complete: true,
      width: 64,
      height: 64
    });
  });

  describe('Level Structure', () => {
    it('should have multiple levels defined', () => {
      expect(LEVELS).toBeDefined();
      expect(Array.isArray(LEVELS)).toBe(true);
      expect(LEVELS.length).toBeGreaterThan(1);
    });

    it('should have proper structure for each level', () => {
      LEVELS.forEach(level => {
        expect(level).toHaveProperty('name');
        expect(level).toHaveProperty('playerStart');
        expect(level).toHaveProperty('platforms');
        expect(level).toHaveProperty('coins');
        expect(level).toHaveProperty('enemies');
        expect(level).toHaveProperty('boss');
        expect(level).toHaveProperty('portal');

        expect(level.playerStart).toHaveProperty('x');
        expect(level.playerStart).toHaveProperty('y');
      });
    });
  });

  describe('Level Loading', () => {
    it('should start at level 0', () => {
      expect(game.currentLevel).toBe(0);
    });

    it('should load the correct level data', async () => {
      await game.init();

      const level0Data = LEVELS[0];
      expect(game.player.x).toBe(level0Data.playerStart.x);
      expect(game.player.y).toBe(level0Data.playerStart.y);
      expect(game.platforms.length).toBe(level0Data.platforms.length);
      expect(game.coins.length).toBe(level0Data.coins.length);
      expect(game.enemies.length).toBe(level0Data.enemies.length);
    });

    it('should preserve player abilities between levels', async () => {
      await game.init();

      // Give player shooting ability
      game.canShoot = true;

      // Load next level
      game.loadNextLevel();

      // Should keep shooting ability
      expect(game.canShoot).toBe(true);
    });
  });

  describe('Level Transitions', () => {
    it('should increment currentLevel when loadNextLevel is called', async () => {
      await game.init();

      const initialLevel = game.currentLevel;
      game.loadNextLevel();

      expect(game.currentLevel).toBe(initialLevel + 1);
    });

    it('should clear existing objects when loading new level', async () => {
      await game.init();

      // Add some projectiles
      game.projectiles.push({ x: 100, y: 100 });

      game.loadNextLevel();

      expect(game.projectiles.length).toBe(0);
    });

    it('should load level 2 data when transitioning from level 1', async () => {
      await game.init();

      game.loadNextLevel();

      const level1Data = LEVELS[1];
      expect(game.player.x).toBe(level1Data.playerStart.x);
      expect(game.player.y).toBe(level1Data.playerStart.y);
    });

    it('should set gameWon to true when completing all levels', async () => {
      await game.init();

      // Set to last level
      game.currentLevel = LEVELS.length - 1;

      game.loadNextLevel();

      expect(game.gameWon).toBe(true);
    });

    it('should not create new level objects when game is won', async () => {
      await game.init();

      // Set to last level
      game.currentLevel = LEVELS.length - 1;

      // const platformCountBefore = game.platforms.length;

      game.loadNextLevel();

      // Should not create new platforms since game is won
      expect(game.gameWon).toBe(true);
      expect(game.platforms.length).toBe(0);
    });
  });

  describe('Camera Reset', () => {
    it('should reset camera position when loading new level', async () => {
      await game.init();

      // Move camera
      game.camera.x = 500;
      game.camera.y = 100;

      game.loadNextLevel();

      expect(game.camera.x).toBe(0);
      expect(game.camera.y).toBe(0);
    });
  });

  describe('Portal Collision', () => {
    it('should trigger level transition when player enters unlocked portal', async () => {
      await game.init();

      // Unlock portal
      game.portal.unlock();

      // Position player at portal
      game.player.x =
        game.portal.x + game.portal.width / 2 - game.player.width / 2;
      game.player.y =
        game.portal.y + game.portal.height / 2 - game.player.height / 2;

      const initialLevel = game.currentLevel;

      // Check collisions
      game.checkCollisions();

      expect(game.currentLevel).toBe(initialLevel + 1);
    });

    it('should not trigger level transition when portal is locked', async () => {
      await game.init();

      // Ensure portal is locked
      game.portal.lock();

      // Position player at portal
      game.player.x =
        game.portal.x + game.portal.width / 2 - game.player.width / 2;
      game.player.y =
        game.portal.y + game.portal.height / 2 - game.player.height / 2;

      const initialLevel = game.currentLevel;

      // Check collisions
      game.checkCollisions();

      expect(game.currentLevel).toBe(initialLevel);
    });
  });
});
