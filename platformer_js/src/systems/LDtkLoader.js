/**
 * @module systems/LDtkLoader
 */

export const WORLD_LIMITS = Object.freeze({
  bytes: 16 * 1024 * 1024,
  timeoutMs: 10_000,
  levels: 64,
  cells: 2_000_000,
  entities: 20_000,
  activeEntities: 1024,
  activePlatforms: 4096
});

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
   * A superseded call still returns its own candidate; convert that returned
   * world with getAllLevels(world), rather than reading the published default.
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
    const timer = setTimeout(
      () => controller.abort(new Error('LDtk transfer deadline exceeded')),
      WORLD_LIMITS.timeoutMs
    );
    let reader;
    const cancelReader = () => {
      void reader?.cancel(controller.signal.reason).catch(() => {});
    };
    controller.signal.addEventListener('abort', cancelReader, { once: true });
    try {
      const response = await fetch(url, { signal: controller.signal });
      controller.signal.throwIfAborted();
      if (!response.ok) {
        throw new Error('LDtk transfer failed');
      }
      reader = response.body?.getReader();
      if (!reader) {
        throw new Error('LDtk response requires a streamed body');
      }
      if (Number(response.headers.get('content-length')) > WORLD_LIMITS.bytes) {
        throw new Error('LDtk byte budget exceeded');
      }
      const chunks = [];
      let bytes = 0;
      for (;;) {
        const { done, value } = await reader.read();
        controller.signal.throwIfAborted();
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
      const data = JSON.parse(new TextDecoder().decode(buffer));
      this.preflightWorld(data);
      const world = data;
      if (publish && generation === this.loadGeneration) {
        this.world = world;
      }
      return world;
    } finally {
      clearTimeout(timer);
      controller.abort();
      controller.signal.removeEventListener('abort', cancelReader);
      reader?.releaseLock();
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

  /**
   * Convert LDtk level to game format, validating geometry and entity numbers.
   * Coordinates and enemy speeds must be finite numbers; enemy/boss platform
   * indices must reference the completed collision mesh with at least 44 px
   * patrol width for enemies or 64 px for bosses. Only absent fields
   * use defaults (Speed: 2, PlatformIndex: 0); malformed present values fail.
   * @throws {Error} If the level has invalid IntGrid or entity numeric data
   * @param {Object} ldtkLevel - LDtk level data
   * @returns {Object} Game level format
   */
  convertLevel(ldtkLevel) {
    const level = {
      name: this.getLevelName(ldtkLevel),
      playerStart: { x: 50, y: 200 }, // Default, will be overridden
      platforms: [],
      coins: [],
      enemies: [],
      boss: null,
      portal: null
    };

    // Process platforms layer
    const platformsLayer = ldtkLevel.layerInstances.find(
      layer => layer.__identifier === 'Platforms'
    );

    if (platformsLayer) {
      this.processPlatforms(platformsLayer, level);
    }

    // Process entities layer
    const entitiesLayer = ldtkLevel.layerInstances.find(
      layer => layer.__identifier === 'Entities'
    );

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
    const nameField = ldtkLevel.fieldInstances.find(
      field => field.__identifier === 'LevelName'
    );
    return nameField ? nameField.__value : ldtkLevel.identifier;
  }

  /**
   * Process and validate recognized entities after the platform mesh is built.
   * @throws {Error} If coordinates, enemy speed, patrol references or widths are invalid
   * @param {Object} entitiesLayer - Entities layer
   * @param {Object} level - Level object to populate
   */
  processEntities(entitiesLayer, level) {
    entitiesLayer.entityInstances.forEach(entity => {
      if (
        !['Player', 'Enemy', 'Boss', 'Coin', 'Portal'].includes(
          entity.__identifier
        )
      ) {
        return;
      }
      const [x, y] = entity.px;
      if (!Number.isFinite(x) || !Number.isFinite(y)) {
        throw new Error('Invalid LDtk entity coordinates');
      }
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
            isPowerUp: this.getFieldValue(entity, 'IsPowerUp', false)
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
   * Validation finishes before scanning cells or replacing geometry.
   * @throws {Error} If dimensions, cell budget or dense array length are invalid
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
          x: p.startX * gridSize,
          y: p.y * gridSize,
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
   * @param {Object} entity - Entity instance
   * @param {string} fieldName - Field identifier
   * @param {*} defaultValue - Default value if field not found
   * @returns {*} Field value
   */
  getFieldValue(entity, fieldName, defaultValue) {
    const field = entity.fieldInstances.find(f => f.__identifier === fieldName);
    return field ? field.__value : defaultValue;
  }

  /**
   * Convert a candidate world or the currently published world.
   * @param {World|null} world - Candidate (defaults to the published world)
   * @returns {Array} Array of converted levels
   */
  getAllLevels(world = this.world) {
    if (!world) {
      return [];
    }

    const data = world.data ?? world;
    this.preflightWorld(data);
    return data.levels.map(ldtkLevel => this.convertLevel(ldtkLevel));
  }

  /**
   * Get level by index
   * @param {number} index - Level index
   * @returns {Object|null} Converted level or null
   */
  getLevel(index) {
    if (!this.world || index >= this.world.levels.length) {
      return null;
    }

    return this.convertLevel((this.world.data ?? this.world).levels[index]);
  }
}
