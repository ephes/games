import assert from 'node:assert/strict';

/** Check source retirement with a real Image and a stalled synthetic request. */
export async function checkSpriteCancellation(page, baseUrl) {
  await page.route('**/__sprite-cancel.html', route =>
    route.fulfill({ contentType: 'text/html', body: '<title>Sprites</title>' })
  );
  await page.goto(`${baseUrl}__sprite-cancel.html`);
  await page.route('**/__stalled-sprite.png', () => {});
  const requested = page.waitForRequest('**/__stalled-sprite.png');
  const checked = page.evaluate(async () => {
    const { SpriteLoader } = await import('/src/systems/SpriteLoader.js');
    const loader = new SpriteLoader();
    const svg =
      '<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"/>';
    const source = `data:image/svg+xml,${encodeURIComponent(svg)}`;
    const cached = await loader.loadSprite('synthetic', source);
    const controller = new AbortController();
    window.addEventListener('cancel-sprite', () => controller.abort(), {
      once: true
    });

    const NativeImage = window.Image;
    let abandoned;
    window.Image = function () {
      abandoned = new NativeImage();
      return abandoned;
    };
    const pending = loader.loadSprite('synthetic', '/__stalled-sprite.png', {
      signal: controller.signal
    });
    window.Image = NativeImage;
    const lateLoad = abandoned.onload;
    const error = await pending.catch(failure => failure);
    lateLoad();
    return {
      errorName: error.name,
      abandonedSource: abandoned.getAttribute('src'),
      cachePreserved:
        loader.getSprite('synthetic') === cached &&
        cached.getAttribute('src') === source
    };
  });
  const [result] = await Promise.all([
    checked,
    requested.then(() =>
      page.evaluate(() => window.dispatchEvent(new Event('cancel-sprite')))
    )
  ]);
  assert.deepEqual(result, {
    errorName: 'AbortError',
    abandonedSource: null,
    cachePreserved: true
  });
}
