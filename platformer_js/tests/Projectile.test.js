import { describe, expect, it, vi } from 'vitest';
import { Projectile } from '../src/entities/Projectile.js';

describe('Real player projectile', () => {
  it.each([-1, 1])(
    'moves one fixed step in direction %i regardless of elapsed time',
    direction => {
      const shot = new Projectile(345, 67, direction);
      expect(shot.speed).toBe(10);
      shot.update(0);
      expect(shot.x).toBe(345 + direction * 10);
      shot.update(9999);
      expect(shot.x).toBe(345 + direction * 20);
      expect(shot.y).toBe(67);
    }
  );

  it.each([
    [174.999, true],
    [175, false],
    [175.001, false],
    [1174.999, false],
    [1175, false],
    [1175.001, true]
  ])('culls x=%s beyond the shifted viewport margins: %s', (x, outside) => {
    const shot = new Projectile(x, 67, 1);
    expect(shot.isOutOfBounds(275, 800)).toBe(outside);
  });

  it('draws once in screen coordinates without moving the world bounds', () => {
    const shot = new Projectile(345, 67, -1);
    const ctx = { fillRect: vi.fn() };
    const bounds = shot.getBounds();
    shot.draw(ctx, 275);
    expect(ctx.fillStyle).toBe('#FFD700');
    expect(ctx.fillRect).toHaveBeenCalledExactlyOnceWith(70, 67, 10, 5);
    expect(shot.getBounds()).toEqual(bounds);
    expect(shot.active).toBe(true);
  });
});
