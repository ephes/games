import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { Game } from '../src/Game.js';
import { Coin } from '../src/objects/Coin.js';
import { BossProjectile } from '../src/entities/BossProjectile.js';

let game;
beforeEach(() => {
  vi.useFakeTimers();
  document.body.innerHTML =
    '<canvas id="coins" width="800" height="400"></canvas>';
  game = new Game('coins');
  game.createLevel();
  game.platforms = [];
  game.enemies = [];
  game.boss.x = 2000;
  game.boss.canShoot = false;
  Object.assign(game.player, { x: 100, y: 0, gravity: 0, velocityY: 200 });
});
afterEach(() => {
  game.dispose();
  vi.useRealTimers();
});
it.each([false, true])('collects a crossed coin once (powerUp=%s)', powerUp => {
  const coin = new Coin(100, 100, powerUp);
  game.coins = [coin];
  game.update(16);
  expect(game.player.y).toBe(200);
  expect(coin.collected).toBe(true);
  expect(game.score).toBe(10);
  expect(game.canShoot).toBe(powerUp);
  game.update(16);
  expect(game.score).toBe(10);
});
it.each([3, 1])(
  'keeps coins through a damaging boss shot (%s lives)',
  lives => {
    game.lives = lives;
    game.player.respawnPoint = { x: 600, y: 0 };
    const early = new Coin(100, 60, true);
    const tied = new Coin(100, 130);
    const late = new Coin(100, 180);
    const spawn = new Coin(600, 0);
    game.coins = [late, spawn, tied, early];
    game.boss.projectiles = [
      new BossProjectile(100, 130, 1, 0, game.camera.bounds)
    ];

    game.update(16);

    expect(game.lives).toBe(lives - 1);
    expect(game.gameOver).toBe(lives === 1);
    expect(game.player.x).toBe(600);
    expect(early.collected).toBe(true);
    expect(tied.collected).toBe(true);
    expect(late.collected).toBe(false);
    expect(spawn.collected).toBe(lives > 1);
    expect(game.score).toBe(lives > 1 ? 30 : 20);
    expect(game.canShoot).toBe(true);
  }
);
it('does not collect coins along a boss-shot respawn teleport', () => {
  Object.assign(game.player, {
    y: 100,
    velocityY: 0,
    respawnPoint: { x: 600, y: 100 }
  });
  game.coins = [new Coin(400, 100, true)];
  game.boss.projectiles = [
    new BossProjectile(0, 110, 1, 300, game.camera.bounds)
  ];
  game.update(16);
  expect(game.lives).toBe(2);
  expect(game.player.x).toBe(600);
  expect(game.coins[0].collected).toBe(false);
  expect(game.score).toBe(0);
  expect(game.canShoot).toBe(false);
});
it('does not collect a tangent coin', () => {
  game.coins = [new Coin(130, 100)];
  game.update(16);
  expect(game.score).toBe(0);
});
