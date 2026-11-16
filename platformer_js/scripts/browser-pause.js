import assert from 'node:assert/strict';

/** Native Escape events with one controlled RAF owner and synthetic game data. */
export async function checkPauseLifecycle(page, baseUrl) {
  await page.route('**/__pause.html', route =>
    route.fulfill({
      contentType: 'text/html',
      body: '<canvas id="pause" width="800" height="400"></canvas><input id="editor">'
    })
  );
  await page.goto(`${baseUrl}__pause.html`);
  await page.evaluate(async () => {
    const { Game } = await import('/src/Game.js');
    window.pauseFrames = new Map();
    let id = 0;
    window.pauseTime = 0;
    window.requestAnimationFrame = callback => {
      window.pauseFrames.set(++id, callback);
      return id;
    };
    window.cancelAnimationFrame = id => window.pauseFrames.delete(id);
    performance.now = () => window.pauseTime;
    const game = (window.pauseGame = new Game('pause'));
    game.levels = [
      {
        name: 'Synthetic pause',
        playerStart: { x: 50, y: 50 },
        platforms: [{ x: 0, y: 350, width: 10000, height: 50 }],
        coins: [],
        enemies: [],
        boss: { x: 9000, y: 254, speed: 0, platformIndex: 0 },
        portal: { x: 9500, y: 200 }
      }
    ];
    game.spriteLoader.loadAll = async () => {};
    await game.init();
    game.player.gravity = 0;
    game.boss.canShoot = false;
    game.canShoot = true;
    const text = game.renderer.drawText.bind(game.renderer);
    game.renderer.drawText = (...args) => {
      if (args[0] === 'Paused - Esc to resume') {
        window.sawPause = true;
      }
      text(...args);
    };
    game.start();
  });
  async function frame(time) {
    await page.evaluate(time => {
      if (window.pauseFrames.size !== 1) {
        throw Error('duplicate pause RAF owner');
      }
      window.pauseTime = time;
      const [id, callback] = window.pauseFrames.entries().next().value;
      window.pauseFrames.delete(id);
      callback(time);
      if (window.pauseFrames.size !== 1) {
        throw Error('lost pause RAF owner');
      }
    }, time);
  }
  const state = () =>
    page.evaluate(() => ({
      paused: window.pauseGame.paused,
      x: window.pauseGame.player.x,
      phase: window.pauseGame.portal.pulseTime,
      shots: window.pauseGame.projectiles.length
    }));
  await page.locator('#pause').focus();
  await page.keyboard.down('ArrowRight');
  await frame(10);
  await page.keyboard.down('Escape');
  assert.equal((await state()).paused, true);
  await page.keyboard.down('Escape');
  assert.equal((await state()).paused, true);
  await page.keyboard.up('Escape');
  await page.keyboard.press('Space');
  await page.evaluate(() => window.pauseGame.shoot());
  await frame(100);
  assert.deepEqual(await state(), { paused: true, x: 50, phase: 0, shots: 0 });
  assert.equal(await page.evaluate(() => window.sawPause), true);
  await page.locator('#editor').focus();
  await page.keyboard.press('Escape');
  assert.equal((await state()).paused, true);
  await page.locator('#pause').focus();
  await page.keyboard.press('Escape');
  await page.evaluate(() => window.pauseGame.start());
  await frame(20000);
  assert.deepEqual(await state(), { paused: false, x: 50, phase: 0, shots: 0 });
  await page.keyboard.down('ArrowRight'); // Still held: native repeat is retired.
  await frame(20020);
  assert.equal((await state()).x, 50);
  await page.keyboard.up('ArrowRight');
  await page.keyboard.down('ArrowRight');
  await frame(20040);
  assert.equal((await state()).x, 55);
  await page.keyboard.up('ArrowRight');
  await page.keyboard.press('Space');
  assert.equal((await state()).shots, 1);
  await page.keyboard.press('Escape');
  await page.evaluate(() => window.pauseGame.resetLevel());
  await frame(20060);
  assert.deepEqual(await state(), { paused: false, x: 50, phase: 0, shots: 0 });
  await page.keyboard.press('Escape');
  assert.equal(
    await page.evaluate(() => {
      const stale = window.pauseFrames.values().next().value;
      window.pauseGame.dispose();
      stale(20080);
      window.pauseGame.start();
      return window.pauseFrames.size;
    }),
    0
  );
  process.stdout.write(
    'Chromium Escape pause, held-input retirement, restart and disposal passed.\n'
  );
}
