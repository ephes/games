import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { Game } from '../src/Game.js';
import { Enemy } from '../src/entities/Enemy.js';

let game;
beforeEach(() => {
  vi.useFakeTimers();
  document.body.innerHTML =
    '<canvas id="body" width="800" height="400"></canvas>';
  game = new Game('body');
  game.createLevel();
  game.coins = [];
  game.boss.x = 2000;
  Object.assign(game.player, { x: 200, y: 200, velocityY: 200 });
});
afterEach(() => {
  game.dispose();
  vi.useRealTimers();
});

it.each([
  [false, false],
  [false, true],
  [true, false],
  [true, true]
])(
  'resolves the earlier stomp before later side entry (boss=%s reverse=%s)',
  (nearBoss, reverse) => {
    const early = nearBoss ? game.boss : new Enemy({ x: 60, y: 100, speed: 0 });
    Object.assign(early, { x: 60, y: 100 });
    const late = new Enemy({ x: 180, y: 150, speed: 0 });
    game.enemies = nearBoss ? [late] : reverse ? [late, early] : [early, late];
    game.checkCollisions({ x: 0, y: 0 });
    expect(game.score).toBe(nearBoss ? 20 : 50);
    expect(game.lives).toBe(3);
    expect(late.alive).toBe(true);
    expect(game.player.y).toBe(70);
    expect(game.player.velocityY).toBeLessThan(0);
  }
);

it.each([false, true])(
  'breaks simultaneous contacts geometrically (reverse=%s)',
  reverse => {
    const left = new Enemy({ x: 100, y: 100, speed: 0 });
    const right = new Enemy({ x: 110, y: 100, speed: 0 });
    game.enemies = reverse ? [right, left] : [left, right];
    game.player.x = 110;
    game.checkCollisions({ x: 110, y: 0 });
    expect(left.alive).toBe(false);
    expect(right.alive).toBe(true);
    expect(game.score).toBe(50);
    expect(game.lives).toBe(3);
  }
);
