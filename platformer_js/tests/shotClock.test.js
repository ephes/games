import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Game } from '../src/Game.js';
import { GAME_CONFIG } from '../src/utils/constants.js';

describe('Monotonic shot cooldowns', () => {
  let game, time;
  beforeEach(async () => {
    time = 0;
    vi.spyOn(performance, 'now').mockImplementation(() => time);
    vi.spyOn(Date, 'now').mockReturnValue(100000);
    document.body.innerHTML = '<canvas id="clock"></canvas>';
    game = new Game('clock');
    vi.spyOn(game.spriteLoader, 'loadAll').mockResolvedValue();
    await game.init();
    game.canShoot = true;
  });
  afterEach(() => {
    game.dispose();
    vi.restoreAllMocks();
  });

  it.each(['reset', 'replacement'])(
    'keeps the player cooldown across %s and wall-clock jumps',
    async action => {
      game.shoot();
      expect(game.projectiles).toHaveLength(1);
      if (action === 'reset') {
        game.resetLevel();
      } else {
        vi.spyOn(game.ldtkLoader, 'loadWorld').mockResolvedValue({});
        vi.spyOn(game.ldtkLoader, 'getAllLevels').mockReturnValue(game.levels);
        expect(await game.loadLDtkLevels('synthetic')).toBe(true);
      }
      Date.now.mockReturnValue(-100000);
      time = GAME_CONFIG.SHOT_COOLDOWN;
      game.shoot();
      expect(game.projectiles).toHaveLength(1);
      Date.now.mockReturnValue(100000000);
      time += GAME_CONFIG.SHOT_COOLDOWN - 1;
      game.shoot();
      expect(game.projectiles).toHaveLength(1);
      time++;
      game.shoot();
      expect(game.projectiles).toHaveLength(2);
    }
  );

  it('keeps boss shots on the same monotonic clock', () => {
    const boss = game.boss;
    const player = { x: boss.x + 100 };
    boss.updateShooting(player);
    expect(boss.projectiles).toHaveLength(1);
    Date.now.mockReturnValue(-100000);
    time = boss.shootCooldown;
    boss.updateShooting(player);
    expect(boss.projectiles).toHaveLength(2);
    Date.now.mockReturnValue(100000000);
    time += boss.shootCooldown - 1;
    boss.updateShooting(player);
    expect(boss.projectiles).toHaveLength(2);
    time++;
    boss.updateShooting(player);
    expect(boss.projectiles).toHaveLength(3);
  });
});
