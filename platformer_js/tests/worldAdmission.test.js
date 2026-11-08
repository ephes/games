import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Game } from '../src/Game.js';
import { LDtkLoader, WORLD_LIMITS } from '../src/systems/LDtkLoader.js';

const layer = cells => ({
  __identifier: 'Platforms',
  __gridSize: 64,
  __cWid: cells.length,
  __cHei: 1,
  intGridCsv: cells
});
const entity = kind => ({ __identifier: kind, px: [0, 0], fieldInstances: [] });
const level = () => ({
  identifier: 'Synthetic',
  fieldInstances: [],
  layerInstances: [
    layer([1]),
    {
      __identifier: 'Entities',
      entityInstances: ['Player', 'Boss', 'Portal'].map(entity)
    }
  ]
});
const response = (body, length = null) => ({
  ok: true,
  headers: new Headers(
    length === null ? {} : { 'content-length': String(length) }
  ),
  body
});
const bytes = data => new TextEncoder().encode(JSON.stringify(data));
const stream = value =>
  new ReadableStream({
    start(c) {
      c.enqueue(value);
      c.close();
    }
  });

describe('World transfer admission', () => {
  let game;
  beforeEach(() => {
    document.body.innerHTML =
      '<canvas id="admission" width="800" height="400"></canvas>';
    game = new Game('admission');
    game.createLevel();
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterEach(() => {
    game.dispose();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('imports a valid streamed world through the real JSON parser', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(response(stream(bytes({ levels: [level()] }))))
    );
    expect(await game.loadLDtkLevels('synthetic')).toBe(true);
    expect(game.boss.x).toBe(0);
  });

  it('accepts exactly the byte ceiling', async () => {
    const content = JSON.stringify({ levels: [level()] });
    const padded = content + ' '.repeat(WORLD_LIMITS.bytes - content.length);
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(response(stream(new TextEncoder().encode(padded))))
    );
    expect(await game.loadLDtkLevels('synthetic')).toBe(true);
  });

  it('refuses append beyond the combined level budget', async () => {
    game.levels = Array(WORLD_LIMITS.levels).fill(game.levels[0]);
    const previous = game.levels;
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(response(stream(bytes({ levels: [level()] }))))
    );
    await game.addLDtkLevels('synthetic');
    expect(game.levels).toBe(previous);
    expect(game.ldtkLoader.world).toBeNull();
  });

  it.each(['declared', 'understated', 'absent'])(
    'rejects %s oversized bodies before JSON parsing and retains play',
    async kind => {
      const cancel = vi.fn();
      const body = new ReadableStream({
        start(c) {
          c.enqueue(new Uint8Array(WORLD_LIMITS.bytes + 1));
        },
        cancel
      });
      vi.stubGlobal(
        'fetch',
        vi
          .fn()
          .mockResolvedValue(
            response(
              body,
              kind === 'declared'
                ? WORLD_LIMITS.bytes + 1
                : kind === 'understated'
                  ? 1
                  : null
            )
          )
      );
      const parse = vi.spyOn(JSON, 'parse');
      const player = game.player,
        levels = game.levels;
      expect(await game.loadLDtkLevels('synthetic')).toBe(false);
      expect(parse).not.toHaveBeenCalled();
      expect(cancel).toHaveBeenCalledOnce();
      expect(game.player).toBe(player);
      expect(game.levels).toBe(levels);
      expect(game.ldtkLoader.world).toBeNull();
    }
  );

  it.each(['deadline', 'dispose', 'supersede'])(
    'cancels a stalled body on %s without parsing or publication',
    async kind => {
      vi.useFakeTimers();
      const cancel = vi.fn();
      const body = new ReadableStream({ cancel });
      const fetch = vi.fn().mockResolvedValue(response(body));
      vi.stubGlobal('fetch', fetch);
      const parse = vi.spyOn(JSON, 'parse');
      const player = game.player;
      const pending = game.loadLDtkLevels('stalled');
      await vi.waitFor(() => expect(body.locked).toBe(true));
      const signal = fetch.mock.calls[0][1].signal;
      if (kind === 'deadline') {
        await vi.advanceTimersByTimeAsync(WORLD_LIMITS.timeoutMs);
      }
      if (kind === 'dispose') {
        game.dispose();
      }
      if (kind === 'supersede') {
        fetch.mockRejectedValue(new Error('synthetic failure'));
        expect(await game.loadLDtkLevels('newer')).toBe(false);
      }
      expect(await pending).toBe(false);
      expect(signal.aborted).toBe(true);
      expect(cancel).toHaveBeenCalledOnce();
      expect(parse).not.toHaveBeenCalled();
      expect(game.player).toBe(player);
      expect(game.ldtkLoader.world).toBeNull();
      expect(vi.getTimerCount()).toBe(0);
    }
  );

  it('aborts a stalled header fetch at the total deadline', async () => {
    vi.useFakeTimers();
    vi.stubGlobal(
      'fetch',
      vi.fn(
        (url, { signal }) =>
          new Promise((resolve, reject) =>
            signal.addEventListener('abort', () => reject(signal.reason))
          )
      )
    );
    const pending = game.loadLDtkLevels('stalled');
    await vi.advanceTimersByTimeAsync(WORLD_LIMITS.timeoutMs);
    expect(await pending).toBe(false);
  });
});

describe('Whole-world geometry budgets', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });
  it.each(['level', 'cell', 'entity'])(
    'rejects the aggregate %s budget before conversion',
    kind => {
      const loader = new LDtkLoader();
      const data = {
        levels: Array.from(
          { length: kind === 'level' ? WORLD_LIMITS.levels + 1 : 21 },
          level
        )
      };
      if (kind === 'cell') {
        for (const item of data.levels) {
          item.layerInstances[0] = layer(Array(100_000).fill(0));
        }
      }
      if (kind === 'entity') {
        for (const item of data.levels) {
          item.layerInstances[1].entityInstances = Array.from(
            { length: 1000 },
            () => entity('Coin')
          );
        }
      }
      const convert = vi.spyOn(loader, 'convertLevel');
      expect(() => loader.getAllLevels(data)).toThrow(
        new RegExp(`LDtk (world )?${kind} budget`)
      );
      expect(convert).not.toHaveBeenCalled();
    }
  );
  it('enforces aggregate admission through fetch before conversion/publication', async () => {
    const loader = new LDtkLoader();
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        response(
          stream(
            bytes({
              levels: Array.from({ length: WORLD_LIMITS.levels + 1 }, level)
            })
          )
        )
      )
    );
    await expect(loader.loadWorld('synthetic')).rejects.toThrow(
      'LDtk level budget'
    );
    expect(loader.world).toBeNull();
  });
  it('accepts exact aggregate cell and level limits', () => {
    const loader = new LDtkLoader();
    const data = { levels: Array.from({ length: WORLD_LIMITS.levels }, level) };
    data.levels[0].layerInstances[0] = layer(Array(1_000_000).fill(1));
    data.levels[1].layerInstances[0] = layer(Array(1_000_000 - 62).fill(1));
    expect(loader.getAllLevels(data)).toHaveLength(WORLD_LIMITS.levels);
  });
  it('rejects a checkerboard over the active platform limit before merging', () => {
    const loader = new LDtkLoader();
    const source = level();
    source.layerInstances[0] = layer(
      Array.from({ length: WORLD_LIMITS.activePlatforms * 2 + 1 }, (_, i) =>
        i % 2 ? 0 : 1
      )
    );
    const merge = vi.spyOn(loader, 'mergePlatforms');
    expect(() => loader.getAllLevels({ levels: [source] })).toThrow(
      'LDtk active platform budget'
    );
    expect(merge).not.toHaveBeenCalled();
  });
  it('accepts the exact active entity limit and rejects the next entity', () => {
    const loader = new LDtkLoader();
    const source = level();
    const entities = source.layerInstances[1].entityInstances;
    while (entities.length < WORLD_LIMITS.activeEntities) {
      entities.push(entity('Coin'));
    }
    expect(loader.getAllLevels({ levels: [source] })[0].coins).toHaveLength(
      WORLD_LIMITS.activeEntities - 3
    );
    entities.push(entity('Coin'));
    expect(() => loader.getAllLevels({ levels: [source] })).toThrow(
      'LDtk active entity budget'
    );
  });
});
