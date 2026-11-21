import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Game } from '../src/Game.js';
import { LDtkLoader, WORLD_LIMITS } from '../src/systems/LDtkLoader.js';
import starterWorld from '../assets/levels/platformer.ldtk?raw';

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

  it.each([
    ['invalid continuation', () => new Uint8Array([0xc3, 0x28])],
    ['truncated sequence', () => new Uint8Array([0xe2, 0x82])],
    ['overlong encoding', () => new Uint8Array([0xc0, 0xaf])],
    ['encoded surrogate', () => new Uint8Array([0xed, 0xa0, 0x80])],
    ['duplicate levels', text => `{"levels":[],${text.slice(1)}`],
    ['escaped levels alias', text => `{"lev\\u0065ls":[],${text.slice(1)}`],
    [
      'duplicate grid',
      text => text.replace('"__gridSize":64', '"__gridSize":1,"__gridSize":64')
    ],
    [
      'escaped grid alias',
      text =>
        text.replace('"__gridSize":64', '"__gridSiz\\u0065":1,"__gridSize":64')
    ],
    [
      'duplicate unknown member',
      text => text.replace('"identifier":', '"extra":1,"extra":2,"identifier":')
    ]
  ])(
    'refuses %s without replacing a playable world',
    async (label, corrupt) => {
      const content = JSON.stringify({ levels: [level()] });
      const valid = new TextEncoder().encode(content);
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue(response(stream(valid)))
      );
      expect(await game.loadLDtkLevels('valid')).toBe(true);
      const player = game.player,
        levels = game.levels,
        world = game.ldtkLoader.world;
      const replacement = corrupt(content);
      // Invalid bytes inside an otherwise valid JSON string used to become U+FFFD.
      const wire =
        typeof replacement === 'string'
          ? new TextEncoder().encode(replacement)
          : new Uint8Array([
              ...new TextEncoder().encode('{"note":"'),
              ...replacement,
              ...new TextEncoder().encode(`",${content.slice(1)}`)
            ]);
      fetch.mockResolvedValue(response(stream(wire)));
      expect(await game.loadLDtkLevels('invalid')).toBe(false);
      expect(game.player).toBe(player);
      expect(game.levels).toBe(levels);
      expect(game.ldtkLoader.world).toBe(world);
      expect(player.disposed).toBe(false);
    }
  );

  it('accepts Unicode, escaped keys, nested scopes and punctuation in strings', async () => {
    const data = {
      levels: [level(), level()],
      note: 'Grüße 🌍 "{}:,',
      nested: [{ key: 1 }, { key: 2 }]
    };
    data.levels[0].identifier = 'Welt 🌍';
    const text = JSON.stringify(data).replace('"levels"', '"lev\\u0065ls"');
    const wire = new TextEncoder().encode(text);
    const body = new ReadableStream({
      start(c) {
        // Split every multibyte sequence across transfer chunks.
        for (const byte of wire) {
          c.enqueue(new Uint8Array([byte]));
        }
        c.close();
      }
    });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response(body)));
    expect(await game.loadLDtkLevels('unicode')).toBe(true);
    expect(game.ldtkLoader.world).toEqual(data);
    expect(game.levels[0].name).toBe('Welt 🌍');
  });

  it.each([
    ['object nesting', '{"child":'.repeat(65) + '0' + '}'.repeat(65)],
    ['array nesting', '['.repeat(65) + '0' + ']'.repeat(65)],
    [
      'container count',
      '[' + '{},'.repeat(WORLD_LIMITS.jsonContainers) + '{}]'
    ],
    ['token count', '[' + '0,'.repeat(WORLD_LIMITS.jsonTokens) + '0]']
  ])(
    'refuses ignored metadata over the %s envelope before parsing',
    async (label, metadata) => {
      const valid = JSON.stringify({ levels: [level()] });
      vi.stubGlobal(
        'fetch',
        vi
          .fn()
          .mockResolvedValue(response(stream(new TextEncoder().encode(valid))))
      );
      expect(await game.loadLDtkLevels('valid')).toBe(true);
      const previous = { ...game };
      const world = game.ldtkLoader.world;
      const text = `{"metadata":${metadata},${valid.slice(1)}`;
      expect(text.length).toBeLessThan(WORLD_LIMITS.bytes);
      fetch.mockResolvedValue(response(stream(new TextEncoder().encode(text))));
      const parse = vi.spyOn(JSON, 'parse');
      expect(await game.loadLDtkLevels('over-envelope')).toBe(false);
      expect(parse).not.toHaveBeenCalled();
      expect(game.ldtkLoader.world).toBe(world);
      for (const key of [
        'levels',
        'player',
        'platforms',
        'staticWorldIndex',
        'boss',
        'portal'
      ]) {
        expect(game[key]).toBe(previous[key]);
      }
      expect(console.error.mock.calls.at(-1)[1].message).toMatch(
        /LDtk JSON .* budget/
      );
    }
  );

  it('admits the nesting boundary and bundled export through the wire path', async () => {
    const loader = new LDtkLoader();
    // Root object + metadata array + 62 child arrays = 64 containers deep.
    const text = `{"metadata":${'['.repeat(63)}0${']'.repeat(63)},"levels":[]}`;
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(response(stream(new TextEncoder().encode(text))))
    );
    await expect(loader.loadWorld('boundary')).resolves.toEqual(
      JSON.parse(text)
    );
    fetch.mockResolvedValue(
      response(stream(new TextEncoder().encode(starterWorld)))
    );
    await expect(loader.loadWorld('bundled')).resolves.toEqual(
      JSON.parse(starterWorld)
    );
  });

  it('admits LDtk-shaped entities and cells at both aggregate boundaries at once', async () => {
    // Exported LDtk entity instances carry several arrays and field records,
    // so the JSON envelope must not undercut the cell and entity budgets
    // when a world uses both together.
    const field = (name, value) => ({
      __identifier: name,
      __type: 'Int',
      __value: value,
      __tile: null,
      defUid: 7,
      realEditorValues: [{ id: 'V_Int', params: [value] }]
    });
    const ldtkEntity = index => ({
      __identifier: 'Decoration',
      __grid: [index % 50, 0],
      __pivot: [0, 0],
      __tags: [],
      __tile: null,
      __smartColor: '#BE4A2F',
      iid: `entity-${index}`,
      width: 16,
      height: 16,
      defUid: 3,
      px: [(index % 50) * 16, 0],
      fieldInstances: [field('A', 1), field('B', 2), field('C', 3)],
      __worldX: (index % 50) * 16,
      __worldY: 0
    });
    const perLevel = 1000;
    const levelCount = WORLD_LIMITS.entities / perLevel;
    const cellsPerLevel = WORLD_LIMITS.cells / levelCount;
    const data = {
      levels: Array.from({ length: levelCount }, (_, n) => ({
        identifier: `Level_${n}`,
        fieldInstances: [],
        layerInstances: [
          {
            __identifier: 'Background',
            __type: 'IntGrid',
            __gridSize: 16,
            __cWid: 1000,
            __cHei: cellsPerLevel / 1000,
            intGridCsv: Array(cellsPerLevel).fill(0)
          },
          {
            __identifier: 'Decorations',
            entityInstances: Array.from({ length: perLevel }, (_, i) =>
              ldtkEntity(n * perLevel + i)
            )
          }
        ]
      }))
    };
    const encoded = bytes(data);
    expect(encoded.byteLength).toBeLessThan(WORLD_LIMITS.bytes);
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(response(stream(encoded)))
    );
    const world = await new LDtkLoader().loadWorld('aggregate-boundary');
    expect(
      world.levels.flatMap(item => item.layerInstances[1].entityInstances)
    ).toHaveLength(WORLD_LIMITS.entities);
    expect(
      world.levels.flatMap(item => item.layerInstances[0].intGridCsv)
    ).toHaveLength(WORLD_LIMITS.cells);
  });

  it('admits two million streamed gameplay cells at the aggregate boundary', async () => {
    const data = { levels: [level(), level()] };
    for (const item of data.levels) {
      item.layerInstances[0] = {
        __identifier: 'Platforms',
        __gridSize: 16,
        __cWid: 1000,
        __cHei: 1000,
        intGridCsv: Array(1_000_000).fill(1)
      };
    }
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(response(stream(bytes(data))))
    );
    expect(await game.loadLDtkLevels('cell-boundary')).toBe(true);
    expect(game.platforms).toHaveLength(1000);
  });

  it.each(['1', true, 0.5, -1, null, Number.MAX_SAFE_INTEGER + 1])(
    'refuses malformed streamed cell %s without partial world publication',
    async value => {
      const valid = { levels: [level()] };
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue(response(stream(bytes(valid))))
      );
      expect(await game.loadLDtkLevels('valid')).toBe(true);
      const previous = { ...game };
      const world = game.ldtkLoader.world;
      const candidate = { levels: [level(), level()] };
      candidate.levels[1].layerInstances[0] = layer([1, value]);
      for (const method of ['loadLDtkLevels', 'addLDtkLevels']) {
        fetch.mockResolvedValue(response(stream(bytes(candidate))));
        expect(await game[method]('malformed-cell')).toBe(false);
        for (const key of [
          'levels',
          'player',
          'platforms',
          'staticWorldIndex',
          'boss',
          'portal'
        ]) {
          expect(game[key]).toBe(previous[key]);
        }
        expect(game.ldtkLoader.world).toBe(world);
        expect(console.error.mock.calls.at(-1)[1].message).toMatch(
          /Invalid LDtk IntGrid cell/
        );
      }
    }
  );

  it('imports empty, solid and alternate positive cell kinds distinctly', async () => {
    const data = { levels: [level()] };
    data.levels[0].layerInstances[0] = layer([0, 1, 2]);
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(response(stream(bytes(data))))
    );
    expect(await game.loadLDtkLevels('valid-kinds')).toBe(true);
    expect(game.levels[0].platforms).toEqual([
      { x: 64, y: 0, width: 64, height: 64 }
    ]);
    expect(
      game.platforms.map(({ x, y, width, height }) => ({ x, y, width, height }))
    ).toEqual(game.levels[0].platforms);
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

  it.each(['loadLDtkLevels', 'addLDtkLevels'])(
    'stops %s conversion on the first aggregate platform overflow',
    async method => {
      const fetch = vi
        .fn()
        .mockResolvedValue(response(stream(bytes({ levels: [level()] }))));
      vi.stubGlobal('fetch', fetch);
      expect(await game.loadLDtkLevels('valid')).toBe(true);
      const { levels, player, platforms, currentLevel, totalLevels } = game;
      const previousWorld = game.ldtkLoader.world;

      const fullLevels = Math.floor(
        WORLD_LIMITS.platforms / WORLD_LIMITS.activePlatforms
      );
      const platformCounts = [
        ...Array(fullLevels).fill(WORLD_LIMITS.activePlatforms),
        WORLD_LIMITS.platforms % WORLD_LIMITS.activePlatforms,
        1,
        1
      ];
      const candidate = {
        levels: platformCounts.map((_, index) => ({
          ...level(),
          identifier: `Candidate_${index}`
        }))
      };
      const convert = vi.spyOn(game.ldtkLoader, 'convertLevel');
      for (const count of platformCounts) {
        convert.mockReturnValueOnce({ platforms: Array(count) });
      }
      fetch.mockResolvedValue(response(stream(bytes(candidate))));

      expect(await game[method]('over-platform-budget')).toBe(false);
      expect(convert.mock.calls).toEqual(
        candidate.levels.slice(0, -1).map(source => [source])
      );
      expect(console.error.mock.calls.at(-1)[1].message).toBe(
        'LDtk world platform budget exceeded'
      );
      expect(game.ldtkLoader.world).toBe(previousWorld);
      expect(game.levels).toBe(levels);
      expect(game.player).toBe(player);
      expect(game.platforms).toBe(platforms);
      expect(game.currentLevel).toBe(currentLevel);
      expect(game.totalLevels).toBe(totalLevels);
    }
  );

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

  it.each(['HTTP error', 'late cancellation'])(
    'cancels the unread body once after %s',
    async kind => {
      const loader = new LDtkLoader();
      const cancel = vi.fn();
      const body = new ReadableStream({ cancel });
      const getReader = vi.spyOn(body, 'getReader');
      const fetch = vi.fn().mockResolvedValue({
        ...response(body),
        ok: kind !== 'HTTP error'
      });
      vi.stubGlobal('fetch', fetch);
      const pending = loader.loadWorld('unread');
      if (kind === 'late cancellation') {
        loader.cancelLoad();
      }

      await expect(pending).rejects.toThrow(
        kind === 'HTTP error' ? 'LDtk transfer failed' : 'LDtk load cancelled'
      );
      expect(getReader).not.toHaveBeenCalled();
      expect(cancel).toHaveBeenCalledOnce();
      expect(loader.world).toBeNull();
    }
  );

  it.each(['invalid', 'valid'])(
    'preserves the %s world result when reader release throws',
    async kind => {
      vi.useFakeTimers();
      const loader = new LDtkLoader();
      const world = kind === 'valid' ? { levels: [level()] } : {};
      const body = stream(bytes(world));
      const reader = body.getReader();
      vi.spyOn(body, 'getReader').mockReturnValue(reader);
      const releaseLock = vi
        .spyOn(reader, 'releaseLock')
        .mockImplementation(() => {
          throw new Error('synthetic reader release failure');
        });
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response(body)));

      const pending = loader.loadWorld('synthetic');
      if (kind === 'valid') {
        const loaded = await pending;
        expect(loaded).toEqual(world);
        expect(loader.world).toBe(loaded);
      } else {
        await expect(pending).rejects.toThrow('LDtk level budget exceeded');
        expect(loader.world).toBeNull();
      }
      expect(releaseLock).toHaveBeenCalledOnce();
      expect(loader.loadController).toBeNull();
      expect(vi.getTimerCount()).toBe(0);
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
  it('rejects aggregate converted platform geometry across levels', () => {
    const loader = new LDtkLoader();
    const data = { levels: Array.from({ length: 5 }, level) };
    for (const item of data.levels) {
      item.layerInstances[0] = layer(
        Array.from({ length: 8191 }, (_, i) => (i % 2 ? 0 : 1))
      );
    }
    expect(() => loader.getAllLevels(data)).toThrow(
      'LDtk world platform budget'
    );
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
