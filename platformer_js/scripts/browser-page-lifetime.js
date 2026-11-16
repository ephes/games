/** Exercise the real entry point with synthetic page transitions and replacement. */
export async function checkPageLifetime(page, baseUrl) {
  await page.route('**/__lifetime.html', route =>
    route.fulfill({
      contentType: 'text/html',
      body: '<canvas id="gameCanvas" width="800" height="400"></canvas>'
    })
  );
  await page.goto(`${baseUrl}__lifetime.html`);
  await page.evaluate(async () => {
    const { Game } = await import('/src/Game.js');
    const { SpriteLoader } = await import('/src/systems/SpriteLoader.js');
    const instances = [];
    const init = Game.prototype.init;
    Game.prototype.init = function () {
      instances.push(this);
      return init.call(this);
    };
    const frames = new Map();
    let id = 0;
    window.requestAnimationFrame = callback => {
      frames.set(++id, callback);
      return id;
    };
    window.cancelAnimationFrame = key => frames.delete(key);
    const transition = type =>
      window.dispatchEvent(new PageTransitionEvent(type, { persisted: true }));
    const settle = () => new Promise(resolve => setTimeout(resolve, 0));
    function owners(count) {
      if (
        frames.size !== count ||
        instances.filter(game => !game.disposed).length !== count ||
        instances.filter(game => game.inputManager.enabled).length !== count
      ) {
        throw Error(`expected ${count} page animation/input owners`);
      }
    }
    let finish;
    const pending = new Promise(resolve => {
      finish = resolve;
    });
    SpriteLoader.prototype.loadAll = () => pending;
    const first = await import('/src/main.js');
    transition('pagehide');
    owners(0);
    SpriteLoader.prototype.loadAll = async () => {};
    transition('pageshow');
    await settle();
    owners(1);
    finish();
    await settle();
    owners(1);
    if (instances.length !== 2 || instances[0].initialized) {
      throw Error('retired initialization changed page ownership');
    }
    const stale = frames.values().next().value;
    first.disposePage();
    owners(0);
    const replacement = await import('/src/main.js?replacement');
    await settle();
    owners(1);
    stale(1000);
    owners(1);
    const logError = console.error;
    const errors = [];
    console.error = (...args) => errors.push(args);
    try {
      transition('pagehide');
      SpriteLoader.prototype.loadAll = async () => {
        throw Error('synthetic re-entry failure');
      };
      transition('pageshow');
      await settle();
      owners(0);
      if (errors.length !== 1) {
        throw Error('failed re-entry was not reported exactly once');
      }
      const failedCount = instances.length;
      transition('pageshow');
      await settle();
      if (instances.length !== failedCount) {
        throw Error('duplicate pageshow retried failed initialization');
      }
      transition('pagehide');
      SpriteLoader.prototype.loadAll = async () => {};
      transition('pageshow');
      await settle();
      owners(1);
    } finally {
      console.error = logError;
      replacement.disposePage();
    }
    owners(0);
  });
  process.stdout.write(
    'Chromium page retirement, restoration and replacement passed.\n'
  );
}
