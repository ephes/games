import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Game } from '../src/Game.js';
import { BossProjectile } from '../src/entities/BossProjectile.js';

describe('Game composes boss shot rendering with the camera', () => {
  let game;
  beforeEach(() => {
    document.body.innerHTML =
      '<canvas id="composition" width="800" height="400"></canvas>';
    game = new Game('composition');
    game.levels = [
      {
        name: 'Synthetic render',
        playerStart: { x: 50, y: 50 },
        platforms: [],
        coins: [],
        enemies: [],
        boss: { x: 1200, y: 200, speed: 0 },
        portal: { x: 1500, y: 100 }
      }
    ];
    vi.spyOn(game.spriteLoader, 'loadAll').mockResolvedValue();
    // A real canvas returns the same context to Game and Renderer.
    vi.spyOn(game.canvas, 'getContext').mockReturnValue(game.ctx);
  });
  afterEach(() => {
    game.dispose();
    vi.restoreAllMocks();
  });

  it.each(['fallback', 'sprite'])(
    'translates %s shots once and balances context ownership',
    async mode => {
      await game.init();
      game.camera.x = 300;
      game.camera.y = 25;
      const shot = new BossProjectile(760, 120, 1);
      shot.currentFrame = 2;
      const inactive = new BossProjectile(900, 140, -1);
      inactive.active = false;
      game.boss.projectiles = [shot, inactive];
      const sprite = {};
      vi.spyOn(game.spriteLoader, 'getSprite').mockImplementation(name =>
        name === 'boss.fireball' && mode === 'sprite' ? sprite : null
      );
      const stack = [],
        arcs = [],
        images = [],
        texts = [];
      let tx = 0,
        ty = 0;
      const ctx = game.ctx;
      ctx.save = vi.fn(() => stack.push([tx, ty]));
      ctx.restore = vi.fn(() => {
        expect(stack.length).toBeGreaterThan(0);
        [tx, ty] = stack.pop();
      });
      ctx.translate = vi.fn((x, y) => {
        tx += x;
        ty += y;
      });
      ctx.arc = vi.fn((x, y, r) => {
        if (r <= 8) {
          arcs.push([x + tx, y + ty, r]);
        }
      });
      ctx.drawImage = vi.fn((image, sx, sy, sw, sh, x, y, w, h) =>
        images.push({
          image,
          source: [sx, sy, sw, sh],
          destination: [x + tx, y + ty, w, h]
        })
      );
      ctx.fillText = vi.fn((text, x, y) => texts.push([text, x + tx, y + ty]));
      ctx.stroke = vi.fn();
      ctx.moveTo = vi.fn();
      ctx.lineTo = vi.fn();
      const original = { ...shot };
      for (let frame = 0; frame < 2; frame++) {
        arcs.length = 0;
        images.length = 0;
        texts.length = 0;
        game.render();
        if (mode === 'fallback') {
          expect(arcs).toEqual([
            [468, 103, 8],
            [468, 103, 16 / 3],
            [468, 103, 16 / 6]
          ]);
          expect(images).toEqual([]);
        } else {
          expect(arcs).toEqual([]);
          expect(images).toEqual([
            {
              image: sprite,
              source: [32, 0, 16, 16],
              destination: [460, 95, 16, 16]
            }
          ]);
        }
        expect(texts).toContainEqual(['Score: 0', 20, 30]);
        expect(stack).toEqual([]);
        expect([tx, ty]).toEqual([0, 0]);
        expect(ctx.save.mock.calls.length).toBe(ctx.restore.mock.calls.length);
        expect(shot).toEqual(original);
      }
      shot.active = false;
      arcs.length = 0;
      images.length = 0;
      game.render();
      expect(arcs).toEqual([]);
      expect(images).toEqual([]);
      expect(stack).toEqual([]);
      expect([tx, ty]).toEqual([0, 0]);
    }
  );
});
