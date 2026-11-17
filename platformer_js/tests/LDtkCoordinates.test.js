import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LDtkLoader } from '../src/systems/LDtkLoader.js';
import { Game } from '../src/Game.js';
import { mockWorldFetch } from './worldFetch.js';

const entity = (__identifier, px) => ({
  __identifier,
  px,
  fieldInstances: []
});
const sourceLevel = () => ({
  identifier: 'Shifted synthetic',
  fieldInstances: [],
  worldX: 1000,
  worldY: 2000,
  layerInstances: [
    {
      __identifier: 'Platforms',
      __gridSize: 16,
      __cWid: 16,
      __cHei: 1,
      __pxTotalOffsetX: 32,
      __pxTotalOffsetY: 160,
      pxOffsetX: 7,
      pxOffsetY: 11,
      intGridCsv: Array(16).fill(1)
    },
    {
      __identifier: 'Entities',
      __pxTotalOffsetX: -10,
      __pxTotalOffsetY: 40,
      pxOffsetX: 2,
      pxOffsetY: 3,
      entityInstances: [
        entity('Player', [58, 90]),
        entity('Enemy', [110, 90]),
        entity('Boss', [186, 24]),
        entity('Coin', [90, 70]),
        entity('Portal', [310, 0])
      ]
    }
  ]
});

const invalidOffsets = [
  '32',
  null,
  true,
  0.5,
  NaN,
  Infinity,
  -Infinity,
  Number.MAX_SAFE_INTEGER + 1
];

describe('LDtk total layer offsets', () => {
  it('normalizes independent layers exactly once into level coordinates', () => {
    const source = sourceLevel();
    const before = structuredClone(source);
    const level = new LDtkLoader().convertLevel(source);
    expect(level.platforms).toEqual([
      { x: 32, y: 160, width: 256, height: 16 }
    ]);
    expect(level.playerStart).toEqual({ x: 48, y: 130 });
    expect(level.enemies[0]).toMatchObject({ x: 100, y: 130 });
    expect(level.boss).toMatchObject({ x: 176, y: 64 });
    expect(level.coins[0]).toMatchObject({ x: 80, y: 110 });
    expect(level.portal).toEqual({ x: 300, y: 40 });
    expect(source).toEqual(before);
  });

  it.each([false, true])(
    'keeps legacy absent/zero offsets (explicit=%s)',
    explicit => {
      const source = sourceLevel();
      for (const layer of source.layerInstances) {
        for (const key of ['__pxTotalOffsetX', '__pxTotalOffsetY']) {
          if (explicit) {
            layer[key] = 0;
          } else {
            delete layer[key];
          }
        }
      }
      const level = new LDtkLoader().convertLevel(source);
      expect(level.platforms[0]).toEqual({
        x: 0,
        y: 0,
        width: 256,
        height: 16
      });
      expect(level.playerStart).toEqual({ x: 58, y: 90 });
    }
  );

  it.each(
    [0, 1].flatMap(index =>
      ['__pxTotalOffsetX', '__pxTotalOffsetY'].flatMap(key =>
        invalidOffsets.map(value => [index, key, value])
      )
    )
  )('rejects layer %s offset %s=%s', (index, key, value) => {
    const source = sourceLevel();
    source.layerInstances[index][key] = value;
    expect(() => new LDtkLoader().convertLevel(source)).toThrow(
      /LDtk layer offset/
    );
  });

  it.each(
    [0, 1].flatMap(index =>
      ['__pxTotalOffsetX', '__pxTotalOffsetY'].map(key => [index, key])
    )
  )('refuses unsafe resulting layer %s %s extents', (index, key) => {
    const source = sourceLevel();
    source.layerInstances[index][key] = Number.MAX_SAFE_INTEGER;
    expect(() => new LDtkLoader().convertLevel(source)).toThrow(
      /LDtk .*extent/
    );
  });

  it('checks translated empty grid extents too', () => {
    const source = sourceLevel();
    source.layerInstances[0].intGridCsv.fill(0);
    source.layerInstances[0].__pxTotalOffsetX = Number.MAX_SAFE_INTEGER;
    source.layerInstances[1].entityInstances = [];
    expect(() => new LDtkLoader().convertLevel(source)).toThrow(
      /LDtk .*extent/
    );
  });

  it('retains negative origins and fractional entity coordinates', () => {
    const source = sourceLevel();
    source.layerInstances[0].__pxTotalOffsetX = -100;
    source.layerInstances[1].entityInstances[0].px = [0.25, -40.5];
    const level = new LDtkLoader().convertLevel(source);
    expect(level.platforms[0].x).toBe(-100);
    expect(level.playerStart).toEqual({ x: -9.75, y: -0.5 });
  });
});

describe('LDtk coordinate publication in Game', () => {
  let game, fromURL;
  beforeEach(async () => {
    document.body.innerHTML =
      '<canvas id="coordinates" width="800" height="400"></canvas>';
    game = new Game('coordinates');
    vi.spyOn(game.spriteLoader, 'loadAll').mockResolvedValue();
    vi.spyOn(game.canvas, 'getContext').mockReturnValue(game.ctx);
    game.ctx.translate = vi.fn();
    game.ctx.stroke = vi.fn();
    game.ctx.moveTo = vi.fn();
    game.ctx.lineTo = vi.fn();
    await game.init();
    fromURL = mockWorldFetch();
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterEach(() => {
    game.dispose();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  function snapshot() {
    return {
      levels: game.levels,
      player: game.player,
      platforms: game.platforms,
      index: game.staticWorldIndex,
      world: game.ldtkLoader.world,
      bounds: game.camera.bounds
    };
  }

  it('shares translated platform/spawn geometry with collision, patrol and rendering', async () => {
    fromURL.mockResolvedValue({ levels: [sourceLevel()] });
    expect(await game.loadLDtkLevels('shifted')).toBe(true);
    expect([game.player.x, game.player.y]).toEqual([48, 130]);
    expect([game.enemies[0].x, game.enemies[0].y]).toEqual([100, 130]);
    game.boss.canShoot = false;
    game.update(1000 / 60);
    expect(game.player.y).toBe(130);
    expect(game.player.isJumping).toBe(false);
    expect(game.enemies[0].x).toBe(102);
    game.enemies[0].x = 287;
    game.enemies[0].update(game.platforms, 16);
    expect(game.enemies[0].x).toBe(244);
    expect(game.enemies[0].direction).toBe(-1);
    game.render();
    expect(game.ctx.fillRect).toHaveBeenCalledWith(32, 160, 256, 16);
    expect(game.ctx.arc).toHaveBeenCalledWith(90, 120, 10, 0, Math.PI * 2);
  });

  it.each(
    ['loadLDtkLevels', 'addLDtkLevels'].flatMap(method =>
      [0, 1].flatMap(index =>
        [null, 0.5, Number.MAX_SAFE_INTEGER].map(value => [
          method,
          index,
          value
        ])
      )
    )
  )(
    'refuses %s with invalid/overflowing future layer %s offset %s',
    async (method, index, value) => {
      fromURL.mockResolvedValue({ levels: [sourceLevel()] });
      expect(await game.loadLDtkLevels('valid')).toBe(true);
      const before = snapshot();
      const invalid = sourceLevel();
      invalid.layerInstances[index].__pxTotalOffsetX = value;
      fromURL.mockResolvedValue({ levels: [sourceLevel(), invalid] });
      expect(await game[method]('invalid-future')).toBe(false);
      expect(snapshot()).toEqual(before);
      for (const key of Object.keys(before)) {
        expect(snapshot()[key]).toBe(before[key]);
      }
      expect(console.error).toHaveBeenCalled();
      expect(game.player.disposed).toBe(false);
    }
  );
});
