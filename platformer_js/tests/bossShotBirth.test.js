import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { Game } from '../src/Game.js';
import { BossProjectile } from '../src/entities/BossProjectile.js';

let game;
beforeEach(() => {
  vi.useFakeTimers();
  document.body.innerHTML = '<canvas id="birth"></canvas>';
  game = new Game('birth');
  game.createLevel();
  game.platforms = [];
  game.coins = [];
  game.enemies = [];
  game.boss.x = 100;
  game.boss.y = 152;
  game.boss.baseSpeed = 0;
  // Stay beside the boss body and cross the right-facing muzzle vertically.
  game.player.x = 165;
  game.player.y = 200;
  game.player.gravity = 0;
});
afterEach(() => {
  game.dispose();
  vi.useRealTimers();
});

it('does not damage a player who crossed the future muzzle before birth', () => {
  game.player.y = 100;
  game.player.velocityY = 200;
  game.update(16);
  expect(game.lives).toBe(3);
  expect(game.player.y).toBe(300);
  expect(game.boss.projectiles).toHaveLength(1);
  const shot = game.boss.projectiles[0];
  expect(shot.x).toBe(game.boss.x + game.boss.width);
  expect(shot.y).toBe(game.boss.y + game.boss.height / 2);
  expect(shot.previousPosition).toBeUndefined();
  expect(shot.animationTimer).toBe(0);
  game.update(16);
  expect(shot.x).toBe(167);
  expect(shot.previousPosition).toEqual({ x: 164, y: 200 });
  expect(game.lives).toBe(3);
});

it.each([false, true])(
  'consumes an overlap at birth (protected: %s)',
  protectedPlayer => {
    game.player.y = 0;
    game.player.velocityY = 200;
    if (protectedPlayer) {
      game.player.makeInvulnerable();
    }
    const damage = vi.spyOn(game.player, 'takeDamage');
    game.update(16);
    expect(damage).toHaveBeenCalledTimes(1);
    expect(game.lives).toBe(protectedPlayer ? 3 : 2);
    expect(game.boss.projectiles).toEqual([]);
  }
);

it('does not move a newborn shot into a player just beyond the muzzle', () => {
  game.player.x = 181;
  game.update(16);
  expect(game.lives).toBe(3);
  expect(game.boss.projectiles).toHaveLength(1);
  expect(game.boss.projectiles[0].x).toBe(164);
  game.update(16);
  expect(game.lives).toBe(2);
  expect(game.boss.projectiles).toEqual([]);
});

it('retains opposing-motion sweeps for established shots without final overlap', () => {
  game.boss.canShoot = false;
  game.boss.x = 2000;
  const shot = new BossProjectile(0, 200, 1, 200, game.camera.bounds);
  game.boss.projectiles = [shot];
  game.player.x = 300;
  game.player.speed = 200;
  game.inputManager.keys.ArrowLeft = true;
  game.update(16);
  expect(game.lives).toBe(2);
  expect(shot.active).toBe(false);
  expect(game.boss.projectiles).toEqual([]);
});
