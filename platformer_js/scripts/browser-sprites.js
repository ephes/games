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

/** Check portal rendering after a real image decode failure. */
export async function checkBrokenPortalSprite(page) {
  const result = await page.evaluate(async () => {
    const { Portal } = await import('/src/objects/Portal.js');
    const image = new Image(128, 128);
    image.src = 'data:image/png;base64,AA==';
    const decodeError = await image.decode().catch(error => error.name);

    const portal = new Portal(0, 0);
    portal.setSprite(image);
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    let fills = 0;
    let imageDraws = 0;
    const labels = [];
    const fill = ctx.fill.bind(ctx);
    const drawImage = ctx.drawImage.bind(ctx);
    const fillText = ctx.fillText.bind(ctx);
    ctx.fill = (...args) => {
      fills++;
      fill(...args);
    };
    ctx.drawImage = (...args) => {
      imageDraws++;
      drawImage(...args);
    };
    ctx.fillText = (text, ...args) => {
      labels.push(text);
      fillText(text, ...args);
    };
    portal.draw(ctx, 0);
    return { decodeError, complete: image.complete, fills, imageDraws, labels };
  });
  assert.deepEqual(result, {
    decodeError: 'EncodingError',
    complete: true,
    fills: 1,
    imageDraws: 0,
    labels: ['LOCKED']
  });
}
