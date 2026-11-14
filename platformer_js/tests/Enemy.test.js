import { describe, it, expect } from 'vitest';
import { Enemy } from '../src/entities/Enemy.js';

const platforms = [{ x: 0, width: 1000 }];
const create = () => new Enemy({ x: 100, y: 0, speed: 0, platformIndex: 0 });
describe('Real enemy simulation animation', () => {
  it('accumulates 15 fps running frames and wraps all ten frames', () => {
    const enemy = create();
    enemy.update(platforms, 66);
    expect(enemy.frameX).toBe(0);
    enemy.update(platforms, 1);
    expect(enemy.frameX).toBe(1);
    const frames = [];
    for (let n = 0; n < 19; n++) {
      enemy.update(platforms, 1000 / 15);
      frames.push(enemy.frameX);
    }
    expect(frames).toEqual([
      2, 3, 4, 5, 6, 7, 8, 9, 0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 0
    ]);
    expect(enemy.getAnimationState()).toBe('run');
  });
  it('resets frame and elapsed remainder on hit, then cycles five frames at 20 fps', () => {
    const enemy = create();
    enemy.update(platforms, 650);
    expect(enemy.frameX).toBe(9);
    enemy.hit();
    expect([enemy.frameX, enemy.frameTimer]).toEqual([0, 0]);
    expect(enemy.getAnimationState()).toBe('hit');
    const frames = [];
    for (let n = 0; n < 5; n++) {
      const previous = enemy.frameX;
      enemy.update(platforms, 49);
      expect(enemy.frameX).toBe(previous);
      enemy.update(platforms, 1);
      frames.push(enemy.frameX);
    }
    expect(frames).toEqual([1, 2, 3, 4, 0]);
  });
});
