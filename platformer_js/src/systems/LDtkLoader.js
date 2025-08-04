/**
 * @module systems/LDtkLoader
 */

import { World } from 'ldtk';

/**
 * LDtk level loader
 */
export class LDtkLoader {
  /**
   * Create LDtk loader
   */
  constructor() {
    this.world = null;
  }

  /**
   * Load LDtk world from URL
   * @param {string} url - URL to LDtk file
   * @returns {Promise<World>} Loaded world
   */
  async loadWorld(url) {
    this.world = await World.fromURL(url);
    return this.world;
  }

  /**
   * Convert LDtk level to game format
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

    // Process entities layer
    const entitiesLayer = ldtkLevel.layerInstances.find(
      layer => layer.__identifier === 'Entities'
    );

    if (entitiesLayer) {
      this.processEntities(entitiesLayer, level);
    }

    // Process platforms layer
    const platformsLayer = ldtkLevel.layerInstances.find(
      layer => layer.__identifier === 'Platforms'
    );

    if (platformsLayer) {
      this.processPlatforms(platformsLayer, level);
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
   * Process entities from LDtk
   * @param {Object} entitiesLayer - Entities layer
   * @param {Object} level - Level object to populate
   */
  processEntities(entitiesLayer, level) {
    entitiesLayer.entityInstances.forEach(entity => {
      switch (entity.__identifier) {
        case 'Player':
          level.playerStart = {
            x: entity.px[0],
            y: entity.px[1]
          };
          break;

        case 'Enemy':
          level.enemies.push({
            x: entity.px[0],
            y: entity.px[1],
            speed: this.getFieldValue(entity, 'Speed', 2),
            platformIndex: this.getFieldValue(entity, 'PlatformIndex', 0)
          });
          break;

        case 'Boss':
          level.boss = {
            x: entity.px[0],
            y: entity.px[1],
            platformIndex: this.getFieldValue(entity, 'PlatformIndex', 0)
          };
          break;

        case 'Coin':
          level.coins.push({
            x: entity.px[0],
            y: entity.px[1],
            isPowerUp: this.getFieldValue(entity, 'IsPowerUp', false)
          });
          break;

        case 'Portal':
          level.portal = {
            x: entity.px[0],
            y: entity.px[1]
          };
          break;
      }
    });
  }

  /**
   * Process platforms from IntGrid
   * @param {Object} platformsLayer - Platforms layer
   * @param {Object} level - Level object to populate
   */
  processPlatforms(platformsLayer, level) {
    const gridSize = platformsLayer.__gridSize;
    const width = platformsLayer.__cWid;
    const height = platformsLayer.__cHei;

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
   * Get all levels from world
   * @returns {Array} Array of converted levels
   */
  getAllLevels() {
    if (!this.world) {
      return [];
    }

    return this.world.levels.map(ldtkLevel => this.convertLevel(ldtkLevel));
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

    return this.convertLevel(this.world.levels[index]);
  }
}
