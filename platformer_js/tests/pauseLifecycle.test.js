import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { Game } from '../src/Game.js';

let game, frames, nextId, now;
beforeEach(async () => {
  document.body.innerHTML = '<canvas id="pause"></canvas><input id="editor">';
  frames = new Map();
  nextId = 0;
  now = 0;
  vi.stubGlobal('requestAnimationFrame', callback => {
    frames.set(++nextId, callback);
    return nextId;
  });
  vi.stubGlobal('cancelAnimationFrame', id => frames.delete(id));
  vi.spyOn(performance, 'now').mockImplementation(() => now);
  game = new Game('pause');
  for (const method of ['translate', 'stroke', 'moveTo', 'lineTo']) {
    game.ctx[method] = vi.fn();
  }
  vi.spyOn(game.spriteLoader, 'loadAll').mockResolvedValue();
  await game.init();
  game.enemies = [];
  game.coins = [];
  game.boss.canShoot = false;
  game.player.gravity = 0;
  game.canShoot = true;
  game.canvas.focus();
  game.start();
});
afterEach(() => {
  game.dispose();
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
function key(key, type = 'keydown', repeat = false) {
  document.activeElement.dispatchEvent(
    new KeyboardEvent(type, { key, repeat, bubbles: true, cancelable: true })
  );
}
function escape() {
  key('Escape');
  key('Escape', 'keyup');
}
function frame(time) {
  now = time;
  expect(frames.size).toBe(1);
  const [id, callback] = frames.entries().next().value;
  frames.delete(id);
  callback(time);
  expect(frames.size).toBe(1);
}

it.each([
  ['gameWon', 'drawWinScreen'],
  ['gameOver', 'drawGameOver']
])('skips terminal ticks for %s while rendering the overlay', (state, draw) => {
  const update = vi.spyOn(game, 'update').mockImplementationOnce(() => {
    game[state] = true;
  });
  const overlay = vi.spyOn(game.renderer, draw);
  frame(100); // The first step ends the run with several steps still queued.
  expect(update).toHaveBeenCalledTimes(1);
  expect(game.accumulator).toBe(0);
  expect(overlay).toHaveBeenCalledTimes(1);

  update.mockClear();
  game.accumulator = 100;
  frame(200);
  expect(update).not.toHaveBeenCalled();
  expect(game.accumulator).toBe(0);
  expect(overlay).toHaveBeenCalledTimes(2);

  expect(game.resetLevel()).toBe(true);
  frame(300);
  expect(update).not.toHaveBeenCalled();
  frame(320);
  expect(update).toHaveBeenCalledTimes(1);
});

it('pauses real Escape input, simulation and shots; resumes once without held input or catch-up', () => {
  key('ArrowRight');
  frame(10); // Retire even this partial fixed step on pause.
  escape();
  expect(game.paused).toBe(true);
  const x = game.player.x;
  const phase = game.portal.pulseTime;
  const update = vi.spyOn(game, 'update');
  const text = vi.spyOn(game.renderer, 'drawText');
  key('Escape', 'keydown', true);
  expect(game.paused).toBe(true);
  key(' ', 'keydown');
  game.shoot();
  frame(100);
  expect(update).not.toHaveBeenCalled();
  game.update(1000); // Direct callers obey pause too.
  expect(game.player.x).toBe(x);
  expect(game.portal.pulseTime).toBe(phase);
  expect(game.projectiles).toHaveLength(0);
  expect(
    text.mock.calls.some(([value]) => value === 'Paused - Esc to resume')
  ).toBe(true);
  escape();
  expect(game.paused).toBe(false);
  game.start();
  frame(20000); // The first resumed frame establishes a fresh baseline.
  expect(game.portal.pulseTime).toBe(phase);
  key('ArrowRight', 'keydown', true); // Retired held key cannot reappear on repeat.
  frame(20020);
  expect(game.player.x).toBe(x);
  key('ArrowRight', 'keyup');
  key('ArrowRight');
  frame(20040);
  expect(game.player.x).toBeGreaterThan(x);
  key(' ', 'keyup');
  key(' ');
  expect(game.projectiles).toHaveLength(1);
});

it('preserves manual pause across focus and visibility changes and resets clocks on return', () => {
  escape();
  document.querySelector('#editor').focus();
  escape();
  window.dispatchEvent(new Event('blur'));
  vi.spyOn(document, 'hidden', 'get').mockReturnValue(true);
  document.dispatchEvent(new Event('visibilitychange'));
  frame(100);
  const phase = game.portal.pulseTime;
  expect(game.paused).toBe(true);
  vi.spyOn(document, 'hidden', 'get').mockReturnValue(false);
  document.dispatchEvent(new Event('visibilitychange'));
  game.canvas.focus();
  escape();
  frame(200);
  expect(game.portal.pulseTime).toBe(phase);
  frame(220);
  expect(game.portal.pulseTime).toBeGreaterThan(phase);
  // Even short hidden intervals, below the existing 250 ms cutoff, are discarded.
  vi.spyOn(document, 'hidden', 'get').mockReturnValue(true);
  document.dispatchEvent(new Event('visibilitychange'));
  const hiddenPhase = game.portal.pulseTime;
  frame(240);
  expect(game.portal.pulseTime).toBe(hiddenPhase);
  vi.spyOn(document, 'hidden', 'get').mockReturnValue(false);
  document.dispatchEvent(new Event('visibilitychange'));
  frame(260);
  expect(game.portal.pulseTime).toBe(hiddenPhase);
  frame(280);
  expect(game.portal.pulseTime).toBeGreaterThan(hiddenPhase);
});

it.each(['uninterrupted', 'paused', 'hidden'])(
  'preserves hit state and damage eligibility at the same step when %s',
  mode => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    game.lives = game.player.takeDamage(game.lives);
    const step = 1000 / 60;
    for (let tick = 1; tick <= 15; tick++) {
      vi.advanceTimersByTime(step);
      frame(tick * step);
    }

    let resumedAt = 15 * step;
    if (mode !== 'uninterrupted') {
      if (mode === 'paused') {
        escape();
      } else {
        vi.spyOn(document, 'hidden', 'get').mockReturnValue(true);
        document.dispatchEvent(new Event('visibilitychange'));
      }
      vi.advanceTimersByTime(3000);
      resumedAt += 3000;
      frame(resumedAt);
      if (mode === 'paused') {
        escape();
      } else {
        vi.spyOn(document, 'hidden', 'get').mockReturnValue(false);
        document.dispatchEvent(new Event('visibilitychange'));
      }
      frame(resumedAt);
    }

    frame(resumedAt + step);
    expect(game.player.isHit).toBe(true);
    expect(game.player.takeDamage(game.lives)).toBe(2);
  }
);

it('restarts into play only on successful reset and retires a paused loop on disposal', async () => {
  await game.init();
  expect(game.inputManager.listeners.get('pause:down')).toHaveLength(1);
  escape();
  const create = vi.spyOn(game, 'createLevel').mockImplementationOnce(() => {
    throw Error('synthetic invalid level');
  });
  expect(() => game.resetLevel()).toThrow('synthetic invalid level');
  expect(game.paused).toBe(true);
  create.mockRestore();
  expect(game.resetLevel()).toBe(true);
  expect(game.paused).toBe(false);
  frame(100);
  expect(game.portal.pulseTime).toBe(0);
  escape();
  const stale = frames.values().next().value;
  game.dispose();
  stale(120);
  game.start();
  escape();
  expect(frames.size).toBe(0);
  expect(game.inputManager.listeners.size).toBe(0);
  game.accumulator = 7;
  game.lastTime = 123;
  window.dispatchEvent(new Event('blur'));
  window.dispatchEvent(new Event('focus'));
  game.canvas.dispatchEvent(new Event('blur'));
  document.dispatchEvent(new Event('visibilitychange'));
  expect(game.accumulator).toBe(7);
  expect(game.lastTime).toBe(123);
});
