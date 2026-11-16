import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { Game } from '../src/Game.js';
import { CollisionSystem } from '../src/systems/CollisionSystem.js';

let game;
const level = (platforms = [], coins = []) => ({
  name: 'Synthetic',
  playerStart: { x: 100, y: 0 },
  platforms,
  coins,
  enemies: [],
  boss: { x: 2000000, y: 0, speed: 0 },
  portal: { x: 2000100, y: 0 }
});
beforeEach(() => {
  document.body.innerHTML =
    '<canvas id="work" width="800" height="400"></canvas>';
  game = new Game('work');
});
afterEach(() => {
  game.dispose();
  vi.restoreAllMocks();
});

it('passes only swept platform candidates to the unchanged solver', () => {
  const near = { x: 90, y: 100, width: 100, height: 1 };
  const far = Array.from({ length: 10000 }, (_, i) => ({
    x: 10000 + i * 100,
    y: 100,
    width: 50,
    height: 1
  }));
  game.createLevel(level([...far, near]));
  game.boss.canShoot = false;
  Object.assign(game.player, { gravity: 0, velocityY: 200 });
  const solver = vi.spyOn(CollisionSystem, 'checkPlatformCollisions');
  game.update(16);
  expect(solver.mock.calls[0][1]).toEqual([game.platforms.at(-1)]);
  expect(game.player.y).toBe(70);
});

it('matches the exhaustive platform solver across diagonal, upward and thin sweeps', () => {
  const platforms = [
    { x: 100, y: 100, width: 100, height: 1 },
    { x: 0, y: 80, width: 70, height: 1 },
    { x: 500, y: 0, width: 10, height: 400 }
  ];
  for (const [x, y, velocityY, speed] of [
    [100, 0, 200, 0],
    [0, 0, 200, 200],
    [100, 200, -200, 0]
  ]) {
    game.createLevel(level(platforms));
    game.boss.canShoot = false;
    Object.assign(game.player, { x, y, velocityY, gravity: 0, speed });
    game.inputManager.keys.ArrowRight = true;
    const oracle = { ...game.player, x: x + speed, y: y + velocityY };
    const result = CollisionSystem.checkPlatformCollisions(
      oracle,
      game.platforms,
      { x, y }
    );
    if (!result.isGrounded && oracle.velocityY === 0) {
      oracle.velocityY = 0.1;
    }
    game.update(16);
    expect([game.player.x, game.player.y, game.player.velocityY]).toEqual([
      oracle.x,
      oracle.y,
      oracle.velocityY
    ]);
  }
});

it('bounds coin work and retires collected leaves even when revisiting them', () => {
  const far = Array.from({ length: 10000 }, (_, i) => ({
    x: 10000 + i * 100,
    y: 100
  }));
  const near = Array.from({ length: 1000 }, () => ({ x: 100, y: 100 }));
  game.createLevel(level([], [...far, ...near]));
  Object.assign(game.player, { x: 100, y: 200 });
  const reads = game.coins.map(coin => vi.spyOn(coin, 'getBounds'));
  game.checkCollisions({ x: 100, y: 0 });
  expect(game.score).toBe(10000);
  expect(reads.reduce((sum, spy) => sum + spy.mock.calls.length, 0)).toBe(1000);
  // Retired branches must be pruned, rather than scanning collected leaves.
  let boundReads = 0;
  const instrument = node => {
    if (!node) {
      return;
    }
    const minX = node.minX;
    Object.defineProperty(node, 'minX', {
      get: () => {
        boundReads++;
        return minX;
      }
    });
    instrument(node.left);
    instrument(node.right);
  };
  instrument(game.staticWorldIndex);
  game.checkCollisions({ x: 100, y: 0 });
  expect(game.score).toBe(10000);
  expect(boundReads).toBeLessThan(100);
  game.createLevel(level([], [{ x: 100, y: 100, isPowerUp: true }]));
  game.player.y = 200;
  game.checkCollisions({ x: 100, y: 0 });
  expect(game.score).toBe(10010);
  expect(game.canShoot).toBe(true);
});

it('matches a full coin sweep oracle for diagonal motion and edge touches', () => {
  const coins = Array.from({ length: 200 }, (_, i) => ({
    x: (i * 37) % 400,
    y: (i * 61) % 400
  }));
  game.createLevel(level([], coins));
  Object.assign(game.player, { x: 300, y: 300 });
  const previous = { x: 0, y: 0 };
  const expected = game.coins.filter(
    coin =>
      CollisionSystem.sweptContactTime(game.player, coin, previous, coin) !==
      null
  );
  game.checkCollisions(previous);
  expect(game.coins.filter(coin => coin.collected)).toEqual(expected);
  expect(game.score).toBe(expected.length * 10);
});

it('retains collision ownership on failed construction, replaces it on reset and clears it on win', () => {
  const data = level(
    [{ x: 90, y: 100, width: 100, height: 1 }],
    [{ x: 100, y: 40 }]
  );
  game.levels = [data];
  game.createLevel();
  const index = game.staticWorldIndex;
  expect(() =>
    game.createLevel(level([{ x: NaN, y: 0, width: 10, height: 1 }]))
  ).toThrow();
  expect(game.staticWorldIndex).toBe(index);
  Object.assign(game.player, { y: 200 });
  game.checkCollisions({ x: 100, y: 0 });
  expect(game.score).toBe(10);
  game.resetLevel();
  expect(game.staticWorldIndex).not.toBe(index);
  game.player.y = 200;
  game.checkCollisions({ x: 100, y: 0 });
  expect(game.score).toBe(20);
  game.loadNextLevel();
  expect(game.staticWorldIndex).toBeNull();
  expect(game.indexedPlatforms).toEqual([]);
  expect(game.indexedCoins).toEqual([]);
});
