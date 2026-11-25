import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Portal } from '../src/objects/Portal.js';

describe('Portal', () => {
  let portal;

  beforeEach(() => {
    portal = new Portal(100, 200);
  });

  describe('Lock/Unlock functionality', () => {
    it('should be locked by default', () => {
      expect(portal.isLocked).toBe(true);
    });

    it('should unlock when unlock() is called', () => {
      portal.unlock();
      expect(portal.isLocked).toBe(false);
    });

    it('should lock when lock() is called', () => {
      portal.unlock();
      expect(portal.isLocked).toBe(false);

      portal.lock();
      expect(portal.isLocked).toBe(true);
    });
  });

  describe('Visual state', () => {
    it('should have pulse animation property', () => {
      expect(portal.pulseTime).toBeDefined();
      expect(typeof portal.pulseTime).toBe('number');
    });

    it('keeps pulse state unchanged across repeated draws', () => {
      const mockCtx = {
        save: () => {},
        restore: () => {},
        beginPath: () => {},
        arc: () => {},
        closePath: () => {},
        clip: () => {},
        stroke: () => {},
        fill: () => {},
        moveTo: () => {},
        lineTo: () => {},
        fillText: () => {},
        drawImage: () => {},
        globalAlpha: 1,
        strokeStyle: '',
        fillStyle: '',
        lineWidth: 0,
        font: '',
        textAlign: ''
      };

      const initialPulseTime = portal.pulseTime;
      for (let i = 0; i < 10; i++) {
        portal.draw(mockCtx, 0);
      }
      expect(portal.pulseTime).toBe(initialPulseTime);
    });
  });

  describe('Bounds', () => {
    it('should return correct bounds', () => {
      const bounds = portal.getBounds();
      expect(bounds).toEqual({
        x: 100,
        y: 200,
        width: 128,
        height: 128
      });
    });
  });

  describe('Sprite', () => {
    it('should set sprite correctly', () => {
      const mockSprite = { complete: true };
      portal.setSprite(mockSprite);
      expect(portal.sprite).toBe(mockSprite);
    });

    it('renders the fallback and lock overlay for a complete image without intrinsic dimensions', () => {
      const sprite = document.createElement('img');
      sprite.width = 128;
      sprite.height = 128;
      expect(sprite.complete).toBe(true);
      expect(sprite.naturalWidth).toBe(0);
      expect(sprite.naturalHeight).toBe(0);
      portal.setSprite(sprite);

      const ctx = {
        save: vi.fn(),
        restore: vi.fn(),
        beginPath: vi.fn(),
        arc: vi.fn(),
        closePath: vi.fn(),
        clip: vi.fn(),
        fill: vi.fn(),
        drawImage: vi.fn(),
        stroke: vi.fn(),
        moveTo: vi.fn(),
        lineTo: vi.fn(),
        fillText: vi.fn()
      };
      portal.draw(ctx, 20);

      expect(ctx.fill).toHaveBeenCalledTimes(1);
      expect(ctx.stroke).toHaveBeenCalledTimes(2);
      expect(ctx.fillText).toHaveBeenCalledExactlyOnceWith('LOCKED', 144, 353);
      expect(ctx.drawImage).not.toHaveBeenCalled();
      expect(ctx.restore).toHaveBeenCalledTimes(2);
    });
  });
});
