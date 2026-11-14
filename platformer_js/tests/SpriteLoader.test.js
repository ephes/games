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
      }
    );
    loader = new SpriteLoader();
  });

  afterEach(() => {
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
    const before = [...loader.sprites];
    const replacement = loader.loadAll().catch(error => error);
    images[10].onload();
    expect([...loader.sprites]).toEqual(before);
    const late = images.slice(12).map(image => image.onload);
    images[11].onerror();
    await replacement;
    late.forEach(onload => onload());
    expect([...loader.sprites]).toEqual(before);
    expect(loader.loaded).toBe(false);
  });

  it.each([true, false])(
    'publishes only the latest complete batch (old first: %s)',
    async oldFirst => {
      const first = loader.loadAll().catch(error => error);
      const retiredLoads = images.map(image => image.onload);
      const second = loader.loadAll();
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
      });
      const retry = loader.loadAll();
      images.slice(10).forEach(image => image.onload?.());
      await retry;
      lateLoad();
      expect(loader.getSprite('player.idle')).toBe(images[10]);
      expect(vi.getTimerCount()).toBe(0);
    }
  );

  it('keeps a direct request authoritative over an overlapping batch', async () => {
    const batch = loader.loadAll();
    const direct = loader.loadSprite('player.idle', 'direct.png');
    images.forEach(image => image.onload?.());
    await Promise.all([batch, direct]);
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

  it('only the current batch can mark the loader complete', async () => {
    const first = loader.loadAll().catch(error => error);
    const second = loader.loadAll();
    images.slice(0, 10).forEach(image => image.onload?.());
    await first;
    expect(loader.loaded).toBe(false);
    images.slice(10).forEach(image => image.onload?.());
    await second;
    expect(loader.loaded).toBe(true);
    const third = loader.loadAll().catch(error => error);
    expect(loader.loaded).toBe(false);
    images[20].onerror();
    expect(await third).toBeInstanceOf(Error);
    expect(loader.loaded).toBe(false);
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
