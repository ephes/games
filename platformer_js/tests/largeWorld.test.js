import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { World } from 'ldtk';
import { Game } from '../src/Game.js';

function largeWorld() {
  return {
    levels: [
      {
        identifier: 'Synthetic alternating grid',
        fieldInstances: [],
        layerInstances: [
          {
            __identifier: 'Platforms',
            __gridSize: 64,
            __cWid: 400001,
            __cHei: 1,
            intGridCsv: Array.from({ length: 400001 }, (_, i) =>
              i % 2 === 0 ? 1 : 0
            )
          },
          {
            __identifier: 'Entities',
            entityInstances: [
              { __identifier: 'Player', px: [0, 0], fieldInstances: [] },
              { __identifier: 'Boss', px: [0, 0], fieldInstances: [] },
              { __identifier: 'Portal', px: [128, 0], fieldInstances: [] }
            ]
          }
        ]
      }
    ]
  };
}

describe('Large imported world bounds', () => {
  let game;
  beforeEach(() => {
    document.body.innerHTML =
      '<canvas id="large" width="800" height="400"></canvas>';
    game = new Game('large');
    game.createLevel();
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterEach(() => {
    game.dispose();
    vi.restoreAllMocks();
  });

  it('imports 200001 platforms through real conversion and retains them on a later invalid grid', async () => {
    const candidate = largeWorld();
    const fromURL = vi.spyOn(World, 'fromURL').mockResolvedValue(candidate);
    expect(await game.loadLDtkLevels('synthetic-large')).toBe(true);
    expect(game.platforms).toHaveLength(200001);
    expect(game.camera.bounds).toEqual({
      minX: 0,
      minY: 0,
      maxX: 25600064,
      maxY: 400
    });
    expect(game.boss.bounds).toBe(game.camera.bounds);
    game.camera.follow({ x: 25601000 });
    expect(game.camera.x).toBe(25599264);
    const before = { ...game };
    const bounds = game.camera.bounds;
    const invalid = structuredClone(candidate);
    invalid.levels[0].layerInstances[0].intGridCsv = [1];
    fromURL.mockResolvedValue(invalid);
    expect(await game.loadLDtkLevels('synthetic-invalid')).toBe(false);
    for (const key of [
      'levels',
      'player',
      'platforms',
      'boss',
      'portal',
      'projectiles'
    ]) {
      expect(game[key]).toBe(before[key]);
    }
    expect(game.camera.bounds).toBe(bounds);
    expect(game.camera.x).toBe(25599264);
    expect(game.ldtkLoader.world).toBe(candidate);
    expect(console.error).toHaveBeenCalledWith(
      'Failed to load LDtk levels:',
      expect.objectContaining({
        message: 'Invalid LDtk IntGrid dimensions or cell data'
      })
    );
  });

  it.each([
    [[], 800],
    [[{ x: -200, y: 0, width: 100, height: 64 }], 800],
    [
      [
        { x: 2000, y: 0, width: 64, height: 64 },
        { x: 0, y: 0, width: 100, height: 64 }
      ],
      2064
    ]
  ])(
    'preserves viewport minimum and translated far-right edges (%j)',
    (platforms, expected) => {
      game.createLevel({ ...game.levels[0], platforms });
      expect(game.camera.bounds.maxX).toBe(expected);
    }
  );
});
