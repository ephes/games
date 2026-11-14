import { afterEach, expect, it, vi } from 'vitest';
import { Enemy } from '../src/entities/Enemy.js';
const platforms = [{ x: 0, width: 1000 }];
const enemy = () => new Enemy({ x: 100, y: 0, speed: 0, platformIndex: 0 });
afterEach(() => vi.restoreAllMocks());
it('retires a hit at 300 simulation milliseconds despite wall-clock jumps', () => {
  const now = vi.spyOn(Date, 'now').mockReturnValue(1000);
  const target = enemy();
  expect(target.hit()).toBe(true);
  now.mockReturnValue(-1_000_000);
  target.update(platforms, 150);
  expect(target.isInHitAnimation()).toBe(true);
  expect(target.frameX).toBe(3);
  now.mockReturnValue(1_000_000_000);
  target.update(platforms, 149);
  expect(target.isInHitAnimation()).toBe(true);
  target.update(platforms, 1);
  expect(target.isInHitAnimation()).toBe(false);
  expect(target.alive).toBe(false);
  expect(target.hit()).toBe(false);
  const frame = target.frameX;
  target.update(platforms, 10000);
  expect(target.frameX).toBe(frame);
  expect(target.x).toBe(100);
});
it('produces the same running and hit frames for split elapsed steps', () => {
  const one = enemy(),
    split = enemy();
  one.update(platforms, 500);
  for (let i = 0; i < 30; i++) {
    split.update(platforms, 1000 / 60);
  }
  expect(one.frameX).toBe(7);
  expect(split.frameX).toBe(one.frameX);
  one.hit();
  split.hit();
  one.update(platforms, 250);
  for (let i = 0; i < 15; i++) {
    split.update(platforms, 1000 / 60);
  }
  expect(one.frameX).toBe(0);
  expect(split.frameX).toBe(one.frameX);
  expect(one.isInHitAnimation()).toBe(true);
  one.update(platforms, 50);
  for (let i = 0; i < 3; i++) {
    split.update(platforms, 1000 / 60);
  }
  expect([one.isInHitAnimation(), split.isInHitAnimation()]).toEqual([
    false,
    false
  ]);
});
