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

/** Check that the flash changes sprite pixels while terrain shows through. */
export async function checkBossHitFlash(page) {
  const results = await page.evaluate(async () => {
    const { Renderer } = await import('/src/rendering/Renderer.js');
    const sprite = document.createElement('canvas');
    sprite.width = 12;
    sprite.height = 6;
    const spriteCtx = sprite.getContext('2d');
    spriteCtx.fillStyle = 'blue';
    spriteCtx.fillRect(0, 0, 3, 3);
    spriteCtx.fillRect(6, 3, 3, 3);

    const canvas = document.createElement('canvas');
    canvas.width = 20;
    canvas.height = 16;
    const renderer = new Renderer(canvas, {
      getAnimationConfig: () => ({ boss: { frameWidth: 6, frameHeight: 6 } }),
      getSprite: () => sprite
    });
    const ctx = canvas.getContext('2d');
    ctx.translate(-10, 0); // World-to-screen offset.
    const pixel = (x, y) => Array.from(ctx.getImageData(x, y, 1, 1).data);
    return [1, -1].map((direction, frameX) => {
      ctx.fillStyle = 'lime';
      ctx.fillRect(10, 0, 20, 16);
      const boss = {
        x: 14,
        y: 2,
        width: 12,
        height: 12,
        direction,
        frameX,
        alive: true,
        getHealthPercentage: () => 1,
        isHit: true,
        simulationTime: 0,
        hitTimer: 0,
        hitDuration: 400
      };
      renderer.drawBoss(boss);
      const left = 6;
      const right = 13;
      return {
        tinted: pixel(direction === 1 ? left : right, frameX ? 11 : 4),
        transparent: [
          pixel(direction === 1 ? right : left, 4),
          pixel(direction === 1 ? left : right, frameX ? 4 : 11)
        ]
      };
    });
  });
  for (const { tinted, transparent } of results) {
    assert.deepEqual(transparent, [
      [0, 255, 0, 255],
      [0, 255, 0, 255]
    ]);
    assert.ok(tinted[0] > 0 && tinted[2] > 0, `untinted boss pixel: ${tinted}`);
  }
}
