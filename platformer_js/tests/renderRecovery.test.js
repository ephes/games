import { afterEach, describe, expect, it, vi } from 'vitest';
import { Game } from '../src/Game.js';
import { BossProjectile } from '../src/entities/BossProjectile.js';

const games = [];
afterEach(() => {
  games.forEach(game => game.dispose());
  games.length = 0;
  vi.restoreAllMocks();
});

it.each(['fall', 'ceiling'])(
  'sweeps the real player update through a thin %s',
  async direction => {
    document.body.innerHTML =
      '<canvas id="sweep" width="800" height="600"></canvas>';
    const game = new Game('sweep');
    games.push(game);
    vi.spyOn(game.spriteLoader, 'loadAll').mockResolvedValue();
    await game.init();
    game.platforms = [{ x: 0, y: 100, width: 800, height: 2 }];
    game.player.x = 20;
    game.player.y = direction === 'fall' ? 0 : 200;
    game.player.velocityY = direction === 'fall' ? 200 : -200;
    game.player.isJumping = true;
    game.update(1000 / 60);
    expect(game.player.y).toBe(direction === 'fall' ? 70 : 102);
    expect(game.player.velocityY).toBe(0);
  }
);

describe('Reusable canvas after a rendering exception', () => {
  it.each([
    'player',
    'enemy',
    'boss',
    'portal sprite',
    'portal barrier',
    'portal glow',
    'portal fallback',
    'boss shot'
  ])('restores every owned scope after %s fails', async target => {
    document.body.innerHTML = '<canvas id="recovery"></canvas>';
    const canvas = document.getElementById('recovery');
    const ctx = canvas.getContext('2d');
    const stack = [];
    let state = { x: 0, y: 0, sx: 1, sy: 1, alpha: 1, clipped: false };
    const baseline = { ...state };
    ctx.save = () => stack.push({ ...state });
    ctx.restore = () => {
      expect(stack.length).toBeGreaterThan(0);
      state = stack.pop();
    };
    ctx.translate = (x, y) => {
      state.x += x;
      state.y += y;
    };
    ctx.scale = (x, y) => {
      state.sx *= x;
      state.sy *= y;
    };
    ctx.clip = () => {
      state.clipped = true;
    };
    Object.defineProperty(ctx, 'globalAlpha', {
      get: () => state.alpha,
      set: alpha => {
        state.alpha = alpha;
      }
    });
    ctx.stroke = vi.fn();
    ctx.moveTo = vi.fn();
    ctx.lineTo = vi.fn();
    vi.spyOn(canvas, 'getContext').mockReturnValue(ctx);
    const makeGame = async () => {
      const game = new Game('recovery');
      games.push(game);
      vi.spyOn(game.spriteLoader, 'loadAll').mockResolvedValue();
      await game.init();
      game.camera.x = 100;
      return game;
    };
    const game = await makeGame();
    const error = new Error('synthetic draw failure');
    let operation = 'drawImage';
    if (['player', 'enemy', 'boss'].includes(target)) {
      const name = { player: 'player.idle', enemy: 'enemy.run', boss: 'boss' }[
        target
      ];
      game.spriteLoader.sprites.set(name, {});
      if (target === 'player') {
        game.player.direction = -1;
      }
      if (target === 'enemy') {
        game.enemies[0].direction = -1;
      }
      if (target === 'boss') {
        game.boss.direction = -1;
      }
    } else if (target.startsWith('portal')) {
      if (target !== 'portal fallback') {
        game.portal.sprite = { complete: true };
      }
      if (target === 'portal glow') {
        game.portal.unlock();
      }
      operation =
        target === 'portal sprite'
          ? 'drawImage'
          : target === 'portal fallback'
            ? 'fill'
            : 'stroke';
    } else {
      game.boss.projectiles = [new BossProjectile(200, 100, 1)];
      operation = 'fill';
    }
    const failure = vi.spyOn(ctx, operation).mockImplementation(() => {
      throw error;
    });
    expect(() => game.start()).toThrow(error);
    expect(game.disposed).toBe(true);
    expect(stack).toHaveLength(0);
    expect(state).toEqual(baseline);
    failure.mockRestore();
    const replacement = await makeGame();
    replacement.render();
    expect(stack).toHaveLength(0);
    expect(state).toEqual(baseline);
  });
});
