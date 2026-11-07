import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { World } from 'ldtk';
import { Game } from '../src/Game.js';
import { LDtkLoader } from '../src/systems/LDtkLoader.js';

const deferred = () => {
  let resolve, reject;
  const promise = new Promise((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
};
const world = name => ({
  levels: [
    {
      identifier: name,
      fieldInstances: [],
      layerInstances: [
        {
          __identifier: 'Entities',
          entityInstances: [
            { __identifier: 'Player', px: [100, 80], fieldInstances: [] },
            { __identifier: 'Boss', px: [500, 100], fieldInstances: [] },
            { __identifier: 'Portal', px: [600, 80], fieldInstances: [] }
          ]
        },
        {
          __identifier: 'Platforms',
          __gridSize: 16,
          __cWid: 100,
          __cHei: 1,
          intGridCsv: Array(100).fill(1)
        }
      ]
    }
  ]
});

describe('Latest world import owns publication', () => {
  let game, a, b;
  beforeEach(() => {
    document.body.innerHTML =
      '<canvas id="imports" width="800" height="400"></canvas>';
    game = new Game('imports');
    game.createLevel();
    a = deferred();
    b = deferred();
    vi.spyOn(World, 'fromURL').mockImplementation(url =>
      url === 'A' ? a.promise : b.promise
    );
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterEach(() => {
    game.dispose();
    vi.restoreAllMocks();
  });
  it.each(['success', 'failure', 'malformed'])(
    'keeps B objects, camera and world after obsolete A %s',
    async outcome => {
      const first = game.loadLDtkLevels('A');
      const second = game.loadLDtkLevels('B');
      const latest = world('B');
      b.resolve(latest);
      expect(await second).toBe(true);
      const player = game.player,
        bounds = game.camera.bounds;
      game.camera.x = 123;
      if (outcome === 'failure') {
        a.reject(new Error('synthetic failure'));
      } else {
        a.resolve(outcome === 'malformed' ? { levels: [{}] } : world('A'));
      }
      expect(await first).toBe(false);
      expect(game.levels[0].name).toBe('B');
      expect(game.ldtkLoader.world).toBe(latest);
      expect(game.player).toBe(player);
      expect(game.camera.bounds).toBe(bounds);
      expect(game.camera.x).toBe(123);
    }
  );
  it.each(['add-first', 'replace-first'])(
    'coordinates append and replacement: %s',
    async order => {
      const first =
        order === 'add-first'
          ? game.addLDtkLevels('A')
          : game.loadLDtkLevels('A');
      const second =
        order === 'add-first'
          ? game.loadLDtkLevels('B')
          : game.addLDtkLevels('B');
      const original = game.levels;
      const latest = world('B');
      b.resolve(latest);
      await second;
      a.resolve(world('A'));
      await first;
      expect(game.ldtkLoader.world).toBe(latest);
      expect(game.levels.map(level => level.name)).toEqual(
        order === 'add-first'
          ? ['B']
          : [...original.map(level => level.name), 'B']
      );
    }
  );
  it('does not publish an import completed after disposal', async () => {
    const original = game.levels;
    const result = game.loadLDtkLevels('A');
    game.dispose();
    a.resolve(world('A'));
    expect(await result).toBe(false);
    expect(game.levels).toBe(original);
    expect(game.ldtkLoader.world).toBeNull();
  });
  it('also fences standalone loader publications', async () => {
    const loader = new LDtkLoader();
    const first = loader.loadWorld('A'),
      second = loader.loadWorld('B');
    const latest = world('B');
    b.resolve(latest);
    await second;
    a.resolve(world('A'));
    await first;
    expect(loader.world).toBe(latest);
  });
});
