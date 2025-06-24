import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Boss } from '../src/entities/Boss.js';

describe('Boss', () => {
  let boss;
  let platforms;

  beforeEach(() => {
    platforms = [{ x: 0, y: 300, width: 800, height: 20 }];

    boss = new Boss({
      x: 400,
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

  describe('AI and Movement', () => {
    let player;

    beforeEach(() => {
      player = {
        x: 300,
        y: 200,
        velocityY: 0
      };
    });

    it('should not change direction rapidly when player is directly above', () => {
      // Place boss directly under player
      boss.x = 300;
      boss.direction = 1;

      // Update with player directly above (0 horizontal distance)
      boss.update(platforms, 16, player);
      expect(boss.direction).toBe(1); // Should maintain direction

      // Move player slightly to the left (within dead zone)
      player.x = 280; // 20 pixels away
      boss.update(platforms, 16, player);
      expect(boss.direction).toBe(1); // Should still maintain direction

      // Move player outside dead zone
      player.x = 250; // 50 pixels away
      boss.update(platforms, 16, player);
      expect(boss.direction).toBe(-1); // Now should change direction
    });

    it('should have different dead zones for different distance zones', () => {
      // Test close zone (< 300 pixels) with 30 pixel dead zone
      boss.x = 400; // Center of platform to avoid edge effects
      boss.direction = 1;

      // Within close zone dead zone (30 pixels)
      player.x = boss.x - 25; // 25 pixels to the left
      boss.update(platforms, 16, player);
      expect(boss.direction).toBe(1); // Should NOT change

      // Outside close zone dead zone
      player.x = boss.x - 35; // 35 pixels to the left
      boss.update(platforms, 16, player);
      expect(boss.direction).toBe(-1); // Should change

      // Test medium zone (300-600 pixels) with 50 pixel dead zone
      // Reset boss position to avoid interference from previous test
      boss.x = 200; // Well within platform bounds
      boss.direction = 1;
      player.x = boss.x + 350; // 350 pixels away (in medium zone)
      boss.update(platforms, 16, player);
      expect(boss.speed).toBe(boss.baseSpeed * 0.5); // Verify medium zone speed

      // Now test dead zone - boss facing right, player slightly to the left
      boss.direction = 1;
      player.x = boss.x - 45; // 45 pixels to the left (155), still in close zone!
      // This puts player at 155, boss at 200, so distance is 45 pixels (close zone)
      boss.update(platforms, 16, player);
      expect(boss.direction).toBe(-1); // Should change (45 > 30 pixel close zone dead zone)

      // Test actual medium zone dead zone
      boss.x = 200;
      boss.direction = 1;
      player.x = boss.x + 340; // 340 pixels away (in medium zone)
      boss.update(platforms, 16, player);

      // Now move player to other side but keep in medium zone
      boss.direction = -1; // Boss facing left
      player.x = boss.x + 340; // Player 340 pixels to the right
      boss.update(platforms, 16, player);
      expect(boss.direction).toBe(1); // Should change (340 > 50)
    });

    it('should dodge when player is falling from above', () => {
      // Place player above boss and falling
      player.x = boss.x + 10;
      player.y = boss.y - 60;
      player.velocityY = 5; // Falling
      boss.direction = 1;
      boss.speed = boss.baseSpeed;

      boss.update(platforms, 16, player);

      // Should move away quickly
      expect(boss.speed).toBe(boss.baseSpeed * 3);
      expect(boss.direction).toBe(-1); // Move away from player
    });

    it('should adjust speed based on distance zones', () => {
      // Far zone
      player.x = boss.x + 700;
      boss.update(platforms, 16, player);
      expect(boss.speed).toBe(boss.baseSpeed);

      // Medium zone
      player.x = boss.x + 400;
      boss.update(platforms, 16, player);
      expect(boss.speed).toBe(boss.baseSpeed * 0.5);

      // Close zone
      player.x = boss.x + 100;
      boss.update(platforms, 16, player);
      expect(boss.speed).toBe(boss.baseSpeed * 1.5);
    });
  });
});
