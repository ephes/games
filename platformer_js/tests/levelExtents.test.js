import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { Game } from '../src/Game.js';
import { LDtkLoader } from '../src/systems/LDtkLoader.js';
import { mockWorldFetch } from './worldFetch.js';

const world = () => ({
  levels: [
    {
      identifier: 'Tall synthetic',
      pxWid: 2400,
      pxHei: 1600,
      fieldInstances: [],
      layerInstances: [
        {
          __identifier: 'Platforms',
          __gridSize: 64,
          __cWid: 2,
          __cHei: 1,
          intGridCsv: [1, 1]
        },
        {
          __identifier: 'Entities',
          entityInstances: [
            { __identifier: 'Player', px: [1800, 1000], fieldInstances: [] },
            { __identifier: 'Boss', px: [0, 0], fieldInstances: [] },
            { __identifier: 'Portal', px: [2100, 1200], fieldInstances: [] }
          ]
        }
      ]
    }
  ]
});
let game;
beforeEach(() => {
  document.body.innerHTML =
    '<canvas id="extent" width="800" height="400"></canvas>';
  game = new Game('extent');
  game.createLevel();
  vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => {
  game.dispose();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it('preserves authored extents beyond the last platform for player, camera and boss shots', async () => {
  mockWorldFetch().mockResolvedValue(world());
  expect(await game.loadLDtkLevels('synthetic')).toBe(true);
  expect([game.levels[0].width, game.levels[0].height]).toEqual([2400, 1600]);
  expect(game.boss.bounds).toBe(game.camera.bounds);
  game.update(16);
  expect(game.player.x).toBe(1800);
  expect(game.player.y).toBeGreaterThanOrEqual(1000);
  expect(game.camera.y).toBeGreaterThan(0);
  game.player.x = 9999;
  game.player.y = 9999;
  game.update(16);
  expect([
    game.player.x + game.player.width,
    game.player.y + game.player.height
  ]).toEqual([2400, 1600]);
  expect([game.camera.x, game.camera.y]).toEqual([1600, 1200]);
  game.portal.unlock();
  game.player.x = game.portal.x + 49;
  game.player.y = game.portal.y + 49;
  game.player.velocityY = 0;
  game.update(16);
  expect(game.gameWon).toBe(true);
});
it('derives complete programmatic bounds including required entities and negative origins', () => {
  game.createLevel({
    ...game.levels[0],
    platforms: [],
    coins: [],
    enemies: [],
    playerStart: { x: -100, y: -50 },
    boss: { x: 1800, y: 900 },
    portal: { x: 2100, y: 1200 }
  });
  expect(game.camera.bounds).toEqual({
    minX: -100,
    minY: -50,
    maxX: 2228,
    maxY: 1328
  });
  expect(game.boss.bounds).toBe(game.camera.bounds);
});
it.each([0, -1, 1.5, null, '2400', Number.MAX_SAFE_INTEGER + 1])(
  'rejects invalid authored width %s without replacement',
  async width => {
    const candidate = world();
    candidate.levels[0].pxWid = width;
    const previous = {
      player: game.player,
      levels: game.levels,
      bounds: game.camera.bounds
    };
    mockWorldFetch().mockResolvedValue(candidate);
    expect(await game.loadLDtkLevels('invalid')).toBe(false);
    expect(game.player).toBe(previous.player);
    expect(game.levels).toBe(previous.levels);
    expect(game.camera.bounds).toBe(previous.bounds);
  }
);
it('rejects a partial authored extent and accepts legacy synthetic records with neither dimension', () => {
  const loader = new LDtkLoader();
  const source = world().levels[0];
  delete source.pxHei;
  expect(() => loader.convertLevel(source)).toThrow(/dimensions/);
  delete source.pxWid;
  expect(() => loader.convertLevel(source)).not.toThrow();
});
