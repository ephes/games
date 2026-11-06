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

  afterEach(() => vi.unstubAllGlobals());

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
      images[i].onload();
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
        image.onload();
      }
    });
    expect(await outcome).toEqual(
      new Error('Failed to load sprite: assets/sprites/slime-run.png')
    );
    await Promise.all(
      loader.loadPromises.filter((_promise, index) => index !== 5)
    );
    expect(loader.loaded).toBe(false);
    expect(loader.getSprite('player.idle')).toBe(images[0]);
    expect(loader.getSprite('enemy.run')).toBeNull();
  });
});
