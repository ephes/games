import assert from 'node:assert/strict';

/** Real Chromium focus, native scrolling and editable/composition journey. */
export async function checkInputOwnership(page, baseUrl) {
  await page.route('**/__input.html', route =>
    route.fulfill({
      contentType: 'text/html',
      body: `<style>body {height:4000px} canvas {width:200px;height:100px}</style>
      <canvas id="one"></canvas><canvas id="two"></canvas>
      <input id="text"><div id="edit" contenteditable="true">Synthetic text</div>`
    })
  );
  await page.goto(`${baseUrl}__input.html`);
  await page.evaluate(async () => {
    const { Game } = await import('/src/Game.js');
    window.games = ['one', 'two'].map(id => {
      const game = new Game(id);
      game.spriteLoader.loadAll = async () => {};
      return game;
    });
    await Promise.all(window.games.map(game => game.init()));
    window.games.forEach(game => {
      game.canShoot = true;
    });
    window.shots = [0, 0];
    window.games.forEach((game, i) =>
      game.inputManager.on('shoot:down', () => window.shots[i]++)
    );
  });
  await page.locator('#one').click();
  await page.keyboard.down('ArrowRight');
  assert.deepEqual(
    await page.evaluate(() =>
      window.games.map(g => g.inputManager.isActionActive('moveRight'))
    ),
    [true, false]
  );
  await page.locator('#text').focus();
  assert.deepEqual(
    await page.evaluate(() => window.games.map(g => g.inputManager.getKeys())),
    [{}, {}]
  );
  await page.keyboard.up('ArrowRight');
  await page.keyboard.type('Synthetic text ');
  await page.locator('#edit').focus();
  await page.keyboard.press('Space');
  await page.keyboard.press('ArrowLeft');
  assert.deepEqual(await page.evaluate(() => window.shots), [0, 0]);
  await page.locator('#two').click();
  await page.evaluate(() => {
    const canvas = document.querySelector('#two');
    canvas.dispatchEvent(
      new CompositionEvent('compositionstart', { bubbles: true })
    );
    canvas.dispatchEvent(
      new KeyboardEvent('keydown', {
        key: ' ',
        bubbles: true,
        isComposing: true
      })
    );
    canvas.dispatchEvent(
      new CompositionEvent('compositionend', { bubbles: true })
    );
  });
  await page.keyboard.press('Space');
  assert.deepEqual(await page.evaluate(() => window.shots), [0, 1]);
  await page.keyboard.press('ArrowDown'); // unbound: native scrolling remains available
  await page.waitForTimeout(300);
  assert.ok(await page.evaluate(() => scrollY > 0));
  await page.evaluate(() => scrollTo(0, 0));
  await page.keyboard.press('Space');
  await page.keyboard.press('ArrowUp');
  await page.keyboard.press('ArrowRight');
  await page.waitForTimeout(300);
  assert.equal(await page.evaluate(() => scrollY), 0);
  await page.keyboard.press('Tab');
  assert.equal(await page.evaluate(() => document.activeElement.id), 'text');
  await page.evaluate(() => {
    document.activeElement.blur();
  });
  await page.keyboard.press('Space');
  await page.waitForTimeout(300);
  assert.ok(await page.evaluate(() => scrollY > 0));
  await page.evaluate(() => window.games.forEach(game => game.dispose()));
  process.stdout.write(
    'Chromium keyboard focus, editing, composition and native scroll journey passed.\n'
  );
}
