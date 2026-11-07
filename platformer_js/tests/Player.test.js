import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Player } from '../src/entities/Player.js';

describe('Player protection', () => {
  let player;
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    player = new Player(10, 20);
  });
  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
  });

  it('renews protection through the old expiry until the new expiry', () => {
    player.makeInvulnerable(2000);
    vi.advanceTimersByTime(1000);
    player.makeInvulnerable(2000);
    vi.advanceTimersByTime(1000);
    expect(player.isInvulnerable).toBe(true);
    vi.advanceTimersByTime(999);
    expect(player.isInvulnerable).toBe(true);
    vi.advanceTimersByTime(1);
    expect(player.isInvulnerable).toBe(false);
  });

  it('renews the hit animation independently of protection', () => {
    player.makeInvulnerable(2000);
    vi.advanceTimersByTime(250);
    player.makeInvulnerable(2000);
    vi.advanceTimersByTime(250);
    player.update({}, 1000 / 60);
    expect(player.isHit).toBe(true);
    vi.advanceTimersByTime(249);
    expect(player.isHit).toBe(true);
    vi.advanceTimersByTime(1);
    expect(player.isHit).toBe(false);
    expect(player.isInvulnerable).toBe(true);
  });

  it('loses one life and respawns once while protected, then accepts damage again', () => {
    Object.assign(player, { x: 100, y: 200, velocityY: -4, isJumping: true });
    let lives = player.takeDamage(3);
    expect(lives).toBe(2);
    expect(player).toMatchObject({
      x: 10,
      y: 20,
      velocityY: 0,
      isJumping: false
    });
    lives = player.takeDamage(lives);
    expect(lives).toBe(2);
    vi.advanceTimersByTime(2000);
    expect(player.takeDamage(lives)).toBe(1);
  });
});

describe('Player animation', () => {
  let player;
  beforeEach(() => {
    player = new Player(10, 20);
  });

  it.each([
    ['hit', true, true, -4, { ArrowRight: true }],
    ['jump', false, true, -4, { ArrowLeft: true }],
    ['fall', false, true, 0, { ArrowRight: true }],
    ['fall', false, true, 4, {}],
    ['run', false, false, 0, { ArrowLeft: true }],
    ['run', false, false, 0, { ArrowRight: true }],
    ['idle', false, false, 0, {}]
  ])(
    'selects %s for hit=%s jumping=%s velocity=%s keys=%j',
    (animation, isHit, isJumping, velocityY, keys) => {
      Object.assign(player, { isHit, isJumping, velocityY });
      player.updateAnimation(keys);
      expect(player.currentAnimation).toBe(animation);
    }
  );

  it('resets frame and timer on a state change, preserving them for the same state', () => {
    player.animationFrame = 5;
    player.animationTimer = 20;
    player.updateAnimation({});
    expect(player.animationFrame).toBe(5);
    expect(player.animationTimer).toBe(20);
    player.updateAnimation({ ArrowRight: true });
    expect(player.currentAnimation).toBe('run');
    expect(player.animationFrame).toBe(0);
    expect(player.animationTimer).toBe(0);
  });

  it.each([
    ['idle', 11],
    ['run', 12],
    ['hit', 7]
  ])('wraps %s at %i frames at 15 FPS', (animation, count) => {
    player.currentAnimation = animation;
    for (let frame = 1; frame <= count; frame++) {
      player.updateAnimationFrame(1000 / 15 - 1);
      expect(player.animationFrame).toBe(frame - 1);
      player.updateAnimationFrame(1);
      expect(player.animationFrame).toBe(frame % count);
      expect(player.animationTimer).toBe(0);
    }
  });

  it.each(['jump', 'fall'])(
    'keeps a stable single-frame %s animation',
    animation => {
      player.currentAnimation = animation;
      for (let step = 0; step < 120; step++) {
        player.updateAnimationFrame(1000 / 60);
        expect(player.animationFrame).toBe(0);
      }
      expect(player.currentAnimation).toBe(animation);
    }
  );

  it('runs production animation selection and frame updates during simulation', () => {
    player.update({ ArrowRight: true }, 1000 / 60);
    expect(player.currentAnimation).toBe('run');
    expect(player.animationTimer).toBe(1000 / 60);
    player.update({ ArrowUp: true, ArrowRight: true }, 1000 / 60);
    expect(player.currentAnimation).toBe('jump');
    expect(player.animationFrame).toBe(0);
    player.velocityY = 0;
    player.update({}, 1000 / 60);
    expect(player.currentAnimation).toBe('fall');
  });

  it('expires hit state by wall time, independently of fixed simulation steps', () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    try {
      player.makeInvulnerable();
      for (let step = 0; step < 120; step++) {
        player.update({ ArrowRight: true }, 1000 / 60);
      }
      expect(player.currentAnimation).toBe('hit');
      vi.advanceTimersByTime(500);
      player.update({ ArrowRight: true }, 1000 / 60);
      expect(player.currentAnimation).toBe('run');
      expect(player.isInvulnerable).toBe(true);
    } finally {
      vi.clearAllTimers();
      vi.useRealTimers();
    }
  });
});
