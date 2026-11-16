import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { Game } from '../src/Game.js';
import { Enemy } from '../src/entities/Enemy.js';
import { BossProjectile } from '../src/entities/BossProjectile.js';

let game, next;
beforeEach(() => {
  vi.useFakeTimers();
  document.body.innerHTML =
    '<canvas id="portalSweep" width="800" height="400"></canvas>';
  game = new Game('portalSweep');
  game.createLevel({
    name: 'Synthetic',
    playerStart: { x: 149, y: 0 },
    platforms: [],
    coins: [],
    enemies: [],
    boss: { x: 2000, y: 0, speed: 0 },
    portal: { x: 100, y: 100 }
  });
  game.boss.canShoot = false;
  Object.assign(game.player, { gravity: 0, velocityY: 300 });
  next = vi.spyOn(game, 'loadNextLevel');
});
afterEach(() => {
  game.dispose();
  vi.useRealTimers();
});

it.each([false, true])(
  'sweeps fast vertical entry only when unlocked (%s)',
  locked => {
    game.portal.isLocked = locked;
    game.update(16);
    expect(next).toHaveBeenCalledTimes(locked ? 0 : 1);
    if (!locked) {
      game.update(16);
      expect(next).toHaveBeenCalledTimes(1);
    }
  }
);

it('keeps ordinary endpoint entry', () => {
  game.portal.unlock();
  Object.assign(game.player, { y: 149, velocityY: 0 });
  game.update(16);
  expect(next).toHaveBeenCalledTimes(1);
});

it('does not enter a portal beyond a platform that stopped the fall', () => {
  game.portal.unlock();
  game.platforms = [{ x: 100, y: 80, width: 128, height: 1 }];
  game.update(16);
  expect(game.player.y).toBe(50);
  expect(next).not.toHaveBeenCalled();
});

it('excludes body respawn teleports and the discarded path', () => {
  game.portal.unlock();
  Object.assign(game.player, {
    x: 400,
    y: 149,
    velocityY: 0,
    respawnPoint: { x: 0, y: 149 }
  });
  game.enemies = [new Enemy({ x: 350, y: 149, speed: 0 })];
  game.checkCollisions({ x: 300, y: 149 });
  expect(game.lives).toBe(2);
  expect(next).not.toHaveBeenCalled();
});

it('excludes boss-shot respawn teleports', () => {
  game.portal.unlock();
  Object.assign(game.player, {
    x: 400,
    y: 149,
    velocityY: 0,
    respawnPoint: { x: 0, y: 149 }
  });
  game.boss.projectiles = [
    new BossProjectile(400, 160, 1, 0, game.camera.bounds)
  ];
  game.update(16);
  expect(game.lives).toBe(2);
  expect(next).not.toHaveBeenCalled();
});

it('does not replay a locked crossing after a later stomp unlocks the portal', () => {
  Object.assign(game.boss, { x: 132, y: 300, health: 1 });
  Object.assign(game.player, { x: 149, y: 500, velocityY: 500 });
  game.checkCollisions({ x: 149, y: 0 });
  expect(game.portal.isLocked).toBe(false);
  expect(next).not.toHaveBeenCalled();
});

it('does not replay a locked crossing after a player shot unlocks the portal', () => {
  Object.assign(game.boss, { health: 1 });
  // Contact late in the step, after the fall already crossed the portal.
  game.projectiles = [
    {
      x: game.boss.x,
      y: game.boss.y,
      width: 10,
      height: 10,
      update() {},
      isOutOfBounds: () => false
    }
  ];
  game.update(16);
  expect(game.boss.alive).toBe(false);
  expect(game.portal.isLocked).toBe(false);
  expect(game.player.y).toBeGreaterThan(game.portal.y + game.portal.height);
  expect(next).not.toHaveBeenCalled();
});

it('still enters at the endpoint when a shot unlocks the portal mid-step', () => {
  Object.assign(game.boss, { health: 1 });
  Object.assign(game.player, { y: 149, velocityY: 0 });
  game.projectiles = [
    {
      x: game.boss.x,
      y: game.boss.y,
      width: 10,
      height: 10,
      update() {},
      isOutOfBounds: () => false
    }
  ];
  const boss = game.boss;
  game.update(16);
  // Entering loads the next level, whose new portal starts locked again.
  expect(boss.alive).toBe(false);
  expect(next).toHaveBeenCalledTimes(1);
});

it('does not enter on a tangential path outside the center radius', () => {
  game.portal.unlock();
  // Player center x=203 is 39 px from the portal center (radius=38.4).
  game.player.x = 188;
  game.update(16);
  expect(next).not.toHaveBeenCalled();
});
