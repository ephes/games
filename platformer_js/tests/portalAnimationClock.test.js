import { afterEach, expect, it, vi } from 'vitest';
import { Game } from '../src/Game.js';
import { Portal } from '../src/objects/Portal.js';

let game;
afterEach(() => {
  game?.dispose();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it.each([30, 60, 144])(
  'advances the portal by simulation time with real rendering at %s Hz',
  async hz => {
    document.body.innerHTML = '<canvas id="portal-clock"></canvas>';
    const frames = new Map();
    let nextId = 0;
    vi.stubGlobal('requestAnimationFrame', callback => {
      frames.set(++nextId, callback);
      return nextId;
    });
    vi.stubGlobal('cancelAnimationFrame', id => frames.delete(id));
    vi.spyOn(performance, 'now').mockReturnValue(0);
    game = new Game('portal-clock');
    vi.spyOn(game.spriteLoader, 'loadAll').mockResolvedValue();
    await game.init();
    for (const method of ['translate', 'stroke', 'moveTo', 'lineTo']) {
      game.ctx[method] = vi.fn();
    }
    game.player.y = -10000;
    game.player.gravity = 0;
    game.boss.canShoot = false;
    game.start();
    for (let n = 1; n <= hz; n++) {
      const [id, callback] = frames.entries().next().value;
      frames.delete(id);
      callback((n * 1000) / hz);
    }
    expect(game.portal.pulseTime).toBeCloseTo(3, 12);
    const phase = game.portal.pulseTime;
    game.render();
    game.render();
    expect(game.portal.pulseTime).toBe(phase);
    const stale = frames.values().next().value;
    stale(60000);
    expect(game.portal.pulseTime).toBe(phase);
  }
);

it('wraps both locked/unlocked pulse cycles and preserves elapsed fractions', () => {
  const portal = new Portal(0, 0);
  const split = new Portal(0, 0);
  portal.update(500);
  for (let n = 0; n < 30; n++) {
    split.update(1000 / 60);
  }
  expect(split.pulseTime).toBeCloseTo(portal.pulseTime, 12);
  portal.update(1_000_000_000);
  expect(portal.pulseTime).toBeGreaterThanOrEqual(0);
  expect(portal.pulseTime).toBeLessThan(2 * Math.PI);
  const phase = portal.pulseTime;
  portal.update((2 * Math.PI * 1000) / 3);
  expect(portal.pulseTime).toBeCloseTo(phase, 8);
});
