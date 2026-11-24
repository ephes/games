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

it.each([false, true])(
  'selects the exhaustive winner in a dense query without sorting (reverse: %s)',
  reverse => {
    const shot = { x: 50, y: 100, width: 5, height: 5 };
    const previousShot = { x: shot.x, y: 0 };
    const first = { x: 50, y: 50, width: 20, height: 20, alive: true };
    const duplicate = { ...first };
    const boss = { ...first };
    const dense = Array.from({ length: 256 }, (_, i) => ({
      ...first,
      x: 51 + ((i * 3) % 4)
    }));
    const enemies = [first, ...dense, duplicate];
    if (reverse) {
      enemies.reverse();
    }
    const previousTargets = new Map([
      [first, { x: 49, y: 50 }],
      [duplicate, { x: 40, y: 50 }],
      [boss, { x: 35, y: 50 }]
    ]);
    const index = CollisionSystem.buildProjectileIndex(
      enemies,
      boss,
      previousTargets
    );

    // Count query comparisons only, excluding the shared tree build.
    const sort = Array.prototype.sort;
    let comparisons = 0;
    const sortSpy = vi
      .spyOn(Array.prototype, 'sort')
      .mockImplementation(function (compare) {
        return sort.call(this, (a, b) => {
          comparisons++;
          return compare(a, b);
        });
      });
    let candidates;
    try {
      candidates = CollisionSystem.queryProjectileIndex(
        index,
        shot,
        previousShot
      );
    } finally {
      sortSpy.mockRestore();
    }

    expect(candidates).toHaveLength(enemies.length + 1);
    const exhaustive = CollisionSystem.checkProjectileCollisions(
      shot,
      enemies,
      boss,
      previousShot,
      previousTargets
    );
    const indexed = CollisionSystem.checkProjectileCollisions(
      shot,
      enemies,
      boss,
      previousShot,
      previousTargets,
      candidates
    );
    expect(exhaustive.type).toBe('enemy');
    expect(exhaustive.target).toBe(enemies[0]);
    expect(exhaustive.time).toBe(0.45);
    expect(indexed.target).toBe(exhaustive.target);
    expect(indexed.type).toBe(exhaustive.type);
    expect(indexed.time).toBe(exhaustive.time);
    expect(comparisons).toBe(0);
  }
);
