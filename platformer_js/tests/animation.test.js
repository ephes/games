import { describe, it, expect, beforeEach } from 'vitest';

// Animation system that would be extracted from the game
class AnimationSystem {
  constructor() {
    this.animations = new Map();
  }

  addAnimation(name, config) {
    this.animations.set(name, {
      ...config,
      currentFrame: 0,
      lastFrameTime: 0,
      isPlaying: false
    });
  }

  play(name) {
    const anim = this.animations.get(name);
    if (anim) {
      anim.isPlaying = true;
      anim.currentFrame = 0;
      anim.lastFrameTime = performance.now();
    }
  }

  stop(name) {
    const anim = this.animations.get(name);
    if (anim) {
      anim.isPlaying = false;
    }
  }

  update(name, currentTime) {
    const anim = this.animations.get(name);
    if (!anim || !anim.isPlaying) {
      return null;
    }

    const elapsed = currentTime - anim.lastFrameTime;

    if (elapsed >= anim.frameInterval) {
      const nextFrame = anim.currentFrame + 1;

      if (nextFrame >= anim.frameCount) {
        if (anim.loop === false) {
          anim.isPlaying = false;
          // Stay at last frame
        } else {
          anim.currentFrame = 0;
        }
      } else {
        anim.currentFrame = nextFrame;
      }

      anim.lastFrameTime = currentTime;
    }

    return {
      frameX: anim.currentFrame * anim.frameWidth,
      frameY: 0,
      frameWidth: anim.frameWidth,
      frameHeight: anim.frameHeight
    };
  }

  getCurrentFrame(name) {
    const anim = this.animations.get(name);
    return anim ? anim.currentFrame : 0;
  }

  isPlaying(name) {
    const anim = this.animations.get(name);
    return anim ? anim.isPlaying : false;
  }
}

describe('Animation System', () => {
  let animSystem;

  beforeEach(() => {
    animSystem = new AnimationSystem();
  });

  describe('Adding animations', () => {
    it('should add animation with config', () => {
      animSystem.addAnimation('run', {
        frameCount: 8,
        frameWidth: 32,
        frameHeight: 32,
        frameInterval: 100,
        loop: true
      });

      expect(animSystem.animations.has('run')).toBe(true);
      expect(animSystem.animations.get('run').frameCount).toBe(8);
    });
  });

  describe('Playing animations', () => {
    beforeEach(() => {
      animSystem.addAnimation('jump', {
        frameCount: 4,
        frameWidth: 32,
        frameHeight: 32,
        frameInterval: 50,
        loop: false
      });
    });

    it('should start animation when played', () => {
      animSystem.play('jump');
      expect(animSystem.isPlaying('jump')).toBe(true);
      expect(animSystem.getCurrentFrame('jump')).toBe(0);
    });

    it('should stop animation', () => {
      animSystem.play('jump');
      animSystem.stop('jump');
      expect(animSystem.isPlaying('jump')).toBe(false);
    });
  });

  describe('Updating animations', () => {
    beforeEach(() => {
      animSystem.addAnimation('walk', {
        frameCount: 6,
        frameWidth: 32,
        frameHeight: 32,
        frameInterval: 100,
        loop: true
      });
    });

    it('should advance frame after interval', () => {
      animSystem.play('walk');
      const anim = animSystem.animations.get('walk');
      const startTime = 1000;

      // First update - sets initial lastFrameTime
      animSystem.update('walk', startTime);
      expect(animSystem.getCurrentFrame('walk')).toBe(0);

      // Need to manually set lastFrameTime since play() uses performance.now()
      anim.lastFrameTime = startTime;

      // Update after interval
      animSystem.update('walk', startTime + 100);
      expect(animSystem.getCurrentFrame('walk')).toBe(1);

      // Update after another interval
      animSystem.update('walk', startTime + 200);
      expect(animSystem.getCurrentFrame('walk')).toBe(2);
    });

    it('should loop back to first frame', () => {
      animSystem.play('walk');
      const anim = animSystem.animations.get('walk');
      const startTime = 1000;
      anim.lastFrameTime = startTime;

      // Advance through all frames
      for (let i = 0; i < 6; i++) {
        animSystem.update('walk', startTime + (i + 1) * 100);
      }

      // Should loop back to 0
      expect(animSystem.getCurrentFrame('walk')).toBe(0);
    });

    it('should stop at last frame for non-looping animations', () => {
      animSystem.addAnimation('death', {
        frameCount: 3,
        frameWidth: 32,
        frameHeight: 32,
        frameInterval: 100,
        loop: false
      });

      animSystem.play('death');
      const anim = animSystem.animations.get('death');
      const startTime = 1000;
      anim.lastFrameTime = startTime;

      // Advance through all frames
      animSystem.update('death', startTime + 100); // frame 1
      animSystem.update('death', startTime + 200); // frame 2
      animSystem.update('death', startTime + 300); // should stay at frame 2

      expect(animSystem.getCurrentFrame('death')).toBe(2);
      expect(animSystem.isPlaying('death')).toBe(false);
    });

    it('should return correct sprite coordinates', () => {
      animSystem.play('walk');
      const anim = animSystem.animations.get('walk');
      anim.lastFrameTime = 1000;

      const result = animSystem.update('walk', 1000);

      expect(result).toEqual({
        frameX: 0,
        frameY: 0,
        frameWidth: 32,
        frameHeight: 32
      });

      // After advancing
      const result2 = animSystem.update('walk', 1100);
      expect(result2.frameX).toBe(32); // frameWidth * frame 1
    });
  });

  describe('Frame timing', () => {
    it('should not advance frame before interval', () => {
      animSystem.addAnimation('idle', {
        frameCount: 4,
        frameWidth: 32,
        frameHeight: 32,
        frameInterval: 200,
        loop: true
      });

      animSystem.play('idle');
      const anim = animSystem.animations.get('idle');
      const startTime = 1000;
      anim.lastFrameTime = startTime;

      // Multiple updates within interval
      animSystem.update('idle', startTime);
      animSystem.update('idle', startTime + 50);
      animSystem.update('idle', startTime + 100);
      animSystem.update('idle', startTime + 150);

      expect(animSystem.getCurrentFrame('idle')).toBe(0);

      // Update after interval
      animSystem.update('idle', startTime + 200);
      expect(animSystem.getCurrentFrame('idle')).toBe(1);
    });
  });
});
