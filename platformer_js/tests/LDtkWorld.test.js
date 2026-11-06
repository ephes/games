import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { World } from 'ldtk';
import { LDtkLoader } from '../src/systems/LDtkLoader.js';

const emptyLevel = name => ({
  name,
  playerStart: { x: 50, y: 200 },
  platforms: [],
  coins: [],
  enemies: [],
  boss: null,
  portal: null
});

describe('LDtk world conversion', () => {
  let loader;
  let fromURL;

  beforeEach(() => {
    loader = new LDtkLoader();
    fromURL = vi.spyOn(World, 'fromURL');
  });

  afterEach(() => vi.restoreAllMocks());

  it('returns no levels before loading', () => {
    expect(loader.getAllLevels()).toEqual([]);
    expect(loader.getLevel(0)).toBeNull();
    expect(fromURL).not.toHaveBeenCalled();
  });

  it('stores the loaded world and converts ordered, named and fallback levels', async () => {
    const world = {
      levels: [
        {
          identifier: 'Level_B',
          fieldInstances: [
            { __identifier: 'Other', __value: 'Ignored' },
            { __identifier: 'LevelName', __value: 'First in world' }
          ],
          layerInstances: []
        },
        {
          identifier: 'Level_A',
          fieldInstances: [],
          layerInstances: [
            { __identifier: 'Decoration' },
            {
              __identifier: 'Entities',
              entityInstances: [
                { __identifier: 'Player', px: [24, 48], fieldInstances: [] }
              ]
            },
            {
              __identifier: 'Platforms',
              __gridSize: 16,
              __cWid: 2,
              __cHei: 1,
              intGridCsv: [1, 1]
            }
          ]
        }
      ]
    };
    fromURL.mockResolvedValue(world);

    await expect(loader.loadWorld('synthetic.ldtk')).resolves.toBe(world);
    expect(fromURL).toHaveBeenCalledExactlyOnceWith('synthetic.ldtk');
    const expected = [
      emptyLevel('First in world'),
      {
        ...emptyLevel('Level_A'),
        playerStart: { x: 24, y: 48 },
        platforms: [{ x: 0, y: 0, width: 32, height: 16 }]
      }
    ];
    expect(loader.getAllLevels()).toEqual(expected);
    expect(loader.getLevel(0)).toEqual(expected[0]);
    expect(loader.getLevel(1)).toEqual(expected[1]);
    expect(loader.getLevel(2)).toBeNull();
  });

  it('propagates a load failure without creating a world', async () => {
    const failure = new Error('Synthetic world failure');
    fromURL.mockRejectedValue(failure);

    await expect(loader.loadWorld('broken.ldtk')).rejects.toBe(failure);
    expect(loader.getAllLevels()).toEqual([]);
    expect(loader.getLevel(0)).toBeNull();
  });
});
