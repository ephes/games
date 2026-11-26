import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Game } from '../src/Game.js';
import { GAME_CONFIG } from '../src/utils/constants.js';
import { mockWorldFetch } from './worldFetch.js';

vi.mock('../src/systems/LDtkLoader.js', async importOriginal => {
  const actual = await importOriginal();
  return { ...actual, WORLD_LIMITS: { ...actual.WORLD_LIMITS, platforms: 5 } };
});
const world = () => ({
  levels: [
    {
      identifier: 'Synthetic',
      fieldInstances: [],
      layerInstances: [
        {
          __identifier: 'Platforms',
          __gridSize: 64,
          __cWid: 3,
          __cHei: 1,
          intGridCsv: [1, 0, 1]
        },
        {
          __identifier: 'Entities',
          entityInstances: [
            { __identifier: 'Player', px: [10, 10], fieldInstances: [] },
            { __identifier: 'Boss', px: [0, 0], fieldInstances: [] },
            { __identifier: 'Portal', px: [10, 10], fieldInstances: [] }
          ]
        }
      ]
    }
  ]
});
let game;
beforeEach(async () => {
  vi.useFakeTimers();
  document.body.innerHTML =
    '<canvas id="recovery" width="800" height="400"></canvas>';
  game = new Game('recovery');
  game.spriteLoader.loadAll = async () => {};
  await game.init();
  mockWorldFetch().mockResolvedValue(world());
  vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => {
  game.dispose();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('Repeated world admission', () => {
  it('refuses the first cumulative platform overrun without publishing anything', async () => {
    expect(await game.loadLDtkLevels('synthetic')).toBe(true);
    await game.addLDtkLevels('synthetic');
    expect(game.levels).toHaveLength(2);
    const boundary = world();
    boundary.levels[0].layerInstances[0].intGridCsv = [1, 1, 1];
    mockWorldFetch().mockResolvedValueOnce(boundary).mockResolvedValue(world());
    await game.addLDtkLevels('exact-boundary');
    expect(game.levels).toHaveLength(3);
    const previousWorld = game.ldtkLoader.world;
    const before = { ...game };
    const bounds = game.camera.bounds;
    game.camera.x = 35;
    const accepted = await game.addLDtkLevels('synthetic');
    for (const key of [
      'levels',
      'player',
      'boss',
      'platforms',
      'currentLevel',
      'totalLevels',
      'projectiles'
    ]) {
      expect(game[key]).toBe(before[key]);
    }
    expect(accepted).toBe(false);
    expect(game.ldtkLoader.world).toBe(previousWorld);
    expect(game.camera.bounds).toBe(bounds);
    expect(game.camera.x).toBe(35);
    expect(console.error.mock.calls.at(-1)[1].message).toMatch(
      /platform budget/
    );
  });
});

describe('Terminal level recovery', () => {
  it('continues a won campaign at the first appended level', async () => {
    expect(await game.loadLDtkLevels('original')).toBe(true);
    game.score = 125;
    game.canShoot = true;
    game.lastShotTime = 12;
    game.loadNextLevel();
    const winner = game.player;
    expect(game.gameWon).toBe(true);
    expect(winner.disposed).toBe(true);

    const appended = world();
    appended.levels[0].identifier = 'Appended';
    mockWorldFetch().mockResolvedValue(appended);
    expect(await game.addLDtkLevels('extension')).toBe(true);
    expect(game.totalLevels).toBe(2);
    expect(game.currentLevel).toBe(1);
    expect(game.levels[game.currentLevel].name).toBe('Appended');
    expect(game.gameWon).toBe(false);
    expect(game.player).not.toBe(winner);
    expect(game.player.disposed).toBe(false);
    expect([game.score, game.canShoot, game.lastShotTime]).toEqual([
      125,
      true,
      12
    ]);
    const update = vi.spyOn(game.player, 'update');
    game.update(16);
    expect(update).toHaveBeenCalledOnce();
  });

  it('retains the won campaign when constructing an appended level fails', async () => {
    expect(await game.loadLDtkLevels('original')).toBe(true);
    game.loadNextLevel();
    const previousWorld = game.ldtkLoader.world;
    const { levels, player } = game;
    vi.spyOn(game.spriteLoader, 'getSprite').mockImplementationOnce(() => {
      throw new Error('Synthetic portal sprite failure');
    });

    expect(await game.addLDtkLevels('extension')).toBe(false);
    expect(game.ldtkLoader.world).toBe(previousWorld);
    expect(game.levels).toBe(levels);
    expect(game.totalLevels).toBe(1);
    expect(game.currentLevel).toBe(1);
    expect(game.player).toBe(player);
    expect(game.gameWon).toBe(true);
    expect(await game.addLDtkLevels('extension')).toBe(true);
    expect(game.gameWon).toBe(false);
  });

  it.each(['won', 'lost'])(
    'restores play after %s via replacement and reset',
    async terminal => {
      expect(await game.loadLDtkLevels('original')).toBe(true);
      for (const action of ['replace', 'reset']) {
        game.score = 125;
        game.canShoot = true;
        game.lastShotTime = 12;
        game.projectiles.push({ synthetic: true });
        game.boss.projectiles.push({ synthetic: true });
        const player = game.player;
        player.makeInvulnerable();
        if (terminal === 'won') {
          game.currentLevel = game.levels.length - 1;
          game.loadNextLevel();
        } else {
          game.lives = 0;
          game.gameOver = true;
          player.dispose();
        }
        if (action === 'replace') {
          const replacement = world();
          replacement.levels.push({
            ...replacement.levels[0],
            identifier: 'Second'
          });
          mockWorldFetch().mockResolvedValue(replacement);
          expect(await game.loadLDtkLevels('synthetic')).toBe(true);
        } else {
          expect(game.resetLevel()).toBe(true);
        }
        expect(game.gameOver || game.gameWon).toBe(false);
        expect(game.lives).toBe(GAME_CONFIG.INITIAL_LIVES);
        expect(game.player).not.toBe(player);
        expect(game.player.disposed).toBe(false);
        expect(game.projectiles).toEqual([]);
        expect(game.boss.projectiles).toEqual([]);
        expect(vi.getTimerCount()).toBe(0);
        const newRun = terminal === 'won';
        expect([game.score, game.canShoot, game.lastShotTime]).toEqual(
          newRun ? [0, false, -GAME_CONFIG.SHOT_COOLDOWN] : [125, true, 12]
        );
        expect(game.currentLevel).toBe(0);
        const update = vi.spyOn(game.player, 'update');
        game.update(16);
        expect(update).toHaveBeenCalledOnce();
        update.mockRestore();
      }
    }
  );

  it('preserves score and shooting progress on replacement during active play', async () => {
    game.score = 125;
    game.canShoot = true;
    game.lastShotTime = 12;
    expect(await game.loadLDtkLevels('synthetic')).toBe(true);
    expect([game.score, game.canShoot, game.lastShotTime]).toEqual([
      125,
      true,
      12
    ]);
  });
  it('requires a new power-up and allows an immediate shot after earning it again', () => {
    vi.spyOn(performance, 'now').mockReturnValue(1000);
    game.levels = [
      {
        playerStart: { x: 40, y: 50 },
        platforms: [],
        coins: [{ x: 40, y: 50, isPowerUp: true }],
        enemies: [],
        boss: { x: 600, y: 200 },
        portal: { x: 700, y: 200 }
      }
    ];
    game.totalLevels = 1;
    game.resetLevel();
    game.checkCollisions();
    game.shoot();
    expect(game.projectiles).toHaveLength(1);

    game.loadNextLevel();
    expect(game.gameWon).toBe(true);
    expect(game.resetLevel()).toBe(true);

    performance.now.mockReturnValue(1001);
    expect(game.canShoot).toBe(false);
    game.shoot();
    expect(game.projectiles).toHaveLength(0);

    // Still within the old run's cooldown when the new power-up is collected.
    game.checkCollisions();
    game.shoot();
    expect(game.projectiles).toHaveLength(1);
  });

  it('preserves progress on a live reset and on a failed restart after winning', () => {
    game.score = 125;
    game.canShoot = true;
    game.lastShotTime = 12;
    expect(game.resetLevel()).toBe(true);
    expect(game.score).toBe(125);

    game.currentLevel = game.levels.length - 1;
    game.loadNextLevel();
    const player = game.player;
    vi.spyOn(game.spriteLoader, 'getSprite').mockImplementationOnce(() => {
      throw Error('synthetic');
    });
    expect(() => game.resetLevel()).toThrow('synthetic');
    expect(game.gameWon).toBe(true);
    expect(game.currentLevel).toBe(game.levels.length);
    expect(game.player).toBe(player);
    expect(game.score).toBe(125);
    expect(game.canShoot).toBe(true);
    expect(game.lastShotTime).toBe(12);
  });

  it('keeps terminal state and objects on construction failure and refuses disposed reset', () => {
    game.gameOver = true;
    game.lives = 0;
    const player = game.player;
    vi.spyOn(game.spriteLoader, 'getSprite').mockImplementation(() => {
      throw Error('synthetic');
    });
    expect(() => game.resetLevel()).toThrow('synthetic');
    expect(game.gameOver).toBe(true);
    expect(game.lives).toBe(0);
    expect(game.player).toBe(player);
    game.dispose();
    expect(game.resetLevel()).toBe(false);
    expect(game.player).toBe(player);
  });
});
