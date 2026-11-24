import { afterEach, beforeEach, expect, it } from 'vitest';
import { Game } from '../src/Game.js';

let game;
beforeEach(() => {
  document.body.innerHTML = '<canvas id="lifetime"></canvas>';
  game = new Game('lifetime');
  game.createLevel();
});
afterEach(() => {
  game.dispose();
});

it.each(['reset', 'next', 'win', 'dispose'])(
  'retires recovery counters on %s',
  action => {
    const retired = game.player;
    retired.makeInvulnerable();
    if (action === 'reset') {
      game.resetLevel();
    }
    if (action === 'next') {
      game.loadNextLevel();
    }
    if (action === 'win') {
      game.currentLevel = game.levels.length - 1;
      game.loadNextLevel();
    }
    if (action === 'dispose') {
      game.dispose();
    }
    expect(retired.disposed).toBe(true);
    retired.dispose();
    retired.makeInvulnerable();
    retired.update({}, 3000);
    expect(retired.isInvulnerable).toBe(true);
    expect(retired.isHit).toBe(true);
    if (game.player !== retired) {
      expect(game.player.isInvulnerable).toBe(false);
    }
  }
);

it('keeps current player recovery counters when replacement construction fails', () => {
  const player = game.player;
  player.makeInvulnerable();
  expect(() => game.createLevel({ playerStart: { x: 0, y: 0 } })).toThrow();
  expect(game.player).toBe(player);
  player.update({}, 500);
  expect(player.isHit).toBe(false);
  expect(player.isInvulnerable).toBe(true);
  player.update({}, 1500);
  expect(player.isInvulnerable).toBe(false);
});
