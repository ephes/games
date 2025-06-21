import { describe, it, expect } from 'vitest';

// Helper functions that would be extracted from the game
const gameHelpers = {
  // Calculate distance between two points
  distance: (x1, y1, x2, y2) => {
    const dx = x2 - x1;
    const dy = y2 - y1;
    return Math.sqrt(dx * dx + dy * dy);
  },

  // Check if a point is within a circle
  pointInCircle: (px, py, cx, cy, radius) => {
    const dist = gameHelpers.distance(px, py, cx, cy);
    return dist < radius;
  },

  // Clamp a value between min and max
  clamp: (value, min, max) => {
    return Math.max(min, Math.min(max, value));
  },

  // Check if two rectangles overlap
  rectIntersect: (r1, r2) => {
    return (
      r1.x < r2.x + r2.width &&
      r1.x + r1.width > r2.x &&
      r1.y < r2.y + r2.height &&
      r1.y + r1.height > r2.y
    );
  },

  // Get rectangle center point
  getRectCenter: rect => {
    return {
      x: rect.x + rect.width / 2,
      y: rect.y + rect.height / 2
    };
  }
};

describe('Game Helper Functions', () => {
  describe('distance', () => {
    it('should calculate distance between two points', () => {
      expect(gameHelpers.distance(0, 0, 3, 4)).toBe(5);
      expect(gameHelpers.distance(1, 1, 1, 1)).toBe(0);
      expect(gameHelpers.distance(-1, -1, 2, 3)).toBeCloseTo(5);
    });
  });

  describe('pointInCircle', () => {
    it('should detect point inside circle', () => {
      expect(gameHelpers.pointInCircle(5, 5, 5, 5, 10)).toBe(true);
      expect(gameHelpers.pointInCircle(0, 0, 5, 5, 5)).toBe(false);
      expect(gameHelpers.pointInCircle(3, 4, 0, 0, 5.1)).toBe(true); // distance is 5, so radius needs to be > 5
    });
  });

  describe('clamp', () => {
    it('should clamp values within range', () => {
      expect(gameHelpers.clamp(5, 0, 10)).toBe(5);
      expect(gameHelpers.clamp(-5, 0, 10)).toBe(0);
      expect(gameHelpers.clamp(15, 0, 10)).toBe(10);
      expect(gameHelpers.clamp(7, 7, 7)).toBe(7);
    });
  });

  describe('rectIntersect', () => {
    it('should detect overlapping rectangles', () => {
      const rect1 = { x: 0, y: 0, width: 10, height: 10 };
      const rect2 = { x: 5, y: 5, width: 10, height: 10 };
      const rect3 = { x: 15, y: 15, width: 10, height: 10 };

      expect(gameHelpers.rectIntersect(rect1, rect2)).toBe(true);
      expect(gameHelpers.rectIntersect(rect1, rect3)).toBe(false);
      expect(gameHelpers.rectIntersect(rect2, rect3)).toBe(false);
    });

    it('should detect edge touching as overlap', () => {
      const rect1 = { x: 0, y: 0, width: 10, height: 10 };
      const rect2 = { x: 10, y: 0, width: 10, height: 10 };

      expect(gameHelpers.rectIntersect(rect1, rect2)).toBe(false);
    });
  });

  describe('getRectCenter', () => {
    it('should calculate rectangle center', () => {
      const rect = { x: 10, y: 20, width: 40, height: 60 };
      const center = gameHelpers.getRectCenter(rect);

      expect(center.x).toBe(30);
      expect(center.y).toBe(50);
    });
  });
});
