import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Coin } from '../src/objects/Coin.js';
import { Game } from '../src/Game.js';

describe('Coin collection and rendering', () => {
  it.each([false, true])('awards exactly once (power-up=%s)', isPowerUp => {
    const coin = new Coin(50, 80, isPowerUp);
    expect(coin.collect()).toEqual({
      collected: true,
      points: 10,
      powerUp: isPowerUp
    });
    expect(coin.collected).toBe(true);
    expect(coin.collect()).toEqual({ collected: false });
    expect(coin.collect()).toEqual({ collected: false });
  });

  it.each([false, true])(
    'draws uncollected geometry only (power-up=%s)',
    isPowerUp => {
      const ctx = {
        beginPath: vi.fn(),
        arc: vi.fn(),
        fill: vi.fn(),
        stroke: vi.fn()
      };
      const coin = new Coin(50, 80, isPowerUp);
      coin.draw(ctx, 20);
      expect(ctx.beginPath).toHaveBeenCalledTimes(1);
      expect(ctx.arc).toHaveBeenCalledWith(40, 90, 10, 0, Math.PI * 2);
      expect(ctx.fill).toHaveBeenCalledTimes(1);
      expect(ctx.stroke).toHaveBeenCalledTimes(isPowerUp ? 1 : 0);
      coin.collect();
      for (const mock of [ctx.beginPath, ctx.arc, ctx.fill, ctx.stroke]) {
        mock.mockClear();
      }
      coin.draw(ctx, 20);
      for (const mock of [ctx.beginPath, ctx.arc, ctx.fill, ctx.stroke]) {
        expect(mock).not.toHaveBeenCalled();
      }
    }
  );
});

describe('Game coin awards', () => {
  let game;
  beforeEach(() => {
    document.body.innerHTML =
      '<canvas id="coins" width="800" height="400"></canvas>';
    game = new Game('coins');
    game.createLevel({
      playerStart: { x: 50, y: 100 },
      platforms: [{ x: 0, y: 350, width: 800, height: 50 }],
      coins: [
        { x: 50, y: 100 },
        { x: 100, y: 100, isPowerUp: true }
      ],
      enemies: [],
      boss: { x: 600, y: 254, speed: 0, platformIndex: 0 },
      portal: { x: 700, y: 200 }
    });
  });
  afterEach(() => {
    game.dispose();
    document.body.innerHTML = '';
  });

  it('uses real collect results across repeated collision frames and revisits', () => {
    game.checkCollisions();
    expect(game.score).toBe(10);
    expect(game.canShoot).toBe(false);
    game.checkCollisions();
    expect(game.score).toBe(10);
    expect(game.canShoot).toBe(false);
    game.player.x = 100;
    game.checkCollisions();
    expect(game.score).toBe(20);
    expect(game.canShoot).toBe(true);
    game.checkCollisions();
    game.player.x = 50;
    game.checkCollisions();
    expect(game.score).toBe(20);
    expect(game.canShoot).toBe(true);
    expect(game.coins.every(coin => coin.collected)).toBe(true);
  });
});
