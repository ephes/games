import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { Game } from '../src/Game.js';
import { Enemy } from '../src/entities/Enemy.js';
import { Renderer } from '../src/rendering/Renderer.js';

let game;
beforeEach(() => {
  document.body.innerHTML =
    '<canvas id="enemies" width="800" height="400"></canvas>';
  game = new Game('enemies');
  game.createLevel({
    name: 'Synthetic',
    playerStart: { x: 0, y: 0 },
    platforms: [],
    coins: [],
    enemies: [],
    boss: { x: 20000, y: 0, speed: 0 },
    portal: { x: 21000, y: 0 }
  });
  game.boss.canShoot = false;
  game.ctx.translate = vi.fn();
  game.portal.draw = vi.fn();
  vi.spyOn(game.canvas, 'getContext').mockReturnValue(game.ctx);
  game.renderer = new Renderer(game.canvas, {
    getAnimationConfig: () => ({ enemy: { frameWidth: 48, frameHeight: 36 } }),
    getSprite: () => ({})
  });
  for (const method of ['drawBoss', 'drawPlayer', 'drawText']) {
    game.renderer[method] = vi.fn();
  }
});
afterEach(() => {
  game.dispose();
  vi.restoreAllMocks();
});

it('draws only enemies touching the translated viewport, including hit sprites in either direction', () => {
  game.camera.x = 400;
  game.camera.y = 200;
  const positions = [
    [356, 200],
    [355, 200],
    [1200, 200],
    [1201, 200],
    [500, 170],
    [500, 169],
    [500, 600],
    [500, 601]
  ];
  game.enemies = positions.map(([x, y], i) => {
    const enemy = new Enemy({ x, y, speed: 0 });
    enemy.direction = i % 2 ? 1 : -1;
    if (i % 2 === 0) {
      enemy.hit();
    }
    return enemy;
  });
  game.enemies.push(
    ...Array.from(
      { length: 10000 },
      (_, i) => new Enemy({ x: 10000 + i, y: 0, speed: 2 })
    )
  );
  const draw = vi.spyOn(game.renderer, 'drawEnemy');
  game.render();
  expect(draw.mock.calls.map(([enemy]) => enemy)).toEqual([
    game.enemies[0],
    game.enemies[2],
    game.enemies[4],
    game.enemies[6]
  ]);
  expect(game.ctx.drawImage).toHaveBeenCalledTimes(4);
  expect(game.ctx.scale).toHaveBeenCalledWith(-1, 1);
  expect(game.ctx.translate).toHaveBeenCalledWith(-400, -200);
  const offscreen = game.enemies.at(-1);
  const x = offscreen.x;
  game.update(16);
  expect(offscreen.x).toBe(x + 2);
});

it('retires defeated enemies only after their last hit frame, without repeating awards', () => {
  game.enemies = Array.from(
    { length: 1000 },
    (_, i) => new Enemy({ x: 1000 + i * 50, y: 100, speed: 0 })
  );
  // Defeat through the real projectile/score path.
  const first = game.enemies[0];
  game.projectiles = [
    {
      x: first.x,
      y: first.y,
      width: 10,
      height: 10,
      update() {},
      isOutOfBounds: () => false
    }
  ];
  game.updateProjectiles(16);
  expect(game.score).toBe(50);
  expect(first.hit()).toBe(false);
  game.enemies.slice(1).forEach(enemy => enemy.hit());
  const updates = game.enemies.map(enemy => vi.spyOn(enemy, 'update'));
  const survivor = new Enemy({ x: 60000, y: 0, speed: 2 });
  game.enemies.push(survivor);
  game.update(299);
  expect(game.enemies).toHaveLength(1001);
  game.update(1);
  expect(game.enemies).toEqual([survivor]);
  game.update(16);
  expect(updates.every(update => update.mock.calls.length === 2)).toBe(true);
  expect(survivor.x).toBe(60006);
  expect(game.score).toBe(50);
});
