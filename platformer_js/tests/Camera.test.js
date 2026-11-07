import { describe, expect, it, vi } from 'vitest';
import { Camera } from '../src/systems/Camera.js';

describe('Real camera coordinates', () => {
  it.each([
    [-1000, -50],
    [100, 0],
    [800, 700],
    [5000, 850]
  ])('follows target x=%i within translated bounds at x=%i', (x, expected) => {
    const camera = new Camera(300, 200);
    camera.setBounds({ minX: -50, maxX: 1150, minY: 40, maxY: 640 });
    camera.follow({ x, y: 9999 });
    expect(camera.x).toBe(expected);
    // Follow is horizontal; the existing vertical position is clamped.
    expect(camera.y).toBe(40);
    camera.y = 9999;
    camera.follow({ x });
    expect(camera.y).toBe(440);
  });

  it.each([300, 500])(
    'anchors a viewport of width %i at bounds smaller or equal',
    width => {
      const camera = new Camera(width, 300);
      camera.setBounds({ minX: 70, maxX: 370, minY: -20, maxY: 180 });
      for (const x of [-1000, 1000]) {
        camera.follow({ x });
        expect({ x: camera.x, y: camera.y }).toEqual({ x: 70, y: -20 });
      }
    }
  );

  it('follows without bounds, preserving the vertical position', () => {
    const camera = new Camera(300, 200);
    camera.y = 70;
    camera.follow({ x: -500, y: 900 });
    expect({ x: camera.x, y: camera.y }).toEqual({ x: -600, y: 70 });
  });

  it.each([
    [80, 250, true],
    [79, 250, false],
    [400, 250, true],
    [401, 250, false],
    [200, 190, true],
    [200, 189, false],
    [200, 400, true],
    [200, 401, false],
    [200, 250, true]
  ])(
    'includes touching edges for an object at (%i,%i): %s',
    (x, y, visible) => {
      const camera = new Camera(300, 200);
      camera.x = 100;
      camera.y = 200;
      expect(camera.isVisible({ x, y, width: 20, height: 10 })).toBe(visible);
    }
  );

  it('agrees with an independent canvas translation oracle and resets', () => {
    const camera = new Camera(300, 200);
    const bounds = { minX: 120, maxX: 900, minY: -40, maxY: 500 };
    camera.setBounds(bounds);
    camera.follow({ x: 445 });
    const point = Object.freeze({ x: 500, y: 90 });
    // x camera = 445 - 300/3 = 345; y clamps from zero to zero.
    camera.y = -40;
    let canvasPoint = { ...point };
    const ctx = {
      translate: vi.fn((dx, dy) => {
        canvasPoint = { x: point.x + dx, y: point.y + dy };
      })
    };
    camera.applyTransform(ctx);
    expect(ctx.translate).toHaveBeenCalledExactlyOnceWith(-345, 40);
    expect(canvasPoint).toEqual({ x: 155, y: 130 });
    expect(camera.worldToScreen(point.x, point.y)).toEqual(canvasPoint);
    expect(point).toEqual({ x: 500, y: 90 });
    camera.reset();
    expect(camera.worldToScreen(point.x, point.y)).toEqual(point);
    expect(camera.bounds).toBe(bounds);
    expect({ width: camera.width, height: camera.height }).toEqual({
      width: 300,
      height: 200
    });
  });
});
