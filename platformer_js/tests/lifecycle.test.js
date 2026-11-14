import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Game } from '../src/Game.js';
import { Player } from '../src/entities/Player.js';
import { Enemy } from '../src/entities/Enemy.js';
import { BossProjectile } from '../src/entities/BossProjectile.js';

const deferred = () => {
  let resolve, reject;
  const promise = new Promise((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
};

describe('Owned game lifecycle and simulation clock', () => {
  let game, frames, nextId;
  beforeEach(() => {
    document.body.innerHTML = '<canvas id="lifecycle"></canvas>';
    game = new Game('lifecycle');
    frames = new Map();
    nextId = 0;
    vi.stubGlobal(
      'requestAnimationFrame',
      vi.fn(callback => {
        frames.set(++nextId, callback);
        return nextId;
      })
    );
    vi.stubGlobal(
      'cancelAnimationFrame',
      vi.fn(id => frames.delete(id))
    );
    vi.spyOn(performance, 'now').mockReturnValue(0);
    vi.spyOn(game, 'render').mockImplementation(() => {});
  });
  afterEach(() => {
    game.dispose();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });
  function frame(time) {
    const [id, callback] = frames.entries().next().value;
    frames.delete(id);
    callback(time);
  }
  it('ignores early starts without retiring the game, then runs one initialized loop', async () => {
    const loading = deferred();
    vi.spyOn(game.spriteLoader, 'loadAll').mockReturnValue(loading.promise);
    game.render.mockRestore();
    for (const method of ['translate', 'stroke', 'moveTo', 'lineTo']) {
      game.ctx[method] = vi.fn();
    }
    expect(() => game.start()).not.toThrow();
    expect(game.disposed).toBe(false);
    expect(game.running).toBe(false);
    expect(frames.size).toBe(0);
    expect(game.spriteLoader.loadAll).not.toHaveBeenCalled();
    const init = game.init();
    game.start();
    game.start();
    expect(game.running).toBe(false);
    expect(game.player).toBeNull();
    expect(frames.size).toBe(0);
    loading.resolve();
    await init;
    game.start();
    game.start();
    expect(game.initialized).toBe(true);
    expect(game.disposed).toBe(false);
    expect(frames.size).toBe(1);
    frame(20);
    expect(frames.size).toBe(1);
  });

  it('keeps a deferred init rejection controlled after an early start', async () => {
    const loading = deferred();
    vi.spyOn(game.spriteLoader, 'loadAll').mockReturnValue(loading.promise);
    game.render.mockRestore();
    const error = new Error('synthetic failed early start');
    const result = game.init().catch(failure => failure);
    expect(() => game.start()).not.toThrow();
    expect(game.disposed).toBe(false);
    loading.reject(error);
    expect(await result).toBe(error);
    expect(await game.init().catch(failure => failure)).toBe(error);
    expect(game.disposed).toBe(true);
    game.start();
    expect(frames.size).toBe(0);
  });

  it('starts one chain and makes disposal terminal even for a delivered callback', async () => {
    vi.spyOn(game.spriteLoader, 'loadAll').mockResolvedValue();
    await game.init();
    vi.spyOn(game, 'update').mockImplementation(() => {});
    game.start();
    game.start();
    expect(frames.size).toBe(1);
    frame(20);
    expect(game.update).toHaveBeenCalledTimes(1);
    const stale = frames.values().next().value;
    game.dispose();
    game.dispose();
    stale(40);
    game.start();
    expect(frames.size).toBe(0);
    expect(game.update).toHaveBeenCalledTimes(1);
  });
  it('releases every input listener on startup failure and retains the error', async () => {
    const loading = deferred();
    vi.spyOn(game.spriteLoader, 'loadAll').mockReturnValue(loading.promise);
    const removeDocument = vi.spyOn(document, 'removeEventListener');
    const removeWindow = vi.spyOn(window, 'removeEventListener');
    const error = new Error('synthetic sprite failure');
    const result = game.init().catch(failure => failure);
    loading.reject(error);
    expect(await result).toBe(error);
    for (const [type, callback] of [
      ['keydown', game.inputManager.onKeyDown],
      ['keyup', game.inputManager.onKeyUp],
      ['visibilitychange', game.inputManager.onVisibilityChange]
    ]) {
      expect(removeDocument).toHaveBeenCalledWith(type, callback);
    }
    expect(removeWindow).toHaveBeenCalledWith('blur', game.inputManager.onBlur);
    expect(game.inputManager.enabled).toBe(false);
    expect(game.player).toBeNull();
  });
  it('does not resurrect a game disposed during sprite loading', async () => {
    const loading = deferred();
    vi.spyOn(game.spriteLoader, 'loadAll').mockReturnValue(loading.promise);
    const result = game.init();
    game.dispose();
    loading.resolve();
    await result;
    expect(game.player).toBeNull();
    expect(game.renderer).toBeNull();
    expect(game.inputManager.listeners.size).toBe(0);
    game.start();
    expect(frames.size).toBe(0);
  });
  it('shares initialization and registers controls once across concurrent and later calls', async () => {
    const loading = deferred();
    vi.spyOn(game.spriteLoader, 'loadAll').mockReturnValue(loading.promise);
    const create = vi.spyOn(game, 'createLevel');
    const first = game.init();
    const second = game.init();
    loading.resolve();
    await Promise.all([first, second]);
    const player = game.player;
    await game.init();
    expect(game.spriteLoader.loadAll).toHaveBeenCalledTimes(1);
    expect(create).toHaveBeenCalledTimes(1);
    expect(game.player).toBe(player);
    expect(game.inputManager.listeners.get('shoot:down')).toHaveLength(1);
    const shoot = vi.spyOn(game, 'shoot').mockImplementation(() => {});
    game.canShoot = true;
    document.dispatchEvent(new KeyboardEvent('keydown', { key: ' ' }));
    expect(shoot).toHaveBeenCalledTimes(1);
  });
  it('retains failed initialization for every caller without retrying', async () => {
    const loading = deferred();
    vi.spyOn(game.spriteLoader, 'loadAll').mockReturnValue(loading.promise);
    const error = new Error('synthetic shared startup failure');
    const first = game.init().catch(failure => failure);
    const second = game.init().catch(failure => failure);
    loading.reject(error);
    expect(await first).toBe(error);
    expect(await second).toBe(error);
    expect(await game.init().catch(failure => failure)).toBe(error);
    expect(game.spriteLoader.loadAll).toHaveBeenCalledTimes(1);
    expect(game.disposed).toBe(true);
    expect(game.inputManager.listeners.size).toBe(0);
  });
  it('cancels both initialization callers when disposed while loading', async () => {
    const loading = deferred();
    vi.spyOn(game.spriteLoader, 'loadAll').mockReturnValue(loading.promise);
    const create = vi.spyOn(game, 'createLevel');
    const first = game.init();
    const second = game.init();
    game.dispose();
    loading.resolve();
    await Promise.all([first, second]);
    await game.init();
    expect(game.spriteLoader.loadAll).toHaveBeenCalledTimes(1);
    expect(create).not.toHaveBeenCalled();
    expect(game.inputManager.listeners.size).toBe(0);
  });
  it.each(['startup', 'later frame'])(
    'releases game ownership on a real render failure at %s',
    async when => {
      vi.spyOn(game.spriteLoader, 'loadAll').mockResolvedValue();
      await game.init();
      game.render.mockRestore();
      const error = new Error('synthetic canvas failure');
      const clear = vi.spyOn(game.renderer, 'clear');
      if (when === 'later frame') {
        // Reach a scheduled frame using the real rendering path.
        for (const method of ['translate', 'stroke', 'moveTo', 'lineTo']) {
          game.ctx[method] = vi.fn();
        }
        game.start();
      }
      clear.mockImplementation(() => {
        throw error;
      });
      const stale = frames.values().next().value;
      let failure;
      try {
        if (when === 'startup') {
          game.start();
        } else {
          frame(1);
        }
      } catch (caught) {
        failure = caught;
      }
      expect(failure).toBe(error);
      expect(game.running).toBe(false);
      expect(game.disposed).toBe(true);
      expect(frames.size).toBe(0);
      expect(game.inputManager.enabled).toBe(false);
      expect(game.inputManager.listeners.size).toBe(0);
      document.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'ArrowRight' })
      );
      expect(game.inputManager.getKeys()).toEqual({});
      game.dispose();
      game.start();
      stale?.(100);
      expect(frames.size).toBe(0);
      const fresh = new Game('lifecycle');
      try {
        vi.spyOn(fresh.spriteLoader, 'loadAll').mockResolvedValue();
        await fresh.init();
        expect(fresh.player).not.toBeNull();
        expect(fresh.inputManager.listeners.get('shoot:down')).toHaveLength(1);
      } finally {
        fresh.dispose();
      }
    }
  );
  it.each([30, 60, 144])(
    'preserves 60 Hz movement, gravity and shots at %s Hz',
    async hz => {
      vi.spyOn(game.spriteLoader, 'loadAll').mockResolvedValue();
      await game.init();
      const player = new Player(0, -10000);
      const enemy = new Enemy({ x: 100, y: 0, speed: 2 });
      const shot = new BossProjectile(0, 0, 1, 3);
      vi.spyOn(game, 'update').mockImplementation(dt => {
        player.update({ ArrowRight: true }, dt);
        enemy.update([], dt);
        shot.update(dt);
      });
      game.start();
      for (let i = 1; i <= hz; i++) {
        frame((i * 1000) / hz);
      }
      expect(game.update).toHaveBeenCalledTimes(60);
      expect(player.x).toBe(300);
      expect(enemy.x).toBe(220);
      expect(shot.x).toBe(180);
      const expected = new Player(0, -10000);
      for (let i = 0; i < 60; i++) {
        expected.update({ ArrowRight: true }, 1000 / 60);
      }
      expect(player.y).toBe(expected.y);
      expect(game.render).toHaveBeenCalledTimes(hz + 1);
    }
  );
  it('bounds catch-up and drops suspension time before resuming', async () => {
    vi.spyOn(game.spriteLoader, 'loadAll').mockResolvedValue();
    await game.init();
    vi.spyOn(game, 'update').mockImplementation(() => {});
    game.start();
    frame(200);
    expect(game.update.mock.calls.length).toBeLessThanOrEqual(5);
    game.update.mockClear();
    frame(60000);
    expect(game.update).not.toHaveBeenCalled();
    frame(60000 + 1000 / 60);
    expect(game.update).toHaveBeenCalledTimes(1);
  });
});
