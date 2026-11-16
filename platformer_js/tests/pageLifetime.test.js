import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Game } from '../src/Game.js';
import { SpriteLoader } from '../src/systems/SpriteLoader.js';

const settle = () => new Promise(resolve => setTimeout(resolve, 0));
const transition = (type, persisted = true) =>
  window.dispatchEvent(new PageTransitionEvent(type, { persisted }));
const deferred = () => {
  let resolve, reject;
  const promise = new Promise((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
};

describe('Entry-point page lifetime', () => {
  let instances,
    entries,
    frames,
    readyState,
    load,
    errors,
    windowEvents,
    domEvents;
  beforeEach(() => {
    vi.resetModules();
    // Keep the real Game (and input/disposal) across entry-point replacements.
    vi.doMock('../src/Game.js', () => ({ Game }));
    document.body.innerHTML = '<canvas id="gameCanvas"></canvas>';
    instances = [];
    entries = [];
    frames = new Map();
    let nextId = 0;
    vi.stubGlobal('requestAnimationFrame', callback => {
      frames.set(++nextId, callback);
      return nextId;
    });
    vi.stubGlobal('cancelAnimationFrame', id => frames.delete(id));
    readyState = vi
      .spyOn(document, 'readyState', 'get')
      .mockReturnValue('complete');
    load = vi.spyOn(SpriteLoader.prototype, 'loadAll').mockResolvedValue();
    const init = Game.prototype.init;
    vi.spyOn(Game.prototype, 'init').mockImplementation(function () {
      instances.push(this);
      return init.call(this);
    });
    vi.spyOn(Game.prototype, 'render').mockImplementation(() => {});
    errors = vi.spyOn(console, 'error').mockImplementation(() => {});
    windowEvents = vi.spyOn(window, 'addEventListener');
    domEvents = vi.spyOn(document, 'addEventListener');
  });
  afterEach(() => {
    entries.forEach(entry => entry.disposePage?.());
    instances.forEach(game => game.dispose());
    // Also isolate the old entry point when proving failures before the fix.
    for (const [type, callback] of windowEvents.mock.calls) {
      if (type === 'pagehide' || type === 'pageshow') {
        window.removeEventListener(type, callback);
      }
    }
    for (const [type, callback] of domEvents.mock.calls) {
      if (type === 'DOMContentLoaded') {
        document.removeEventListener(type, callback);
      }
    }
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    vi.doUnmock('../src/Game.js');
  });
  async function enter() {
    const entry = await import('../src/main.js');
    entries.push(entry);
    await settle();
    return entry;
  }
  function expectOwners(count) {
    expect(frames.size).toBe(count);
    expect(instances.filter(game => !game.disposed)).toHaveLength(count);
    expect(instances.filter(game => game.inputManager.enabled)).toHaveLength(
      count
    );
  }

  it.each([false, true])(
    'retires a running page (persisted=%s)',
    async persisted => {
      await enter();
      expectOwners(1);
      const stale = frames.values().next().value;
      const first = instances[0];
      first.canvas.focus();
      first.canvas.dispatchEvent(
        new KeyboardEvent('keydown', {
          key: 'ArrowRight',
          bubbles: true
        })
      );
      expect(first.inputManager.getKeys().ArrowRight).toBe(true);
      transition('pagehide', persisted);
      expectOwners(0);
      expect(first.inputManager.getKeys()).toEqual({});
      stale(1000);
      expectOwners(0);
      transition('pageshow', persisted);
      await settle();
      expectOwners(persisted ? 1 : 0);
      if (persisted) {
        expect(instances).toHaveLength(2);
        expect(instances[1].score).toBe(0);
        transition('pageshow');
        await settle();
        expect(instances).toHaveLength(2);
        expectOwners(1);
      }
    }
  );

  it.each(['resolve', 'reject'])(
    'fences a retired pending init that later %ss',
    async outcome => {
      const pending = deferred();
      load.mockReturnValueOnce(pending.promise);
      await enter();
      const retired = instances[0];
      transition('pagehide');
      expect(retired.disposed).toBe(true);
      expect(retired.spriteController.signal.aborted).toBe(true);
      transition('pageshow');
      await settle();
      expectOwners(1);
      pending[outcome](new Error('synthetic retired startup'));
      await settle();
      expectOwners(1);
      expect(retired.initialized).toBe(false);
      expect(errors).not.toHaveBeenCalled();
    }
  );

  it('releases failed re-entry and retries only after another retirement', async () => {
    await enter();
    transition('pagehide');
    const failure = new Error('synthetic restored-page failure');
    load.mockRejectedValueOnce(failure);
    transition('pageshow');
    await settle();
    expect(instances).toHaveLength(2);
    expectOwners(0);
    expect(errors).toHaveBeenCalledWith('Failed to initialize game:', failure);
    transition('pageshow');
    await settle();
    expect(instances).toHaveLength(2);
    transition('pagehide');
    transition('pageshow');
    await settle();
    expect(instances).toHaveLength(3);
    expectOwners(1);
  });

  it('waits for DOM readiness, even after a hide/restore before DOMContentLoaded', async () => {
    readyState.mockReturnValue('loading');
    await enter();
    expect(instances).toHaveLength(0);
    transition('pagehide');
    readyState.mockReturnValue('complete');
    document.dispatchEvent(new Event('DOMContentLoaded'));
    await settle();
    expect(instances).toHaveLength(0);
    transition('pageshow');
    await settle();
    expectOwners(1);
    document.dispatchEvent(new Event('DOMContentLoaded'));
    await settle();
    expect(instances).toHaveLength(1);
  });

  it('restores before DOM readiness without starting until DOMContentLoaded', async () => {
    readyState.mockReturnValue('loading');
    await enter();
    transition('pagehide');
    transition('pageshow');
    await settle();
    expect(instances).toHaveLength(0);
    readyState.mockReturnValue('complete');
    document.dispatchEvent(new Event('DOMContentLoaded'));
    await settle();
    expectOwners(1);
  });

  it.each(['loading', 'pending', 'running'])(
    'replaces a %s entry without old owners',
    async state => {
      const pending = deferred();
      if (state === 'loading') {
        readyState.mockReturnValue('loading');
      } else if (state === 'pending') {
        load.mockReturnValueOnce(pending.promise);
      }
      const old = await enter();
      old.disposePage();
      old.disposePage();
      expectOwners(0);
      readyState.mockReturnValue('complete');
      vi.resetModules();
      await enter();
      document.dispatchEvent(new Event('DOMContentLoaded'));
      transition('pageshow');
      pending.resolve();
      await settle();
      expectOwners(1);
      expect(instances).toHaveLength(state === 'loading' ? 1 : 2);
      expect(errors).not.toHaveBeenCalled();
    }
  );
});
