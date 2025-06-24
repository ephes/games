import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Boss } from '../src/entities/Boss.js';

describe('Boss', () => {
  let boss;
  let platforms;

  beforeEach(() => {
    platforms = [{ x: 100, y: 300, width: 600, height: 20 }];

    boss = new Boss({
      x: 200,
      y: 250,
      speed: 2,
      platformIndex: 0
    });
  });

  describe('Animation', () => {
    it('should use custom animation sequence', () => {
      expect(boss.animationSequence).toEqual([0, 1, 2, 3, 4, 3, 2, 1]);
      expect(boss.sequenceIndex).toBe(0);
      expect(boss.frameX).toBe(0);
    });

    it('should not be affected by parent Enemy animation logic', () => {
      // Simulate multiple update cycles
      const originalFrameX = boss.frameX;
      const originalSequenceIndex = boss.sequenceIndex;

      // Call update which used to call parent's updateAnimation
      boss.update(platforms, 16);

      // The animation should only change based on boss's frameInterval
      expect(boss.frameX).toBe(originalFrameX);
      expect(boss.sequenceIndex).toBe(originalSequenceIndex);
    });

    it('should update animation based on time interval', () => {
      // Mock Date.now to control timing
      const mockNow = vi.spyOn(Date, 'now');
      const startTime = 1000;
      mockNow.mockReturnValue(startTime);

      boss.frameTimer = startTime;

      // First update - no change (not enough time passed)
      mockNow.mockReturnValue(startTime + 50);
      boss.updateBossAnimation();
      expect(boss.frameX).toBe(0);
      expect(boss.sequenceIndex).toBe(0);

      // Second update - should change (200ms passed)
      mockNow.mockReturnValue(startTime + 250);
      boss.updateBossAnimation();
      expect(boss.sequenceIndex).toBe(1);
      expect(boss.frameX).toBe(boss.animationSequence[1]);

      mockNow.mockRestore();
    });

    it('should cycle through animation sequence correctly', () => {
      const mockNow = vi.spyOn(Date, 'now');
      let currentTime = 1000;
      mockNow.mockReturnValue(currentTime);
      boss.frameTimer = currentTime;

      // Test full animation cycle
      const expectedFrames = [0, 1, 2, 3, 4, 3, 2, 1];

      for (let i = 0; i < expectedFrames.length * 2; i++) {
        currentTime += boss.frameInterval + 10;
        mockNow.mockReturnValue(currentTime);
        boss.updateBossAnimation();

        const expectedIndex = (i + 1) % expectedFrames.length;
        expect(boss.sequenceIndex).toBe(expectedIndex);
        expect(boss.frameX).toBe(expectedFrames[expectedIndex]);
      }

      mockNow.mockRestore();
    });

    it('should maintain consistent frame timing', () => {
      const mockNow = vi.spyOn(Date, 'now');
      const startTime = 1000;
      mockNow.mockReturnValue(startTime);

      boss.frameTimer = startTime;
      const frameChanges = [];

      // Simulate 1 second of updates at 60fps
      for (let time = startTime; time < startTime + 1000; time += 16) {
        mockNow.mockReturnValue(time);
        const oldFrame = boss.frameX;
        boss.updateBossAnimation();

        if (boss.frameX !== oldFrame) {
          frameChanges.push(time);
        }
      }

      // Should have ~5 frame changes in 1 second (200ms interval)
      expect(frameChanges.length).toBeGreaterThanOrEqual(4);
      expect(frameChanges.length).toBeLessThanOrEqual(6);

      // Check intervals between changes are consistent
      for (let i = 1; i < frameChanges.length; i++) {
        const interval = frameChanges[i] - frameChanges[i - 1];
        expect(interval).toBeGreaterThanOrEqual(boss.frameInterval - 20);
        expect(interval).toBeLessThanOrEqual(boss.frameInterval + 20);
      }

      mockNow.mockRestore();
    });

    it('should not reset animation when hit', () => {
      const mockNow = vi.spyOn(Date, 'now');
      mockNow.mockReturnValue(1000);

      // Set boss to middle of animation
      boss.sequenceIndex = 3;
      boss.frameX = boss.animationSequence[3];

      // Take damage
      boss.takeDamage();

      // Animation should continue from current position
      expect(boss.sequenceIndex).toBe(3);
      expect(boss.frameX).toBe(boss.animationSequence[3]);

      mockNow.mockRestore();
    });
  });
});
