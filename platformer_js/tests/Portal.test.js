import { describe, it, expect, beforeEach } from 'vitest';
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

    it('should update pulse time during draw', () => {
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
      portal.draw(mockCtx, 0);
      expect(portal.pulseTime).toBeGreaterThan(initialPulseTime);
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
  });
});
