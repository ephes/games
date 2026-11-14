import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { Game } from '../src/Game.js';

let game;
beforeEach(() => {
  vi.useFakeTimers();
  document.body.innerHTML = '<canvas id="lifetime"></canvas>';
  game = new Game('lifetime');
  game.createLevel();
});
afterEach(() => {
  game.dispose();
  vi.useRealTimers();
});

it.each(['reset', 'next', 'win', 'dispose'])(
  'retires damage timers on %s',
  action => {
    const retired = game.player;
    retired.makeInvulnerable();
    expect(vi.getTimerCount()).toBe(2);
    if (action === 'reset') game.resetLevel();
    if (action === 'next') game.loadNextLevel();
    if (action === 'win') {
      game.currentLevel = game.levels.length - 1;
      game.loadNextLevel();
    }
    if (action === 'dispose') game.dispose();
    expect(vi.getTimerCount()).toBe(0);
    retired.dispose();
    retired.makeInvulnerable();
    expect(vi.getTimerCount()).toBe(0);
    vi.advanceTimersByTime(3000);
    expect(retired.isInvulnerable).toBe(true);
    expect(retired.isHit).toBe(true);
    if (game.player !== retired) expect(game.player.isInvulnerable).toBe(false);
  }
);

it('keeps current player timers when replacement construction fails', () => {
  const player = game.player;
  player.makeInvulnerable();
  expect(() => game.createLevel({ playerStart: { x: 0, y: 0 } })).toThrow();
  expect(game.player).toBe(player);
  expect(vi.getTimerCount()).toBe(2);
  vi.advanceTimersByTime(500);
  expect(player.isHit).toBe(false);
  expect(player.isInvulnerable).toBe(true);
  vi.advanceTimersByTime(1500);
  expect(player.isInvulnerable).toBe(false);
});
