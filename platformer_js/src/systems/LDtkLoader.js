/**
 * @module systems/LDtkLoader
 */

export const WORLD_LIMITS = Object.freeze({
  bytes: 16 * 1024 * 1024,
  timeoutMs: 10_000,
  jsonDepth: 64,
  // Sized so 2,000,000 cells and 20,000 LDtk-shaped entities with field
  // instances fit together, with headroom for level, layer and defs metadata.
  jsonContainers: 1_000_000,
  jsonTokens: 6_000_000,
  levels: 64,
  cells: 2_000_000,
  entities: 20_000,
  activeEntities: 1024,
  activePlatforms: 4096,
  platforms: 20_000
});

/**
 * Bound all wire content (including ignored metadata) before native tree
 * construction, then admit syntax and check member names while the wire retains
 * duplicates. Depth includes the root; tokens count keys, scalar values and
 * container openings. These limits also bound the duplicate-member pass.
 * Quoted tokens consume escaped punctuation; only native-decoded keys in the
 * same object share an identity.
 * @param {string} text - Decoded world JSON
 * @returns {Object} Unambiguous world data
 */
function parseWorldJSON(text) {
  let depth = 0,
    containers = 0,
    tokens = 0;
  // Quoted tokens consume escaped punctuation. Native JSON.parse below remains
  // responsible for syntax; this pass only bounds expansion, without a tree.
  for (const [token] of text.matchAll(
    /"(?:[^"\\]|\\.)*"|[{}[\]]|[^\s,:[\]{}"]+/g
  )) {
    if (token === '}' || token === ']') {
      depth--;
      continue;
    }
    if (++tokens > WORLD_LIMITS.jsonTokens) {
      throw new Error('LDtk JSON token budget exceeded');
    }
    if (token === '{' || token === '[') {
      if (++depth > WORLD_LIMITS.jsonDepth) {
        throw new Error('LDtk JSON depth budget exceeded');
      }
      if (++containers > WORLD_LIMITS.jsonContainers) {
        throw new Error('LDtk JSON container budget exceeded');
      }
    }
  }
  const data = JSON.parse(text);
  const objects = [];
  let previous;
  for (const [token] of text.matchAll(/"(?:[^"\\]|\\.)*"|[{}:]/g)) {
    if (token === '{') {
      objects.push(new Set());
    } else if (token === '}') {
      objects.pop();
    } else if (token === ':') {
      const key = JSON.parse(previous);
      const keys = objects[objects.length - 1];
      if (keys.has(key)) {
        throw new Error('Duplicate LDtk JSON member');
      }
      keys.add(key);
    }
    previous = token;
  }
  return data;
}

// Fixed runtime rectangles; authored anchors are normalized separately.
const ENTITY_SIZES = {
  Player: [30, 30],
  Enemy: [44, 30],
  Boss: [64, 96],
  Coin: [20, 20],
  Portal: [128, 128]
};

/** Check normalized origins and far edges before publishing any candidate level. */
function checkExtent(x, y, width, height) {
  if (
    ![x, y, x + width, y + height].every(
      value =>
        Number.isFinite(value) && Math.abs(value) <= Number.MAX_SAFE_INTEGER
    )
  ) {
    throw new Error('Invalid LDtk normalized extent');
  }
}

// Detach each read's abort listener on settlement, keeping ownership bounded
// even when a transfer arrives in many small chunks.
function withTransferAbort(signal, operation) {
  signal.throwIfAborted();
  let onAbort;
  return new Promise((resolve, reject) => {
    onAbort = () => reject(signal.reason);
    signal.addEventListener('abort', onAbort, { once: true });
    Promise.resolve(operation()).then(resolve, reject);
  }).finally(() => signal.removeEventListener('abort', onAbort));
}

function cancelTransfer(transfer, reason) {
  try {
    void Promise.resolve(transfer?.cancel(reason)).catch(() => {});
  } catch {
    // Best-effort cleanup preserves the original transfer result.
  }
}

/**
 * LDtk level loader
 */
export class LDtkLoader {
  /**
   * Create LDtk loader
   */
  constructor() {
    this.world = null;
    this.loadGeneration = 0;
    this.loadController = null;
  }

  /**
   * Load a candidate world. Only the latest requested load may publish it.
   * Cancellation and supersession reject pending loads. Convert a successful
   * candidate with getAllLevels(world), including when publish is false.
   * @param {string} url - URL to LDtk file
   * @param {Object} options - Publication options
   * @param {boolean} options.publish - Publish if latest (default true)
   * @returns {Promise<World>} This request's candidate world
   */
  async loadWorld(url, { publish = true } = {}) {
    this.cancelLoad();
    const generation = this.loadGeneration;
    const controller = new AbortController();
    this.loadController = controller;
    const { signal } = controller;
    const deadline = performance.now() + WORLD_LIMITS.timeoutMs;
    const deadlineError = new Error('LDtk transfer deadline exceeded');
    const timer = setTimeout(
      () => controller.abort(deadlineError),
      WORLD_LIMITS.timeoutMs
    );
    let body;
    let reader;
    try {
      const response = await withTransferAbort(signal, async () => {
        const response = await fetch(url, { signal });
        if (signal.aborted) {
          cancelTransfer(response.body, signal.reason);
        } else {
          body = response.body;
        }
        return response;
      });
      signal.throwIfAborted();
      if (response.status !== 200 || response.headers.has('content-range')) {
        throw new Error('LDtk transfer failed');
      }
      reader = body?.getReader();
      if (!reader) {
        throw new Error('LDtk response requires a streamed body');
      }
      if (Number(response.headers.get('content-length')) > WORLD_LIMITS.bytes) {
        throw new Error('LDtk byte budget exceeded');
      }
      const chunks = [];
      let bytes = 0;
      for (;;) {
        const { done, value } = await withTransferAbort(signal, () =>
          reader.read()
        );
        signal.throwIfAborted();
        if (done) {
          break;
        }
        bytes += value.byteLength;
        if (bytes > WORLD_LIMITS.bytes) {
          throw new Error('LDtk byte budget exceeded');
        }
        chunks.push(value);
      }
      const buffer = new Uint8Array(bytes);
      let offset = 0;
      for (const chunk of chunks) {
        buffer.set(chunk, offset);
        offset += chunk.byteLength;
      }
      const data = parseWorldJSON(
        new TextDecoder('utf-8', { fatal: true }).decode(buffer)
      );
      this.preflightWorld(data);
      signal.throwIfAborted();
      if (performance.now() >= deadline) {
        throw deadlineError;
      }
      const world = data;
      if (publish && generation === this.loadGeneration) {
        this.world = world;
      }
      return world;
    } finally {
      clearTimeout(timer);
      controller.abort();
      cancelTransfer(reader ?? body, signal.reason);
      try {
        reader?.releaseLock();
      } catch {
        // A release failure must not replace the transfer or publication result.
      }
      if (this.loadController === controller) {
        this.loadController = null;
      }
    }
  }

  /** Cancel an in-flight transfer and retire its publication ownership. */
  cancelLoad() {
    this.loadGeneration++;
    this.loadController?.abort(new Error('LDtk load cancelled'));
    this.loadController = null;
  }

  /** Check aggregate source budgets before the LDtk parser constructs objects. */
  preflightWorld(data) {
    if (
      !Array.isArray(data.levels) ||
      data.levels.length > WORLD_LIMITS.levels
    ) {
      throw new Error('LDtk level budget exceeded');
    }
    let cells = 0,
      entities = 0;
    for (const level of data.levels) {
      this.recognizedLayers(level);
      let activeEntities = 0;
      for (const layer of level.layerInstances ?? []) {
        if (layer.intGridCsv) {
          cells += layer.intGridCsv.length;
        }
        activeEntities += layer.entityInstances?.length ?? 0;
      }
      entities += activeEntities;
      if (cells > WORLD_LIMITS.cells) {
        throw new Error('LDtk world cell budget exceeded');
      }
      if (entities > WORLD_LIMITS.entities) {
        throw new Error('LDtk world entity budget exceeded');
      }
      if (activeEntities > WORLD_LIMITS.activeEntities) {
        throw new Error('LDtk active entity budget exceeded');
      }
    }
  }

  /** Reject ambiguous gameplay layers while leaving unrelated layers untouched. */
  recognizedLayers(level) {
    const layers = new Map();
    for (const layer of level.layerInstances ?? []) {
      const name = layer.__identifier;
      if (name === 'Platforms' || name === 'Entities') {
        if (layers.has(name)) {
          throw new Error(`Duplicate LDtk ${name} layer`);
        }
        layers.set(name, layer);
      }
    }
    return layers;
  }

  /**
   * Convert LDtk level to game format, validating geometry, singletons and fields.
   * Coordinates and enemy speeds must be finite numbers; enemy/boss platform
   * indices must reference the completed collision mesh with at least 44 px
   * patrol width for enemies or 64 px for bosses. Only absent fields
   * use defaults (Speed: 2, PlatformIndex: 0, IsPowerUp: false).
   * Optional total layer offsets must be signed safe integers (absent: zero).
   * Add totals exactly once to layer-local coordinates, never instance offsets
   * or level worldX/worldY. Normalized runtime rectangle edges must stay finite
   * and within the safe numeric range. entityPosition admits authored pivots
   * and dimensions separately from fixed runtime sizes. Default Player start
   * is level-local.
   * IsPowerUp must be boolean; duplicate singletons/recognized fields fail.
   * Game additionally requires Boss and Portal before accepting an import.
   * @throws {Error} If the level has invalid geometry, entities or fields
   * @param {Object} ldtkLevel - LDtk level data
   * @returns {Object} Game level format
   */
  convertLevel(ldtkLevel) {
    const layers = this.recognizedLayers(ldtkLevel);
    const hasDimensions = 'pxWid' in ldtkLevel || 'pxHei' in ldtkLevel;
    if (
      hasDimensions &&
      ![ldtkLevel.pxWid, ldtkLevel.pxHei].every(
        value => Number.isSafeInteger(value) && value > 0
      )
    ) {
      throw new Error('Invalid LDtk level dimensions');
    }
    const level = {
      name: this.getLevelName(ldtkLevel),
      ...(hasDimensions
        ? { width: ldtkLevel.pxWid, height: ldtkLevel.pxHei }
        : {}),
      playerStart: { x: 50, y: 200 }, // Default, will be overridden
      platforms: [],
      coins: [],
      enemies: [],
      boss: null,
      portal: null
    };

    // Process platforms layer
    const platformsLayer = layers.get('Platforms');

    if (platformsLayer) {
      this.processPlatforms(platformsLayer, level);
    }

    // Process entities layer
    const entitiesLayer = layers.get('Entities');

    if (entitiesLayer) {
      this.processEntities(entitiesLayer, level);
    }

    return level;
  }

  /**
   * Get level name from field instances
   * @param {Object} ldtkLevel - LDtk level
   * @returns {string} Level name
   */
  getLevelName(ldtkLevel) {
    return this.getFieldValue(ldtkLevel, 'LevelName', ldtkLevel.identifier);
  }

  /**
   * Read total layer translation, including LDtk instance and definition offsets.
   * @param {Object} layer - Recognized layer
   * @returns {number[]} Signed safe integer X/Y totals, absent axes default to zero
   * @throws {Error} If a present total is not a safe integer
   */
  layerOffset(layer) {
    return ['__pxTotalOffsetX', '__pxTotalOffsetY'].map(key => {
      const value = key in layer ? layer[key] : 0;
      if (!Number.isSafeInteger(value)) {
        throw new Error('Invalid LDtk layer offset: expected safe integer');
      }
      return value;
    });
  }

  /**
   * Normalize an authored anchor to runtime top-left, then add layer totals once.
   * Pivot defaults to [0,0] only when absent; present pivots must have two finite
   * components in [0,1]. Authored width/height, if either is present, must both
   * be positive safe integers. Nonzero pivots require authored dimensions.
   * Dimensions describe anchor geometry only: runtime sizes remain Player 30x30,
   * Enemy 44x30, Boss 64x96, Coin 20x20 and Portal 128x128. They never substitute
   * for missing authored anchor dimensions or resize colliders/sprites.
   * @param {Object} entity - Recognized LDtk entity
   * @param {number} offsetX - Admitted total layer X offset
   * @param {number} offsetY - Admitted total layer Y offset
   * @returns {Object} Level-local top-left x/y
   * @throws {Error} If coordinates, pivot, authored sizes or extents are invalid
   */
  entityPosition(entity, offsetX, offsetY) {
    const [px, py] = entity.px;
    if (!Number.isFinite(px) || !Number.isFinite(py)) {
      throw new Error('Invalid LDtk entity coordinates');
    }
    const pivot = '__pivot' in entity ? entity.__pivot : [0, 0];
    if (
      !Array.isArray(pivot) ||
      pivot.length !== 2 ||
      ![pivot[0], pivot[1]].every(
        value => Number.isFinite(value) && value >= 0 && value <= 1
      )
    ) {
      throw new Error(
        'Invalid LDtk entity pivot: expected two numbers in [0,1]'
      );
    }
    const hasDimensions = 'width' in entity || 'height' in entity;
    if (
      (hasDimensions &&
        ![entity.width, entity.height].every(
          value => Number.isSafeInteger(value) && value > 0
        )) ||
      (!hasDimensions && (pivot[0] !== 0 || pivot[1] !== 0))
    ) {
      throw new Error(
        'Invalid LDtk entity dimensions: authored width/height required'
      );
    }
    // Legacy top-left fixtures need no authored anchor geometry.
    const width = hasDimensions ? entity.width : 0;
    const height = hasDimensions ? entity.height : 0;
    const x = px - pivot[0] * width + offsetX;
    const y = py - pivot[1] * height + offsetY;
    if (hasDimensions) {
      checkExtent(x, y, width, height);
    }
    checkExtent(x, y, ...ENTITY_SIZES[entity.__identifier]);
    return { x, y };
  }

  /**
   * Process and validate recognized entities after the platform mesh is built.
   * @throws {Error} If singleton counts, fields, coordinates or patrol geometry are invalid
   * @param {Object} entitiesLayer - Entities layer
   * @param {Object} level - Level object to populate
   */
  processEntities(entitiesLayer, level) {
    const [offsetX, offsetY] = this.layerOffset(entitiesLayer);
    const singletons = new Set();
    entitiesLayer.entityInstances.forEach(entity => {
      if (
        !['Player', 'Enemy', 'Boss', 'Coin', 'Portal'].includes(
          entity.__identifier
        )
      ) {
        return;
      }
      if (['Player', 'Boss', 'Portal'].includes(entity.__identifier)) {
        if (singletons.has(entity.__identifier)) {
          throw new Error(`Duplicate LDtk singleton ${entity.__identifier}`);
        }
        singletons.add(entity.__identifier);
      }
      const { x, y } = this.entityPosition(entity, offsetX, offsetY);
      const patrol =
        entity.__identifier === 'Enemy' || entity.__identifier === 'Boss';
      const platformIndex = patrol
        ? this.getFieldValue(entity, 'PlatformIndex', 0)
        : null;
      if (
        patrol &&
        (!Number.isInteger(platformIndex) ||
          platformIndex < 0 ||
          platformIndex >= level.platforms.length)
      ) {
        throw new Error('Invalid LDtk entity platform reference');
      }
      if (patrol) {
        const minimumWidth = entity.__identifier === 'Boss' ? 64 : 44;
        if (level.platforms[platformIndex].width < minimumWidth) {
          throw new Error(
            `${entity.__identifier} patrol platform must be at least ${minimumWidth} px wide`
          );
        }
      }
      const speed =
        entity.__identifier === 'Enemy'
          ? this.getFieldValue(entity, 'Speed', 2)
          : null;
      if (entity.__identifier === 'Enemy' && !Number.isFinite(speed)) {
        throw new Error('Invalid LDtk enemy speed');
      }
      const isPowerUp =
        entity.__identifier === 'Coin'
          ? this.getFieldValue(entity, 'IsPowerUp', false)
          : null;
      if (entity.__identifier === 'Coin' && typeof isPowerUp !== 'boolean') {
        throw new Error('Invalid LDtk coin IsPowerUp: expected boolean');
      }
      switch (entity.__identifier) {
        case 'Player':
          level.playerStart = {
            x,
            y
          };
          break;

        case 'Enemy':
          level.enemies.push({
            x,
            y,
            speed,
            platformIndex
          });
          break;

        case 'Boss':
          level.boss = {
            x,
            y,
            platformIndex
          };
          break;

        case 'Coin':
          level.coins.push({
            x,
            y,
            isPowerUp
          });
          break;

        case 'Portal':
          level.portal = {
            x,
            y
          };
          break;
      }
    });
  }

  /**
   * Process a dense IntGrid with positive safe integer dimensions/grid size.
   * At most 1,000,000 cells and safe integer pixel extents are supported.
   * Cells must be nonnegative safe integers: 0 is empty, 1 is collision terrain,
   * other positive kinds are noncollision. No coercion is performed.
   * Apply admitted total layer offsets once; validate the full translated grid
   * extent even if empty. Validation finishes before constructing geometry.
   * @throws {Error} If dimensions, cell budget, dense array length or cell values are invalid
   * @param {Object} platformsLayer - Platforms layer
   * @param {Object} level - Level object to populate
   */
  processPlatforms(platformsLayer, level) {
    const gridSize = platformsLayer.__gridSize;
    const width = platformsLayer.__cWid;
    const height = platformsLayer.__cHei;

    const cellCount = width * height;
    if (
      ![gridSize, width, height].every(
        value => Number.isSafeInteger(value) && value > 0
      ) ||
      cellCount > 1_000_000 ||
      !Number.isSafeInteger(width * gridSize) ||
      !Number.isSafeInteger(height * gridSize) ||
      !Array.isArray(platformsLayer.intGridCsv) ||
      platformsLayer.intGridCsv.length !== cellCount
    ) {
      throw new Error('Invalid LDtk IntGrid dimensions or cell data');
    }

    const [offsetX, offsetY] = this.layerOffset(platformsLayer);
    checkExtent(offsetX, offsetY, width * gridSize, height * gridSize);
    for (const value of platformsLayer.intGridCsv) {
      if (!Number.isSafeInteger(value) || value < 0) {
        throw new Error(
          'Invalid LDtk IntGrid cell: expected nonnegative safe integer'
        );
      }
    }

    // Convert IntGrid to platforms
    const platforms = [];
    let currentPlatform = null;

    // Scan rows
    for (let y = 0; y < height; y++) {
      const rowPlatforms = [];

      for (let x = 0; x < width; x++) {
        const index = y * width + x;
        const value = platformsLayer.intGridCsv[index];

        if (value === 1) {
          // Platform tile
          if (!currentPlatform || currentPlatform.endX < x - 1) {
            // Start new platform
            currentPlatform = {
              startX: x,
              endX: x,
              y: y
            };
            rowPlatforms.push(currentPlatform);
          } else {
            // Extend current platform
            currentPlatform.endX = x;
          }
        }
      }

      // Convert row platforms to game format
      rowPlatforms.forEach(p => {
        if (platforms.length >= WORLD_LIMITS.activePlatforms) {
          throw new Error('LDtk active platform budget exceeded');
        }
        platforms.push({
          x: p.startX * gridSize + offsetX,
          y: p.y * gridSize + offsetY,
          width: (p.endX - p.startX + 1) * gridSize,
          height: gridSize
        });
      });

      currentPlatform = null;
    }

    level.platforms = this.mergePlatforms(platforms);
  }

  /**
   * Merge adjacent platforms
   * @param {Array} platforms - Array of platforms
   * @returns {Array} Merged platforms
   */
  mergePlatforms(platforms) {
    // Sort by position
    platforms.sort((a, b) => {
      if (a.y !== b.y) {
        return a.y - b.y;
      }
      return a.x - b.x;
    });

    const merged = [];
    let current = null;

    for (const platform of platforms) {
      if (!current) {
        current = { ...platform };
        merged.push(current);
      } else if (
        current.y === platform.y &&
        current.height === platform.height &&
        current.x + current.width === platform.x
      ) {
        // Merge horizontally adjacent platforms
        current.width += platform.width;
      } else {
        current = { ...platform };
        merged.push(current);
      }
    }

    return merged;
  }

  /**
   * Get field value from entity
   * @throws {Error} If the requested field occurs more than once
   * @param {Object} entity - Entity instance
   * @param {string} fieldName - Field identifier
   * @param {*} defaultValue - Default value if field not found
   * @returns {*} Field value
   */
  getFieldValue(entity, fieldName, defaultValue) {
    const fields = entity.fieldInstances.filter(
      f => f.__identifier === fieldName
    );
    if (fields.length > 1) {
      throw new Error(`Duplicate LDtk field ${fieldName}`);
    }
    return fields.length ? fields[0].__value : defaultValue;
  }

  /**
   * Convert a candidate world or the currently published world in level order.
   * Return the batch only after all levels pass the converted platform budget.
   * @param {World|null} world - Candidate (defaults to the published world)
   * @returns {Array} Array of converted levels
   * @throws {Error} If preflight or conversion fails, or a level exceeds the
   * cumulative platform budget
   */
  getAllLevels(world = this.world) {
    if (!world) {
      return [];
    }

    const data = world.data ?? world;
    this.preflightWorld(data);
    const levels = [];
    let platforms = 0;
    for (const ldtkLevel of data.levels) {
      const level = this.convertLevel(ldtkLevel);
      platforms += level.platforms.length;
      if (platforms > WORLD_LIMITS.platforms) {
        throw new Error('LDtk world platform budget exceeded');
      }
      levels.push(level);
    }
    return levels;
  }

  /**
   * Get a level from raw world data or a compatibility wrapper with a data property.
   * @param {number} index - Zero-based integer level index
   * @returns {Object|null} Converted level, or null if no world or index is available
   * @throws {Error} If conversion of the selected level fails
   */
  getLevel(index) {
    const levels = (this.world?.data ?? this.world)?.levels;
    if (
      !levels ||
      !Number.isInteger(index) ||
      index < 0 ||
      index >= levels.length
    ) {
      return null;
    }

    return this.convertLevel(levels[index]);
  }
}
