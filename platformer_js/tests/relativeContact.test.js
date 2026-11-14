import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { Game } from '../src/Game.js';
import { Enemy } from '../src/entities/Enemy.js';
import { BossProjectile } from '../src/entities/BossProjectile.js';
import { CollisionSystem } from '../src/systems/CollisionSystem.js';

let game;
beforeEach(() => {
  vi.useFakeTimers();
  document.body.innerHTML =
    '<canvas id="contact" width="800" height="400"></canvas>';
  game = new Game('contact');
  game.createLevel();
  game.platforms = [];
  game.coins = [];
  game.enemies = [];
  game.player.x = 100;
  game.player.y = 100;
  game.player.gravity = 0;
  game.boss.x = 2000;
  game.boss.canShoot = false;
});
afterEach(() => {
  game.dispose();
  vi.useRealTimers();
});

it('hits a moving player before a fast boss shot is culled', () => {
  const shot = new BossProjectile(0, 110, 1, 2000, game.camera.bounds);
  game.boss.projectiles = [shot];
  game.inputManager.keys.ArrowRight = true;
  game.update(16);
  expect(game.lives).toBe(2);
  expect(shot.active).toBe(false);
  expect(game.boss.projectiles).toHaveLength(0);
  game.update(16);
  expect(game.lives).toBe(2);
});

it('sweeps opposing shot/player motion with no final overlap', () => {
  game.player.x = 300;
  game.player.speed = 200;
  game.inputManager.keys.ArrowLeft = true;
  const shot = new BossProjectile(0, 110, 1, 200, game.camera.bounds);
  game.boss.projectiles = [shot];
  game.update(16);
  expect(game.lives).toBe(2);
  expect(shot.active).toBe(false);
  game.update(16);
  expect(game.lives).toBe(2);
});

it.each(['grazing', 'away', 'protected', 'lethal'])(
  'preserves boss shot policy: %s',
  kind => {
    const shot = new BossProjectile(
      kind === 'away' ? 200 : 0,
      kind === 'grazing' ? 130 : 110,
      1,
      300,
      game.camera.bounds
    );
    game.boss.projectiles = [shot];
    if (kind === 'protected') {
      game.player.makeInvulnerable();
    }
    if (kind === 'lethal') {
      game.lives = 1;
    }
    game.update(16);
    expect(game.lives).toBe(kind === 'lethal' ? 0 : 3);
    expect(game.gameOver).toBe(kind === 'lethal');
    if (kind === 'lethal') {
      expect(vi.getTimerCount()).toBe(0);
    }
  }
);

it.each([1, 4])('stomps a moving enemy once with %s subdivisions', steps => {
  const enemy = new Enemy({ x: 105, y: 100, speed: 20 / steps });
  game.enemies = [enemy];
  game.player.y = 0;
  game.player.velocityY = 180 / steps;
  for (let n = 0; n < steps; n++) {
    game.update(16 / steps);
  }
  expect(game.score).toBe(50);
  expect(game.lives).toBe(3);
  expect(enemy.alive).toBe(false);
  game.update(16);
  expect(game.score).toBe(50);
});

it.each([1, 4])(
  'treats falling side entry as damage with %s subdivisions',
  steps => {
    game.player.x = 60;
    game.player.y = 65;
    game.player.speed = 20 / steps;
    game.player.velocityY = 10 / steps;
    game.inputManager.keys.ArrowRight = true;
    const enemy = new Enemy({ x: 100, y: 90, speed: 0 });
    game.enemies = [enemy];
    for (let n = 0; n < steps; n++) {
      game.update(16 / steps);
    }
    expect(game.lives).toBe(2);
    expect(game.score).toBe(0);
    expect(enemy.alive).toBe(true);
  }
);

it.each([true, false])(
  'checks the moving boss head at first contact (head %s)',
  head => {
    game.boss.x = 100;
    game.boss.y = 100;
    game.boss.baseSpeed = 20;
    game.player.x = head ? 125 : 90;
    game.player.y = 0;
    game.player.velocityY = 200;
    game.update(16);
    expect(game.score).toBe(head ? 20 : 0);
    expect(game.lives).toBe(head ? 3 : 2);
  }
);

it('classifies an enemy moving upward through the player by relative top crossing', () => {
  const player = { x: 100, y: 30, width: 30, height: 30, velocityY: 0 };
  const enemy = { x: 100, y: 0, width: 44, height: 32, alive: true };
  expect(
    CollisionSystem.checkEnemyCollision(
      player,
      enemy,
      { x: 100, y: 30 },
      { x: 100, y: 100 }
    )
  ).toBe('stomp');
});
