import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Renderer } from '../src/rendering/Renderer.js';
import { Boss } from '../src/entities/Boss.js';

// Record geometry and the canvas state at each draw, without browser pixels.
function recordingContext() {
  let state = { scaleX: 1, scaleY: 1, composite: 'source-over' };
  const stack = [];
  return {
    save: vi.fn(() => stack.push({ ...state })),
    restore: vi.fn(() => {
      if (!stack.length) {
        throw new Error('Unbalanced canvas restore');
      }
      state = stack.pop();
    }),
    scale: vi.fn((x, y) => {
      state.scaleX *= x;
      state.scaleY *= y;
    }),
    get globalCompositeOperation() {
      return state.composite;
    },
    set globalCompositeOperation(value) {
      state.composite = value;
    },
    drawImage: vi.fn((...args) => ({ args, ...state })),
    fillRect: vi.fn((...args) => ({ args, ...state })),
    get depth() {
      return stack.length;
    }
  };
}

describe('Renderer sprite geometry', () => {
  let ctx, sprites, renderer;
  const sprite = {};
  beforeEach(() => {
    ctx = recordingContext();
    sprites = {
      getAnimationConfig: () => ({
        player: { frameWidth: 32, frameHeight: 40 },
        enemy: { frameWidth: 48, frameHeight: 36 },
        boss: { frameWidth: 64, frameHeight: 80 }
      }),
      getSprite: vi.fn(() => sprite)
    };
    renderer = new Renderer({ getContext: () => ctx }, sprites);
  });
  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it.each([1, -1])(
    'draws the player frame facing %i, restoring transforms for the next entity',
    direction => {
      const player = {
        x: 12,
        y: 34,
        width: 30,
        height: 40,
        currentAnimation: 'run',
        animationFrame: 3,
        direction
      };
      renderer.drawPlayer(player);
      expect(sprites.getSprite).toHaveBeenCalledWith('player.run');
      expect(ctx.drawImage.mock.results[0].value).toEqual({
        args: [sprite, 96, 0, 32, 40, direction === -1 ? -42 : 12, 34, 30, 40],
        scaleX: direction,
        scaleY: 1,
        composite: 'source-over'
      });
      renderer.drawPlayer({ ...player, direction: 1, animationFrame: 0 });
      expect(ctx.drawImage.mock.results[1].value).toEqual({
        args: [sprite, 0, 0, 32, 40, 12, 34, 30, 40],
        scaleX: 1,
        scaleY: 1,
        composite: 'source-over'
      });
      expect(ctx.depth).toBe(0);
      expect(ctx.save).toHaveBeenCalledTimes(2);
      expect(ctx.restore).toHaveBeenCalledTimes(2);
    }
  );

  it.each([1, -1])('draws the enemy frame facing %i', direction => {
    const enemy = {
      x: 50,
      y: 70,
      width: 44,
      height: 30,
      frameX: 2,
      direction,
      alive: true,
      getAnimationState: () => 'hit'
    };
    renderer.drawEnemy(enemy);
    expect(sprites.getSprite).toHaveBeenCalledWith('enemy.hit');
    expect(ctx.drawImage.mock.results[0].value).toEqual({
      args: [sprite, 96, 0, 48, 36, direction === -1 ? -94 : 50, 70, 44, 30],
      scaleX: direction,
      scaleY: 1,
      composite: 'source-over'
    });
    renderer.drawPlayer({
      x: 1,
      y: 2,
      width: 30,
      height: 30,
      currentAnimation: 'idle',
      animationFrame: 0,
      direction: 1
    });
    expect(ctx.drawImage.mock.results[1].value.scaleX).toBe(1);
    expect(ctx.depth).toBe(0);
    expect(ctx.save).toHaveBeenCalledTimes(2);
    expect(ctx.restore).toHaveBeenCalledTimes(2);
  });

  it('stops drawing a defeated real boss at once', () => {
    const boss = new Boss({ x: 100, y: 80, speed: 0, platformIndex: 0 });
    while (boss.alive) {
      boss.takeDamage();
    }
    boss.update([{ x: 0, y: 176, width: 400, height: 20 }], 16);
    renderer.drawBoss(boss);
    expect(ctx.drawImage).not.toHaveBeenCalled();
    expect(ctx.fillRect).not.toHaveBeenCalled();
  });

  it('does no drawing or canvas changes for missing sprites', () => {
    sprites.getSprite.mockReturnValue(null);
    renderer.drawPlayer({ currentAnimation: 'idle' });
    renderer.drawEnemy({ alive: true, getAnimationState: () => 'run' });
    renderer.drawBoss({ alive: true });
    expect(ctx.drawImage).not.toHaveBeenCalled();
    expect(ctx.fillRect).not.toHaveBeenCalled();
    expect(ctx.save).not.toHaveBeenCalled();
    expect(ctx.restore).not.toHaveBeenCalled();
    expect(ctx.depth).toBe(0);
  });

  it.each([1, -1])(
    'isolates the hit boss composite and transform facing %i',
    direction => {
      const hitCtx = recordingContext();
      hitCtx.clearRect = vi.fn();
      const getHitContext = vi
        .spyOn(HTMLCanvasElement.prototype, 'getContext')
        .mockImplementation(function () {
          hitCtx.canvas = this;
          return hitCtx;
        });
      const boss = {
        x: 100,
        y: 80,
        width: 96,
        height: 96,
        frameX: 4,
        direction,
        alive: true,
        isHit: true,
        hitTimer: 1000,
        simulationTime: 1100,
        hitDuration: 500,
        getHealthPercentage: () => 0.5
      };
      renderer.drawBoss(boss);
      expect(sprites.getSprite).toHaveBeenCalledWith('boss');
      expect(hitCtx.clearRect).toHaveBeenCalledWith(0, 0, 64, 80);
      expect(hitCtx.drawImage).toHaveBeenCalledWith(
        sprite,
        256,
        0,
        64,
        80,
        0,
        0,
        64,
        80
      );
      expect(hitCtx.fillRect.mock.results[0].value).toEqual({
        args: [0, 0, 64, 80],
        scaleX: 1,
        scaleY: 1,
        composite: 'source-atop'
      });
      const frame = getHitContext.mock.contexts[0];
      expect(frame).toMatchObject({ width: 64, height: 80 });
      expect(ctx.drawImage.mock.results[0].value).toEqual({
        args: [frame, 0, 0, 64, 80, direction === -1 ? -196 : 100, 80, 96, 96],
        scaleX: direction,
        scaleY: 1,
        composite: 'source-over'
      });
      expect(ctx.imageSmoothingEnabled).toBe(true);
      expect(ctx.imageSmoothingQuality).toBe('high');
      expect(ctx.fillRect.mock.results.map(result => result.value)).toEqual([
        {
          args: [100, 64, 96, 10],
          scaleX: 1,
          scaleY: 1,
          composite: 'source-over'
        },
        {
          args: [100, 64, 48, 10],
          scaleX: 1,
          scaleY: 1,
          composite: 'source-over'
        }
      ]);
      renderer.drawPlayer({
        x: 1,
        y: 2,
        width: 30,
        height: 30,
        currentAnimation: 'idle',
        animationFrame: 0,
        direction: 1
      });
      expect(ctx.drawImage.mock.results[1].value).toMatchObject({
        scaleX: 1,
        scaleY: 1,
        composite: 'source-over'
      });
      expect(ctx.globalCompositeOperation).toBe('source-over');
      expect(ctx.depth).toBe(0);
      expect(ctx.save).toHaveBeenCalledTimes(2);
      expect(ctx.restore).toHaveBeenCalledTimes(2);

      boss.frameX++;
      renderer.drawBoss(boss);
      expect(getHitContext).toHaveBeenCalledTimes(1);
      expect(hitCtx.clearRect).toHaveBeenCalledTimes(2);
      expect(hitCtx.drawImage.mock.results[1].value).toMatchObject({
        args: [sprite, 320, 0, 64, 80, 0, 0, 64, 80],
        composite: 'source-over'
      });
      expect(ctx.drawImage.mock.calls[2][0]).toBe(frame);
    }
  );
});
