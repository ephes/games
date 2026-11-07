import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Enemy } from '../src/entities/Enemy.js';

describe('Real enemy animation clock', () => {
  let enemy, now;
  const platforms = [{ x: 0, width: 1000 }];
  beforeEach(() => {
    now = 1000;
    vi.spyOn(Date, 'now').mockImplementation(() => now);
    enemy = new Enemy({ x: 100, y: 0, speed: 0, platformIndex: 0 });
    enemy.frameTimer = now;
  });
  afterEach(() => vi.restoreAllMocks());

  it('advances only above 1/15 second and wraps all ten running frames', () => {
    now += 66;
    enemy.update(platforms, 9999);
    expect(enemy.frameX).toBe(0);
    now += 1;
    enemy.update(platforms, 0);
    expect(enemy.frameX).toBe(1);
    const frames = [enemy.frameX];
    for (let step = 0; step < 19; step++) {
      now += 67;
      enemy.update(platforms, 0);
      frames.push(enemy.frameX);
    }
    expect(frames).toEqual([
      1, 2, 3, 4, 5, 6, 7, 8, 9, 0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 0
    ]);
    expect(enemy.getAnimationState()).toBe('run');
  });

  it('resets running frame nine and cycles five hit frames above 50 ms', () => {
    for (let step = 0; step < 9; step++) {
      now += 67;
      enemy.update(platforms, 0);
    }
    expect(enemy.frameX).toBe(9);
    enemy.hit();
    expect(enemy.frameX).toBe(0);
    expect(enemy.getAnimationState()).toBe('hit');
    const frames = [];
    for (let step = 0; step < 5; step++) {
      const previous = enemy.frameX;
      now += 50;
      enemy.update(platforms, 9999);
      expect(enemy.frameX).toBe(previous);
      now += 1;
      enemy.update(platforms, 0);
      frames.push(enemy.frameX);
    }
    expect(frames).toEqual([1, 2, 3, 4, 0]);
  });
});
