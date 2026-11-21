import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Game } from '../src/Game.js';
import { BossProjectile } from '../src/entities/BossProjectile.js';
import { Enemy } from '../src/entities/Enemy.js';
import { Projectile } from '../src/entities/Projectile.js';

const level = width => ({
  name: 'Synthetic level',
  playerStart: { x: 40, y: 50 },
  // The first platform deliberately is not the rightmost or a full-width ground.
  platforms: [
    { x: 0, y: 350, width: 200, height: 50 },
    { x: width - 100, y: 350, width: 100, height: 50 }
  ],
  coins: [],
  enemies: [],
  boss: { x: 100, y: 200, speed: 1, patrolStart: 100, patrolEnd: 200 },
  portal: { x: width - 128, y: 200 }
});

describe('Render camera after same-step contacts', () => {
  let game;
  beforeEach(async () => {
    document.body.innerHTML =
      '<canvas id="contact-camera" width="120" height="120"></canvas>';
    game = new Game('contact-camera');
    game.levels = [
      {
        ...level(2400),
        width: 2400,
        height: 1000,
        platforms: [],
        playerStart: { x: 640, y: 360 },
        portal: { x: 590, y: 310 }
      },
      { ...level(2400), playerStart: { x: 800, y: 300 } }
    ];
    game.spriteLoader.loadAll = vi.fn().mockResolvedValue();
    await game.init();
    game.boss.canShoot = false;
    Object.assign(game.player, { x: 1300, y: 600, gravity: 0 });
    game.ctx.translate = vi.fn();
    game.portal.draw = vi.fn();
  });

  afterEach(() => {
    game.dispose();
  });

  it('renders at the respawn point after body damage', () => {
    game.enemies = [new Enemy({ x: 1300, y: 600, speed: 0 })];
    game.update(16);
    game.render();
    expect(game.lives).toBe(2);
    expect(game.ctx.translate).toHaveBeenCalledWith(-600, -300);
  });

  it.each([1, 3])(
    'renders at the boss-shot respawn point with %i starting lives',
    lives => {
      game.lives = lives;
      game.boss.projectiles = [
        new BossProjectile(1300, 610, 1, 0, game.camera.bounds)
      ];
      const playerShot = new Projectile(1300, 50, 1);
      game.projectiles = [playerShot];
      game.update(16);
      game.render();
      expect(game.lives).toBe(lives - 1);
      // Culling still uses the viewport from before the contact.
      expect(game.projectiles).toEqual([playerShot]);
      expect(game.ctx.translate).toHaveBeenCalledWith(-600, -300);
    }
  );

  it('renders at the bounce pose after a fast stomp', () => {
    Object.assign(game.player, { y: 140, velocityY: 380 });
    game.enemies = [new Enemy({ x: 1300, y: 300, speed: 0 })];
    game.update(16);
    game.render();
    expect(game.score).toBe(50);
    expect(game.player.y).toBe(270);
    expect(game.ctx.translate).toHaveBeenCalledWith(-1260, -210);
  });

  it('keeps the camera reset when a respawn immediately enters the next level', () => {
    game.portal.unlock();
    game.enemies = [new Enemy({ x: 1300, y: 600, speed: 0 })];
    game.update(16);
    expect(game.lives).toBe(2);
    expect(game.currentLevel).toBe(1);
    expect(game.camera.x).toBe(0);
    expect(game.camera.y).toBe(0);
  });
});

describe('Current level camera bounds', () => {
  let game;
  beforeEach(() => {
    document.body.innerHTML =
      '<canvas id="bounds" width="800" height="400"></canvas>';
    game = new Game('bounds');
    game.spriteLoader.loadAll = vi.fn().mockResolvedValue();
    game.spriteLoader.getSprite = vi.fn().mockReturnValue(null);
  });
  afterEach(() => {
    game.dispose();
    vi.restoreAllMocks();
  });

  function expectRightEdge(width) {
    game.camera.follow({ x: width + 1000 });
    expect(game.camera.bounds.maxX).toBe(Math.max(width, 800));
    expect(game.camera.x).toBe(Math.max(0, width - 800));
    game.camera.follow({ x: -1000 });
    expect(game.camera.x).toBe(0);
  }

  it.each([
    [1000, 2400],
    [2400, 1000],
    [2400, 400]
  ])('refreshes bounds from %i to %i on transition', async (first, next) => {
    game.levels = [level(first), level(next)];
    await game.init();
    expectRightEdge(first);
    game.loadNextLevel();
    expect(game.camera.x).toBe(0);
    expectRightEdge(next);
    game.player.x = next + 1000;
    game.update(0);
    expect(game.player.x + game.player.width).toBe(Math.max(800, next));
  });

  it('refreshes geometry on reset', async () => {
    game.levels = [level(2400)];
    await game.init();
    game.levels[0] = level(1200);
    game.resetLevel();
    expect(game.camera.x).toBe(0);
    expectRightEdge(1200);
  });

  it('refreshes bounds when LDtk levels replace the current level', async () => {
    game.levels = [level(1000)];
    await game.init();
    game.ldtkLoader.loadWorld = vi.fn().mockResolvedValue();
    game.ldtkLoader.getAllLevels = vi.fn().mockReturnValue([level(3200)]);
    await game.loadLDtkLevels('synthetic.ldtk');
    expect(game.ldtkLoader.loadWorld).toHaveBeenCalledWith('synthetic.ldtk', {
      publish: false
    });
    expectRightEdge(3200);
  });
});
