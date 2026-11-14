import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { createServer } from 'vite';

// All gameplay data, input and frame schedules are synthetic; no network assets.
const server = await createServer({
  server: { host: '127.0.0.1', port: 0, open: false }
});
let browser;
try {
  await server.listen();
  browser = await chromium.launch();
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/__clock.html', route =>
    route.fulfill({
      contentType: 'text/html',
      body: '<canvas id="clock" width="800" height="400"></canvas>'
    })
  );
  await page.goto(`${server.resolvedUrls.local[0]}__clock.html`);
  const results = await page.evaluate(async () => {
    const { Game } = await import('/src/Game.js');
    const { BossProjectile } = await import('/src/entities/BossProjectile.js');
    let frames, id;
    window.requestAnimationFrame = callback => {
      frames.set(++id, callback);
      return id;
    };
    window.cancelAnimationFrame = key => frames.delete(key);
    performance.now = () => 0;
    Date.now = () => 0;
    const results = [];
    for (const hz of [30, 60, 144]) {
      frames = new Map();
      id = 0;
      const game = new Game('clock');
      game.levels = [
        {
          name: 'Synthetic',
          playerStart: { x: 50, y: -10000 },
          platforms: [{ x: 0, y: 350, width: 10000, height: 50 }],
          coins: [],
          enemies: [{ x: 2000, y: 320, speed: 2, platformIndex: 0 }],
          boss: { x: 9000, y: 254, speed: 0, platformIndex: 0 },
          portal: { x: 9500, y: 200 }
        }
      ];
      game.spriteLoader.loadAll = async () => {};
      game.start();
      if (game.disposed || game.running || frames.size) {
        throw Error('early start changed game ownership');
      }
      await game.init();
      game.inputManager.keys.ArrowRight = true;
      game.boss.canShoot = false;
      game.boss.projectiles.push(
        new BossProjectile(1000, 100, 1, 3, game.camera.bounds)
      );
      let renders = 0;
      const render = game.render.bind(game);
      game.render = () => {
        renders++;
        render();
      };
      game.start();
      game.start();
      if (frames.size !== 1) {
        throw Error('duplicate chain');
      }
      for (let n = 1; n <= hz; n++) {
        const [key, callback] = frames.entries().next().value;
        frames.delete(key);
        callback((n * 1000) / hz);
      }
      const positions = [
        game.player.x,
        game.player.y,
        game.enemies[0].x,
        game.boss.projectiles[0]?.x
      ];
      const stale = frames.values().next().value;
      game.dispose();
      stale(2000);
      if (frames.size) {
        throw Error('disposed chain restarted');
      }
      results.push({ hz, positions, renders });
    }
    const { Enemy } = await import('/src/entities/Enemy.js');
    const game = new Game('clock');
    game.createLevel();
    game.platforms = [];
    game.coins = [];
    game.enemies = [];
    game.boss.x = 2000;
    game.boss.canShoot = false;
    game.player.x = 100;
    game.player.y = 100;
    game.player.gravity = 0;
    const shot = new BossProjectile(0, 110, 1, 2000, game.camera.bounds);
    game.boss.projectiles = [shot];
    game.update(16);
    if (game.lives !== 2 || shot.active || game.boss.projectiles.length) {
      throw Error('boss shot tunneled or survived culling');
    }
    const retired = game.player;
    game.resetLevel();
    if (
      !retired.disposed ||
      retired.hitTimeout !== null ||
      retired.invulnerabilityTimeout !== null
    ) {
      throw Error('retired timers retained');
    }
    game.platforms = [];
    game.coins = [];
    game.boss.x = 2000;
    game.boss.canShoot = false;
    game.player.x = 100;
    game.player.y = 0;
    game.player.gravity = 0;
    game.player.velocityY = 180;
    const enemy = new Enemy({ x: 105, y: 100, speed: 0 });
    game.enemies = [enemy];
    game.update(16);
    game.update(16);
    if (game.score !== 50 || enemy.alive || game.lives !== 2) {
      throw Error('top crossing did not award exactly one stomp');
    }
    game.dispose();
    return results;
  });
  assert.deepEqual(errors, []);
  for (const { hz, positions, renders } of results) {
    assert.deepEqual(positions, [350, -9085, 2120, 1180]);
    assert.equal(renders, hz + 1);
  }
  process.stdout.write(
    'Chromium clock smoke passed at 30, 60 and 144 Hz; relative contact and timer retirement passed.\n'
  );
} finally {
  await browser?.close();
  await server.close();
}
