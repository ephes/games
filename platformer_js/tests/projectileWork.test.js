import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { Game } from '../src/Game.js';
import { Enemy } from '../src/entities/Enemy.js';
import { Projectile } from '../src/entities/Projectile.js';
import { CollisionSystem } from '../src/systems/CollisionSystem.js';

let game;
beforeEach(() => {
  document.body.innerHTML = '<canvas id="work"></canvas>';
  game = new Game('work');
  game.createLevel();
  game.boss.x = 1e6;
});
afterEach(() => {
  game.dispose();
  vi.restoreAllMocks();
});

it('shares a broad phase across 20 shots and 10,000 distant targets', () => {
  game.enemies = Array.from(
    { length: 10000 },
    (_, i) => new Enemy({ x: 10000 + i * 50, y: 100, speed: 0 })
  );
  game.projectiles = Array.from(
    { length: 20 },
    () => new Projectile(0, 110, 1)
  );
  const exact = vi.spyOn(CollisionSystem, 'sweptContactTime');
  game.updateProjectiles(16);
  expect(exact.mock.calls.length).toBeLessThan(100);
  expect(game.projectiles).toHaveLength(20);
});

it('matches exhaustive ordering for crossing, tied, grazing and distant targets', () => {
  const enemies = [
    new Enemy({ x: 70, y: 100 }),
    new Enemy({ x: 50, y: 90 }),
    new Enemy({ x: 50, y: 100 }),
    new Enemy({ x: 5000, y: 100 }),
    new Enemy({ x: -100, y: 100 })
  ];
  const previous = new Map(enemies.map(e => [e, { x: e.x, y: e.y }]));
  previous.set(enemies[0], { x: 400, y: 100 });
  previous.set(enemies[3], { x: -100, y: 100 });
  game.enemies = enemies;
  for (const y of [50, 85, 110, 144, 200]) {
    const shot = new Projectile(0, y, 1);
    shot.speed = 200;
    const expected = CollisionSystem.checkProjectileCollisions(
      { ...shot, x: 200 },
      enemies,
      game.boss,
      shot,
      previous
    );
    game.projectiles = [shot];
    game.score = 0;
    game.updateProjectiles(16, previous);
    expect(game.score).toBe(expected ? 50 : 0);
    if (expected) {
      expect(expected.target.alive).toBe(false);
      expected.target.alive = true;
    }
  }
});
