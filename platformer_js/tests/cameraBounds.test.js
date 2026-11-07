import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Game } from '../src/Game.js';

const level = width => ({
  name: 'Synthetic level',
  playerStart: { x: 40, y: 50 },
  // The first platform deliberately is not the rightmost or a full-width ground.
  platforms: [
    { x: 0, y: 350, width: 200, height: 50 },
    { x: width - 100, y: 350, width: 100, height: 50 }
  ],
  coins: [],
  enemies: [],
  boss: { x: 100, y: 200, speed: 1, patrolStart: 100, patrolEnd: 200 },
  portal: { x: width - 80, y: 200 }
});

describe('Current level camera bounds', () => {
  let game;
  beforeEach(() => {
    document.body.innerHTML =
      '<canvas id="bounds" width="800" height="400"></canvas>';
    game = new Game('bounds');
    game.spriteLoader.loadAll = vi.fn().mockResolvedValue();
    game.spriteLoader.getSprite = vi.fn().mockReturnValue(null);
  });
  afterEach(() => {
    game.dispose();
    vi.restoreAllMocks();
  });

  function expectRightEdge(width) {
    game.camera.follow({ x: width + 1000 });
    expect(game.camera.bounds.maxX).toBe(Math.max(width, 800));
    expect(game.camera.x).toBe(Math.max(0, width - 800));
    game.camera.follow({ x: -1000 });
    expect(game.camera.x).toBe(0);
  }

  it.each([
    [1000, 2400],
    [2400, 1000],
    [2400, 400]
  ])('refreshes bounds from %i to %i on transition', async (first, next) => {
    game.levels = [level(first), level(next)];
    await game.init();
    expectRightEdge(first);
    game.loadNextLevel();
    expect(game.camera.x).toBe(0);
    expectRightEdge(next);
    game.player.x = next + 1000;
    game.update(0);
    expect(game.player.x + game.player.width).toBe(Math.max(800, next));
  });

  it('refreshes geometry on reset', async () => {
    game.levels = [level(2400)];
    await game.init();
    game.levels[0] = level(1200);
    game.resetLevel();
    expect(game.camera.x).toBe(0);
    expectRightEdge(1200);
  });

  it('refreshes bounds when LDtk levels replace the current level', async () => {
    game.levels = [level(1000)];
    await game.init();
    game.ldtkLoader.loadWorld = vi.fn().mockResolvedValue();
    game.ldtkLoader.getAllLevels = vi.fn().mockReturnValue([level(3200)]);
    await game.loadLDtkLevels('synthetic.ldtk');
    expect(game.ldtkLoader.loadWorld).toHaveBeenCalledWith('synthetic.ldtk', {
      publish: false
    });
    expectRightEdge(3200);
  });
});
