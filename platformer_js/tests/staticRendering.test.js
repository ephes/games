import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Game } from '../src/Game.js';
import { Portal } from '../src/objects/Portal.js';
import {
  buildStaticWorldIndex,
  visibleStaticObjects
} from '../src/rendering/staticWorld.js';

const MARGIN = 2; // Covers the power-up coin's one-pixel stroke.
const visible = (object, camera) =>
  object.x + object.width >= camera.x - MARGIN &&
  object.x <= camera.x + camera.width + MARGIN &&
  object.y + object.height >= camera.y - MARGIN &&
  object.y <= camera.y + camera.height + MARGIN;

function countVisits(index) {
  let visits = 0;
  const instrument = node => {
    if (!node) {
      return;
    }
    const minX = node.minX;
    Object.defineProperty(node, 'minX', {
      get: () => {
        visits++;
        return minX;
      }
    });
    instrument(node.left);
    instrument(node.right);
  };
  instrument(index);
  return () => visits;
}

const level = (platforms = [], coins = []) => ({
  name: 'Synthetic static world',
  playerStart: { x: 50, y: 50 },
  platforms,
  coins,
  enemies: [],
  boss: { x: 20000, y: 200, speed: 0 },
  portal: { x: 21000, y: 100 }
});

it('prunes a shuffled same-X column while returning candidates in level order', () => {
  const platforms = Array.from({ length: 4096 }, (_, i) => ({
    x: 100,
    y: ((i * 2043) % 4096) * 32,
    width: 16,
    height: 8
  }));
  const coins = [{ x: 100, y: 32 * 2048, width: 8, height: 8 }];
  const index = buildStaticWorldIndex(platforms, coins);
  const visits = countVisits(index);

  const camera = { x: 99, y: 32 * 2047, width: 20, height: 40 };
  const expected = [...platforms, ...coins].filter(object =>
    visible(object, camera)
  );
  expect(expected).toHaveLength(3);
  expect(expected[0].y).toBeGreaterThan(expected[1].y);
  expect(visibleStaticObjects(index, camera)).toEqual(expected);
  expect(visits()).toBeLessThan(100);
});

describe('static world rendering', () => {
  let game;
  beforeEach(async () => {
    document.body.innerHTML =
      '<canvas id="static" width="800" height="400"></canvas>';
    game = new Game('static');
    game.levels = [level()];
    vi.spyOn(game.spriteLoader, 'loadAll').mockResolvedValue();
    vi.spyOn(game.canvas, 'getContext').mockReturnValue(game.ctx);
    await game.init();
    // Only static canvas operations contribute to the recording oracle.
    game.renderer.drawBoss = vi.fn();
    game.renderer.drawPlayer = vi.fn();
    game.renderer.drawWinScreen = vi.fn();
    vi.spyOn(Portal.prototype, 'draw').mockImplementation(() => {});
    game.ctx.translate = vi.fn();
    game.ctx.stroke = vi.fn();
  });
  afterEach(() => {
    game.dispose();
    vi.restoreAllMocks();
  });

  it('bounds draw calls with 10,000 off-screen objects of each kind', () => {
    const platforms = Array.from({ length: 10000 }, (_, i) => ({
      x: 10000 + i * 100,
      y: 10000,
      width: 40,
      height: 20
    }));
    const coins = platforms.map(({ x, y }) => ({ x, y }));
    platforms.splice(5000, 0, { x: 20, y: 30, width: 50, height: 10 });
    coins.splice(5000, 0, { x: 40, y: 20, isPowerUp: true });
    game.createLevel(level(platforms, coins));
    const draws = [...game.platforms, ...game.coins].map(object =>
      vi.spyOn(object, 'draw')
    );
    const visits = countVisits(game.staticWorldIndex);
    game.render();
    expect(visits()).toBeLessThan(100);
    expect(draws.reduce((sum, spy) => sum + spy.mock.calls.length, 0)).toBe(2);
    expect(game.ctx.fillRect).toHaveBeenCalledWith(20, 30, 50, 10);
    expect(game.ctx.arc).toHaveBeenCalledWith(50, 30, 10, 0, Math.PI * 2);
    expect(game.ctx.translate).toHaveBeenCalledWith(-0, -0);
  });

  it('matches a full-render oracle at both axes, margin edges and collected coins', () => {
    // Interleave spatial order deliberately; a long rectangle crosses the view.
    const platforms = [
      { x: 1202, y: 70, width: 10, height: 10 },
      { x: -1000, y: 62, width: 2000, height: 4 },
      { x: 600, y: 452, width: 10, height: 10 },
      { x: 600, y: 453, width: 10, height: 10 },
      { x: 389, y: 70, width: 10, height: 10 },
      { x: 600, y: 29, width: 10, height: 20 },
      { x: 600, y: 27, width: 10, height: 20 },
      { x: 387, y: 70, width: 10, height: 10 },
      { x: 1203, y: 70, width: 10, height: 10 }
    ];
    const coins = platforms.map(({ x, y }) => ({ x, y, isPowerUp: true }));
    game.createLevel(level(platforms, coins));
    game.coins[0].collect();
    game.camera.x = 400;
    game.camera.y = 50;
    const calls = [];
    game.ctx.fillRect = (...args) => calls.push(['rect', ...args]);
    game.ctx.arc = (...args) => calls.push(['arc', ...args]);
    const original = [...game.platforms, ...game.coins].map(object => ({
      ...object
    }));
    game.render();
    const actual = [...calls];
    calls.length = 0;
    for (const object of [...game.platforms, ...game.coins]) {
      if (visible(object, game.camera)) {
        object.draw(game.ctx, 0);
      }
    }
    expect(actual).toEqual(calls);
    expect([...game.platforms, ...game.coins]).toEqual(original);
    expect(game.ctx.translate).toHaveBeenCalledWith(-400, -50);
  });

  it('publishes a fresh index only with a successful level and clears it on win', () => {
    game.createLevel(level([{ x: 10, y: 20, width: 30, height: 40 }]));
    expect(() =>
      game.createLevel(level([{ x: NaN, y: 20, width: 30, height: 40 }]))
    ).toThrow();
    game.ctx.fillRect.mockClear();
    game.render();
    expect(game.ctx.fillRect).toHaveBeenCalledWith(10, 20, 30, 40);
    game.createLevel(level([{ x: 50, y: 60, width: 70, height: 80 }]));
    game.ctx.fillRect.mockClear();
    game.render();
    expect(game.ctx.fillRect.mock.calls).toEqual([[50, 60, 70, 80]]);
    game.loadNextLevel();
    game.ctx.fillRect.mockClear();
    game.render();
    expect(game.ctx.fillRect).not.toHaveBeenCalled();
  });
});
