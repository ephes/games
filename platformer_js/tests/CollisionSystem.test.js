import { describe, expect, it } from 'vitest';
import { CollisionSystem } from '../src/systems/CollisionSystem.js';

describe('Platform contact boundaries', () => {
  const platform = { x: 0, y: 100, width: 100, height: 20 };
  const noContact = { isGrounded: false, platform: null, side: null };

  it.each([
    ['overlap', 99, 99, true],
    ['right edge', 100, 100, false],
    ['left edge', -20, 100, false],
    ['top edge', 0, 80, false],
    ['bottom edge', 0, 120, false],
    ['apart', 200, 200, false]
  ])('uses strict rectangle overlap: %s', (_label, x, y, expected) => {
    const entity = { x, y, width: 20, height: 20 };
    expect(CollisionSystem.checkCollision(entity, platform)).toBe(expected);
    expect(CollisionSystem.checkCollision(platform, entity)).toBe(expected);
  });

  it.each([
    ['49% right', 51, 90, 5, null],
    ['50% right', 50, 90, 5, 'top'],
    ['49% left', -51, 90, 5, null],
    ['50% left', -50, 90, 5, 'top'],
    ['full support', 0, 90, 5, 'top'],
    ['side edge only', 100, 90, 5, null],
    ['top edge only', 0, 80, 5, null],
    ['bottom edge only', 0, 120, -5, null],
    ['upward ceiling', 0, 110, -5, 'bottom'],
    ['rising through top', 0, 90, -5, null],
    ['stationary overlap', 0, 90, 0, null],
    ['vertically apart', 0, 0, 5, null],
    ['horizontally apart', 500, 90, 5, null]
  ])('resolves %s', (_label, x, y, velocityY, side) => {
    const entity = { x, y, width: 100, height: 20, velocityY, isJumping: true };
    const before = { ...entity };
    const result = CollisionSystem.checkPlatformCollisions(entity, [platform]);
    if (side === 'top') {
      expect(result).toEqual({ isGrounded: true, platform, side: 'top' });
      expect(result.platform).toBe(platform);
      expect(entity).toEqual({
        ...before,
        y: 80,
        velocityY: 0,
        isJumping: false
      });
    } else if (side === 'bottom') {
      expect(result).toEqual({ ...noContact, side: 'bottom' });
      expect(entity).toEqual({ ...before, y: 120, velocityY: 0 });
    } else {
      expect(result).toEqual(noContact);
      expect(entity).toEqual(before);
    }
  });

  it('ignores unrelated platforms before and after landing', () => {
    const entity = {
      x: 25,
      y: 90,
      width: 20,
      height: 20,
      velocityY: 5,
      isJumping: true
    };
    const result = CollisionSystem.checkPlatformCollisions(entity, [
      { ...platform, x: 500 },
      platform,
      { ...platform, y: 300 }
    ]);
    expect(result).toEqual({ isGrounded: true, platform, side: 'top' });
    expect(entity).toMatchObject({
      x: 25,
      y: 80,
      velocityY: 0,
      isJumping: false
    });
  });

  it('preserves the entity when there are no platforms', () => {
    const entity = {
      x: 5,
      y: 10,
      width: 20,
      height: 20,
      velocityY: -5,
      isJumping: true
    };
    const before = { ...entity };
    expect(CollisionSystem.checkPlatformCollisions(entity, [])).toEqual(
      noContact
    );
    expect(entity).toEqual(before);
  });
});
