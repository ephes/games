import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SpriteLoader } from '../src/systems/SpriteLoader.js';

const requestedSprites = [
  ['player.idle', 'assets/sprites/pink-man-idle.png'],
  ['player.run', 'assets/sprites/pink-man-run.png'],
  ['player.jump', 'assets/sprites/pink-man-jump.png'],
  ['player.fall', 'assets/sprites/pink-man-fall.png'],
  ['player.hit', 'assets/sprites/pink-man-hit.png'],
  ['enemy.run', 'assets/sprites/slime-run.png'],
  ['enemy.hit', 'assets/sprites/slime-hit.png'],
  ['boss', 'assets/sprites/boss_kobra_64x96-sheet.png'],
  ['portal', 'assets/sprites/level_portal_128.png'],
  ['boss.fireball', 'assets/sprites/boss-fireball.png']
];

describe('Real sprite loading', () => {
  let loader;
  let images;

  beforeEach(() => {
    images = [];
    vi.stubGlobal(
      'Image',
      class {
        constructor() {
          images.push(this);
        }

        removeAttribute(name) {
          delete this[name];
        }
      }
    );
    loader = new SpriteLoader();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('caches the exact image only after its load event', async () => {
    expect(loader.getSprite('synthetic')).toBeNull();
    const loading = loader.loadSprite('synthetic', 'synthetic.png');
    expect(images).toHaveLength(1);
    expect(images[0].src).toBe('synthetic.png');
    expect(loader.getSprite('synthetic')).toBeNull();

    images[0].onload();
    await expect(loading).resolves.toBe(images[0]);
    expect(loader.getSprite('synthetic')).toBe(images[0]);
    expect(loader.loaded).toBe(false);
  });

  it('waits for every image despite out-of-order completion', async () => {
    const loading = loader.loadAll();
    expect(images.map(image => image.src)).toEqual(
      requestedSprites.map(([_name, path]) => path)
    );
    expect(loader.loaded).toBe(false);
    for (let i = images.length - 1; i > 0; i--) {
      images[i].onload?.();
    }
    await Promise.all(loader.loadPromises.slice(1));
    expect(loader.loaded).toBe(false);
    expect(loader.getSprite('player.idle')).toBeNull();

    images[0].onload();
    await loading;
    expect(loader.loaded).toBe(true);
    requestedSprites.forEach(([name], index) => {
      expect(loader.getSprite(name)).toBe(images[index]);
    });
  });

  it('rejects a failed batch and stays incomplete even when the other images finish', async () => {
    const loading = loader.loadAll();
    // Observe rejection before emitting the error to avoid an unhandled promise.
    const outcome = loading.catch(error => error);
    images[5].onerror();
    expect(loader.loaded).toBe(false);
    expect(loader.getSprite('enemy.run')).toBeNull();

    images.forEach((image, index) => {
      if (index !== 5) {
        image.onload?.();
      }
    });
    expect(await outcome).toEqual(
      new Error('Failed to load sprite: assets/sprites/slime-run.png')
    );
    await Promise.all(
      loader.loadPromises.filter((_promise, index) => index !== 5)
    );
    expect(loader.loaded).toBe(false);
    expect(loader.getSprite('player.idle')).toBeNull();
    expect(loader.getSprite('enemy.run')).toBeNull();
  });
  it('retains the complete previous cache after a replacement fails, including late successes', async () => {
    const initial = loader.loadAll();
    images.forEach(image => image.onload?.());
    await initial;
    const replacement = loader.loadAll().catch(error => error);
    images[requestedSprites.length].onload();
    const readyDuringReload = loader.loaded;
    requestedSprites.forEach(([name], index) => {
      expect(loader.getSprite(name)).toBe(images[index]);
    });
    const late = images.slice(12).map(image => image.onload);
    images[11].onerror();
    expect(await replacement).toEqual(
      new Error('Failed to load sprite: assets/sprites/pink-man-run.png')
    );
    late.forEach(onload => onload());
    expect(loader.loaded).toBe(true);
    expect(readyDuringReload).toBe(true);
    requestedSprites.forEach(([name], index) => {
      expect(loader.getSprite(name)).toBe(images[index]);
    });
  });

  it('retains the published sprites when aborted after all replacement images load', async () => {
    const initial = loader.loadAll();
    images.forEach(image => image.onload());
    await initial;
    const controller = new AbortController();
    const replacement = loader.loadAll({ signal: controller.signal });
    images.slice(requestedSprites.length).forEach(image => image.onload());
    controller.abort();

    await expect(replacement).rejects.toMatchObject({ name: 'AbortError' });
    expect(loader.loaded).toBe(true);
    requestedSprites.forEach(([name], index) => {
      expect(loader.getSprite(name)).toBe(images[index]);
    });
  });

  it('preserves the cached sprite when aborted after the replacement image loads', async () => {
    const initial = loader.loadSprite('single', 'valid.png');
    images[0].onload();
    await initial;

    const controller = new AbortController();
    const replacement = loader.loadSprite('single', 'replacement.png', {
      signal: controller.signal
    });
    images[1].onload();
    controller.abort(new Error('synthetic cancellation'));

    await expect(replacement).rejects.toMatchObject({ name: 'AbortError' });
    expect(loader.getSprite('single')).toBe(images[0]);
    expect(loader.requests.has('single')).toBe(false);
  });

  it.each(['loadSprite', 'loadAll'])(
    'rejects pre-aborted %s before allocating or superseding requests',
    async method => {
      vi.useFakeTimers();
      const initial = loader.loadAll();
      images.forEach(image => image.onload());
      await initial;
      const previous = loader.getSprite('player.idle');
      const controller = new AbortController();
      controller.abort(new Error('synthetic cancellation'));
      const load = options =>
        method === 'loadAll'
          ? loader.loadAll(options)
          : loader.loadSprite('player.idle', 'replacement.png', options);
      const schedule = vi.spyOn(globalThis, 'setTimeout');
      const abort = () => load({ signal: controller.signal });

      await expect(abort()).rejects.toMatchObject({ name: 'AbortError' });
      expect(images).toHaveLength(requestedSprites.length);
      expect(schedule).not.toHaveBeenCalled();
      expect(loader.loaded).toBe(true);
      expect(loader.getSprite('player.idle')).toBe(previous);

      const active = load();
      const replacement = images.slice(requestedSprites.length);
      schedule.mockClear();
      await expect(abort()).rejects.toMatchObject({ name: 'AbortError' });
      expect(schedule).not.toHaveBeenCalled();
      replacement.forEach(image => image.onload());
      await active;
      expect(loader.getSprite('player.idle')).toBe(replacement[0]);
    }
  );

  it.each([true, false])(
    'publishes only the latest complete batch (old first: %s)',
    async oldFirst => {
      const first = loader.loadAll().catch(error => error);
      const retiredLoads = images.map(image => image.onload);
      const second = loader.loadAll();
      images.slice(0, 10).forEach(image => expect(image.src).toBeUndefined());
      for (const start of oldFirst ? [0, 10] : [10, 0]) {
        if (start === 0) {
          retiredLoads.forEach(onload => onload());
        } else {
          images.slice(start, start + 10).forEach(image => image.onload());
        }
        await (start === 0 ? first : second);
        if (start === 0 && oldFirst) {
          expect(loader.sprites.size).toBe(0);
        }
      }
      requestedSprites.forEach(([name], index) =>
        expect(loader.getSprite(name)).toBe(images[index + 10])
      );
    }
  );

  it.each(['deadline', 'abort'])(
    'retires a never-settling batch on %s and allows retry',
    async reason => {
      vi.useFakeTimers();
      const controller = new AbortController();
      const add = vi.spyOn(controller.signal, 'addEventListener');
      const remove = vi.spyOn(controller.signal, 'removeEventListener');
      let failure;
      const pending = loader
        .loadAll({ signal: controller.signal })
        .catch(error => {
          failure = error;
        });
      const lateLoad = images[0].onload;
      const completed = images.at(-1);
      const completedSource = completed.src;
      completed.onload();
      if (reason === 'abort') {
        controller.abort();
      } else {
        await vi.advanceTimersByTimeAsync(10_000);
      }
      await vi.advanceTimersByTimeAsync(0);
      expect(failure).toMatchObject({
        name: reason === 'abort' ? 'AbortError' : 'Error'
      });
      await pending;
      expect(loader.loaded).toBe(false);
      expect(loader.requests.size).toBe(0);
      expect(remove).toHaveBeenCalledWith('abort', add.mock.calls[0][1]);
      expect(vi.getTimerCount()).toBe(0);
      images.forEach(image => {
        expect(image.onload).toBeNull();
        expect(image.onerror).toBeNull();
        expect(image.src).toBe(
          image === completed ? completedSource : undefined
        );
      });
      const retry = loader.loadAll();
      images.slice(10).forEach(image => image.onload?.());
      await retry;
      lateLoad();
      expect(loader.getSprite('player.idle')).toBe(images[10]);
      expect(vi.getTimerCount()).toBe(0);
    }
  );

  it('rejects a late load event before its timeout callback runs', async () => {
    vi.useFakeTimers();
    let now = 100;
    vi.spyOn(performance, 'now').mockImplementation(() => now);
    const options = { timeoutMs: 10 };
    const first = loader.loadSprite('single', 'first.png', options);
    const [previous] = images;
    now += 9;
    previous.onload();
    await expect(first).resolves.toBe(previous);

    const settled = vi.fn();
    const pending = loader
      .loadSprite('single', 'replacement.png', options)
      .then(settled, settled);
    const image = images[1];
    const lateLoad = image.onload;
    const removeSource = vi.spyOn(image, 'removeAttribute');
    // Move only the monotonic clock, leaving the scheduled timer pending.
    now += 11;
    expect(vi.getTimerCount()).toBe(1);
    lateLoad();
    await pending;
    lateLoad();
    await vi.advanceTimersByTimeAsync(10);

    expect(settled).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({
        message: 'Sprite load timed out: replacement.png'
      })
    );
    expect(removeSource).toHaveBeenCalledExactlyOnceWith('src');
    expect(image.onload).toBeNull();
    expect(image.onerror).toBeNull();
    expect(loader.getSprite('single')).toBe(previous);
    expect(vi.getTimerCount()).toBe(0);
  });

  it.each(['abort', 'timeout'])(
    'settles a sprite on %s even when removing its source throws',
    async reason => {
      vi.useFakeTimers();
      const controller = new AbortController();
      const settled = vi.fn();
      loader
        .loadSprite('single', 'single.png', {
          signal: controller.signal,
          timeoutMs: 10
        })
        .then(settled, settled);
      const [image] = images;
      const lateLoad = image.onload;
      const removeSource = vi
        .spyOn(image, 'removeAttribute')
        .mockImplementation(() => {
          throw new Error('synthetic source retirement failure');
        });

      if (reason === 'abort') {
        controller.abort();
      }
      await vi.advanceTimersByTimeAsync(reason === 'abort' ? 0 : 10);
      expect(settled.mock.calls[0]?.[0]).toMatchObject({
        name: reason === 'abort' ? 'AbortError' : 'Error',
        message:
          reason === 'abort'
            ? 'Sprite load aborted'
            : 'Sprite load timed out: single.png'
      });
      lateLoad();
      controller.abort();
      await vi.advanceTimersByTimeAsync(10);
      expect(settled).toHaveBeenCalledTimes(1);
      expect(removeSource).toHaveBeenCalledExactlyOnceWith('src');
      expect(image.onload).toBeNull();
      expect(image.onerror).toBeNull();
      expect(vi.getTimerCount()).toBe(0);
      expect(loader.getSprite('single')).toBeNull();
    }
  );

  it('keeps a direct request authoritative over an overlapping batch', async () => {
    const batch = loader.loadAll().catch(error => error);
    const direct = loader.loadSprite('player.idle', 'direct.png');
    images.forEach(image => image.onload?.());
    await direct;
    expect(await batch).toMatchObject({
      name: 'AbortError',
      message: 'Sprite batch superseded'
    });
    expect(loader.getSprite('player.idle')).toBe(images[10]);
    expect(loader.getSprite('player.run')).toBeNull();
    expect(loader.loaded).toBe(false);
  });

  it('cleans up a single image on success, error, abort and setup failure', async () => {
    vi.useFakeTimers();
    for (const event of ['onload', 'onerror']) {
      const result = loader
        .loadSprite('single', 'single.png')
        .catch(error => error);
      const image = images.at(-1);
      image[event]();
      await result;
      expect(image.onload).toBeNull();
      expect(image.onerror).toBeNull();
      expect(vi.getTimerCount()).toBe(0);
    }
    const controller = new AbortController();
    controller.abort();
    await expect(
      loader.loadSprite('single', 'single.png', { signal: controller.signal })
    ).rejects.toMatchObject({ name: 'AbortError' });
    vi.stubGlobal(
      'Image',
      class {
        set src(_value) {
          throw new Error('synthetic setup failure');
        }
      }
    );
    await expect(loader.loadSprite('single', 'single.png')).rejects.toThrow(
      'synthetic setup failure'
    );
    expect(vi.getTimerCount()).toBe(0);
    expect(loader.requests.size).toBe(0);
  });

  it('retires partially started batches after a synchronous setup error', async () => {
    vi.useFakeTimers();
    const direct = loader.loadSprite('player.jump', 'direct.png');
    const error = new Error('synthetic batch setup failure');
    const loadImage = loader.loadImage.bind(loader);
    const replacement = vi
      .spyOn(loader, 'loadImage')
      .mockImplementationOnce(loadImage)
      .mockImplementationOnce(() => {
        throw error;
      });

    await expect(loader.loadAll()).rejects.toBe(error);
    expect(images).toHaveLength(2);
    expect(images[1].src).toBeUndefined();
    expect(images[1].onload).toBeNull();
    expect(loader.batchController).toBeNull();
    expect(loader.loadPromises).toEqual([]);
    expect([...loader.requests.keys()]).toEqual(['player.jump']);
    expect(loader.loaded).toBe(false);

    images[0].onload();
    await direct;
    expect(loader.getSprite('player.jump')).toBe(images[0]);
    replacement.mockRestore();
    const retry = loader.loadAll();
    images.slice(2).forEach(image => image.onload());
    await expect(retry).resolves.toBeUndefined();
    expect(loader.loaded).toBe(true);
    for (const [key, path] of requestedSprites) {
      expect(loader.getSprite(key)?.src).toBe(path);
    }
    expect(vi.getTimerCount()).toBe(0);
  });

  it('can retry a failed batch without retaining its rejected promises', async () => {
    const first = loader.loadAll().catch(error => error);
    images[0].onerror();
    expect(await first).toBeInstanceOf(Error);
    const retry = loader.loadAll();
    images.slice(10).forEach(image => image.onload?.());
    await expect(retry).resolves.toBeUndefined();
    expect(loader.loaded).toBe(true);
    images.slice(1, 10).forEach(image => image.onload?.());
    expect(loader.getSprite('player.run')).toBe(images[11]);
  });

  it('rejects stale startup without clearing readiness on later reloads', async () => {
    const first = loader.loadAll().catch(error => error);
    const second = loader.loadAll();
    images.slice(0, 10).forEach(image => image.onload?.());
    expect(await first).toMatchObject({ name: 'AbortError' });
    expect(loader.loaded).toBe(false);
    images.slice(10).forEach(image => image.onload?.());
    await second;
    expect(loader.loaded).toBe(true);
    const third = loader.loadAll().catch(error => error);
    expect(loader.loaded).toBe(true);
    images[20].onerror();
    expect(await third).toBeInstanceOf(Error);
    expect(loader.loaded).toBe(true);
  });

  it.each([true, false])(
    'keeps the newest requested sprite (old finishes first: %s)',
    async oldFirst => {
      const old = loader.loadSprite('same', 'old.png');
      const latest = loader.loadSprite('same', 'new.png');
      for (const i of oldFirst ? [0, 1] : [1, 0]) {
        images[i].onload?.();
      }
      await Promise.all([old, latest]);
      expect(loader.getSprite('same')).toBe(images[1]);
    }
  );

  it('preserves cached data when a replacement fails and ignores retired success', async () => {
    const initial = loader.loadSprite('same', 'valid.png');
    images[0].onload();
    await initial;
    const retired = loader.loadSprite('same', 'retired.png');
    const replacement = loader
      .loadSprite('same', 'broken.png')
      .catch(error => error);
    images[2].onerror();
    images[1].onload();
    await retired;
    expect(await replacement).toBeInstanceOf(Error);
    expect(loader.getSprite('same')).toBe(images[0]);
  });
});
