import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Game } from '../src/Game.js';
import { Enemy } from '../src/entities/Enemy.js';
import { Projectile } from '../src/entities/Projectile.js';
import { CollisionSystem } from '../src/systems/CollisionSystem.js';

describe('Earliest swept projectile contact', () => {
  let game;
  beforeEach(() => {
    document.body.innerHTML =
      '<canvas id="sweep" width="800" height="400"></canvas>';
    game = new Game('sweep');
    game.createLevel();
    game.boss.x = 2000;
  });
  afterEach(() => {
    game.dispose();
    vi.restoreAllMocks();
  });

  it.each([1, -1])(
    'hits the nearest target once regardless of array order (direction %s)',
    direction => {
      for (const reverse of [false, true]) {
        const near = new Enemy({
          x: direction > 0 ? 50 : 100,
          y: 100,
          speed: 0
        });
        const far = new Enemy({
          x: direction > 0 ? 100 : 50,
          y: 100,
          speed: 0
        });
        game.enemies = reverse ? [far, near] : [near, far];
        game.score = 0;
        const shot = new Projectile(direction > 0 ? 0 : 200, 110, direction);
        shot.speed = 200;
        game.projectiles = [shot];
        game.updateProjectiles(16);
        game.updateProjectiles(16);
        expect(near.alive).toBe(false);
        expect(far.alive).toBe(true);
        expect(game.score).toBe(50);
        expect(game.projectiles).toEqual([]);
      }
    }
  );

  it('sweeps relative target movement through the real Game update', () => {
    const enemy = new Enemy({ x: 100, y: 100, speed: 200 });
    enemy.width = 2;
    enemy.direction = -1;
    game.enemies = [enemy];
    game.platforms = [];
    game.projectiles = [new Projectile(0, 110, 1)];
    game.update(16);
    expect(enemy.alive).toBe(false);
    expect(game.score).toBe(50);
    expect(game.projectiles).toEqual([]);
  });

  it('hits before culling a shot that leaves the viewport margin', () => {
    const enemy = new Enemy({ x: 890, y: 100, speed: 0 });
    game.enemies = [enemy];
    const shot = new Projectile(880, 110, 1);
    shot.speed = 100;
    game.projectiles = [shot];
    game.updateProjectiles(16);
    expect(enemy.alive).toBe(false);
    expect(game.score).toBe(50);
    expect(game.projectiles).toEqual([]);
  });

  it('compares boss and enemy contact times while retaining boss rewards', () => {
    game.boss.x = 50;
    game.boss.y = 100;
    const far = new Enemy({ x: 150, y: 100, speed: 0 });
    game.enemies = [far];
    for (let i = 0; i < 3; i++) {
      const shot = new Projectile(0, 110, 1);
      shot.speed = 200;
      game.projectiles = [shot];
      game.updateProjectiles(16);
      expect(far.alive).toBe(true);
      expect(game.projectiles).toEqual([]);
    }
    expect(game.score).toBe(240);
    expect(game.boss.health).toBe(0);
    expect(game.portal.isLocked).toBe(false);
  });

  it('resolves equal-time contacts by geometry rather than array order', () => {
    const upper = new Enemy({ x: 50, y: 90 });
    const lower = new Enemy({ x: 50, y: 100 });
    const previous = { x: 0, y: 110, width: 10, height: 5 };
    const shot = { ...previous, x: 100 };
    for (const enemies of [
      [lower, upper],
      [upper, lower]
    ]) {
      expect(
        CollisionSystem.checkProjectileCollisions(shot, enemies, null, previous)
          ?.target
      ).toBe(upper);
    }
  });

  it('keeps static overlap callers and excludes dead, separated and grazing targets', () => {
    const enemy = new Enemy({ x: 50, y: 100 });
    const shot = new Projectile(55, 110, 1);
    expect(CollisionSystem.checkProjectileCollisions(shot, [enemy])).toEqual({
      type: 'enemy',
      target: enemy
    });
    const previous = { ...shot, x: 0 };
    for (const patch of [{ alive: false }, { y: 200 }, { y: 115 }]) {
      const target = { ...enemy, ...patch };
      expect(
        CollisionSystem.checkProjectileCollisions(
          { ...shot, x: 100 },
          [target],
          null,
          previous
        )
      ).toBeNull();
    }
  });
});
