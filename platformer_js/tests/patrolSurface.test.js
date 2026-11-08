import { afterEach, describe, expect, it, vi } from 'vitest';
import { mockWorldFetch } from './worldFetch.js';
import { Game } from '../src/Game.js';
import { LDtkLoader } from '../src/systems/LDtkLoader.js';
import { Enemy } from '../src/entities/Enemy.js';
import { Boss } from '../src/entities/Boss.js';

// One translated patrol surface plus a separate, wide boss surface.
const source = (kind, width, left = 100) => {
  const rowWidth = Math.max(left + width, 64);
  const entity = (__identifier, px, index = 0) => ({
    __identifier,
    px,
    fieldInstances: [{ __identifier: 'PlatformIndex', __value: index }]
  });
  return {
    identifier: 'Synthetic patrol',
    fieldInstances: [],
    layerInstances: [
      {
        __identifier: 'Entities',
        entityInstances: [
          entity(kind, [left, 0]),
          ...(kind === 'Enemy' ? [entity('Boss', [left, 1], 1)] : []),
          entity('Portal', [left, 0])
        ]
      },
      {
        __identifier: 'Platforms',
        __gridSize: 1,
        __cWid: rowWidth,
        __cHei: 2,
        intGridCsv: [
          ...Array(left).fill(0),
          ...Array(width).fill(1),
          ...Array(rowWidth - left - width).fill(0),
          ...Array(rowWidth).fill(1)
        ]
      }
    ]
  };
};

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('LDtk patrol surface admission', () => {
  it.each([
    ['Enemy', 43, 44],
    ['Boss', 63, 64]
  ])(
    'rejects %s surface width %i with an authoring error',
    (kind, width, minimum) => {
      expect(() => new LDtkLoader().convertLevel(source(kind, width))).toThrow(
        `${kind} patrol platform must be at least ${minimum} px wide`
      );
    }
  );

  it.each([
    ['Enemy', 44, 0],
    ['Enemy', 44, 100],
    ['Enemy', 80, 100],
    ['Boss', 64, 0],
    ['Boss', 64, 100],
    ['Boss', 100, 100]
  ])('keeps real %s within width %i at x=%i', (kind, width, left) => {
    const level = new LDtkLoader().convertLevel(source(kind, width, left));
    const actor =
      kind === 'Enemy' ? new Enemy(level.enemies[0]) : new Boss(level.boss);
    expect(actor.width).toBe(kind === 'Enemy' ? 44 : 64);
    const platform = level.platforms[actor.platformIndex];
    expect(platform.x).toBe(left);
    expect(platform.width).toBe(width);
    const positions = [];
    for (let step = 0; step < 150; step++) {
      actor.update(level.platforms, 1000 / 60);
      positions.push(actor.x);
      expect(actor.x).toBeGreaterThanOrEqual(left);
      expect(actor.x + actor.width).toBeLessThanOrEqual(left + width);
    }
    expect(positions).toContain(left);
    expect(positions).toContain(left + width - actor.width);
  });

  it.each(['Enemy', 'Boss'])(
    'retains the playable world when an imported %s surface is too narrow',
    async kind => {
      document.body.innerHTML =
        '<canvas id="patrol" width="800" height="400"></canvas>';
      const game = new Game('patrol');
      const fromURL = mockWorldFetch();
      vi.spyOn(console, 'error').mockImplementation(() => {});
      vi.spyOn(console, 'log').mockImplementation(() => {});
      try {
        const previousWorld = { levels: [source('Enemy', 80)] };
        fromURL.mockResolvedValue(previousWorld);
        expect(await game.loadLDtkLevels('synthetic.ldtk')).toBe(true);
        const previous = {
          levels: game.levels,
          player: game.player,
          platforms: game.platforms,
          enemies: game.enemies,
          boss: game.boss,
          portal: game.portal,
          bounds: game.camera.bounds
        };
        game.camera.x = 37;
        const width = kind === 'Enemy' ? 43 : 63;
        fromURL.mockResolvedValue({ levels: [source(kind, width)] });
        expect(await game.loadLDtkLevels('invalid.ldtk')).toBe(false);
        expect(game.ldtkLoader.world).toEqual(previousWorld);
        for (const key of [
          'levels',
          'player',
          'platforms',
          'enemies',
          'boss',
          'portal'
        ]) {
          expect(game[key]).toBe(previous[key]);
        }
        expect(game.camera.bounds).toBe(previous.bounds);
        expect(game.camera.x).toBe(37);
        expect(game.currentLevel).toBe(0);
      } finally {
        game.dispose();
      }
    }
  );
});
