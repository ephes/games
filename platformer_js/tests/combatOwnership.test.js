import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Game } from '../src/Game.js';
import { Enemy } from '../src/entities/Enemy.js';
import { Boss } from '../src/entities/Boss.js';
import { Projectile } from '../src/entities/Projectile.js';
import { Renderer } from '../src/rendering/Renderer.js';

const level = (width = 5000) => ({
  name: 'Synthetic combat',
  playerStart: { x: 4100, y: 250 },
  platforms: [{ x: 0, y: 350, width, height: 50 }],
  coins: [],
  enemies: [],
  boss: { x: 4000, y: 254, speed: 0, platformIndex: 0 },
  portal: { x: 4500, y: 200 }
});

describe('Combat transitions and world-owned projectiles', () => {
  let game;
  beforeEach(() => {
    vi.useFakeTimers();
    document.body.innerHTML =
      '<canvas id="combat" width="800" height="400"></canvas>';
    game = new Game('combat');
    game.levels = [level(), level(800)];
    game.createLevel();
  });
  afterEach(() => {
    game.dispose();
    vi.clearAllTimers();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });
  it.each(['shots-first', 'stomp-first'])(
    'awards one defeat for two bullets plus a stomp (%s)',
    order => {
      const enemy = new Enemy({ x: 100, y: 100, speed: 2 });
      game.enemies = [enemy];
      game.player.x = 100;
      game.player.y = 85;
      game.player.velocityY = 10;
      game.projectiles = [
        new Projectile(105, 110, 1),
        new Projectile(105, 110, 1)
      ];
      if (order === 'stomp-first') {
        game.checkCollisions();
      }
      game.updateProjectiles(1000 / 60);
      game.checkCollisions();
      expect(game.score).toBe(50);
      expect(enemy.alive).toBe(false);
      expect(enemy.hit()).toBe(false);
      const x = enemy.x;
      const renderer = new Renderer(game.canvas, game.spriteLoader);
      const sprite = {};
      vi.spyOn(game.spriteLoader, 'getSprite').mockReturnValue(sprite);
      renderer.drawEnemy(enemy);
      expect(renderer.ctx.drawImage).toHaveBeenCalled();
      vi.advanceTimersByTime(100);
      enemy.update(game.platforms, 1000 / 60);
      expect(enemy.x).toBe(x);
      expect(enemy.frameX).toBe(1);
      vi.advanceTimersByTime(199);
      renderer.ctx.drawImage.mockClear();
      renderer.drawEnemy(enemy);
      expect(renderer.ctx.drawImage).toHaveBeenCalled();
      vi.advanceTimersByTime(1);
      renderer.ctx.drawImage.mockClear();
      renderer.drawEnemy(enemy);
      expect(renderer.ctx.drawImage).not.toHaveBeenCalled();
    }
  );
  it('keeps wide-world shots active and culls them past the actual level margin', () => {
    game.boss.shoot(game.player);
    const shot = game.boss.projectiles[0];
    shot.update(1000 / 60);
    expect(shot.x).toBeGreaterThan(4000);
    expect(shot.active).toBe(true);
    shot.x = 5200;
    shot.update(1000 / 60);
    expect(shot.active).toBe(false);
  });
  it.each(['reset', 'transition'])(
    'replaces projectile ownership on %s and uses the new level bounds',
    action => {
      game.boss.shoot(game.player);
      const oldBoss = game.boss;
      if (action === 'reset') {
        game.levels[0] = level(800);
        game.resetLevel();
      } else {
        game.loadNextLevel();
      }
      expect(game.boss).not.toBe(oldBoss);
      expect(game.boss.projectiles).toEqual([]);
      game.boss.x = 900;
      game.boss.shoot({ x: 1100 });
      const shot = game.boss.projectiles[0];
      shot.x = 1000;
      shot.update(1000 / 60);
      expect(shot.active).toBe(false);
    }
  );
  it('passes replacement bounds to imported bosses and retires the previous shots', async () => {
    game.boss.shoot(game.player);
    const previous = game.boss;
    vi.spyOn(game.ldtkLoader, 'loadWorld').mockResolvedValue({ levels: [] });
    vi.spyOn(game.ldtkLoader, 'getAllLevels').mockReturnValue([level(6000)]);
    await expect(game.loadLDtkLevels('synthetic')).resolves.toBe(true);
    expect(game.boss).not.toBe(previous);
    expect(game.boss.projectiles).toEqual([]);
    game.boss.shoot(game.player);
    const shot = game.boss.projectiles[0];
    shot.update(1000 / 60);
    expect(shot.active).toBe(true);
    shot.x = 6200;
    shot.update(1000 / 60);
    expect(shot.active).toBe(false);
  });
  it.each([0, undefined, 3])(
    'preserves inherited speed %s for neutral enemy/boss movement',
    speed => {
      const config = { x: 100, y: 100, speed, platformIndex: 0 };
      const enemy = new Enemy(config),
        boss = new Boss(config);
      const expected = speed ?? 2;
      enemy.update(game.platforms, 1000 / 60);
      boss.update(game.platforms, 1000 / 60);
      expect(enemy.x).toBe(100 + expected);
      expect(boss.x).toBe(100 + expected);
      expect(boss.baseSpeed).toBe(expected);
    }
  );
});
