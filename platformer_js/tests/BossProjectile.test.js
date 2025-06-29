import { describe, test, expect, beforeEach } from 'vitest';
import { BossProjectile } from '../src/entities/BossProjectile.js';

describe('BossProjectile', () => {
  let projectile;

  beforeEach(() => {
    projectile = new BossProjectile(100, 200, 1, 5);
  });

  test('should initialize with correct properties', () => {
    expect(projectile.x).toBe(100);
    expect(projectile.y).toBe(200);
    expect(projectile.width).toBe(16);
    expect(projectile.height).toBe(16);
    expect(projectile.velocityX).toBe(5);
    expect(projectile.velocityY).toBe(0);
    expect(projectile.active).toBe(true);
    expect(projectile.damage).toBe(1);
  });

  test('should move in correct direction', () => {
    projectile.update(16);
    expect(projectile.x).toBe(105);
    expect(projectile.y).toBe(200);

    const leftProjectile = new BossProjectile(100, 200, -1, 3);
    leftProjectile.update(16);
    expect(leftProjectile.x).toBe(97);
  });

  test('should update animation frame', () => {
    const initialFrame = projectile.currentFrame;
    projectile.animationTimer = 0.9;
    projectile.update(16);
    expect(projectile.currentFrame).not.toBe(initialFrame);
  });

  test('should cycle through all animation frames', () => {
    const frames = new Set();
    for (let i = 0; i < 20; i++) {
      projectile.animationTimer = 0.9;
      projectile.update(16);
      frames.add(projectile.currentFrame);
    }
    expect(frames.size).toBe(4);
  });

  test('should deactivate when off screen', () => {
    // Moving left - will be at -205 after update (boundary is -200)
    projectile.x = -200;
    projectile.velocityX = -5;
    projectile.update(16);
    expect(projectile.active).toBe(false);

    // Moving right - will be at 3203 after update (boundary is 3200)
    const rightProjectile = new BossProjectile(3200, 200, 1, 3);
    rightProjectile.update(16);
    expect(rightProjectile.active).toBe(false);

    // Already off screen top
    const topProjectile = new BossProjectile(100, -101, 1);
    topProjectile.update(16);
    expect(topProjectile.active).toBe(false);

    // Already off screen bottom
    const bottomProjectile = new BossProjectile(100, 801, 1);
    bottomProjectile.update(16);
    expect(bottomProjectile.active).toBe(false);
  });

  test('should not update when inactive', () => {
    projectile.active = false;
    const oldX = projectile.x;
    projectile.update(16);
    expect(projectile.x).toBe(oldX);
  });

  test('should draw when active', () => {
    const mockCtx = {
      save: () => {},
      restore: () => {},
      fillStyle: '',
      beginPath: () => {},
      arc: () => {},
      fill: () => {}
    };
    const mockCamera = { x: 0, y: 0 };

    // Should not throw
    expect(() => projectile.draw(mockCtx, mockCamera)).not.toThrow();
  });

  test('should not draw when inactive', () => {
    projectile.active = false;
    const mockCtx = {
      save: () => {},
      restore: () => {},
      fillStyle: '',
      beginPath: () => {},
      arc: () => {},
      fill: () => {}
    };
    const mockCamera = { x: 0, y: 0 };

    let drawCalled = false;
    mockCtx.save = () => {
      drawCalled = true;
    };

    projectile.draw(mockCtx, mockCamera);
    expect(drawCalled).toBe(false);
  });

  test('should draw with sprite when provided', () => {
    const mockCtx = {
      drawImage: () => {}
    };
    const mockCamera = { x: 0, y: 0 };
    const mockSprite = new Image();

    let drawImageCalled = false;
    mockCtx.drawImage = () => {
      drawImageCalled = true;
    };

    projectile.drawWithSprite(mockCtx, mockCamera, mockSprite);
    expect(drawImageCalled).toBe(true);
  });
});
