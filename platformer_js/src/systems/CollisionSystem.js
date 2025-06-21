/**
 * @module systems/CollisionSystem
 */

/**
 * Handles all collision detection in the game
 */
export class CollisionSystem {
  /**
   * Check collision between two rectangles
   * @param {Object} rect1 - First rectangle
   * @param {Object} rect2 - Second rectangle
   * @returns {boolean} True if collision detected
   */
  static checkCollision(rect1, rect2) {
    return (
      rect1.x < rect2.x + rect2.width &&
      rect1.x + rect1.width > rect2.x &&
      rect1.y < rect2.y + rect2.height &&
      rect1.y + rect1.height > rect2.y
    );
  }

  /**
   * Check platform collisions for an entity
   * @param {Object} entity - Entity to check
   * @param {Array} platforms - List of platforms
   * @returns {Object} Collision info
   */
  static checkPlatformCollisions(entity, platforms) {
    const result = {
      isGrounded: false,
      platform: null,
      side: null
    };

    for (const platform of platforms) {
      if (this.checkCollision(entity, platform)) {
        const entityBottom = entity.y + entity.height;
        const entityTop = entity.y;

        const platformTop = platform.y;
        const platformBottom = platform.y + platform.height;

        // Check vertical collision
        if (
          entity.velocityY > 0 &&
          entityBottom > platformTop &&
          entityTop < platformTop
        ) {
          // Check if player is sufficiently on top of the platform (at least 50% of player width)
          const entityLeft = entity.x;
          const entityRight = entity.x + entity.width;
          const platformLeft = platform.x;
          const platformRight = platform.x + platform.width;

          const overlapLeft = Math.max(entityLeft, platformLeft);
          const overlapRight = Math.min(entityRight, platformRight);
          const overlapWidth = overlapRight - overlapLeft;

          // Only consider grounded if at least 50% of player is on the platform
          if (overlapWidth >= entity.width * 0.5) {
            // Landing on platform
            result.isGrounded = true;
            result.platform = platform;
            result.side = 'top';
            entity.y = platformTop - entity.height;
            entity.velocityY = 0;
            entity.isJumping = false;
          }
        } else if (
          entity.velocityY < 0 &&
          entityTop < platformBottom &&
          entityBottom > platformBottom
        ) {
          // Hitting platform from below
          result.side = 'bottom';
          entity.y = platformBottom;
          entity.velocityY = 0;
        }
      }
    }

    return result;
  }

  /**
   * Check enemy collision with player
   * @param {Object} player - Player object
   * @param {Object} enemy - Enemy object
   * @returns {string|null} Collision type: 'stomp', 'damage', or null
   */
  static checkEnemyCollision(player, enemy) {
    if (!enemy.alive || player.isInvulnerable) {
      return null;
    }

    if (this.checkCollision(player, enemy)) {
      const playerBottom = player.y + player.height;
      const enemyTop = enemy.y;
      const playerFalling = player.velocityY > 0;

      // Check if player is stomping on enemy
      if (
        playerFalling &&
        playerBottom >= enemyTop &&
        playerBottom - enemyTop <= player.velocityY + 10
      ) {
        return 'stomp';
      }

      return 'damage';
    }

    return null;
  }

  /**
   * Check projectile collisions
   * @param {Object} projectile - Projectile to check
   * @param {Array} enemies - List of enemies
   * @param {Object} boss - Boss enemy (optional)
   * @returns {Object|null} Hit target or null
   */
  static checkProjectileCollisions(projectile, enemies, boss = null) {
    // Check enemy collisions
    for (const enemy of enemies) {
      if (enemy.alive && this.checkCollision(projectile, enemy)) {
        return { type: 'enemy', target: enemy };
      }
    }

    // Check boss collision
    if (boss && boss.alive && this.checkCollision(projectile, boss)) {
      return { type: 'boss', target: boss };
    }

    return null;
  }

  /**
   * Check if entity is within bounds
   * @param {Object} entity - Entity to check
   * @param {Object} bounds - Boundary limits
   * @returns {Object} Clamped position
   */
  static keepInBounds(entity, bounds) {
    const clampedX = Math.max(
      bounds.minX,
      Math.min(bounds.maxX - entity.width, entity.x)
    );
    const clampedY = Math.min(bounds.maxY - entity.height, entity.y);

    return {
      x: clampedX,
      y: clampedY,
      clamped: clampedX !== entity.x || clampedY !== entity.y
    };
  }

  /**
   * Check if player is centered in portal
   * @param {Object} player - Player object
   * @param {Object} portal - Portal object
   * @param {number} threshold - Distance threshold (0-1)
   * @returns {boolean} True if centered enough
   */
  static checkPortalEntry(player, portal, threshold = 0.6) {
    if (!this.checkCollision(player, portal)) {
      return false;
    }

    const playerCenterX = player.x + player.width / 2;
    const playerCenterY = player.y + player.height / 2;
    const portalCenterX = portal.x + portal.width / 2;
    const portalCenterY = portal.y + portal.height / 2;

    const dx = playerCenterX - portalCenterX;
    const dy = playerCenterY - portalCenterY;
    const distance = Math.sqrt(dx * dx + dy * dy);

    const portalRadius = portal.width / 2;
    return distance < portalRadius * threshold;
  }
}
