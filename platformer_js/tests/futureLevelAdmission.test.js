import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Game } from '../src/Game.js';
import { mockWorldFetch } from './worldFetch.js';

const level = name => ({
  identifier: name,
  fieldInstances: [],
  layerInstances: [
    {
      __identifier: 'Platforms',
      __gridSize: 64,
      __cWid: 1,
      __cHei: 1,
      intGridCsv: [1]
    },
    {
      __identifier: 'Entities',
      entityInstances: ['Player', 'Boss', 'Portal'].map(__identifier => ({
        __identifier,
        px: [0, 0],
        fieldInstances: []
      }))
    }
  ]
});

describe('Future level admission and publication', () => {
  let game, source;
  beforeEach(() => {
    document.body.innerHTML =
      '<canvas id="future" width="800" height="400"></canvas>';
    game = new Game('future');
    game.createLevel();
    game.score = 150;
    game.canShoot = true;
    game.projectiles.push({ x: 1, y: 2 });
    game.camera.x = 123;
    game.ldtkLoader.world = { levels: [level('Previous')] };
    source = mockWorldFetch();
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterEach(() => {
    game.dispose();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  function snapshot() {
    return {
      ...Object.fromEntries(
        [
          'levels',
          'totalLevels',
          'currentLevel',
          'player',
          'platforms',
          'coins',
          'enemies',
          'boss',
          'portal',
          'projectiles',
          'score',
          'lives',
          'canShoot',
          'gameWon'
        ].map(key => [key, game[key]])
      ),
      world: game.ldtkLoader.world,
      bounds: game.camera.bounds,
      cameraX: game.camera.x
    };
  }

  function expectUnchanged(before) {
    const after = snapshot();
    for (const key of Object.keys(before)) {
      expect(after[key]).toBe(before[key]);
    }
  }

  it.each([
    ['replace', 'Boss'],
    ['replace', 'Portal'],
    ['append', 'Boss'],
    ['append', 'Portal']
  ])('refuses %s when the second level lacks %s', async (mode, missing) => {
    const candidate = { levels: [level('First'), level('Invalid second')] };
    candidate.levels[1].layerInstances[1].entityInstances =
      candidate.levels[1].layerInstances[1].entityInstances.filter(
        entity => entity.__identifier !== missing
      );
    source.mockResolvedValue(candidate);
    const before = snapshot();
    if (mode === 'replace') {
      expect(await game.loadLDtkLevels('synthetic')).toBe(false);
    } else {
      await game.addLDtkLevels('synthetic');
    }
    expectUnchanged(before);
    expect(console.error).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ message: expect.stringContaining(missing) })
    );
    // Retained objects still support a real simulation tick.
    game.projectiles = [];
    expect(() => game.update(16)).not.toThrow();
  });

  it('preserves play on a late next-level construction failure and allows retry', () => {
    const before = snapshot();
    const failure = new Error('Synthetic portal sprite failure');
    const fault = vi
      .spyOn(game.spriteLoader, 'getSprite')
      .mockImplementation(() => {
        throw failure;
      });
    expect(() => game.loadNextLevel()).toThrow(failure);
    expect(fault).toHaveBeenCalledWith('portal');
    expectUnchanged(before);
    fault.mockRestore();
    game.loadNextLevel();
    expect(game.currentLevel).toBe(1);
    expect(game.player).not.toBe(before.player);
    expect(game.projectiles).toEqual([]);
    expect(game.canShoot).toBe(true);
    expect(game.camera.x).toBe(0);
  });

  it.each(['replace', 'append'])(
    'accepts complete future levels through %s',
    async mode => {
      source.mockResolvedValue({ levels: [level('First'), level('Second')] });
      if (mode === 'replace') {
        expect(await game.loadLDtkLevels('synthetic')).toBe(true);
      } else {
        await game.addLDtkLevels('synthetic');
      }
      while (game.currentLevel < game.levels.length - 1) {
        game.loadNextLevel();
      }
      expect(game.levels[game.currentLevel].name).toBe('Second');
      expect(() => game.update(16)).not.toThrow();
    }
  );

  const ambiguousEntities = [
    [
      'duplicate LevelName',
      (entities, source) => {
        source.fieldInstances = Array.from({ length: 2 }, () => ({
          __identifier: 'LevelName',
          __value: 'Repeated name'
        }));
      }
    ],
    ...['Player', 'Boss', 'Portal'].map(kind => [
      `duplicate ${kind}`,
      entities => {
        entities.push({
          __identifier: kind,
          px: [100, 100],
          fieldInstances: []
        });
      }
    ]),
    ...[
      ['Enemy', 'Speed', 0],
      ['Enemy', 'PlatformIndex', 0],
      ['Boss', 'PlatformIndex', 0],
      ['Coin', 'IsPowerUp', false]
    ].map(([kind, field, value]) => [
      `duplicate ${kind}.${field}`,
      entities => {
        // Use valid, identical values: even duplicates that agree are ambiguous.
        const entry = entities.find(entity => entity.__identifier === kind) ?? {
          __identifier: kind,
          px: [0, 0],
          fieldInstances: []
        };
        entry.fieldInstances = Array.from({ length: 2 }, () => ({
          __identifier: field,
          __value: value
        }));
        if (!entities.includes(entry)) {
          entities.push(entry);
        }
      }
    ]),
    ...['false', 0, 1, null, {}, []].map(value => [
      `IsPowerUp ${JSON.stringify(value)}`,
      entities => {
        entities.push({
          __identifier: 'Coin',
          px: [0, 0],
          fieldInstances: [{ __identifier: 'IsPowerUp', __value: value }]
        });
      }
    ])
  ];

  it.each(
    ambiguousEntities.flatMap(([label, mutate]) =>
      ['replace', 'append'].map(mode => [mode, label, mutate])
    )
  )(
    'refuses %s with %s in a future level before mutation',
    async (mode, label, mutate) => {
      const candidate = { levels: [level('First'), level('Ambiguous second')] };
      mutate(
        candidate.levels[1].layerInstances[1].entityInstances,
        candidate.levels[1]
      );
      source.mockResolvedValue(candidate);
      const before = snapshot();
      if (mode === 'replace') {
        expect(await game.loadLDtkLevels('synthetic')).toBe(false);
      } else {
        await game.addLDtkLevels('synthetic');
      }
      expectUnchanged(before);
      expect(console.error).toHaveBeenCalled();
    }
  );
});
