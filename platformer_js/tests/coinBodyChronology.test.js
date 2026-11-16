import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { Game } from '../src/Game.js';
import { Enemy } from '../src/entities/Enemy.js';
import { Coin } from '../src/objects/Coin.js';

let game;
beforeEach(() => {
  vi.useFakeTimers();
  document.body.innerHTML =
    '<canvas id="chronology" width="800" height="400"></canvas>';
  game = new Game('chronology');
  game.createLevel();
  game.boss.x = 2000;
  game.boss.canShoot = false;
  Object.assign(game.player, { x: 400, y: 100, velocityY: 0 });
});
afterEach(() => {
  game.dispose();
  vi.useRealTimers();
});

it.each([false, true])(
  'keeps only coins earlier than lethal contact regardless of array order (%s)',
  reverse => {
    const before = new Coin(60, 100);
    const after = new Coin(300, 100, true);
    game.coins = reverse ? [after, before] : [before, after];
    const near = new Enemy({ x: 180, y: 100, speed: 0 });
    const far = new Enemy({ x: 350, y: 100, speed: 0 });
    game.enemies = reverse ? [far, near] : [near, far];
    game.lives = 1;
    game.checkCollisions({ x: 0, y: 100 });
    expect(game.gameOver).toBe(true);
    expect(before.collected).toBe(true);
    expect(after.collected).toBe(false);
    expect(game.score).toBe(10);
    expect(game.canShoot).toBe(false);
  }
);

it('replaces the old motion with respawn overlaps without sweeping the teleport', () => {
  const later = new Coin(300, 100);
  const teleport = new Coin(500, 100);
  const spawn = new Coin(700, 100, true);
  game.coins = [later, teleport, spawn];
  game.enemies = [new Enemy({ x: 180, y: 100, speed: 0 })];
  game.player.respawnPoint = { x: 700, y: 100 };
  game.checkCollisions({ x: 0, y: 100 });
  expect(game.lives).toBe(2);
  expect(game.player.x).toBe(700);
  expect(game.coins.map(coin => coin.collected)).toEqual([false, false, true]);
  expect(game.score).toBe(10);
});

it('discards coins beyond a stomp and preserves earlier coins', () => {
  const before = new Coin(100, 40);
  const after = new Coin(100, 200);
  game.coins = [after, before];
  game.enemies = [new Enemy({ x: 100, y: 120, speed: 0 })];
  Object.assign(game.player, { x: 100, y: 300, velocityY: 300 });
  game.checkCollisions({ x: 100, y: 0 });
  expect(before.collected).toBe(true);
  expect(after.collected).toBe(false);
  expect(game.score).toBe(60);
  expect(game.player.y).toBe(90);
});

it('preserves coin precedence for an exact simultaneous body contact', () => {
  game.coins = [new Coin(180, 100)];
  game.enemies = [new Enemy({ x: 180, y: 100, speed: 0 })];
  game.lives = 1;
  game.checkCollisions({ x: 0, y: 100 });
  expect(game.score).toBe(10);
});
