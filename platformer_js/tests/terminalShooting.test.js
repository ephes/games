import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Game } from '../src/Game.js';
import { Enemy } from '../src/entities/Enemy.js';
import { GAME_CONFIG } from '../src/utils/constants.js';

const level = {
  name: 'Synthetic shooting',
  playerStart: { x: 50, y: 50 },
  platforms: [{ x: 0, y: 350, width: 2000, height: 50 }],
  coins: [],
  enemies: [],
  boss: { x: 1500, y: 254, speed: 0, platformIndex: 0 },
  portal: { x: 1800, y: 200 }
};

describe('Only initialized playable games create player shots', () => {
  let game;
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(10000);
    document.body.innerHTML =
      '<canvas id="shots" width="800" height="400"></canvas>';
    game = new Game('shots');
    game.levels = [level];
    vi.spyOn(game.spriteLoader, 'loadAll').mockResolvedValue();
  });
  afterEach(() => {
    game.dispose();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('ignores shooting before and during initialization even with a power-up flag', async () => {
    game.canShoot = true;
    expect(() => game.shoot()).not.toThrow();
    const init = game.init();
    expect(() => game.shoot()).not.toThrow();
    expect(game.projectiles).toEqual([]);
    expect(game.lastShotTime).toBe(0);
    await init;
    game.shoot();
    expect(game.projectiles).toHaveLength(1);
  });

  it.each(['win', 'death', 'disposal'])(
    'allocates no shots after %s via direct calls or actions',
    async terminal => {
      await game.init();
      game.canShoot = true;
      if (terminal === 'win') {
        game.loadNextLevel();
      } else if (terminal === 'death') {
        game.lives = 1;
        game.enemies = [
          new Enemy({ x: game.player.x, y: game.player.y, speed: 0 })
        ];
        game.checkCollisions();
        expect(game.gameOver).toBe(true);
      } else {
        game.dispose();
      }
      const before = game.projectiles;
      for (let i = 0; i < 3; i++) {
        vi.advanceTimersByTime(GAME_CONFIG.SHOT_COOLDOWN);
        game.shoot();
        game.inputManager.triggerAction('shoot', 'down');
      }
      expect(game.projectiles).toBe(before);
      expect(game.projectiles).toEqual([]);
      expect(game.lastShotTime).toBe(0);
    }
  );

  it('preserves power-ups and cooldowns through live reset and replacement', async () => {
    await game.init();
    game.shoot();
    expect(game.projectiles).toEqual([]);
    game.canShoot = true;
    game.inputManager.triggerAction('shoot', 'down');
    game.shoot();
    expect(game.projectiles).toHaveLength(1);
    game.resetLevel();
    game.shoot();
    expect(game.projectiles).toEqual([]);
    vi.advanceTimersByTime(GAME_CONFIG.SHOT_COOLDOWN);
    game.shoot();
    expect(game.projectiles).toHaveLength(1);
    vi.spyOn(game.ldtkLoader, 'loadWorld').mockResolvedValue({});
    vi.spyOn(game.ldtkLoader, 'getAllLevels').mockReturnValue([level]);
    expect(await game.loadLDtkLevels('synthetic')).toBe(true);
    game.shoot();
    expect(game.projectiles).toEqual([]);
    vi.advanceTimersByTime(GAME_CONFIG.SHOT_COOLDOWN);
    game.inputManager.triggerAction('shoot', 'down');
    game.shoot();
    expect(game.projectiles).toHaveLength(1);
  });

  it('allows a fresh initialized game to fire after replacing a disposed game', async () => {
    await game.init();
    game.dispose();
    game = new Game('shots');
    game.levels = [level];
    vi.spyOn(game.spriteLoader, 'loadAll').mockResolvedValue();
    await game.init();
    game.canShoot = true;
    game.shoot();
    expect(game.projectiles).toHaveLength(1);
  });
});
