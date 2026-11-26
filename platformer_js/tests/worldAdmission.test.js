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
  status: 200,
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
      const decode = vi.spyOn(TextDecoder.prototype, 'decode');
      const player = game.player,
        levels = game.levels;
      expect(await game.loadLDtkLevels('synthetic')).toBe(false);
      expect(decode).not.toHaveBeenCalled();
      expect(cancel).toHaveBeenCalledOnce();
      expect(game.player).toBe(player);
      expect(game.levels).toBe(levels);
      expect(game.ldtkLoader.world).toBeNull();
    }
  );

  it.each([
    [undefined, 1],
    ['IdEnTiTy', -1]
  ])(
    'rejects an identity length mismatch (%s, %s bytes)',
    async (encoding, delta) => {
      const loader = new LDtkLoader();
      const previous = { levels: [] };
      loader.world = previous;
      const world = { levels: [level()] };
      const wire = bytes(world);
      const mismatched = response(stream(wire), wire.byteLength + delta);
      const exact = response(stream(wire), wire.byteLength);
      if (encoding) {
        mismatched.headers.set('Content-Encoding', encoding);
        exact.headers.set('Content-Encoding', encoding);
      }
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValueOnce(mismatched).mockResolvedValueOnce(exact)
      );

      await expect(loader.loadWorld('mismatched')).rejects.toThrow(
        'LDtk body length does not match Content-Length'
      );
      expect(loader.world).toBe(previous);

      const loaded = await loader.loadWorld('exact');
      expect(loaded).toEqual(world);
      expect(loader.world).toBe(loaded);
    }
  );

  it.each(['', '+1', '1e3', '0x20', '12, 12'])(
    'rejects a malformed Content-Length (%j)',
    async length => {
      const loader = new LDtkLoader();
      const body = stream(bytes({ levels: [] }));
      const cancel = vi.spyOn(body, 'cancel');
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response(body, length)));

      await expect(loader.loadWorld('malformed')).rejects.toThrow(
        'Invalid LDtk Content-Length'
      );
      expect(cancel).toHaveBeenCalledOnce();
      expect(loader.world).toBeNull();
    }
  );

  it.each(['gzip', null])(
    'uses the delivered byte cap when encoding %s is compressed or hidden by CORS',
    async encoding => {
      const loader = new LDtkLoader();
      const world = { levels: [level()] };
      const valid = response(stream(bytes(world)), 1);
      const cancel = vi.fn();
      const oversized = response(
        new ReadableStream({
          start(controller) {
            controller.enqueue(new Uint8Array(WORLD_LIMITS.bytes + 1));
          },
          cancel
        }),
        1
      );
      for (const reply of [valid, oversized]) {
        if (encoding) {
          reply.headers.set('Content-Encoding', encoding);
        } else {
          reply.type = 'cors';
        }
      }
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValueOnce(valid).mockResolvedValueOnce(oversized)
      );

      const loaded = await loader.loadWorld('within-cap');
      expect(loaded).toEqual(world);
      await expect(loader.loadWorld('over-cap')).rejects.toThrow(
        'LDtk byte budget exceeded'
      );
      expect(cancel).toHaveBeenCalledOnce();
      expect(loader.world).toBe(loaded);
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
        status: kind === 'HTTP error' ? 500 : 200
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

  it.each([
    ['206 without Content-Range', { status: 206 }],
    [
      '200 with Content-Range',
      { headers: { 'Content-Range': 'bytes 0-9/20' } }
    ],
    ['other successful status', { status: 201 }]
  ])('rejects %s before reading a valid world body', async (_kind, init) => {
    const loader = new LDtkLoader();
    const previous = { levels: [] };
    const candidate = { levels: [level()] };
    loader.world = previous;
    const body = stream(bytes(candidate));
    const getReader = vi.spyOn(body, 'getReader');
    const cancel = vi.spyOn(body, 'cancel');
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce(new Response(body, init))
        .mockResolvedValueOnce(new Response(stream(bytes(candidate))))
    );

    await expect(loader.loadWorld('incomplete')).rejects.toThrow(
      'LDtk transfer failed'
    );
    expect(getReader).not.toHaveBeenCalled();
    expect(cancel).toHaveBeenCalledOnce();
    expect(loader.world).toBe(previous);

    const loaded = await loader.loadWorld('complete');
    expect(loaded).toEqual(candidate);
    expect(loader.world).toBe(loaded);
  });

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
      const decode = vi.spyOn(TextDecoder.prototype, 'decode');
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
      expect(decode).not.toHaveBeenCalled();
      expect(game.player).toBe(player);
      expect(game.ldtkLoader.world).toBeNull();
      expect(vi.getTimerCount()).toBe(0);
    }
  );

  it.each(['cancel', 'deadline'])(
    'settles a noncooperative read on %s',
    async kind => {
      vi.useFakeTimers();
      const loader = new LDtkLoader();
      const previous = { levels: [] };
      loader.world = previous;
      let rejectRead;
      const reader = {
        read: vi.fn(
          () =>
            new Promise((_, reject) => {
              rejectRead = reject;
            })
        ),
        cancel: vi.fn(() => new Promise(() => {})),
        releaseLock: vi.fn()
      };
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue(response({ getReader: () => reader }))
      );
      const settled = vi.fn();
      const pending = loader.loadWorld('stalled').catch(settled);
      await vi.waitFor(() => expect(reader.read).toHaveBeenCalledOnce());

      if (kind === 'cancel') {
        loader.cancelLoad();
      }
      await vi.advanceTimersByTimeAsync(
        kind === 'deadline' ? WORLD_LIMITS.timeoutMs : 0
      );

      const message =
        kind === 'cancel'
          ? 'LDtk load cancelled'
          : 'LDtk transfer deadline exceeded';
      expect(settled).toHaveBeenCalledExactlyOnceWith(
        expect.objectContaining({ message })
      );
      expect(reader.cancel).toHaveBeenCalledExactlyOnceWith(
        settled.mock.calls[0][0]
      );
      expect(reader.releaseLock).toHaveBeenCalledOnce();
      expect(loader.loadController).toBeNull();
      expect(loader.world).toBe(previous);
      expect(vi.getTimerCount()).toBe(0);

      rejectRead(new Error('late read failure'));
      await pending;
    }
  );

  it('settles a superseded fetch before retiring its late response', async () => {
    const loader = new LDtkLoader();
    let deliver;
    const late = new Promise(resolve => {
      deliver = resolve;
    });
    const latest = { levels: [level()] };
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockReturnValueOnce(late)
        .mockResolvedValueOnce(response(stream(bytes(latest))))
    );
    const settled = vi.fn();
    const first = loader.loadWorld('late').catch(settled);
    const current = await loader.loadWorld('latest');

    expect(settled).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ message: 'LDtk load cancelled' })
    );
    const cancel = vi.fn();
    const body = new ReadableStream({ cancel });
    const getReader = vi.spyOn(body, 'getReader');
    deliver(response(body));
    await late;
    await first;

    expect(cancel).toHaveBeenCalledExactlyOnceWith(settled.mock.calls[0][0]);
    expect(getReader).not.toHaveBeenCalled();
    expect(current).toEqual(latest);
    expect(loader.world).toBe(current);
  });

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

  it.each(['empty reads', 'elapsed deadline'])(
    'cancels a transfer before decoding on %s',
    async reason => {
      const loader = new LDtkLoader();
      const previous = { levels: [] };
      loader.world = previous;
      const candidate = bytes({ levels: [level()] });
      const empty = new Uint8Array(0);
      let now = 100;
      let reads = 0;
      vi.spyOn(performance, 'now').mockImplementation(() => now);
      const reader = {
        read: vi.fn(async () => {
          reads++;
          if (reason === 'elapsed deadline' && reads === 2) {
            now += WORLD_LIMITS.timeoutMs;
            return { done: true };
          }
          // End naturally if the guard regresses, so the test cannot hang.
          if (reads === 101) {
            return { done: true };
          }
          return { done: false, value: reads === 1 ? candidate : empty };
        }),
        cancel: vi.fn(),
        releaseLock: vi.fn()
      };
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue(response({ getReader: () => reader }))
      );
      const decode = vi.spyOn(TextDecoder.prototype, 'decode');

      await expect(loader.loadWorld('replacement')).rejects.toThrow(
        reason === 'elapsed deadline'
          ? 'LDtk transfer deadline exceeded'
          : 'LDtk empty read budget exceeded'
      );
      expect(reader.read).toHaveBeenCalledTimes(
        reason === 'elapsed deadline' ? 2 : 66
      );
      expect(reader.cancel).toHaveBeenCalledOnce();
      expect(reader.releaseLock).toHaveBeenCalledOnce();
      expect(decode).not.toHaveBeenCalled();
      expect(loader.world).toBe(previous);
    }
  );

  it('accepts empty chunks and resets their budget after a nonempty read', async () => {
    const candidate = { levels: [level()] };
    const payload = bytes(candidate);
    const empty = new Uint8Array(0);
    const body = new ReadableStream({
      start(controller) {
        for (const chunk of [payload.subarray(0, 1), payload.subarray(1)]) {
          for (let count = 0; count < 64; count++) {
            controller.enqueue(empty);
          }
          controller.enqueue(chunk);
        }
        controller.close();
      }
    });
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(response(body, payload.byteLength))
    );

    await expect(
      new LDtkLoader().loadWorld('with-empty-chunks')
    ).resolves.toEqual(candidate);
  });

  it('rejects a world when synchronous admission reaches the deadline', async () => {
    const loader = new LDtkLoader();
    const previous = { levels: [] };
    const candidate = { levels: [level()] };
    loader.world = previous;
    let now = 100;
    let admissionMs = WORLD_LIMITS.timeoutMs;
    vi.spyOn(performance, 'now').mockImplementation(() => now);
    const preflight = loader.preflightWorld.bind(loader);
    vi.spyOn(loader, 'preflightWorld').mockImplementation(data => {
      preflight(data);
      now += admissionMs;
    });
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation(async () => response(stream(bytes(candidate))))
    );

    await expect(loader.loadWorld('expired')).rejects.toThrow(
      'LDtk transfer deadline exceeded'
    );
    expect(loader.world).toBe(previous);

    admissionMs--;
    const loaded = await loader.loadWorld('on-time');
    expect(loaded).toEqual(candidate);
    expect(loader.world).toBe(loaded);
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
