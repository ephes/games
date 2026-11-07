import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { World } from 'ldtk';
import { Game } from '../src/Game.js';
import { Boss } from '../src/entities/Boss.js';
import { BossProjectile } from '../src/entities/BossProjectile.js';
import { Enemy } from '../src/entities/Enemy.js';
import { Player } from '../src/entities/Player.js';
import { CollisionSystem } from '../src/systems/CollisionSystem.js';

const level = (x = 500, y = 40) => ({
  name: 'Synthetic level',
  playerStart: { x, y },
  platforms: [{ x: 0, y: 350, width: 1600, height: 50 }],
  coins: [],
  enemies: [],
  boss: { x: 1200, y: 254, platformIndex: 0 },
  portal: { x: 1000, y: 200 }
});

const world = (x = 600, y = 80) => ({
  levels: [
    {
      identifier: 'Replacement',
      fieldInstances: [],
      layerInstances: [
        {
          __identifier: 'Entities',
          entityInstances: [
            { __identifier: 'Player', px: [x, y], fieldInstances: [] },
            { __identifier: 'Boss', px: [1200, 254], fieldInstances: [] },
            { __identifier: 'Portal', px: [1000, 200], fieldInstances: [] }
          ]
        }
      ]
    }
  ]
});

describe('Stable boss collision kind', () => {
  it.each(['Boss', 'a'])(
    'keeps the head rule with constructor name %s',
    name => {
      const boss = new Boss({ x: 100, y: 100 });
      // Rename the actual constructor as a minifier does; restore after the probe.
      const originalName = Boss.name;
      Object.defineProperty(Boss, 'name', { value: name, configurable: true });
      try {
        const player = new Player(85, 75);
        player.velocityY = 10;
        expect(CollisionSystem.checkEnemyCollision(player, boss)).toBe(
          'damage'
        );
        player.x = boss.x + boss.width / 2 - player.width / 2;
        expect(CollisionSystem.checkEnemyCollision(player, boss)).toBe('stomp');
        player.y = 95;
        player.velocityY = 30;
        expect(CollisionSystem.checkEnemyCollision(player, boss)).toBe(
          'damage'
        );
      } finally {
        Object.defineProperty(Boss, 'name', {
          value: originalName,
          configurable: true
        });
      }
    }
  );

  it('keeps ordinary enemy stomps outside the boss head zone', () => {
    const player = new Player(85, 75);
    player.velocityY = 10;
    expect(
      CollisionSystem.checkEnemyCollision(player, new Enemy({ x: 100, y: 100 }))
    ).toBe('stomp');
  });
});

describe('Playable level state', () => {
  let game;
  beforeEach(() => {
    vi.useFakeTimers();
    document.body.innerHTML =
      '<canvas id="playable" width="800" height="400"></canvas>';
    game = new Game('playable');
    vi.spyOn(game.spriteLoader, 'getSprite').mockReturnValue(null);
    game.levels = [level(), level(300, 120), level(700, 90)];
    game.totalLevels = game.levels.length;
    game.createLevel();
  });
  afterEach(() => {
    game.dispose();
    vi.clearAllTimers();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  function expectRespawn(x, y) {
    game.player.x = 900;
    game.player.y = 300;
    game.player.velocityY = 8;
    game.player.isJumping = true;
    game.lives = game.player.takeDamage(game.lives);
    expect([game.player.x, game.player.y]).toEqual([x, y]);
    expect(game.player.velocityY).toBe(0);
    expect(game.player.isJumping).toBe(false);
    expect(game.lives).toBe(2);
    expect(game.player.isInvulnerable).toBe(true);
    expect(game.player.takeDamage(game.lives)).toBe(2);
    vi.advanceTimersByTime(2000);
    expect(game.player.isInvulnerable).toBe(false);
  }

  it('respawns at the active level start before and after a transition', () => {
    expectRespawn(500, 40);
    const firstPlayer = game.player;
    game.loadNextLevel();
    expect(game.player).not.toBe(firstPlayer);
    game.lives = 3;
    expectRespawn(300, 120);
  });

  it('respawns at the converted LDtk start', async () => {
    vi.spyOn(World, 'fromURL').mockResolvedValue(world());
    await expect(game.loadLDtkLevels('synthetic.ldtk')).resolves.toBe(true);
    expectRespawn(600, 80);
  });

  it('selects level zero when a shorter replacement lacks the current index', async () => {
    game.loadNextLevel();
    game.loadNextLevel();
    const oldPlayer = game.player;
    vi.spyOn(World, 'fromURL').mockResolvedValue(world());
    await expect(game.loadLDtkLevels('synthetic.ldtk')).resolves.toBe(true);
    expect(game.currentLevel).toBe(0);
    expect(game.totalLevels).toBe(1);
    expect(game.levels[0].name).toBe('Replacement');
    expect(game.player).not.toBe(oldPlayer);
    expect([game.player.x, game.player.y]).toEqual([600, 80]);
    expect(game.camera.x).toBe(0);
  });

  it('retains a current index still present in the replacement', async () => {
    game.loadNextLevel();
    const replacement = world();
    replacement.levels.push(world(240, 60).levels[0]);
    vi.spyOn(World, 'fromURL').mockResolvedValue(replacement);
    await expect(game.loadLDtkLevels('synthetic.ldtk')).resolves.toBe(true);
    expect(game.currentLevel).toBe(1);
    expect([game.player.x, game.player.y]).toEqual([240, 60]);
  });

  it.each(['load', 'conversion', 'construction', 'empty'])(
    'preserves prior playable state after replacement %s failure',
    async failure => {
      game.loadNextLevel();
      game.score = 150;
      game.canShoot = true;
      game.projectiles.push({ x: 20, y: 30 });
      game.camera.x = 150;
      game.ldtkLoader.world = world(300, 120);
      const previousWorld = game.ldtkLoader.world;
      const before = { ...game };
      const bounds = game.camera.bounds;
      const fromURL = vi.spyOn(World, 'fromURL').mockResolvedValue(world());
      const errorLog = vi.spyOn(console, 'error').mockImplementation(() => {});
      let fault;
      if (failure === 'load') {
        fromURL.mockRejectedValue(new Error('Synthetic load failure'));
      } else if (failure === 'conversion') {
        fault = vi
          .spyOn(game.ldtkLoader, 'convertLevel')
          .mockImplementation(() => {
            throw new Error('Synthetic conversion failure');
          });
      } else if (failure === 'construction') {
        // This runs after player, platforms, enemies and boss construction.
        fault = game.spriteLoader.getSprite.mockImplementation(() => {
          throw new Error('Synthetic sprite failure');
        });
      } else {
        fromURL.mockResolvedValue({ levels: [] });
      }
      const result = await game.loadLDtkLevels('synthetic.ldtk');
      if (fault) {
        expect(fault).toHaveBeenCalled();
      }
      for (const key of [
        'levels',
        'totalLevels',
        'currentLevel',
        'player',
        'platforms',
        'coins',
        'enemies',
        'boss',
        'portal',
        'projectiles',
        'score',
        'lives',
        'canShoot',
        'gameOver',
        'gameWon'
      ]) {
        expect(game[key]).toBe(before[key]);
      }
      expect(game.projectiles).toHaveLength(1);
      expect(game.camera.bounds).toBe(bounds);
      expect(game.camera.x).toBe(150);
      expect(game.ldtkLoader.world).toBe(previousWorld);
      expect(result).toBe(false);
      if (failure !== 'empty') {
        expect(errorLog).toHaveBeenCalled();
      }
    }
  );

  function overlapExit(hazard) {
    game.portal.unlock();
    // Put the exit at the real respawn point: a later check would advance.
    game.portal.x = game.player.x - 49;
    game.portal.y = game.player.y - 49;
    const config = { x: game.player.x, y: game.player.y, platformIndex: 0 };
    if (hazard === 'enemy') {
      game.enemies = [new Enemy(config)];
    } else if (hazard === 'boss') {
      game.boss = new Boss(config);
    } else if (hazard === 'projectile') {
      game.boss.projectiles.push(
        new BossProjectile(game.player.x, game.player.y, 1, 0)
      );
    }
  }

  it.each(['enemy', 'boss', 'projectile'])(
    'ends the update immediately on lethal %s contact at the exit',
    hazard => {
      // One level ensures an accidental transition would also incorrectly win.
      game.levels = [level(1049, 249)];
      game.totalLevels = 1;
      game.resetLevel();
      overlapExit(hazard);
      game.lives = 1;
      const portalCheck = vi.spyOn(CollisionSystem, 'checkPortalEntry');
      const projectileUpdate = vi.spyOn(game, 'updateProjectiles');
      const collisions = vi.spyOn(game, 'checkCollisions');
      game.update(16);
      expect(game.lives).toBe(0);
      expect(game.gameOver).toBe(true);
      expect(game.currentLevel).toBe(0);
      expect(game.gameWon).toBe(false);
      expect(portalCheck).not.toHaveBeenCalled();
      if (hazard === 'projectile') {
        expect(projectileUpdate).not.toHaveBeenCalled();
        expect(collisions).not.toHaveBeenCalled();
      }
    }
  );

  it.each(['enemy', 'boss', 'projectile', 'none'])(
    'allows portal entry after surviving %s contact',
    hazard => {
      overlapExit(hazard);
      game.update(16);
      expect(game.gameOver).toBe(false);
      expect(game.currentLevel).toBe(1);
      expect(game.lives).toBe(hazard === 'none' ? 3 : 2);
    }
  );
});
