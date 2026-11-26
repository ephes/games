import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mockWorldFetch } from './worldFetch.js';
import starterWorld from '../assets/levels/platformer.ldtk?raw';
import { LDtkLoader, WORLD_LIMITS } from '../src/systems/LDtkLoader.js';

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
    fromURL = mockWorldFetch();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('returns no levels before loading', () => {
    expect(loader.getAllLevels()).toEqual([]);
    expect(loader.getLevel(0)).toBeNull();
    expect(fromURL).not.toHaveBeenCalled();
  });

  it('stores the loaded world and converts ordered, named and fallback levels', async () => {
    const world = {
      data: { note: 'Ignored metadata in a raw LDtk world' },
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

    await expect(loader.loadWorld('synthetic.ldtk')).resolves.toEqual(world);
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

  it('converts the bundled synthetic starter world with an empty dense grid', () => {
    const input = JSON.parse(starterWorld);
    loader.world = input;
    const levels = loader.getAllLevels();
    expect(levels).toHaveLength(1);
    expect(levels[0].playerStart).toEqual({ x: 48, y: 192 });
    expect(levels[0].platforms).toEqual([]);
    expect(fromURL).not.toHaveBeenCalled();
  });

  it('rejects invalid dimensions in a later level before replacing the world', async () => {
    const playable = {
      identifier: 'Playable',
      fieldInstances: [],
      layerInstances: []
    };
    const invalid = { ...playable, identifier: 'Broken', pxWid: 16, pxHei: 0 };
    fromURL.mockResolvedValueOnce({ levels: [playable] });
    const previous = await loader.loadWorld('playable.ldtk');
    fromURL.mockResolvedValue({ levels: [playable, invalid] });

    await expect(loader.loadWorld('broken.ldtk')).rejects.toThrow(
      'Invalid LDtk level dimensions'
    );
    expect(loader.world).toBe(previous);
    expect(loader.getLevel(0)).toEqual(emptyLevel('Playable'));
    expect(loader.getLevel(1)).toBeNull();
  });

  it('checks the deadline after converting a direct load', async () => {
    const level = {
      identifier: 'Playable',
      fieldInstances: [],
      layerInstances: []
    };
    fromURL.mockResolvedValue({ levels: [level] });
    const previous = await loader.loadWorld('playable.ldtk');
    const now = vi.spyOn(performance, 'now').mockReturnValue(0);
    const convertLevel = loader.convertLevel.bind(loader);
    vi.spyOn(loader, 'convertLevel').mockImplementation(candidate => {
      const converted = convertLevel(candidate);
      now.mockReturnValue(WORLD_LIMITS.timeoutMs);
      return converted;
    });

    await expect(loader.loadWorld('late.ldtk')).rejects.toThrow(
      'LDtk transfer deadline exceeded'
    );
    expect(loader.world).toBe(previous);
  });

  it.each([false, true])(
    'converts only valid level indices (wrapped: %s)',
    wrapped => {
      const source = {
        identifier: 'Selected',
        fieldInstances: [],
        layerInstances: []
      };
      const world = { levels: [source] };
      loader.world = wrapped ? { data: world } : world;
      const convert = vi.spyOn(loader, 'convertLevel');

      expect(loader.getLevel(0)).toEqual(emptyLevel('Selected'));
      for (const index of [-1, 0.5, NaN, Infinity, 1, '0', undefined]) {
        expect(loader.getLevel(index)).toBeNull();
      }
      expect(convert).toHaveBeenCalledExactlyOnceWith(source);
    }
  );

  it('propagates conversion errors for a selected level', () => {
    const source = {
      identifier: 'Invalid',
      fieldInstances: [],
      layerInstances: [],
      pxWid: 0,
      pxHei: 1
    };
    loader.world = { data: { levels: [source] } };
    expect(() => loader.getLevel(0)).toThrow('Invalid LDtk level dimensions');
  });

  it('propagates a load failure without creating a world', async () => {
    const failure = new Error('Synthetic world failure');
    fromURL.mockRejectedValue(failure);

    await expect(loader.loadWorld('broken.ldtk')).rejects.toBe(failure);
    expect(loader.getAllLevels()).toEqual([]);
    expect(loader.getLevel(0)).toBeNull();
  });
});
