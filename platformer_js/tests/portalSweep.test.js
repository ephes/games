import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { Game } from '../src/Game.js';
import { Coin } from '../src/objects/Coin.js';
import { Enemy } from '../src/entities/Enemy.js';
import { BossProjectile } from '../src/entities/BossProjectile.js';
import { Projectile } from '../src/entities/Projectile.js';

let game, next;
beforeEach(() => {
  vi.useFakeTimers();
  document.body.innerHTML =
    '<canvas id="portalSweep" width="800" height="400"></canvas>';
  game = new Game('portalSweep');
  game.createLevel({
    name: 'Synthetic',
    playerStart: { x: 149, y: 0 },
    platforms: [],
    coins: [],
    enemies: [],
    boss: { x: 2000, y: 0, speed: 0 },
    portal: { x: 100, y: 100 }
  });
  game.boss.canShoot = false;
  Object.assign(game.player, { gravity: 0, velocityY: 300 });
  next = vi.spyOn(game, 'loadNextLevel');
});
afterEach(() => {
  game.dispose();
  vi.useRealTimers();
});

it.each([false, true])(
  'sweeps fast vertical entry only when unlocked (%s)',
  locked => {
    game.portal.isLocked = locked;
    game.update(16);
    expect(next).toHaveBeenCalledTimes(locked ? 0 : 1);
    if (!locked) {
      game.update(16);
      expect(next).toHaveBeenCalledTimes(1);
    }
  }
);

it.each([
  { enemyX: 155, level: 1, lives: 3 },
  { enemyX: 130, level: 0, lives: 2 }
])(
  'resolves an open portal and body contact in sweep order ($enemyX)',
  ({ enemyX, level, lives }) => {
    game.portal.unlock();
    game.enemies = [new Enemy({ x: enemyX, y: 149, speed: 0 })];
    const earlyCoin = new Coin(60, 149);
    const lateCoin = new Coin(150, 149);
    game.coins = [earlyCoin, lateCoin];
    Object.assign(game.player, { x: 400, y: 149, velocityY: 0 });

    game.checkCollisions({ x: 0, y: 149 });

    expect(game.currentLevel).toBe(level);
    expect(game.lives).toBe(lives);
    expect(earlyCoin.collected).toBe(true);
    expect(lateCoin.collected).toBe(false);
  }
);

it('keeps ordinary endpoint entry', () => {
  game.portal.unlock();
  Object.assign(game.player, { y: 149, velocityY: 0 });
  game.update(16);
  expect(next).toHaveBeenCalledTimes(1);
});

it('does not enter a portal beyond a platform that stopped the fall', () => {
  game.portal.unlock();
  game.platforms = [{ x: 100, y: 80, width: 128, height: 1 }];
  game.update(16);
  expect(game.player.y).toBe(50);
  expect(next).not.toHaveBeenCalled();
});

it('excludes body respawn teleports and the discarded path', () => {
  game.portal.unlock();
  Object.assign(game.player, {
    x: 400,
    y: 149,
    velocityY: 0,
    respawnPoint: { x: 0, y: 149 }
  });
  game.enemies = [new Enemy({ x: 350, y: 149, speed: 0 })];
  game.checkCollisions({ x: 300, y: 149 });
  expect(game.lives).toBe(2);
  expect(next).not.toHaveBeenCalled();
});

it('excludes boss-shot respawn teleports', () => {
  game.portal.unlock();
  Object.assign(game.player, {
    x: 400,
    y: 149,
    velocityY: 0,
    respawnPoint: { x: 0, y: 149 }
  });
  game.boss.projectiles = [
    new BossProjectile(400, 160, 1, 0, game.camera.bounds)
  ];
  game.update(16);
  expect(game.lives).toBe(2);
  expect(next).not.toHaveBeenCalled();
});

it.each([
  { shotY: 240, level: 1, lives: 3 },
  { shotY: 80, level: 0, lives: 2 }
])(
  'resolves an open portal and a boss shot in sweep order ($shotY)',
  ({ shotY, level, lives }) => {
    game.portal.unlock();
    game.boss.projectiles = [
      new BossProjectile(149, shotY, 1, 0, game.camera.bounds)
    ];

    game.update(16);

    expect(game.currentLevel).toBe(level);
    expect(game.lives).toBe(lives);
  }
);

it('gives a boss shot priority at simultaneous portal entry', () => {
  game.portal.unlock();
  game.player.y = 149;
  game.boss.projectiles = [
    new BossProjectile(149, 149, 1, 0, game.camera.bounds)
  ];

  game.update(16);

  expect(game.lives).toBe(2);
  expect(next).not.toHaveBeenCalled();
});

it('treats rounding-adjacent shot and portal times as a shot-first tie', () => {
  game.portal.unlock();
  game.portal.y = 0;
  game.boss.projectiles = [
    new BossProjectile(149, 40.6, 1, 0, game.camera.bounds)
  ];

  game.update(16);

  expect(game.lives).toBe(2);
  expect(next).not.toHaveBeenCalled();
});

it.each([
  { shotX: 80, bossShot: true, score: 50 },
  { shotX: 10, bossShot: true, score: 0 },
  { shotX: 10, bossShot: false, score: 0 }
])(
  'settles player shot scoring through open portal entry ($shotX, $bossShot)',
  ({ shotX, bossShot, score }) => {
    game.portal.unlock();
    const enemy = new Enemy({ x: 100, y: 40, speed: 0 });
    game.enemies = [enemy];
    const shot = new Projectile(shotX, 50, 1);
    shot.speed = 100;
    game.projectiles = [shot];
    if (bossShot) {
      game.boss.projectiles = [
        new BossProjectile(149, 240, 1, 0, game.camera.bounds)
      ];
    }

    game.update(16);

    expect(game.currentLevel).toBe(1);
    expect(game.lives).toBe(3);
    expect(game.score).toBe(score);
    expect(enemy.alive).toBe(score === 0);
  }
);

it.each([false, true])(
  'ignores body contact with an enemy a player shot retires first (shot: %s)',
  withShot => {
    game.portal.unlock();
    game.enemies = [new Enemy({ x: 149, y: 40, speed: 0 })];
    if (withShot) {
      // The blocking body contact defers entry, even for this late shot.
      const shot = new Projectile(80, 50, 1);
      shot.speed = 75;
      game.projectiles = [shot];
    }
    game.boss.projectiles = [
      new BossProjectile(149, 240, 1, 0, game.camera.bounds)
    ];

    game.update(16);

    expect(game.currentLevel).toBe(withShot ? 1 : 0);
    expect(game.lives).toBe(withShot ? 3 : 2);
    expect(game.score).toBe(withShot ? 50 : 0);
  }
);

it('drops a body-deferred boss shot cleared by a boss-defeating player shot', () => {
  game.portal.unlock();
  game.enemies = [new Enemy({ x: 149, y: 40, speed: 0 })];
  // A stale fireball would settle this coin through its later contact time.
  const coin = new Coin(149, 180);
  game.coins = [coin];
  Object.assign(game.boss, { x: 500, y: 0, health: 1 });
  game.projectiles = [new Projectile(481, 10, 1)];
  game.boss.projectiles = [
    new BossProjectile(149, 240, 1, 0, game.camera.bounds)
  ];

  game.update(16);

  expect(game.boss.alive).toBe(false);
  // Boss defeat plus the blocking stomp; the cleared fireball never hits.
  expect(game.score).toBe(250);
  expect(game.lives).toBe(3);
  expect(coin.collected).toBe(false);
  expect(game.currentLevel).toBe(0);
});

it('keeps a lethal boss shot that precedes a boss-defeating player shot', () => {
  game.lives = 1;
  Object.assign(game.boss, { x: 500, y: 0, health: 1 });
  game.projectiles = [new Projectile(481, 10, 1)];
  game.boss.projectiles = [
    new BossProjectile(149, 40, 1, 0, game.camera.bounds)
  ];

  game.update(16);

  expect(game.boss.alive).toBe(true);
  expect(game.gameOver).toBe(true);
  expect(game.lives).toBe(0);
  expect(next).not.toHaveBeenCalled();
});

it('does not replay a locked crossing after a later stomp unlocks the portal', () => {
  Object.assign(game.boss, { x: 132, y: 300, health: 1 });
  Object.assign(game.player, { x: 149, y: 500, velocityY: 500 });
  game.checkCollisions({ x: 149, y: 0 });
  expect(game.portal.isLocked).toBe(false);
  expect(next).not.toHaveBeenCalled();
});

it('does not replay a locked crossing after a player shot unlocks the portal', () => {
  Object.assign(game.boss, { health: 1 });
  // Contact late in the step, after the fall already crossed the portal.
  game.projectiles = [
    {
      x: game.boss.x,
      y: game.boss.y,
      width: 10,
      height: 10,
      update() {},
      isOutOfBounds: () => false
    }
  ];
  game.update(16);
  expect(game.boss.alive).toBe(false);
  expect(game.portal.isLocked).toBe(false);
  expect(game.player.y).toBeGreaterThan(game.portal.y + game.portal.height);
  expect(next).not.toHaveBeenCalled();
});

it('still enters at the endpoint when a shot unlocks the portal mid-step', () => {
  Object.assign(game.boss, { health: 1 });
  Object.assign(game.player, { y: 149, velocityY: 0 });
  game.projectiles = [
    {
      x: game.boss.x,
      y: game.boss.y,
      width: 10,
      height: 10,
      update() {},
      isOutOfBounds: () => false
    }
  ];
  const boss = game.boss;
  game.update(16);
  // Entering loads the next level, whose new portal starts locked again.
  expect(boss.alive).toBe(false);
  expect(next).toHaveBeenCalledTimes(1);
});

it('does not enter on a tangential path outside the center radius', () => {
  game.portal.unlock();
  // Player center x=203 is 39 px from the portal center (radius=38.4).
  game.player.x = 188;
  game.update(16);
  expect(next).not.toHaveBeenCalled();
});
